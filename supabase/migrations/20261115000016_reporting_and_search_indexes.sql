-- ============================================================================
-- CareOS Migration 20261115000016_reporting_and_search_indexes.sql
-- STEP 16: Dashboard, Global Search, Role-Scoped Exports & Reporting Indexes
-- ============================================================================

-- 1. Optimized Compound & Text Search Indexes for Performance
-- Tickets reporting & search indexes
CREATE INDEX IF NOT EXISTS idx_tickets_reporting ON public.tickets(tenant_id, created_at, status, priority);
CREATE INDEX IF NOT EXISTS idx_tickets_customer_reporting ON public.tickets(tenant_id, customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_search_number ON public.tickets(tenant_id, ticket_number);
CREATE INDEX IF NOT EXISTS idx_tickets_search_title ON public.tickets USING gin(to_tsvector('english', title));

-- Assets search & fleet reporting indexes
CREATE INDEX IF NOT EXISTS idx_assets_reporting ON public.assets(tenant_id, customer_id, operational_status);
CREATE INDEX IF NOT EXISTS idx_assets_search_plate ON public.assets(tenant_id, plate_number);
CREATE INDEX IF NOT EXISTS idx_assets_search_vin ON public.assets(tenant_id, vin);
CREATE INDEX IF NOT EXISTS idx_assets_search_serial ON public.assets(tenant_id, serial_number);

-- Work Orders dispatch & technician workload indexes
CREATE INDEX IF NOT EXISTS idx_work_orders_reporting ON public.work_orders(tenant_id, status, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_work_orders_technician_load ON public.work_orders(tenant_id, technician_id, status);

-- Customer Accounts search index
CREATE INDEX IF NOT EXISTS idx_customers_search_name ON public.customer_accounts(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_customers_search_acc_num ON public.customer_accounts(tenant_id, account_number);

-- Quotations commercial reporting index
CREATE INDEX IF NOT EXISTS idx_quotations_reporting ON public.quotations(tenant_id, status, created_at);

-- Parts catalog & stock reporting indexes
CREATE INDEX IF NOT EXISTS idx_parts_search_sku ON public.parts_catalog(tenant_id, part_number);
CREATE INDEX IF NOT EXISTS idx_stock_levels_reporting ON public.stock_levels(tenant_id, quantity_on_hand);

-- Bulk Service campaigns reporting index
CREATE INDEX IF NOT EXISTS idx_bulk_service_reporting ON public.bulk_service_requests(tenant_id, status, created_at);

-- 2. Export Audit Logs Table
CREATE TABLE IF NOT EXISTS public.export_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    portal TEXT NOT NULL CHECK (portal IN ('operations', 'customer', 'technician', 'admin')),
    export_type TEXT NOT NULL CHECK (export_type IN ('tickets', 'customers', 'assets', 'sla_report', 'inventory', 'bulk_service', 'service_trends')),
    format TEXT NOT NULL DEFAULT 'csv' CHECK (format IN ('csv', 'json', 'xlsx')),
    row_count INT NOT NULL DEFAULT 0,
    filters_applied JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_audit_logs_tenant ON public.export_audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_audit_logs_user ON public.export_audit_logs(user_id, created_at DESC);

-- ── Enable Row-Level Security ──────────────────────────────────────────────────
ALTER TABLE public.export_audit_logs ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies ─────────────────────────────────────────────────────────────
-- Tenant operations users can view their export audit history
CREATE POLICY "Tenant users view own export audit logs"
    ON public.export_audit_logs
    FOR SELECT
    TO authenticated
    USING (
        tenant_id IN (
            SELECT tm.tenant_id FROM public.tenant_members tm
            WHERE tm.user_id = auth.uid() AND tm.is_active = true
        )
    );

CREATE POLICY "Tenant users insert export audit logs"
    ON public.export_audit_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id IN (
            SELECT tm.tenant_id FROM public.tenant_members tm
            WHERE tm.user_id = auth.uid() AND tm.is_active = true
        )
    );

-- ── Grants ───────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON public.export_audit_logs TO authenticated;
GRANT ALL ON public.export_audit_logs TO service_role;
