-- Migration: 20261115000014_contracts_sla_and_escalation.sql
-- Description: Contract coverage entitlements, SLA policies with business calendars,
--              SLA instances with clock pause/resume calculations, escalation rules,
--              and escalation audit history.

-- ============================================================================
-- 1. CONTRACT COVERAGE ENTITLEMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.contract_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  service_category_code TEXT,
  max_free_visits INTEGER,
  labour_discount_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (labour_discount_percentage BETWEEN 0 AND 100),
  parts_discount_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (parts_discount_percentage BETWEEN 0 AND 100),
  sla_tier TEXT NOT NULL DEFAULT 'standard' CHECK (sla_tier IN ('standard', 'gold', 'platinum')),
  custom_response_hours INTEGER,
  custom_resolution_hours INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (contract_id, service_category_code)
);

CREATE INDEX IF NOT EXISTS idx_contract_entitlements_contract ON public.contract_entitlements (contract_id);

-- ============================================================================
-- 2. SLA POLICIES TABLE (WITH BUSINESS CALENDARS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('standard', 'gold', 'platinum')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  service_category_code TEXT,
  target_response_hours INTEGER NOT NULL DEFAULT 4 CHECK (target_response_hours > 0),
  target_resolution_hours INTEGER NOT NULL DEFAULT 24 CHECK (target_resolution_hours > 0),
  business_hours_only BOOLEAN NOT NULL DEFAULT true,
  business_start_time TIME NOT NULL DEFAULT '08:00:00',
  business_end_time TIME NOT NULL DEFAULT '18:00:00',
  working_days INTEGER[] NOT NULL DEFAULT '{0, 1, 2, 3, 4}', -- 0=Sun to 4=Thu in Gulf / KSA
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (tenant_id, tier, priority, service_category_code)
);

CREATE INDEX IF NOT EXISTS idx_sla_policies_tenant ON public.sla_policies (tenant_id);

-- ============================================================================
-- 3. SLA INSTANCES TABLE (TICKET SLA CLOCKS WITH PAUSE / RESUME)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sla_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES public.sla_policies(id) ON DELETE RESTRICT,
  response_target_at TIMESTAMPTZ NOT NULL,
  response_actual_at TIMESTAMPTZ,
  response_breached BOOLEAN NOT NULL DEFAULT false,
  resolution_target_at TIMESTAMPTZ NOT NULL,
  resolution_actual_at TIMESTAMPTZ,
  resolution_breached BOOLEAN NOT NULL DEFAULT false,
  is_paused BOOLEAN NOT NULL DEFAULT false,
  last_paused_at TIMESTAMPTZ,
  total_paused_minutes INTEGER NOT NULL DEFAULT 0 CHECK (total_paused_minutes >= 0),
  pause_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_sla_instances_tenant ON public.sla_instances (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sla_instances_eval ON public.sla_instances (tenant_id, resolution_breached, is_paused);

-- ============================================================================
-- 4. ESCALATION RULES & ESCALATION HISTORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.escalation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  policy_id UUID REFERENCES public.sla_policies(id) ON DELETE CASCADE,
  trigger_condition TEXT NOT NULL
    CHECK (trigger_condition IN ('response_warning_80', 'response_breached', 'resolution_warning_80', 'resolution_breached', 'unassigned_over_2_hours')),
  action_type TEXT NOT NULL
    CHECK (action_type IN ('notify_email', 'notify_in_app', 'notify_sms', 'reassign_priority')),
  target_role TEXT NOT NULL DEFAULT 'tenant_manager',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_escalation_rules_tenant ON public.escalation_rules (tenant_id);

CREATE TABLE IF NOT EXISTS public.escalation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  sla_instance_id UUID REFERENCES public.sla_instances(id) ON DELETE SET NULL,
  rule_id UUID REFERENCES public.escalation_rules(id) ON DELETE SET NULL,
  trigger_condition TEXT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  action_taken TEXT NOT NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_escalation_history_ticket ON public.escalation_history (ticket_id);
CREATE INDEX IF NOT EXISTS idx_escalation_history_tenant ON public.escalation_history (tenant_id, triggered_at DESC);

-- ============================================================================
-- 5. ROW-LEVEL SECURITY & GRANTS
-- ============================================================================
ALTER TABLE public.contract_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalation_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_entitlements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_instances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.escalation_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.escalation_history TO authenticated;

-- Operations policies
CREATE POLICY "operations_contract_entitlements_all"
  ON public.contract_entitlements FOR ALL TO authenticated
  USING (tenant_id IN (SELECT m.tenant_id FROM public.memberships m WHERE m.user_id = auth.uid()));

CREATE POLICY "operations_sla_policies_all"
  ON public.sla_policies FOR ALL TO authenticated
  USING (tenant_id IN (SELECT m.tenant_id FROM public.memberships m WHERE m.user_id = auth.uid()));

CREATE POLICY "operations_sla_instances_all"
  ON public.sla_instances FOR ALL TO authenticated
  USING (tenant_id IN (SELECT m.tenant_id FROM public.memberships m WHERE m.user_id = auth.uid()));

CREATE POLICY "operations_escalation_rules_all"
  ON public.escalation_rules FOR ALL TO authenticated
  USING (tenant_id IN (SELECT m.tenant_id FROM public.memberships m WHERE m.user_id = auth.uid()));

CREATE POLICY "operations_escalation_history_all"
  ON public.escalation_history FOR ALL TO authenticated
  USING (tenant_id IN (SELECT m.tenant_id FROM public.memberships m WHERE m.user_id = auth.uid()));
