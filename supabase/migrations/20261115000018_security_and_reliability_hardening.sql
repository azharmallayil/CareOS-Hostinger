-- Migration: 20261115000018_security_and_reliability_hardening.sql
-- Description: Step 19 comprehensive security, isolation, and audit immutability hardening.
--              - Enables RLS on payment_webhook_events
--              - Sets search_path on public generator wrappers
--              - Revokes UPDATE/DELETE on audit & immutable ledger tables
--              - Adds immutability trigger on audit ledgers
--              - Enforces strict zero-privilege defaults for anon role

-- ============================================================================
-- 1. ENABLE RLS ON PAYMENT WEBHOOK EVENTS & RESTRICT ACCESS
-- ============================================================================
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

-- Revoke all permissions from public/anon/authenticated on webhook events
REVOKE ALL ON public.payment_webhook_events FROM anon;
REVOKE ALL ON public.payment_webhook_events FROM authenticated;
GRANT ALL ON public.payment_webhook_events TO service_role;

-- Allow authenticated tenant admins read-only inspection of webhook logs for their tenant
CREATE POLICY "tenant_admins_read_webhook_events"
  ON public.payment_webhook_events
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_memberships tm
      JOIN public.membership_roles mr ON mr.membership_id = tm.id
      JOIN public.roles r ON r.id = mr.role_id
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'active'
        AND r.name IN ('Platform Admin', 'Tenant Admin')
    )
  );

-- ============================================================================
-- 2. HARDEN SECURITY DEFINER SEARCH_PATH ON PUBLIC GENERATOR WRAPPERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_quotation_number(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = app_private, public, pg_temp
AS $$ SELECT app_private.generate_quotation_number(p_tenant_id); $$;

CREATE OR REPLACE FUNCTION public.generate_invoice_number(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = app_private, public, pg_temp
AS $$ SELECT app_private.generate_invoice_number(p_tenant_id); $$;

CREATE OR REPLACE FUNCTION public.generate_work_order_number(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = app_private, public, pg_temp
AS $$ SELECT app_private.generate_work_order_number(p_tenant_id); $$;

CREATE OR REPLACE FUNCTION public.generate_bulk_batch_number(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = app_private, public, pg_temp
AS $$ SELECT app_private.generate_bulk_batch_number(p_tenant_id); $$;

CREATE OR REPLACE FUNCTION public.generate_rma_case_number(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = app_private, public, pg_temp
AS $$ SELECT app_private.generate_rma_case_number(p_tenant_id); $$;

-- ============================================================================
-- 3. AUDIT & LEDGER IMMUTABILITY (PREVENT UPDATE & DELETE)
-- ============================================================================
-- Generic trigger function to reject UPDATE or DELETE on immutable tables
CREATE OR REPLACE FUNCTION app_private.enforce_ledger_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app_private, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Audit and ledger tables are strictly immutable. Action % on table % is prohibited.',
    TG_OP, TG_TABLE_NAME;
END;
$$;

-- Apply immutability trigger to stock_movements
DROP TRIGGER IF EXISTS trg_immutable_stock_movements ON public.stock_movements;
CREATE TRIGGER trg_immutable_stock_movements
  BEFORE UPDATE OR DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_ledger_immutability();

-- Apply immutability trigger to escalation_history
DROP TRIGGER IF EXISTS trg_immutable_escalation_history ON public.escalation_history;
CREATE TRIGGER trg_immutable_escalation_history
  BEFORE UPDATE OR DELETE ON public.escalation_history
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_ledger_immutability();

-- Apply immutability trigger to ticket_events
DROP TRIGGER IF EXISTS trg_immutable_ticket_events ON public.ticket_events;
CREATE TRIGGER trg_immutable_ticket_events
  BEFORE UPDATE OR DELETE ON public.ticket_events
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_ledger_immutability();

-- Apply immutability trigger to export_audit_logs
DROP TRIGGER IF EXISTS trg_immutable_export_audit_logs ON public.export_audit_logs;
CREATE TRIGGER trg_immutable_export_audit_logs
  BEFORE UPDATE OR DELETE ON public.export_audit_logs
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_ledger_immutability();

-- Revoke UPDATE/DELETE grants from authenticated role on ledgers
REVOKE UPDATE, DELETE ON public.stock_movements FROM authenticated;
REVOKE UPDATE, DELETE ON public.escalation_history FROM authenticated;
REVOKE UPDATE, DELETE ON public.ticket_events FROM authenticated;
REVOKE UPDATE, DELETE ON public.export_audit_logs FROM authenticated;

-- ============================================================================
-- 4. RE-ENFORCE ZERO-PRIVILEGE FOR ANON ROLE ACROSS ALL PUBLIC OBJECTS
-- ============================================================================
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
