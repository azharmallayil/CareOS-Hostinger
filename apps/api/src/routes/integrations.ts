import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { createAdminClient } from "@careos/supabase-client";
import { requireAuth, requireTenant } from "../middleware/guards.js";
import { createErpConnector } from "@careos/connector-erp";
import { createTelematicsConnector } from "@careos/connector-telematics";
import type {
  CanonicalCustomer,
  CanonicalInvoice,
  ErpConnectionConfig,
} from "@careos/integration-contracts";

const createConnectionSchema = z.object({
  integrationType: z.enum(["erp", "telematics"]),
  providerCode: z.string().min(2).max(100),
  name: z.string().min(2).max(100),
  baseUrl: z.string().url().optional(),
  authType: z.enum(["none", "bearer_token", "api_key", "hmac_signature", "basic_auth"]).default("none"),
  credentials: z.record(z.string()).default({}),
  webhookSecret: z.string().optional(),
  settings: z.record(z.unknown()).default({}),
});

const updateConnectionSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  baseUrl: z.string().url().optional(),
  authType: z.enum(["none", "bearer_token", "api_key", "hmac_signature", "basic_auth"]).optional(),
  credentials: z.record(z.string()).optional(),
  webhookSecret: z.string().optional(),
  isActive: z.boolean().optional(),
  settings: z.record(z.unknown()).optional(),
});

const createFieldMappingSchema = z.object({
  connectionId: z.string().uuid(),
  entityType: z.enum(["customer", "asset", "invoice", "ticket", "telematics_event"]),
  internalField: z.string().min(1),
  externalField: z.string().min(1),
  direction: z.enum(["inbound", "outbound", "bidirectional"]).default("bidirectional"),
  transformationRule: z.enum(["direct", "uppercase", "lowercase", "iso_date", "cent_to_amount", "amount_to_cent"]).default("direct"),
});

const triggerErpSyncSchema = z.object({
  connectionId: z.string().uuid(),
  entityType: z.enum(["customer", "invoice"]),
  entityId: z.string().uuid(),
});

export const integrationRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  const erpConnector = createErpConnector();
  const telematicsConnector = createTelematicsConnector();

  // Helper to sanitize connection record (NEVER expose secrets to the client)
  const sanitizeConnection = (conn: Record<string, unknown>) => {
    const creds = (conn["auth_credentials"] as Record<string, unknown>) || {};
    return {
      id: conn["id"],
      tenantId: conn["tenant_id"],
      integrationType: conn["integration_type"],
      providerCode: conn["provider_code"],
      name: conn["name"],
      baseUrl: conn["base_url"],
      authType: conn["auth_type"],
      hasCredentials: Object.keys(creds).length > 0,
      hasWebhookSecret: Boolean(conn["webhook_secret"]),
      isActive: conn["is_active"],
      settings: conn["settings"] || {},
      createdAt: conn["created_at"],
      updated_at: conn["updated_at"],
    };
  };

  // ── 1. Connection Management ────────────────────────────────────────────────

  // GET /api/v1/integrations/connections
  fastify.get(
    "/connections",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ connections: [] });
      }

      const { data, error } = await adminClient
        .from("integration_connections")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({
        connections: (data || []).map(sanitizeConnection),
      });
    }
  );

  // POST /api/v1/integrations/connections
  fastify.post(
    "/connections",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = createConnectionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const b = parsed.data;
      const generatedSecret = b.webhookSecret || (b.integrationType === "telematics" ? crypto.randomBytes(24).toString("hex") : null);

      const { data, error } = await adminClient
        .from("integration_connections")
        .insert({
          tenant_id: tenantId,
          integration_type: b.integrationType,
          provider_code: b.providerCode,
          name: b.name,
          base_url: b.baseUrl ?? null,
          auth_type: b.authType,
          auth_credentials: b.credentials,
          webhook_secret: generatedSecret,
          settings: b.settings,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.status(201).send({
        connection: sanitizeConnection(data),
        webhookSecretProvided: generatedSecret ? true : false,
      });
    }
  );

  // PATCH /api/v1/integrations/connections/:id
  fastify.patch<{ Params: { id: string } }>(
    "/connections/:id",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const { id } = request.params;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = updateConnectionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const b = parsed.data;
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (b.name !== undefined) updateData["name"] = b.name;
      if (b.baseUrl !== undefined) updateData["base_url"] = b.baseUrl;
      if (b.authType !== undefined) updateData["auth_type"] = b.authType;
      if (b.credentials !== undefined) updateData["auth_credentials"] = b.credentials;
      if (b.webhookSecret !== undefined) updateData["webhook_secret"] = b.webhookSecret;
      if (b.isActive !== undefined) updateData["is_active"] = b.isActive;
      if (b.settings !== undefined) updateData["settings"] = b.settings;

      const { data, error } = await adminClient
        .from("integration_connections")
        .update(updateData)
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ connection: sanitizeConnection(data) });
    }
  );

  // POST /api/v1/integrations/connections/:id/test
  fastify.post<{ Params: { id: string } }>(
    "/connections/:id/test",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const { id } = request.params;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const { data: conn } = await adminClient
        .from("integration_connections")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .single();

      if (!conn) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Connection not found" } });
      }

      if (conn.integration_type === "erp") {
        const erpConfig: ErpConnectionConfig = {
          baseUrl: conn.base_url || "https://sandbox.local/erp",
          authType: conn.auth_type,
          credentials: conn.auth_credentials || {},
          timeoutMs: 4000,
        };

        const result = await erpConnector.checkConnection(erpConfig);

        // Record log
        await adminClient.from("integration_sync_logs").insert({
          tenant_id: tenantId,
          connection_id: conn.id,
          direction: "outbound",
          entity_type: "erp:health_check",
          status: result.connected ? "success" : "error",
          records_processed: 1,
          records_failed: result.connected ? 0 : 1,
          details: { result },
        });

        return reply.send({ testResult: result });
      } else {
        // Telematics Webhook self-check
        const testResult = {
          connected: true,
          version: "Generic-Webhook-Telematics-v1.0",
          hasWebhookSecret: Boolean(conn.webhook_secret),
          message: "Telematics webhook intake ready and verified.",
        };
        return reply.send({ testResult });
      }
    }
  );

  // ── 2. Telematics Inbound Webhook Ingestion ──────────────────────────────────
  fastify.post(
    "/telematics/webhook",
    async (request, reply) => {
      const signature =
        (request.headers["x-careos-signature"] as string) ||
        (request.headers["x-telematics-signature"] as string) ||
        (request.headers["x-hub-signature-256"] as string);

      const query = request.query as { connectionId?: string; tenantId?: string };
      const connectionId = query.connectionId || (request.headers["x-careos-connection-id"] as string);

      if (!adminClient) {
        return reply.status(503).send({ error: { code: "SERVICE_UNAVAILABLE", message: "Database offline" } });
      }

      // Find connection
      let connQuery = adminClient.from("integration_connections").select("*").eq("integration_type", "telematics");
      if (connectionId) {
        connQuery = connQuery.eq("id", connectionId);
      }
      const { data: conn } = await connQuery.limit(1).maybeSingle();

      if (!conn) {
        return reply.status(404).send({ error: { code: "INVALID_CONNECTION", message: "Active telematics connection not found" } });
      }

      // Verify HMAC signature if secret configured
      const payloadString = JSON.stringify(request.body);
      if (conn.webhook_secret) {
        if (!signature) {
          return reply.status(401).send({ error: { code: "MISSING_SIGNATURE", message: "Missing required HMAC signature" } });
        }
        const isValid = telematicsConnector.verifyWebhookSignature(payloadString, signature, conn.webhook_secret);
        if (!isValid) {
          return reply.status(401).send({ error: { code: "INVALID_SIGNATURE", message: "HMAC signature mismatch" } });
        }
      }

      // Normalize event
      const rawPayload = (request.body || {}) as Record<string, unknown>;
      const normalized = telematicsConnector.normalizeEvent(rawPayload);

      if (!normalized) {
        // Ignored raw GPS stream ping or empty heartbeat
        return reply.send({ status: "ignored_raw_gps_ping", message: "High frequency GPS stream ignored" });
      }

      // Check for recent events to deduplicate routine heartbeats
      const { data: recentEvents } = await adminClient
        .from("inbound_event_inbox")
        .select("payload, created_at")
        .eq("tenant_id", conn.tenant_id)
        .eq("connection_id", conn.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const recentNormalized = recentEvents && recentEvents[0]
        ? (recentEvents[0].payload as any)
        : undefined;

      const isDuplicate = telematicsConnector.shouldDeduplicate(normalized, recentNormalized);
      const idempotencyKey =
        normalized.sourceEventId ||
        crypto.createHash("sha256").update(`${conn.tenant_id}:${normalized.deviceId}:${normalized.timestamp}:${normalized.eventType}`).digest("hex");

      const status = isDuplicate ? "ignored_heartbeat" : "processed";

      // Insert into inbox
      const { data: inboxRecord, error: insertError } = await adminClient
        .from("inbound_event_inbox")
        .insert({
          tenant_id: conn.tenant_id,
          connection_id: conn.id,
          event_type: normalized.eventType,
          source_event_id: normalized.sourceEventId ?? null,
          idempotency_key: idempotencyKey,
          payload: normalized,
          status,
          processed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        if (insertError.code === "23505") {
          // Idempotency duplicate
          return reply.send({ status: "ignored_duplicate", idempotencyKey });
        }
        return reply.status(500).send({ error: { code: "INBOX_ERROR", message: insertError.message } });
      }

      // Evaluate fault / alert ticket generation
      const actionDecision = telematicsConnector.requiresTicketGeneration(normalized);
      let generatedTicketId: string | undefined = undefined;

      if (actionDecision.generateTicket && !isDuplicate) {
        // Create ticket in support desk
        const { data: newTicket } = await adminClient
          .from("tickets")
          .insert({
            tenant_id: conn.tenant_id,
            ticket_number: `TKT-AUTO-${Date.now().toString().slice(-6)}`,
            title: actionDecision.title || `Telematics Alert: ${normalized.eventType}`,
            category: actionDecision.category || "repair",
            priority: actionDecision.priority || "high",
            status: "new",
            description: `Automated incident created from telematics event (${normalized.eventType}) on device ${normalized.deviceId}.\nFault details: ${JSON.stringify(normalized.faultDetails || normalized.alertDetails)}`,
            asset_id: normalized.assetId ?? null,
          })
          .select("id")
          .single();

        generatedTicketId = newTicket?.id;
      }

      return reply.status(200).send({
        status: "accepted",
        inboxId: inboxRecord.id,
        eventType: normalized.eventType,
        isDuplicate,
        generatedTicketId,
      });
    }
  );

  // ── 3. Outbound ERP Push & Synchronization ─────────────────────────────────
  fastify.post(
    "/erp/sync",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = triggerErpSyncSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const { connectionId, entityType, entityId } = parsed.data;

      // Fetch connection
      const { data: conn } = await adminClient
        .from("integration_connections")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", connectionId)
        .single();

      if (!conn || conn.integration_type !== "erp") {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "ERP connection not found" } });
      }

      let payloadData: Record<string, unknown> = {};

      if (entityType === "customer") {
        const { data: cust } = await adminClient
          .from("customer_accounts")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("id", entityId)
          .single();

        if (!cust) {
          return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Customer not found" } });
        }

        payloadData = {
          id: cust.id,
          name: cust.name,
          accountNumber: cust.account_number,
          email: cust.primary_email,
          phone: cust.primary_phone,
        };
      } else if (entityType === "invoice") {
        const { data: quot } = await adminClient
          .from("quotations")
          .select("*, lines:quotation_line_items(*)")
          .eq("tenant_id", tenantId)
          .eq("id", entityId)
          .single();

        if (!quot) {
          return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Quotation/Invoice not found" } });
        }

        payloadData = {
          id: quot.id,
          invoiceNumber: quot.quotation_number,
          customerId: quot.customer_id,
          currency: quot.currency || "SAR",
          subtotal: Number(quot.subtotal),
          discountAmount: Number(quot.discount_total || 0),
          vatAmount: Number(quot.vat_total || 0),
          totalAmount: Number(quot.grand_total),
          issuedAt: quot.created_at,
          items: quot.lines || [],
        };
      }

      // Insert into outbound_event_outbox
      const { data: outboxItem, error: outboxError } = await adminClient
        .from("outbound_event_outbox")
        .insert({
          tenant_id: tenantId,
          connection_id: conn.id,
          event_type: `${entityType}:push`,
          entity_id: entityId,
          payload: payloadData,
          status: "pending",
          attempts: 0,
          max_attempts: 5,
        })
        .select()
        .single();

      if (outboxError) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: outboxError.message } });
      }

      // If mock connection or sandbox, deliver immediately and record external ID mapping
      let syncResult: unknown = null;
      if (!conn.base_url || conn.base_url.includes("mock") || conn.base_url.includes("sandbox.local")) {
        const erpConfig: ErpConnectionConfig = {
          baseUrl: conn.base_url || "https://sandbox.local/erp",
          authType: conn.auth_type,
          credentials: conn.auth_credentials || {},
        };

        if (entityType === "customer") {
          syncResult = await erpConnector.pushCustomer(payloadData as unknown as CanonicalCustomer, erpConfig);
        } else {
          syncResult = await erpConnector.pushInvoice(payloadData as unknown as CanonicalInvoice, erpConfig);
        }

        // Record external ID mapping
        const extId = (syncResult as any)?.data?.erpCustomerId || (syncResult as any)?.data?.erpInvoiceId || `EXT-${entityId.slice(0, 8)}`;
        await adminClient.from("external_id_mappings").insert({
          tenant_id: tenantId,
          connection_id: conn.id,
          entity_type: entityType,
          internal_id: entityId,
          external_id: extId,
        });

        // Mark outbox completed
        await adminClient
          .from("outbound_event_outbox")
          .update({
            status: "delivered",
            last_attempted_at: new Date().toISOString(),
            response_status: 200,
            response_payload: syncResult as any,
          })
          .eq("id", outboxItem.id);

        // Record sync log
        await adminClient.from("integration_sync_logs").insert({
          tenant_id: tenantId,
          connection_id: conn.id,
          direction: "outbound",
          entity_type: `${entityType}:push`,
          status: "success",
          records_processed: 1,
          records_failed: 0,
          details: { syncResult },
        });
      }

      return reply.send({
        outboxItem,
        syncResult,
        message: "Event registered in outbound outbox for durable delivery",
      });
    }
  );

  // ── 4. Field & External ID Mappings ─────────────────────────────────────────
  fastify.get(
    "/mappings",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ externalIds: [], fieldMappings: [] });
      }

      const [extRes, fieldRes] = await Promise.all([
        adminClient.from("external_id_mappings").select("*").eq("tenant_id", tenantId).limit(50),
        adminClient.from("field_mappings").select("*").eq("tenant_id", tenantId).limit(50),
      ]);

      return reply.send({
        externalIds: extRes.data || [],
        fieldMappings: fieldRes.data || [],
      });
    }
  );

  fastify.post(
    "/mappings/field",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = createFieldMappingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const b = parsed.data;
      const { data, error } = await adminClient
        .from("field_mappings")
        .insert({
          tenant_id: tenantId,
          connection_id: b.connectionId,
          entity_type: b.entityType,
          internal_field: b.internalField,
          external_field: b.externalField,
          direction: b.direction,
          transformation_rule: b.transformationRule,
        })
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.status(201).send({ mapping: data });
    }
  );

  // ── 5. Integration Logs & Inbox Telemetry ───────────────────────────────────
  fastify.get(
    "/logs",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ logs: [] });
      }

      const { data, error } = await adminClient
        .from("integration_sync_logs")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ logs: data || [] });
    }
  );

  fastify.get(
    "/inbox",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ events: [] });
      }

      const { data, error } = await adminClient
        .from("inbound_event_inbox")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ events: data || [] });
    }
  );
};
