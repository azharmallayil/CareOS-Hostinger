-- Migration: 20261115000010_coverage_quotations_and_payments.sql
-- Description: Service coverage classification, warranty registry, service contracts,
--              versioned free-service rules & decisions, quotations with versioning & VAT,
--              invoices, server-verified payments, and commercial overrides.
-- Reversible:
--   DROP TABLE IF EXISTS public.commercial_overrides CASCADE;
--   DROP TABLE IF EXISTS public.payment_webhook_events CASCADE;
--   DROP TABLE IF EXISTS public.payments CASCADE;
--   DROP TABLE IF EXISTS public.invoices CASCADE;
--   DROP TABLE IF EXISTS public.quotation_versions CASCADE;
--   DROP TABLE IF EXISTS public.quotations CASCADE;
--   DROP TABLE IF EXISTS public.free_service_eligibility_decisions CASCADE;
--   DROP TABLE IF EXISTS public.free_service_rule_versions CASCADE;
--   DROP TABLE IF EXISTS public.free_service_rules CASCADE;
--   DROP TABLE IF EXISTS public.contracts CASCADE;
--   DROP TABLE IF EXISTS public.warranties CASCADE;

-- ============================================================================
-- 1. WARRANTIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.warranties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  warranty_type TEXT NOT NULL CHECK (warranty_type IN ('manufacturer', 'extended', 'dealer', 'service_contract')),
  provider TEXT NOT NULL,
  reference_number TEXT,
  starts_at DATE NOT NULL,
  expires_at DATE NOT NULL,
  covers_parts BOOLEAN NOT NULL DEFAULT true,
  covers_labour BOOLEAN NOT NULL DEFAULT true,
  terms_document_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'void')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_warranties_tenant ON public.warranties (tenant_id);
CREATE INDEX IF NOT EXISTS idx_warranties_asset_active ON public.warranties (asset_id, status, expires_at);

-- ============================================================================
-- 2. SERVICE CONTRACTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  customer_account_id UUID NOT NULL REFERENCES public.customer_accounts(id) ON DELETE RESTRICT,
  contract_number TEXT NOT NULL,
  name TEXT NOT NULL,
  covers_categories TEXT[] NOT NULL DEFAULT '{}',
  includes_parts BOOLEAN NOT NULL DEFAULT false,
  includes_labour BOOLEAN NOT NULL DEFAULT true,
  free_visits_per_year INTEGER,
  starts_at DATE NOT NULL,
  expires_at DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'expired', 'terminated')),
  document_url TEXT,
  terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  monthly_fee NUMERIC(15, 4),
  currency CHAR(3) NOT NULL DEFAULT 'SAR',
  signed_at TIMESTAMPTZ,
  signed_by_customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_contracts_tenant_number UNIQUE (tenant_id, contract_number)
);

CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON public.contracts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_contracts_customer ON public.contracts (customer_account_id, status, expires_at);

-- ============================================================================
-- 3. FREE SERVICE RULES & VERSIONS (OQ-09 Architecture)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.free_service_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 100, -- lower number = higher priority
  current_version_id UUID,              -- Forward ref to active version
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_free_service_rules_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_free_service_rules_eval 
  ON public.free_service_rules (tenant_id, is_enabled, priority);

CREATE TABLE IF NOT EXISTS public.free_service_rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.free_service_rules(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL,

  -- Eligibility scope
  eligible_account_types TEXT[] NOT NULL DEFAULT '{"commercial", "residential", "enterprise", "government"}',
  eligible_account_ids UUID[],
  eligible_asset_categories TEXT[],
  eligible_service_categories TEXT[],

  -- Validity window
  effective_from DATE NOT NULL,
  effective_until DATE,

  -- Visit limits
  max_visits_per_asset INTEGER,
  visit_period TEXT CHECK (visit_period IN ('day', 'month', 'quarter', 'year', 'lifetime')),

  -- Coverage scope
  covers_labour BOOLEAN NOT NULL DEFAULT true,
  covers_parts BOOLEAN NOT NULL DEFAULT false,
  covers_travel_charge BOOLEAN NOT NULL DEFAULT false,

  -- Approval controls
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  approver_role TEXT,
  approver_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Structured conditions and exclusions
  exclusions JSONB NOT NULL DEFAULT '[]'::jsonb,
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Status & version lifecycle
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'superseded', 'rejected')),
  authored_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  change_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_free_service_rule_version UNIQUE (rule_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_free_service_rule_versions_status 
  ON public.free_service_rule_versions (rule_id, status);

CREATE TABLE IF NOT EXISTS public.free_service_eligibility_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.free_service_rules(id) ON DELETE SET NULL,
  rule_version_id UUID REFERENCES public.free_service_rule_versions(id) ON DELETE SET NULL,
  is_eligible BOOLEAN NOT NULL,
  explanation TEXT NOT NULL,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approval_notes TEXT,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_free_service_decisions_ticket 
  ON public.free_service_eligibility_decisions (ticket_id);

-- ============================================================================
-- 4. QUOTATIONS & QUOTATION VERSIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  quotation_number TEXT NOT NULL,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE RESTRICT,
  customer_account_id UUID NOT NULL REFERENCES public.customer_accounts(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'expired', 'invoiced', 'superseded')),
  current_version INTEGER NOT NULL DEFAULT 1,
  subtotal NUMERIC(15, 4) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.1500, -- 15% standard VAT
  tax_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'SAR',
  valid_until TIMESTAMPTZ NOT NULL,
  terms_and_conditions TEXT,
  notes TEXT,
  sent_at TIMESTAMPTZ,
  customer_approved_at TIMESTAMPTZ,
  customer_rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  approved_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  document_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_quotations_tenant_number UNIQUE (tenant_id, quotation_number)
);

CREATE INDEX IF NOT EXISTS idx_quotations_ticket ON public.quotations (ticket_id, status);
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON public.quotations (customer_account_id);

CREATE TABLE IF NOT EXISTS public.quotation_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(15, 4) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.1500,
  tax_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  change_reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_quotation_version_num UNIQUE (quotation_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_quotation_versions_quote ON public.quotation_versions (quotation_id, version_number DESC);

-- ============================================================================
-- 5. INVOICES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE RESTRICT,
  customer_account_id UUID NOT NULL REFERENCES public.customer_accounts(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'partially_paid', 'paid', 'void', 'written_off')),
  subtotal NUMERIC(15, 4) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.1500,
  tax_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(15, 4) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'SAR',
  due_date DATE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  paid_at TIMESTAMPTZ,
  document_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_invoices_tenant_number UNIQUE (tenant_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_ticket ON public.invoices (ticket_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices (customer_account_id);

-- ============================================================================
-- 6. PAYMENTS & WEBHOOK LOGS (Provider Abstraction)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE RESTRICT,
  method TEXT NOT NULL CHECK (method IN ('card_online', 'bank_transfer', 'cash', 'pos_terminal')),
  amount NUMERIC(15, 4) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'SAR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded')),
  provider TEXT NOT NULL DEFAULT 'mock_gateway',
  provider_payment_id TEXT,
  provider_reference TEXT,
  idempotency_key TEXT,
  collected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  confirmed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_ticket ON public.payments (ticket_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_idempotency 
  ON public.payments (tenant_id, idempotency_key) 
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  signature TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed', 'ignored')),
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_webhook_provider_event UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_status ON public.payment_webhook_events (status);

-- ============================================================================
-- 7. COMMERCIAL OVERRIDES & AUDIT (Exception Gate for Paid Tickets)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.commercial_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  authorized_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  override_type TEXT NOT NULL CHECK (override_type IN ('payment_deferred', 'goodwill_warranty', 'contract_grace_period', 'executive_exception')),
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_commercial_overrides_ticket ON public.commercial_overrides (ticket_id);

-- ============================================================================
-- 8. NUMBERING FUNCTIONS (Quotations & Invoices)
-- ============================================================================
CREATE OR REPLACE FUNCTION app_private.generate_quotation_number(
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
  VALUES (p_tenant_id, 'QT', v_year, 1, 6)
  ON CONFLICT (tenant_id, prefix, year)
  DO UPDATE SET
    current_val = public.ticket_number_sequences.current_val + 1,
    updated_at = timezone('utc', now())
  RETURNING current_val, padding_length INTO v_seq, v_padding;

  RETURN 'QT-' || v_year::text || '-' || lpad(v_seq::text, v_padding, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_quotation_number(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$ SELECT app_private.generate_quotation_number(p_tenant_id); $$;

CREATE OR REPLACE FUNCTION app_private.generate_invoice_number(
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
  VALUES (p_tenant_id, 'INV', v_year, 1, 6)
  ON CONFLICT (tenant_id, prefix, year)
  DO UPDATE SET
    current_val = public.ticket_number_sequences.current_val + 1,
    updated_at = timezone('utc', now())
  RETURNING current_val, padding_length INTO v_seq, v_padding;

  RETURN 'INV-' || v_year::text || '-' || lpad(v_seq::text, v_padding, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_invoice_number(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$ SELECT app_private.generate_invoice_number(p_tenant_id); $$;

-- ============================================================================
-- 9. ROW-LEVEL SECURITY POLICIES
-- ============================================================================
ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_service_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_service_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_service_eligibility_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_overrides ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranties TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.free_service_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.free_service_rule_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.free_service_eligibility_decisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.quotation_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT SELECT, INSERT ON public.commercial_overrides TO authenticated;

-- Policies for WARRANTIES & CONTRACTS
CREATE POLICY "warranties_access" ON public.warranties
  FOR ALL TO authenticated
  USING (
    app_private.is_platform_admin() OR
    app_private.has_active_membership(tenant_id)
  );

CREATE POLICY "contracts_access" ON public.contracts
  FOR ALL TO authenticated
  USING (
    app_private.is_platform_admin() OR
    app_private.has_active_membership(tenant_id)
  );

-- Policies for QUOTATIONS
CREATE POLICY "quotations_select" ON public.quotations
  FOR SELECT TO authenticated
  USING (
    app_private.is_platform_admin() OR
    (app_private.has_active_membership(tenant_id) AND (
      app_private.can_access_portal(tenant_id, 'operations') OR
      app_private.can_access_ticket(tenant_id, ticket_id)
    ))
  );

CREATE POLICY "quotations_manage" ON public.quotations
  FOR ALL TO authenticated
  USING (
    app_private.is_platform_admin() OR
    (app_private.has_active_membership(tenant_id) AND app_private.can_access_portal(tenant_id, 'operations'))
  );

CREATE POLICY "invoices_select" ON public.invoices
  FOR SELECT TO authenticated
  USING (
    app_private.is_platform_admin() OR
    (app_private.has_active_membership(tenant_id) AND (
      app_private.can_access_portal(tenant_id, 'operations') OR
      app_private.can_access_ticket(tenant_id, ticket_id)
    ))
  );

CREATE POLICY "payments_select" ON public.payments
  FOR SELECT TO authenticated
  USING (
    app_private.is_platform_admin() OR
    (app_private.has_active_membership(tenant_id) AND (
      app_private.can_access_portal(tenant_id, 'operations') OR
      app_private.can_access_ticket(tenant_id, ticket_id)
    ))
  );
