-- Migration: 20261115000009_tickets_and_complaints.sql
-- Description: Support desk, transactional ticket numbering, ticket lifecycle, events, and complaints.
-- Reversible:
--   DROP TABLE IF EXISTS public.complaint_events CASCADE;
--   DROP TABLE IF EXISTS public.complaints CASCADE;
--   DROP TABLE IF EXISTS public.ticket_events CASCADE;
--   DROP TABLE IF EXISTS public.ticket_status_history CASCADE;
--   DROP TABLE IF EXISTS public.tickets CASCADE;
--   DROP TABLE IF EXISTS public.ticket_number_sequences CASCADE;
--   DROP TABLE IF EXISTS public.ticket_categories CASCADE;
--   DROP FUNCTION IF EXISTS app_private.generate_ticket_number(UUID, TEXT);
--   DROP FUNCTION IF EXISTS app_private.generate_complaint_number(UUID);
--   DROP FUNCTION IF EXISTS app_private.can_access_ticket(UUID, UUID);
--   DROP FUNCTION IF EXISTS app_private.can_access_complaint(UUID, UUID);

-- ============================================================================
-- 1. TICKET CATEGORIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ticket_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  default_priority TEXT NOT NULL DEFAULT 'medium' CHECK (default_priority IN ('low', 'medium', 'high', 'critical')),
  sla_response_hours INTEGER NOT NULL DEFAULT 4,
  sla_resolution_hours INTEGER NOT NULL DEFAULT 24,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_ticket_category_code UNIQUE (tenant_id, code),
  CONSTRAINT uq_ticket_category_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_ticket_categories_tenant 
  ON public.ticket_categories (tenant_id, is_active);

-- ============================================================================
-- 2. TICKET NUMBER SEQUENCES (Transactional Concurrency-Safe Generation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ticket_number_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  prefix TEXT NOT NULL DEFAULT 'TCK',
  year INTEGER NOT NULL DEFAULT extract(year from now())::integer,
  current_val BIGINT NOT NULL DEFAULT 0,
  padding_length INTEGER NOT NULL DEFAULT 6,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_ticket_number_sequence UNIQUE (tenant_id, prefix, year)
);

-- Concurrency-safe atomic ticket numbering helper
CREATE OR REPLACE FUNCTION app_private.generate_ticket_number(
  p_tenant_id UUID,
  p_prefix TEXT DEFAULT 'TCK'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app_private, public
AS $$
DECLARE
  v_year INTEGER := extract(year from now())::integer;
  v_seq BIGINT;
  v_padding INTEGER := 6;
  v_result TEXT;
BEGIN
  -- Insert sequence row if it doesn't exist, otherwise lock row and increment atomically
  INSERT INTO public.ticket_number_sequences (tenant_id, prefix, year, current_val, padding_length)
  VALUES (p_tenant_id, p_prefix, v_year, 1, 6)
  ON CONFLICT (tenant_id, prefix, year)
  DO UPDATE SET
    current_val = public.ticket_number_sequences.current_val + 1,
    updated_at = timezone('utc', now())
  RETURNING current_val, padding_length INTO v_seq, v_padding;

  v_result := p_prefix || '-' || v_year::text || '-' || lpad(v_seq::text, v_padding, '0');
  RETURN v_result;
END;
$$;

-- Public wrapper for PostgREST RPC
CREATE OR REPLACE FUNCTION public.generate_ticket_number(
  p_tenant_id UUID,
  p_prefix TEXT DEFAULT 'TCK'
)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = app_private, public
AS $$
  SELECT app_private.generate_ticket_number(p_tenant_id, p_prefix);
$$;

-- Concurrency-safe atomic complaint numbering helper
CREATE OR REPLACE FUNCTION app_private.generate_complaint_number(
  p_tenant_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app_private, public
AS $$
DECLARE
  v_year INTEGER := extract(year from now())::integer;
  v_seq BIGINT;
  v_padding INTEGER := 6;
BEGIN
  INSERT INTO public.ticket_number_sequences (tenant_id, prefix, year, current_val, padding_length)
  VALUES (p_tenant_id, 'CMP', v_year, 1, 6)
  ON CONFLICT (tenant_id, prefix, year)
  DO UPDATE SET
    current_val = public.ticket_number_sequences.current_val + 1,
    updated_at = timezone('utc', now())
  RETURNING current_val, padding_length INTO v_seq, v_padding;

  RETURN 'CMP-' || v_year::text || '-' || lpad(v_seq::text, v_padding, '0');
END;
$$;

-- Public wrapper for PostgREST RPC
CREATE OR REPLACE FUNCTION public.generate_complaint_number(
  p_tenant_id UUID
)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = app_private, public
AS $$
  SELECT app_private.generate_complaint_number(p_tenant_id);
$$;

GRANT EXECUTE ON FUNCTION public.generate_ticket_number(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_complaint_number(UUID) TO authenticated;

-- ============================================================================
-- 3. TICKETS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  ticket_number TEXT NOT NULL,
  customer_account_id UUID NOT NULL REFERENCES public.customer_accounts(id) ON DELETE RESTRICT,
  site_id UUID REFERENCES public.customer_sites(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.customer_contacts(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  category_id UUID NOT NULL REFERENCES public.ticket_categories(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'draft',
    'submitted',
    'under_review',
    'awaiting_quotation',
    'awaiting_customer_approval',
    'awaiting_payment',
    'ready_for_assignment',
    'assigned',
    'accepted',
    'scheduled',
    'technician_en_route',
    'arrived',
    'in_progress',
    'on_hold',
    'service_completed',
    'awaiting_operations_verification',
    'awaiting_customer_confirmation',
    'resolved',
    'closed',
    'cancelled'
  )),
  coverage_type TEXT NOT NULL DEFAULT 'paid' CHECK (coverage_type IN ('paid', 'warranty', 'free_service', 'contract')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_via TEXT NOT NULL DEFAULT 'portal' CHECK (reported_via IN ('portal', 'phone', 'email', 'chat', 'automated_telematics')),
  sla_due_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  resolution_summary TEXT,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_ticket_number UNIQUE (tenant_id, ticket_number)
);

CREATE INDEX IF NOT EXISTS idx_tickets_tenant_status 
  ON public.tickets (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_tickets_tenant_customer 
  ON public.tickets (tenant_id, customer_account_id);

CREATE INDEX IF NOT EXISTS idx_tickets_asset 
  ON public.tickets (asset_id) 
  WHERE asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_category 
  ON public.tickets (category_id);

CREATE INDEX IF NOT EXISTS idx_tickets_assigned 
  ON public.tickets (assigned_to);

-- ============================================================================
-- 4. TICKET STATUS HISTORY TABLE (Immutable Transition Audit)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ticket_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_ticket_status_history_ticket 
  ON public.ticket_status_history (ticket_id, created_at DESC);

-- ============================================================================
-- 5. TICKET EVENTS & TIMELINE TABLE (Comments, Events, Internal Notes)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('comment', 'status_change', 'assignment', 'quotation', 'inspection', 'complaint_linked', 'system')),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL DEFAULT 'staff' CHECK (actor_type IN ('staff', 'technician', 'customer', 'system')),
  is_internal BOOLEAN NOT NULL DEFAULT false,
  body TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket 
  ON public.ticket_events (ticket_id, created_at ASC);

-- ============================================================================
-- 6. COMPLAINTS TABLE (Independent Lifecycle)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  complaint_number TEXT NOT NULL,
  complaint_type TEXT NOT NULL CHECK (complaint_type IN ('service', 'platform')),
  customer_account_id UUID NOT NULL REFERENCES public.customer_accounts(id) ON DELETE RESTRICT,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted',
    'under_investigation',
    'action_required',
    'resolved',
    'closed',
    'rejected'
  )),
  assigned_manager_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  internal_investigation_notes TEXT,
  resolution_summary TEXT,
  customer_update TEXT,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_complaint_number UNIQUE (tenant_id, complaint_number)
);

CREATE INDEX IF NOT EXISTS idx_complaints_tenant_status 
  ON public.complaints (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_complaints_ticket 
  ON public.complaints (ticket_id) 
  WHERE ticket_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_complaints_customer 
  ON public.complaints (customer_account_id);

-- ============================================================================
-- 7. COMPLAINT EVENTS & INVESTIGATION LOG TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.complaint_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  event_type TEXT NOT NULL CHECK (event_type IN ('note', 'status_change', 'customer_communication', 'resolution')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_complaint_events_complaint 
  ON public.complaint_events (complaint_id, created_at ASC);

-- ============================================================================
-- 8. UPDATED_AT TRIGGERS
-- ============================================================================
CREATE TRIGGER set_ticket_categories_updated_at
  BEFORE UPDATE ON public.ticket_categories
  FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER set_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER set_complaints_updated_at
  BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

-- ============================================================================
-- 9. ACCESS HELPERS IN APP_PRIVATE
-- ============================================================================

-- Helper: Check if current user can access a specific ticket
CREATE OR REPLACE FUNCTION app_private.can_access_ticket(
  p_tenant_id UUID,
  p_ticket_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app_private, public
AS $$
DECLARE
  v_ticket_customer_id UUID;
  v_is_staff BOOLEAN;
  v_is_linked BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR p_tenant_id IS NULL OR p_ticket_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. SaaS Platform Admin has superadmin visibility
  IF app_private.is_platform_admin() THEN
    RETURN true;
  END IF;

  -- 2. Tenant Operations or Technician member
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.is_active = true
      AND tm.portal IN ('operations', 'technician')
  ) INTO v_is_staff;

  IF v_is_staff THEN
    RETURN true;
  END IF;

  -- 3. Customer Portal user: check if ticket's customer account is linked to this user
  SELECT customer_account_id INTO v_ticket_customer_id
  FROM public.tickets
  WHERE id = p_ticket_id AND tenant_id = p_tenant_id;

  IF v_ticket_customer_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.customer_users cu
    WHERE cu.tenant_id = p_tenant_id
      AND cu.customer_account_id = v_ticket_customer_id
      AND cu.user_id = auth.uid()
      AND cu.is_active = true
  ) INTO v_is_linked;

  RETURN v_is_linked;
END;
$$;

-- Helper: Check if current user can access a specific complaint
CREATE OR REPLACE FUNCTION app_private.can_access_complaint(
  p_tenant_id UUID,
  p_complaint_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app_private, public
AS $$
DECLARE
  v_complaint_customer_id UUID;
  v_is_staff BOOLEAN;
  v_is_linked BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR p_tenant_id IS NULL OR p_complaint_id IS NULL THEN
    RETURN false;
  END IF;

  IF app_private.is_platform_admin() THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.is_active = true
      AND tm.portal IN ('operations')
  ) INTO v_is_staff;

  IF v_is_staff THEN
    RETURN true;
  END IF;

  SELECT customer_account_id INTO v_complaint_customer_id
  FROM public.complaints
  WHERE id = p_complaint_id AND tenant_id = p_tenant_id;

  IF v_complaint_customer_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.customer_users cu
    WHERE cu.tenant_id = p_tenant_id
      AND cu.customer_account_id = v_complaint_customer_id
      AND cu.user_id = auth.uid()
      AND cu.is_active = true
  ) INTO v_is_linked;

  RETURN v_is_linked;
END;
$$;

-- ============================================================================
-- 10. ENABLE ROW-LEVEL SECURITY & POLICIES
-- ============================================================================
ALTER TABLE public.ticket_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_number_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ticket_number_sequences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT SELECT, INSERT ON public.ticket_status_history TO authenticated;
GRANT SELECT, INSERT ON public.ticket_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaints TO authenticated;
GRANT SELECT, INSERT ON public.complaint_events TO authenticated;

-- Policies for TICKET_CATEGORIES
CREATE POLICY "ticket_categories_select"
  ON public.ticket_categories
  FOR SELECT
  TO authenticated
  USING (
    app_private.is_platform_admin() OR
    app_private.has_active_membership(tenant_id)
  );

CREATE POLICY "ticket_categories_manage"
  ON public.ticket_categories
  FOR ALL
  TO authenticated
  USING (
    app_private.is_platform_admin() OR (
      app_private.has_active_membership(tenant_id) AND
      app_private.can_access_portal(tenant_id, 'operations')
    )
  );

-- Policies for TICKETS
CREATE POLICY "tickets_select"
  ON public.tickets
  FOR SELECT
  TO authenticated
  USING (
    app_private.can_access_ticket(tenant_id, id)
  );

CREATE POLICY "tickets_insert"
  ON public.tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    app_private.is_platform_admin() OR
    app_private.has_active_membership(tenant_id)
  );

CREATE POLICY "tickets_update"
  ON public.tickets
  FOR UPDATE
  TO authenticated
  USING (
    app_private.can_access_ticket(tenant_id, id)
  )
  WITH CHECK (
    app_private.can_access_ticket(tenant_id, id)
  );

-- Policies for TICKET_STATUS_HISTORY
CREATE POLICY "ticket_status_history_select"
  ON public.ticket_status_history
  FOR SELECT
  TO authenticated
  USING (
    app_private.can_access_ticket(tenant_id, ticket_id)
  );

-- Policies for TICKET_EVENTS (Customers NEVER see internal notes)
CREATE POLICY "ticket_events_select"
  ON public.ticket_events
  FOR SELECT
  TO authenticated
  USING (
    app_private.can_access_ticket(tenant_id, ticket_id) AND (
      NOT is_internal OR (
        app_private.is_platform_admin() OR
        app_private.can_access_portal(tenant_id, 'operations') OR
        app_private.can_access_portal(tenant_id, 'technician')
      )
    )
  );

CREATE POLICY "ticket_events_insert"
  ON public.ticket_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    app_private.can_access_ticket(tenant_id, ticket_id)
  );

-- Policies for COMPLAINTS
CREATE POLICY "complaints_select"
  ON public.complaints
  FOR SELECT
  TO authenticated
  USING (
    app_private.can_access_complaint(tenant_id, id)
  );

CREATE POLICY "complaints_insert"
  ON public.complaints
  FOR INSERT
  TO authenticated
  WITH CHECK (
    app_private.is_platform_admin() OR
    app_private.has_active_membership(tenant_id)
  );

CREATE POLICY "complaints_update"
  ON public.complaints
  FOR UPDATE
  TO authenticated
  USING (
    app_private.is_platform_admin() OR (
      app_private.has_active_membership(tenant_id) AND
      app_private.can_access_portal(tenant_id, 'operations')
    )
  );

-- Policies for COMPLAINT_EVENTS
CREATE POLICY "complaint_events_select"
  ON public.complaint_events
  FOR SELECT
  TO authenticated
  USING (
    app_private.can_access_complaint(tenant_id, complaint_id) AND (
      NOT is_internal OR (
        app_private.is_platform_admin() OR
        app_private.can_access_portal(tenant_id, 'operations')
      )
    )
  );

CREATE POLICY "complaint_events_insert"
  ON public.complaint_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    app_private.can_access_complaint(tenant_id, complaint_id)
  );
