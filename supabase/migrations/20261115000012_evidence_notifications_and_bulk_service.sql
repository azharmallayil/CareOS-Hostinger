-- Migration: 20261115000012_evidence_notifications_and_bulk_service.sql
-- Description: Service evidence requirements, immutable evidence records with review status,
--              notification preferences, in-app notifications, and bulk service campaigns
--              with independent single-asset ticket creation.

-- ============================================================================
-- 1. SERVICE EVIDENCE REQUIREMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.service_evidence_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  service_category_code TEXT NOT NULL,
  stage_name TEXT NOT NULL CHECK (stage_name IN ('arrival_checkin', 'diagnosis', 'execution', 'checkout')),
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('photo', 'video', 'document', 'signature', 'odometer_reading')),
  title TEXT NOT NULL,
  description TEXT,
  min_count INTEGER NOT NULL DEFAULT 1,
  max_count INTEGER NOT NULL DEFAULT 5,
  is_mandatory BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (tenant_id, service_category_code, stage_name, evidence_type)
);

CREATE INDEX IF NOT EXISTS idx_evidence_reqs_lookup 
  ON public.service_evidence_requirements (tenant_id, service_category_code, stage_name);

-- ============================================================================
-- 2. SERVICE EVIDENCE RECORDS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.service_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE RESTRICT,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  requirement_id UUID REFERENCES public.service_evidence_requirements(id),
  stage_name TEXT NOT NULL CHECK (stage_name IN ('arrival_checkin', 'diagnosis', 'execution', 'checkout')),
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('photo', 'video', 'document', 'signature', 'odometer_reading')),
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  location_lat NUMERIC(10, 7),
  location_lng NUMERIC(10, 7),
  location_consented BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_finalized BOOLEAN NOT NULL DEFAULT false,
  review_status TEXT NOT NULL DEFAULT 'pending_review' CHECK (review_status IN ('pending_review', 'verified', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_evidence_ticket ON public.service_evidence (ticket_id);
CREATE INDEX IF NOT EXISTS idx_evidence_work_order ON public.service_evidence (work_order_id);
CREATE INDEX IF NOT EXISTS idx_evidence_review ON public.service_evidence (tenant_id, review_status);

-- ============================================================================
-- 3. NOTIFICATION PREFERENCES & IN-APP NOTIFICATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_email BOOLEAN NOT NULL DEFAULT true,
  channel_sms BOOLEAN NOT NULL DEFAULT false,
  channel_in_app BOOLEAN NOT NULL DEFAULT true,
  notify_on_assignment BOOLEAN NOT NULL DEFAULT true,
  notify_on_status_change BOOLEAN NOT NULL DEFAULT true,
  notify_on_rejection BOOLEAN NOT NULL DEFAULT true,
  notify_on_approval BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('assignment', 'status_change', 'rejection', 'quote', 'system')),
  link_url TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications (recipient_id, read_at);

-- ============================================================================
-- 4. BULK SERVICE REQUESTS & ITEMS (OQ-10 RESOLUTION)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bulk_service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  batch_number TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL CHECK (source IN ('csv_upload', 'api', 'manual')),
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'partial', 'failed')),
  total_items INTEGER NOT NULL DEFAULT 0,
  created_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  default_category_code TEXT,
  default_priority TEXT NOT NULL DEFAULT 'medium' CHECK (default_priority IN ('low', 'medium', 'high', 'critical')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  original_filename TEXT,
  storage_path TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (tenant_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_bulk_requests_tenant_status ON public.bulk_service_requests (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.bulk_service_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  bulk_request_id UUID NOT NULL REFERENCES public.bulk_service_requests(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  asset_id UUID REFERENCES public.assets(id),
  asset_identifier TEXT,
  customer_account_id UUID REFERENCES public.customer_accounts(id),
  customer_site_id UUID REFERENCES public.customer_sites(id),
  category_code TEXT,
  description TEXT,
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'created', 'failed', 'skipped')),
  ticket_id UUID REFERENCES public.tickets(id),
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_bulk_items_parent ON public.bulk_service_request_items (bulk_request_id);
CREATE INDEX IF NOT EXISTS idx_bulk_items_ticket ON public.bulk_service_request_items (ticket_id);

-- Batch sequence generation function
CREATE OR REPLACE FUNCTION app_private.generate_bulk_batch_number(
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
  v_padding INTEGER := 5;
BEGIN
  INSERT INTO public.ticket_number_sequences (tenant_id, prefix, year, current_val, padding_length)
  VALUES (p_tenant_id, 'BSR', v_year, 1, 5)
  ON CONFLICT (tenant_id, prefix, year)
  DO UPDATE SET
    current_val = public.ticket_number_sequences.current_val + 1,
    updated_at = timezone('utc', now())
  RETURNING current_val, padding_length INTO v_seq, v_padding;

  RETURN 'BSR-' || v_year::text || '-' || lpad(v_seq::text, v_padding, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_bulk_batch_number(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$ SELECT app_private.generate_bulk_batch_number(p_tenant_id); $$;

-- ============================================================================
-- 5. ROW-LEVEL SECURITY & GRANTS
-- ============================================================================
ALTER TABLE public.service_evidence_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_service_request_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_evidence_requirements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_evidence TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bulk_service_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bulk_service_request_items TO authenticated;

-- Policies
CREATE POLICY "operations_evidence_reqs_all"
  ON public.service_evidence_requirements
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT m.tenant_id FROM public.memberships m
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "operations_evidence_all"
  ON public.service_evidence
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT m.tenant_id FROM public.memberships m
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "user_notification_prefs_own"
  ON public.notification_preferences
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_notifications_own"
  ON public.notifications
  FOR ALL
  TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "operations_bulk_requests_all"
  ON public.bulk_service_requests
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT m.tenant_id FROM public.memberships m
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "operations_bulk_items_all"
  ON public.bulk_service_request_items
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT m.tenant_id FROM public.memberships m
      WHERE m.user_id = auth.uid()
    )
  );
