-- ============================================================================
-- CareOS Migration 20261115000015_erp_and_telematics_integrations.sql
-- STEP 15: Generic REST ERP Connector & Telematics Event Ingestion Framework
-- ============================================================================

-- 1. Integration Connections
CREATE TABLE IF NOT EXISTS public.integration_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    integration_type TEXT NOT NULL CHECK (integration_type IN ('erp', 'telematics')),
    provider_code TEXT NOT NULL, -- e.g. 'generic_rest_erp', 'generic_webhook_telematics', 'mock_erp'
    name TEXT NOT NULL,
    base_url TEXT,
    auth_type TEXT NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none', 'bearer_token', 'api_key', 'hmac_signature', 'basic_auth')),
    -- Encrypted server-side; NEVER exposed to frontend
    auth_credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
    webhook_secret TEXT, -- For HMAC webhook signature validation
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_connections_tenant ON public.integration_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_connections_type ON public.integration_connections(tenant_id, integration_type);

-- 2. External ID Mappings (Bidirectional mapping between CareOS entities and external system IDs)
CREATE TABLE IF NOT EXISTS public.external_id_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('customer', 'asset', 'ticket', 'invoice', 'part', 'vendor')),
    internal_id UUID NOT NULL,
    external_id TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_external_id_mapping UNIQUE (tenant_id, connection_id, entity_type, external_id)
);

CREATE INDEX IF NOT EXISTS idx_external_id_mappings_internal ON public.external_id_mappings(tenant_id, entity_type, internal_id);

-- 3. Field Mappings (Customizable schema transformation)
CREATE TABLE IF NOT EXISTS public.field_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('customer', 'asset', 'invoice', 'ticket', 'telematics_event')),
    internal_field TEXT NOT NULL,
    external_field TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'bidirectional' CHECK (direction IN ('inbound', 'outbound', 'bidirectional')),
    transformation_rule TEXT NOT NULL DEFAULT 'direct' CHECK (transformation_rule IN ('direct', 'uppercase', 'lowercase', 'iso_date', 'cent_to_amount', 'amount_to_cent')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_field_mappings_lookup ON public.field_mappings(tenant_id, connection_id, entity_type);

-- 4. Inbound Event Inbox (Durable telematics & ERP webhook intake)
CREATE TABLE IF NOT EXISTS public.inbound_event_inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    connection_id UUID REFERENCES public.integration_connections(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- e.g. 'device:online', 'camera:fault', 'alert:dms', 'erp:invoice_paid'
    source_event_id TEXT, -- External unique ID for deduplication
    idempotency_key TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'ignored_duplicate', 'ignored_heartbeat', 'failed')),
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_inbound_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_inbound_inbox_status ON public.inbound_event_inbox(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_inbound_inbox_created ON public.inbound_event_inbox(created_at DESC);

-- 5. Outbound Event Outbox (Durable transactional outbox for ERP sync)
CREATE TABLE IF NOT EXISTS public.outbound_event_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- e.g. 'invoice:push', 'customer:sync', 'ticket:closure'
    entity_id UUID NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'dead_letter')),
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_attempted_at TIMESTAMPTZ,
    response_status INT,
    response_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbound_outbox_queue ON public.outbound_event_outbox(status, next_run_at)
    WHERE status IN ('pending', 'processing');

-- 6. Integration Sync Logs (Audit trail of sync operations)
CREATE TABLE IF NOT EXISTS public.integration_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    connection_id UUID REFERENCES public.integration_connections(id) ON DELETE SET NULL,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    entity_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'warning', 'error')),
    records_processed INT NOT NULL DEFAULT 0,
    records_failed INT NOT NULL DEFAULT 0,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_sync_logs ON public.integration_sync_logs(tenant_id, created_at DESC);

-- ── Enable Row-Level Security ──────────────────────────────────────────────────
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_id_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_event_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_sync_logs ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies ─────────────────────────────────────────────────────────────
-- Tenant operations users can view and manage their connections
CREATE POLICY "Tenant operations users manage integration connections"
    ON public.integration_connections
    FOR ALL
    TO authenticated
    USING (
        tenant_id IN (
            SELECT tm.tenant_id FROM public.tenant_members tm
            WHERE tm.user_id = auth.uid() AND tm.is_active = true
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tm.tenant_id FROM public.tenant_members tm
            WHERE tm.user_id = auth.uid() AND tm.is_active = true
        )
    );

CREATE POLICY "Tenant members access external id mappings"
    ON public.external_id_mappings
    FOR ALL
    TO authenticated
    USING (
        tenant_id IN (
            SELECT tm.tenant_id FROM public.tenant_members tm
            WHERE tm.user_id = auth.uid() AND tm.is_active = true
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tm.tenant_id FROM public.tenant_members tm
            WHERE tm.user_id = auth.uid() AND tm.is_active = true
        )
    );

CREATE POLICY "Tenant members access field mappings"
    ON public.field_mappings
    FOR ALL
    TO authenticated
    USING (
        tenant_id IN (
            SELECT tm.tenant_id FROM public.tenant_members tm
            WHERE tm.user_id = auth.uid() AND tm.is_active = true
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tm.tenant_id FROM public.tenant_members tm
            WHERE tm.user_id = auth.uid() AND tm.is_active = true
        )
    );

CREATE POLICY "Tenant members access inbound inbox"
    ON public.inbound_event_inbox
    FOR ALL
    TO authenticated
    USING (
        tenant_id IN (
            SELECT tm.tenant_id FROM public.tenant_members tm
            WHERE tm.user_id = auth.uid() AND tm.is_active = true
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tm.tenant_id FROM public.tenant_members tm
            WHERE tm.user_id = auth.uid() AND tm.is_active = true
        )
    );

CREATE POLICY "Tenant members access outbound outbox"
    ON public.outbound_event_outbox
    FOR ALL
    TO authenticated
    USING (
        tenant_id IN (
            SELECT tm.tenant_id FROM public.tenant_members tm
            WHERE tm.user_id = auth.uid() AND tm.is_active = true
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tm.tenant_id FROM public.tenant_members tm
            WHERE tm.user_id = auth.uid() AND tm.is_active = true
        )
    );

CREATE POLICY "Tenant members view sync logs"
    ON public.integration_sync_logs
    FOR SELECT
    TO authenticated
    USING (
        tenant_id IN (
            SELECT tm.tenant_id FROM public.tenant_members tm
            WHERE tm.user_id = auth.uid() AND tm.is_active = true
        )
    );

-- ── Grants ───────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_id_mappings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_mappings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbound_event_inbox TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outbound_event_outbox TO authenticated;
GRANT SELECT, INSERT ON public.integration_sync_logs TO authenticated;

GRANT ALL ON public.integration_connections TO service_role;
GRANT ALL ON public.external_id_mappings TO service_role;
GRANT ALL ON public.field_mappings TO service_role;
GRANT ALL ON public.inbound_event_inbox TO service_role;
GRANT ALL ON public.outbound_event_outbox TO service_role;
GRANT ALL ON public.integration_sync_logs TO service_role;
