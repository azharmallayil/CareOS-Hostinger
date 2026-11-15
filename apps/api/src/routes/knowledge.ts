import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createAdminClient } from "@careos/supabase-client";
import { requireAuth, requireTenant } from "../middleware/guards.js";

const createArticleSchema = z.object({
  title: z.string().min(3).max(200),
  slug: z.string().min(3).max(100),
  category: z.enum(["manual", "faq", "troubleshooting", "installation_guide", "datasheet", "procedure"]),
  targetAudience: z.enum(["customer", "internal", "all"]).default("customer"),
  content: z.string().min(10),
  summary: z.string().max(500).optional(),
  tags: z.array(z.string()).default([]),
  deviceModels: z.array(z.string()).default([]),
  isPublished: z.boolean().default(true),
});

export const knowledgeRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  // GET /api/v1/knowledge/articles
  fastify.get(
    "/articles",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ articles: [] });
      }

      // Role scoping: customer portal users can ONLY see customer or all
      const roles = request.auth?.activeMembership?.roles || [];
      const isCustomerUser = roles.includes("customer_user");

      let query = adminClient
        .from("knowledge_articles")
        .select("id, title, slug, category, target_audience, summary, tags, device_models, created_at")
        .eq("tenant_id", tenantId)
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      if (isCustomerUser) {
        query = query.in("target_audience", ["customer", "all"]);
      }

      const { data, error } = await query;
      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ articles: data || [] });
    }
  );

  // POST /api/v1/knowledge/articles (Operations Only)
  fastify.post(
    "/articles",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const roles = request.auth?.activeMembership?.roles || [];
      if (roles.includes("customer_user")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only operations staff can author knowledge articles" } });
      }

      const parsed = createArticleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const b = parsed.data;
      const { data, error } = await adminClient
        .from("knowledge_articles")
        .insert({
          tenant_id: tenantId,
          title: b.title,
          slug: b.slug,
          category: b.category,
          target_audience: b.targetAudience,
          content: b.content,
          summary: b.summary ?? null,
          tags: b.tags,
          device_models: b.deviceModels,
          is_published: b.isPublished,
        })
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.status(201).send({ article: data });
    }
  );

  // GET /api/v1/knowledge/articles/:id
  fastify.get<{ Params: { id: string } }>(
    "/articles/:id",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const { id } = request.params;
      if (!tenantId || !adminClient) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Article not found" } });
      }

      const roles = request.auth?.activeMembership?.roles || [];
      const isCustomerUser = roles.includes("customer_user");

      const { data: article, error } = await adminClient
        .from("knowledge_articles")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .single();

      if (error || !article) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Article not found" } });
      }

      // Security check: customer user trying to read internal article
      if (isCustomerUser && article.target_audience === "internal") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Access denied to internal knowledge" } });
      }

      return reply.send({ article });
    }
  );
};
