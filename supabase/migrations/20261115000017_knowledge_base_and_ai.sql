-- ============================================================================
-- CareOS Migration 20261115000017_knowledge_base_and_ai.sql
-- STEP 17: CareOS Assist AI Gateway & Tenant-Scoped Knowledge Base
-- ============================================================================

-- 1. Knowledge Base Articles
CREATE TABLE IF NOT EXISTS public.knowledge_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('manual', 'faq', 'troubleshooting', 'installation_guide', 'datasheet', 'procedure')),
    target_audience TEXT NOT NULL DEFAULT 'customer' CHECK (target_audience IN ('customer', 'internal', 'all')),
    content TEXT NOT NULL,
    summary TEXT,
    tags TEXT[] NOT NULL DEFAULT '{}',
    device_models TEXT[] NOT NULL DEFAULT '{}',
    is_published BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_knowledge_article_slug UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_lookup ON public.knowledge_articles(tenant_id, target_audience, category)
    WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_search ON public.knowledge_articles USING gin(to_tsvector('english', title || ' ' || content));

-- 2. Knowledge Base Document Metadata (PDFs, schematics, datasheets)
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN ('manual', 'datasheet', 'schematic', 'firmware_guide', 'procedure')),
    target_audience TEXT NOT NULL DEFAULT 'customer' CHECK (target_audience IN ('customer', 'internal', 'all')),
    parsed_text TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_tenant ON public.knowledge_documents(tenant_id, target_audience);

-- 3. AI Conversations
CREATE TABLE IF NOT EXISTS public.ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    portal_mode TEXT NOT NULL CHECK (portal_mode IN ('customer', 'internal')),
    context_entity_type TEXT CHECK (context_entity_type IN ('ticket', 'asset', 'quotation', 'general')),
    context_entity_id UUID,
    title TEXT NOT NULL DEFAULT 'New Conversation',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON public.ai_conversations(tenant_id, user_id, created_at DESC);

-- 4. AI Messages
CREATE TABLE IF NOT EXISTS public.ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    sender TEXT NOT NULL CHECK (sender IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    provider_used TEXT NOT NULL DEFAULT 'deterministic_fallback',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON public.ai_messages(conversation_id, created_at ASC);

-- ── Enable Row-Level Security ──────────────────────────────────────────────────
ALTER TABLE public.knowledge_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies ─────────────────────────────────────────────────────────────
-- Knowledge articles: customers can ONLY see target_audience IN ('customer', 'all')
CREATE POLICY "Tenant users view published knowledge articles"
    ON public.knowledge_articles
    FOR SELECT
    TO authenticated
    USING (
        tenant_id IN (
            SELECT tm.tenant_id FROM public.tenant_members tm
            WHERE tm.user_id = auth.uid() AND tm.is_active = true
        )
        AND is_published = true
    );

CREATE POLICY "Operations staff manage knowledge articles"
    ON public.knowledge_articles
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

-- Documents RLS
CREATE POLICY "Tenant users view authorized documents"
    ON public.knowledge_documents
    FOR SELECT
    TO authenticated
    USING (
        tenant_id IN (
            SELECT tm.tenant_id FROM public.tenant_members tm
            WHERE tm.user_id = auth.uid() AND tm.is_active = true
        )
    );

-- AI Conversations RLS
CREATE POLICY "Users access own AI conversations"
    ON public.ai_conversations
    FOR ALL
    TO authenticated
    USING (
        tenant_id IN (
            SELECT tm.tenant_id FROM public.tenant_members tm
            WHERE tm.user_id = auth.uid() AND tm.is_active = true
        )
        AND user_id = auth.uid()
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tm.tenant_id FROM public.tenant_members tm
            WHERE tm.user_id = auth.uid() AND tm.is_active = true
        )
        AND user_id = auth.uid()
    );

-- AI Messages RLS
CREATE POLICY "Users access own AI messages"
    ON public.ai_messages
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

-- ── Grants ───────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_articles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_messages TO authenticated;

GRANT ALL ON public.knowledge_articles TO service_role;
GRANT ALL ON public.knowledge_documents TO service_role;
GRANT ALL ON public.ai_conversations TO service_role;
GRANT ALL ON public.ai_messages TO service_role;
