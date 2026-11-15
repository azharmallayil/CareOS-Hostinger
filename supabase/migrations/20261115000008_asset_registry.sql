-- Migration: 20261115000008_asset_registry.sql
-- Description: Asset categories, fleet/asset registry, history-aware assignments, and RLS policies.
-- Reversible:
--   DROP TRIGGER IF EXISTS on_asset_assignment_change ON public.assets;
--   DROP FUNCTION IF EXISTS app_private.handle_asset_assignment_history();
--   DROP TABLE IF EXISTS public.asset_assignments CASCADE;
--   DROP TABLE IF EXISTS public.assets CASCADE;
--   DROP TABLE IF EXISTS public.asset_categories CASCADE;
--   DROP FUNCTION IF EXISTS app_private.can_access_asset(UUID, UUID);

-- ============================================================================
-- 1. ASSET CATEGORIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.asset_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  asset_type TEXT NOT NULL DEFAULT 'vehicle' CHECK (asset_type IN ('vehicle', 'trailer', 'heavy_machinery', 'stationary_equipment', 'marine', 'other')),
  custom_attributes_schema JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_asset_category_code UNIQUE (tenant_id, code),
  CONSTRAINT uq_asset_category_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_asset_categories_tenant 
  ON public.asset_categories (tenant_id, is_active);

-- ============================================================================
-- 2. ASSETS / FLEET REGISTRY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  customer_account_id UUID NOT NULL REFERENCES public.customer_accounts(id) ON DELETE RESTRICT,
  site_id UUID REFERENCES public.customer_sites(id) ON DELETE SET NULL,
  category_id UUID NOT NULL REFERENCES public.asset_categories(id) ON DELETE RESTRICT,
  asset_tag TEXT NOT NULL,
  fleet_number TEXT,
  name TEXT NOT NULL,
  vin TEXT,
  plate_number TEXT,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  model_year INTEGER,
  color TEXT,
  engine_number TEXT,
  fuel_type TEXT CHECK (fuel_type IN ('diesel', 'gasoline', 'electric', 'hybrid', 'cng', 'other')),
  operational_status TEXT NOT NULL DEFAULT 'active' CHECK (operational_status IN ('active', 'inactive', 'maintenance', 'decommissioned', 'impounded')),
  service_status TEXT NOT NULL DEFAULT 'operational' CHECK (service_status IN ('operational', 'needs_service', 'service_in_progress', 'critical_fault')),
  odometer_reading NUMERIC(10, 2),
  engine_hours NUMERIC(10, 2),
  warranty_expiry_date DATE,
  notes TEXT,
  custom_attributes JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_asset_tag UNIQUE (tenant_id, asset_tag)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_tenant_vin 
  ON public.assets (tenant_id, vin) 
  WHERE vin IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_customer_fleet_number 
  ON public.assets (tenant_id, customer_account_id, fleet_number) 
  WHERE fleet_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assets_tenant_customer 
  ON public.assets (tenant_id, customer_account_id);

CREATE INDEX IF NOT EXISTS idx_assets_site 
  ON public.assets (site_id);

CREATE INDEX IF NOT EXISTS idx_assets_category 
  ON public.assets (category_id);

CREATE INDEX IF NOT EXISTS idx_assets_status 
  ON public.assets (tenant_id, operational_status);

-- ============================================================================
-- 3. ASSET ASSIGNMENTS & TRANSFER HISTORY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.asset_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  customer_account_id UUID NOT NULL REFERENCES public.customer_accounts(id) ON DELETE RESTRICT,
  site_id UUID REFERENCES public.customer_sites(id) ON DELETE SET NULL,
  assignment_type TEXT NOT NULL DEFAULT 'initial' CHECK (assignment_type IN ('initial', 'site_transfer', 'ownership_transfer', 'temporary_loan', 'return')),
  start_date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  end_date TIMESTAMPTZ,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_asset_assignments_asset 
  ON public.asset_assignments (asset_id, start_date DESC);

CREATE INDEX IF NOT EXISTS idx_asset_assignments_customer 
  ON public.asset_assignments (customer_account_id);

-- ============================================================================
-- 4. TIMESTAMPS TRIGGERS
-- ============================================================================
CREATE TRIGGER set_asset_categories_updated_at
  BEFORE UPDATE ON public.asset_categories
  FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER set_assets_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

-- ============================================================================
-- 5. AUTOMATIC ASSIGNMENT HISTORY TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION app_private.handle_asset_assignment_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app_private, public
AS $$
DECLARE
  v_assign_type TEXT := 'initial';
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.asset_assignments (
      tenant_id,
      asset_id,
      customer_account_id,
      site_id,
      assignment_type,
      start_date,
      assigned_by,
      reason
    ) VALUES (
      NEW.tenant_id,
      NEW.id,
      NEW.customer_account_id,
      NEW.site_id,
      'initial',
      NEW.created_at,
      NEW.created_by,
      'Initial asset registration'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Check if customer ownership or site location changed
    IF NEW.customer_account_id IS DISTINCT FROM OLD.customer_account_id OR
       NEW.site_id IS DISTINCT FROM OLD.site_id THEN

      IF NEW.customer_account_id IS DISTINCT FROM OLD.customer_account_id THEN
        v_assign_type := 'ownership_transfer';
      ELSE
        v_assign_type := 'site_transfer';
      END IF;

      -- Close the current open assignment
      UPDATE public.asset_assignments
      SET end_date = timezone('utc', now())
      WHERE asset_id = NEW.id
        AND end_date IS NULL;

      -- Insert the new active assignment
      INSERT INTO public.asset_assignments (
        tenant_id,
        asset_id,
        customer_account_id,
        site_id,
        assignment_type,
        start_date,
        assigned_by,
        reason
      ) VALUES (
        NEW.tenant_id,
        NEW.id,
        NEW.customer_account_id,
        NEW.site_id,
        v_assign_type,
        timezone('utc', now()),
        auth.uid(),
        CASE
          WHEN v_assign_type = 'ownership_transfer' THEN 'Customer ownership transfer'
          ELSE 'Branch / site facility transfer'
        END
      );
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER on_asset_assignment_change
  AFTER INSERT OR UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION app_private.handle_asset_assignment_history();

-- ============================================================================
-- 6. SECURITY HELPER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION app_private.can_access_asset(
  p_tenant_id UUID,
  p_asset_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app_private, public
AS $$
DECLARE
  v_asset_customer_id UUID;
  v_is_ops BOOLEAN;
  v_is_linked BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR p_tenant_id IS NULL OR p_asset_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. SaaS Platform Admin has superadmin visibility
  IF app_private.is_platform_admin() THEN
    RETURN true;
  END IF;

  -- 2. Tenant Operations/Technician member has full access
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.is_active = true
      AND tm.portal IN ('operations', 'technician')
  ) INTO v_is_ops;

  IF v_is_ops THEN
    RETURN true;
  END IF;

  -- 3. Customer Portal member: Check if asset belongs to an account they are linked to
  SELECT customer_account_id INTO v_asset_customer_id
  FROM public.assets
  WHERE id = p_asset_id AND tenant_id = p_tenant_id;

  IF v_asset_customer_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.customer_users cu
    WHERE cu.tenant_id = p_tenant_id
      AND cu.customer_account_id = v_asset_customer_id
      AND cu.user_id = auth.uid()
      AND cu.is_active = true
  ) INTO v_is_linked;

  RETURN v_is_linked;
END;
$$;

-- ============================================================================
-- 7. ENABLE ROW-LEVEL SECURITY & POLICIES
-- ============================================================================
ALTER TABLE public.asset_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_assignments ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_assignments TO authenticated;

-- Policies for ASSET_CATEGORIES
CREATE POLICY "asset_categories_select"
  ON public.asset_categories
  FOR SELECT
  TO authenticated
  USING (
    app_private.is_platform_admin() OR
    app_private.has_active_membership(tenant_id)
  );

CREATE POLICY "asset_categories_manage"
  ON public.asset_categories
  FOR ALL
  TO authenticated
  USING (
    app_private.is_platform_admin() OR (
      app_private.has_active_membership(tenant_id) AND
      app_private.can_access_portal(tenant_id, 'operations')
    )
  );

-- Policies for ASSETS
CREATE POLICY "assets_select"
  ON public.assets
  FOR SELECT
  TO authenticated
  USING (
    app_private.can_access_asset(tenant_id, id)
  );

CREATE POLICY "assets_insert"
  ON public.assets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    app_private.is_platform_admin() OR (
      app_private.has_active_membership(tenant_id) AND
      app_private.can_access_portal(tenant_id, 'operations')
    )
  );

CREATE POLICY "assets_update"
  ON public.assets
  FOR UPDATE
  TO authenticated
  USING (
    app_private.is_platform_admin() OR (
      app_private.has_active_membership(tenant_id) AND
      app_private.can_access_portal(tenant_id, 'operations')
    )
  )
  WITH CHECK (
    app_private.is_platform_admin() OR (
      app_private.has_active_membership(tenant_id) AND
      app_private.can_access_portal(tenant_id, 'operations')
    )
  );

CREATE POLICY "assets_delete"
  ON public.assets
  FOR DELETE
  TO authenticated
  USING (
    app_private.is_platform_admin() OR (
      app_private.has_active_membership(tenant_id) AND
      app_private.has_role(tenant_id, 'tenant_admin')
    )
  );

-- Policies for ASSET_ASSIGNMENTS
CREATE POLICY "asset_assignments_select"
  ON public.asset_assignments
  FOR SELECT
  TO authenticated
  USING (
    app_private.can_access_asset(tenant_id, asset_id)
  );

CREATE POLICY "asset_assignments_manage"
  ON public.asset_assignments
  FOR ALL
  TO authenticated
  USING (
    app_private.is_platform_admin() OR (
      app_private.has_active_membership(tenant_id) AND
      app_private.can_access_portal(tenant_id, 'operations')
    )
  );
