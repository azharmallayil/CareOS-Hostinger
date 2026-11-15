import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createAdminClient } from "@careos/supabase-client";
import { requireAuth, requireTenant } from "../middleware/guards.js";
import { CareOSAiGateway } from "../services/ai-gateway.js";

const chatSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(2000),
  contextEntityType: z.enum(["ticket", "asset", "quotation", "general"]).optional(),
  contextEntityId: z.string().uuid().optional(),
});

export const aiRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  const aiGateway = new CareOSAiGateway();

  // POST /api/v1/ai/chat
  fastify.post(
    "/chat",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const user = request.auth?.user;
      if (!tenantId || !user || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = chatSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const { message, contextEntityType, contextEntityId } = parsed.data;
      let { conversationId } = parsed.data;

      // Determine portal mode
      const roles = request.auth?.activeMembership?.roles || [];
      const isCustomerUser = roles.includes("customer_user");
      const portalMode = isCustomerUser ? "customer" : "internal";

      // 1. Ensure conversation exists
      if (!conversationId) {
        const titleSnippet = message.length > 30 ? `${message.slice(0, 30)}...` : message;
        const { data: conv, error: convErr } = await adminClient
          .from("ai_conversations")
          .insert({
            tenant_id: tenantId,
            user_id: user.id,
            portal_mode: portalMode,
            context_entity_type: contextEntityType ?? null,
            context_entity_id: contextEntityId ?? null,
            title: titleSnippet,
          })
          .select("id")
          .single();

        if (convErr) {
          return reply.status(500).send({ error: { code: "DB_ERROR", message: convErr.message } });
        }
        conversationId = conv.id;
      }

      // 2. Record user message
      await adminClient.from("ai_messages").insert({
        conversation_id: conversationId,
        tenant_id: tenantId,
        sender: "user",
        content: message,
      });

      // 3. Generate AI Gateway response
      const aiResponse = await aiGateway.generateResponse(
        message,
        {
          portalMode,
          tenantId,
          userId: user.id,
          userEmail: user.email,
          contextEntityType,
          contextEntityId,
        },
        adminClient
      );

      // 4. Record assistant message
      await adminClient.from("ai_messages").insert({
        conversation_id: conversationId,
        tenant_id: tenantId,
        sender: "assistant",
        content: aiResponse.reply,
        citations: aiResponse.citations,
        provider_used: aiResponse.providerUsed,
      });

      return reply.send({
        conversationId,
        reply: aiResponse.reply,
        citations: aiResponse.citations,
        providerUsed: aiResponse.providerUsed,
        requiresHumanApproval: aiResponse.requiresHumanApproval,
        actionRequested: aiResponse.actionRequested,
      });
    }
  );

  // GET /api/v1/ai/conversations
  fastify.get(
    "/conversations",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const user = request.auth?.user;
      if (!tenantId || !user || !adminClient) {
        return reply.send({ conversations: [] });
      }

      const { data, error } = await adminClient
        .from("ai_conversations")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(20);

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ conversations: data || [] });
    }
  );

  // GET /api/v1/ai/conversations/:id/messages
  fastify.get<{ Params: { id: string } }>(
    "/conversations/:id/messages",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const user = request.auth?.user;
      const { id } = request.params;
      if (!tenantId || !user || !adminClient) {
        return reply.send({ messages: [] });
      }

      const { data, error } = await adminClient
        .from("ai_messages")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ messages: data || [] });
    }
  );
};
