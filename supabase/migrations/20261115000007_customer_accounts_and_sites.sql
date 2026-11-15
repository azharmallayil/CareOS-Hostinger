-- Migration: 20261115000007_customer_accounts_and_sites.sql
-- Description: Customer accounts, branches/sites, contacts, customer-user links, and RLS policies.
-- Reversible:
--   DROP TABLE IF EXISTS public.customer_users CASCADE;
--   DROP TABLE IF EXISTS public.customer_contacts CASCADE;
--   DROP TABLE IF EXISTS public.customer_sites CASCADE;
--   DROP TABLE IF EXISTS public.customer_accounts CASCADE;
--   DROP FUNCTION IF EXISTS app_private.can_access_customer_account(UUID, UUID);
--   DROP FUNCTION IF EXISTS app_private.get_user_customer_accounts(UUID);

-- ============================================================================
-- 1. CUSTOMER ACCOUNTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.customer_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  account_number TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'commercial' CHECK (account_type IN ('commercial', 'residential', 'enterprise', 'government')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived', 'lead')),
  email TEXT,
  phone TEXT,
  tax_id TEXT,
  website TEXT,
  currency TEXT NOT NULL DEFAULT 'SAR',
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  billing_address JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_customer_account_number UNIQUE (tenant_id, account_number),
  CONSTRAINT uq_customer_account_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_customer_accounts_tenant_status 
  ON public.customer_accounts (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_customer_accounts_tenant_created 
  ON public.customer_accounts (tenant_id, created_at DESC);

-- ============================================================================
-- 2. CUSTOMER BRANCHES & SITES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.customer_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  customer_account_id UUID NOT NULL REFERENCES public.customer_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'under_maintenance', 'decommissioned')),
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT,
  postal_code TEXT,
  country TEXT NOT NULL DEFAULT 'Saudi Arabia',
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  geofence_radius_meters INTEGER NOT NULL DEFAULT 150,
  access_instructions TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_customer_site_code UNIQUE (tenant_id, customer_account_id, code)
);

CREATE INDEX IF NOT EXISTS idx_customer_sites_tenant_account 
  ON public.customer_sites (tenant_id, customer_account_id);

-- ============================================================================
-- 3. CUSTOMER CONTACTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  customer_account_id UUID NOT NULL REFERENCES public.customer_accounts(id) ON DELETE CASCADE,
  site_id UUID REFERENCES public.customer_sites(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  job_title TEXT,
  department TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_billing_contact BOOLEAN NOT NULL DEFAULT false,
  is_service_contact BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_tenant_account 
  ON public.customer_contacts (tenant_id, customer_account_id);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_site 
  ON public.customer_contacts (site_id);

-- ============================================================================
-- 4. CUSTOMER USERS LINK TABLE (Customer Portal Access)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.customer_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  customer_account_id UUID NOT NULL REFERENCES public.customer_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.customer_contacts(id) ON DELETE SET NULL,
  portal_role TEXT NOT NULL DEFAULT 'customer_user' CHECK (portal_role IN ('customer_admin', 'customer_user', 'customer_viewer')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_customer_user_link UNIQUE (tenant_id, customer_account_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_users_tenant_account 
  ON public.customer_users (tenant_id, customer_account_id);

CREATE INDEX IF NOT EXISTS idx_customer_users_user 
  ON public.customer_users (user_id);

-- ============================================================================
-- 5. UPDATED_AT TRIGGERS
-- ============================================================================
CREATE TRIGGER set_customer_accounts_updated_at
  BEFORE UPDATE ON public.customer_accounts
  FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER set_customer_sites_updated_at
  BEFORE UPDATE ON public.customer_sites
  FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER set_customer_contacts_updated_at
  BEFORE UPDATE ON public.customer_contacts
  FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER set_customer_users_updated_at
  BEFORE UPDATE ON public.customer_users
  FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

-- ============================================================================
-- 6. SECURITY HELPER FUNCTIONS IN APP_PRIVATE
-- ============================================================================

-- Helper: Get customer account IDs linked to the current user
CREATE OR REPLACE FUNCTION app_private.get_user_customer_accounts(p_tenant_id UUID)
RETURNS TABLE (customer_account_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app_private, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_tenant_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT cu.customer_account_id
    FROM public.customer_users cu
    WHERE cu.tenant_id = p_tenant_id
      AND cu.user_id = auth.uid()
      AND cu.is_active = true;
END;
$$;

-- Helper: Check if current user can access a specific customer account
CREATE OR REPLACE FUNCTION app_private.can_access_customer_account(
  p_tenant_id UUID,
  p_customer_account_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app_private, public
AS $$
DECLARE
  v_is_ops BOOLEAN;
  v_is_linked BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR p_tenant_id IS NULL OR p_customer_account_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. SaaS Platform Admin has superadmin visibility
  IF app_private.is_platform_admin() THEN
    RETURN true;
  END IF;

  -- 2. Tenant Operations member has full organization access
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

  -- 3. Customer Portal member: Must be explicitly linked to this customer account
  SELECT EXISTS (
    SELECT 1
    FROM public.customer_users cu
    WHERE cu.tenant_id = p_tenant_id
      AND cu.customer_account_id = p_customer_account_id
      AND cu.user_id = auth.uid()
      AND cu.is_active = true
  ) INTO v_is_linked;

  RETURN v_is_linked;
END;
$$;

-- ============================================================================
-- 7. ENABLE ROW-LEVEL SECURITY & POLICIES
-- ============================================================================
ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_users ENABLE ROW LEVEL SECURITY;

-- Explicit grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_sites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_users TO authenticated;

-- Policies for CUSTOMER_ACCOUNTS
CREATE POLICY "customer_accounts_select"
  ON public.customer_accounts
  FOR SELECT
  TO authenticated
  USING (
    app_private.can_access_customer_account(tenant_id, id)
  );

CREATE POLICY "customer_accounts_insert"
  ON public.customer_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    app_private.is_platform_admin() OR (
      app_private.has_active_membership(tenant_id) AND
      app_private.can_access_portal(tenant_id, 'operations')
    )
  );

CREATE POLICY "customer_accounts_update"
  ON public.customer_accounts
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

CREATE POLICY "customer_accounts_delete"
  ON public.customer_accounts
  FOR DELETE
  TO authenticated
  USING (
    app_private.is_platform_admin() OR (
      app_private.has_active_membership(tenant_id) AND
      app_private.has_role(tenant_id, 'tenant_admin')
    )
  );

-- Policies for CUSTOMER_SITES
CREATE POLICY "customer_sites_select"
  ON public.customer_sites
  FOR SELECT
  TO authenticated
  USING (
    app_private.can_access_customer_account(tenant_id, customer_account_id)
  );

CREATE POLICY "customer_sites_insert"
  ON public.customer_sites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    app_private.is_platform_admin() OR (
      app_private.has_active_membership(tenant_id) AND
      app_private.can_access_portal(tenant_id, 'operations')
    )
  );

CREATE POLICY "customer_sites_update"
  ON public.customer_sites
  FOR UPDATE
  TO authenticated
  USING (
    app_private.is_platform_admin() OR (
      app_private.has_active_membership(tenant_id) AND
      app_private.can_access_portal(tenant_id, 'operations')
    )
  );

CREATE POLICY "customer_sites_delete"
  ON public.customer_sites
  FOR DELETE
  TO authenticated
  USING (
    app_private.is_platform_admin() OR (
      app_private.has_active_membership(tenant_id) AND
      app_private.can_access_portal(tenant_id, 'operations')
    )
  );

-- Policies for CUSTOMER_CONTACTS
CREATE POLICY "customer_contacts_select"
  ON public.customer_contacts
  FOR SELECT
  TO authenticated
  USING (
    app_private.can_access_customer_account(tenant_id, customer_account_id)
  );

CREATE POLICY "customer_contacts_insert"
  ON public.customer_contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    app_private.is_platform_admin() OR (
      app_private.has_active_membership(tenant_id) AND
      app_private.can_access_portal(tenant_id, 'operations')
    )
  );

CREATE POLICY "customer_contacts_update"
  ON public.customer_contacts
  FOR UPDATE
  TO authenticated
  USING (
    app_private.is_platform_admin() OR (
      app_private.has_active_membership(tenant_id) AND
      app_private.can_access_portal(tenant_id, 'operations')
    )
  );

CREATE POLICY "customer_contacts_delete"
  ON public.customer_contacts
  FOR DELETE
  TO authenticated
  USING (
    app_private.is_platform_admin() OR (
      app_private.has_active_membership(tenant_id) AND
      app_private.can_access_portal(tenant_id, 'operations')
    )
  );

-- Policies for CUSTOMER_USERS
CREATE POLICY "customer_users_select"
  ON public.customer_users
  FOR SELECT
  TO authenticated
  USING (
    app_private.is_platform_admin() OR
    (app_private.has_active_membership(tenant_id) AND app_private.can_access_portal(tenant_id, 'operations')) OR
    (user_id = auth.uid())
  );

CREATE POLICY "customer_users_insert"
  ON public.customer_users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    app_private.is_platform_admin() OR (
      app_private.has_active_membership(tenant_id) AND
      app_private.can_access_portal(tenant_id, 'operations')
    )
  );

CREATE POLICY "customer_users_update"
  ON public.customer_users
  FOR UPDATE
  TO authenticated
  USING (
    app_private.is_platform_admin() OR (
      app_private.has_active_membership(tenant_id) AND
      app_private.can_access_portal(tenant_id, 'operations')
    )
  );

CREATE POLICY "customer_users_delete"
  ON public.customer_users
  FOR DELETE
  TO authenticated
  USING (
    app_private.is_platform_admin() OR (
      app_private.has_active_membership(tenant_id) AND
      app_private.can_access_portal(tenant_id, 'operations')
    )
  );
