import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { createAdminClient } from "@careos/supabase-client";
import { paymentProvider, type WebhookEventPayload } from "../services/payment-provider.js";
import { requireAuth, requireTenant } from "../middleware/guards.js";

// ============================================================================
// Schemas
// ============================================================================
const createIntentSchema = z.object({
  invoiceId: z.string().uuid(),
  idempotencyKey: z.string().max(100).optional(),
});

const recordManualPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  method: z.enum(["cash", "pos_terminal", "bank_transfer"]),
  amount: z.number().positive(),
  providerReference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

const commercialOverrideSchema = z.object({
  ticketId: z.string().uuid(),
  overrideType: z.enum(["payment_deferred", "goodwill_warranty", "contract_grace_period", "executive_exception"]),
  reason: z.string().min(5, "A detailed commercial exception reason is mandatory").max(1000),
});

// ============================================================================
// Payments Routes Plugin
// ============================================================================
export const paymentRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const webhookSecret = process.env["PAYMENT_WEBHOOK_SECRET"] || "mock-webhook-secret-careos-dev";

  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  const logAudit = async (
    tenantId: string,
    userId: string,
    action: string,
    resourceType: string,
    resourceId?: string | null,
    oldData?: unknown,
    newData?: unknown
  ) => {
    if (!adminClient) return;
    try {
      await adminClient.from("audit_logs").insert({
        tenant_id: tenantId,
        user_id: userId,
        action,
        resource_type: resourceType,
        resource_id: resourceId ?? null,
        old_data: oldData ?? null,
        new_data: newData ?? null,
      });
    } catch (err) {
      fastify.log.error(err, "Failed to write audit log in payments routes");
    }
  };

  // =========================================================================
  // 1. PUBLIC WEBHOOK ENDPOINT (NO AUTH HOOK - SIGNATURE VERIFIED)
  // =========================================================================

  // POST /api/v1/payments/webhook
  fastify.post("/webhook", async (request, reply) => {
    const signature = (request.headers["x-signature"] || request.headers["x-webhook-signature"]) as string;
    const providerHeader = (request.headers["x-provider"] as string) || "mock_gateway";

    const rawPayload = typeof request.body === "string" ? request.body : JSON.stringify(request.body);

    // 1. Server-Side HMAC Signature Verification
    const isValid = paymentProvider.verifyWebhookSignature(rawPayload, signature, webhookSecret);
    if (!isValid) {
      fastify.log.warn({ signature }, "Rejected webhook with invalid HMAC signature");
      return reply.status(401).send({
        error: { code: "INVALID_SIGNATURE", message: "Webhook HMAC signature verification failed" },
      });
    }

    const event = (typeof request.body === "string" ? JSON.parse(request.body) : request.body) as WebhookEventPayload;
    if (!event.id || !event.type || !event.data?.invoiceId) {
      return reply.status(400).send({
        error: { code: "INVALID_WEBHOOK_PAYLOAD", message: "Malformed webhook payload structure" },
      });
    }

    if (!adminClient) {
      return reply.send({ received: true, simulated: true });
    }

    // 2. Replay Protection & Idempotency Check
    const { data: existingEvent } = await adminClient
      .from("payment_webhook_events")
      .select("id, status")
      .eq("provider", providerHeader)
      .eq("event_id", event.id)
      .maybeSingle();

    if (existingEvent) {
      fastify.log.info({ eventId: event.id }, "Idempotent ignore: Webhook event already processed");
      return reply.send({ received: true, duplicate: true, status: existingEvent.status });
    }

    // 3. Log webhook event into payment_webhook_events
    const { data: loggedEvent } = await adminClient
      .from("payment_webhook_events")
      .insert({
        provider: providerHeader,
        event_id: event.id,
        event_type: event.type,
        payload: event,
        signature,
        status: "pending",
      })
      .select()
      .single();

    // 4. Process event
    if (event.type === "payment.succeeded") {
      const { invoiceId, ticketId, amount, currency, method, providerReference } = event.data;

      const { data: invoice } = await adminClient
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .maybeSingle();

      if (invoice) {
        const tenantId = invoice.tenant_id;
        const newPaidAmount = Number(invoice.amount_paid || 0) + Number(amount);
        const isFullyPaid = newPaidAmount >= Number(invoice.total_amount);
        const nowIso = new Date().toISOString();

        // Update invoice
        await adminClient
          .from("invoices")
          .update({
            amount_paid: newPaidAmount,
            status: isFullyPaid ? "paid" : "partially_paid",
            paid_at: isFullyPaid ? nowIso : null,
            updated_at: nowIso,
          })
          .eq("id", invoiceId);

        // Record confirmed payment record
        await adminClient.from("payments").insert({
          tenant_id: tenantId,
          invoice_id: invoiceId,
          ticket_id: ticketId,
          method,
          amount,
          currency,
          status: "confirmed",
          provider: providerHeader,
          provider_payment_id: event.data.paymentIntentId,
          provider_reference: providerReference,
          confirmed_at: nowIso,
          metadata: { webhook_event_id: event.id },
        });

        // 5. Automatic Progression of Ticket:
        // When payment is verified, advance ticket from awaiting_payment to ready_for_assignment!
        if (isFullyPaid) {
          const { data: ticket } = await adminClient
            .from("tickets")
            .select("id, status")
            .eq("id", ticketId)
            .maybeSingle();

          if (ticket && ticket.status === "awaiting_payment") {
            await adminClient
              .from("tickets")
              .update({
                status: "ready_for_assignment",
                updated_at: nowIso,
              })
              .eq("id", ticketId);

            await adminClient.from("ticket_status_history").insert({
              tenant_id: tenantId,
              ticket_id: ticketId,
              from_status: "awaiting_payment",
              to_status: "ready_for_assignment",
              reason: `Server-verified payment received (Invoice ${invoice.invoice_number})`,
            });

            await adminClient.from("ticket_events").insert({
              tenant_id: tenantId,
              ticket_id: ticketId,
              event_type: "status_change",
              actor_type: "system",
              is_internal: false,
              body: `Payment verified via ${providerHeader} (SAR ${amount.toFixed(2)}). Ticket unlocked and ready for assignment.`,
            });
          }
        }
      }
    }

    // Mark event processed
    if (loggedEvent) {
      await adminClient
        .from("payment_webhook_events")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("id", loggedEvent.id);
    }

    return reply.send({ received: true, processed: true });
  });

  // =========================================================================
  // PROTECTED ENDPOINTS (REQUIRE AUTH & TENANT)
  // =========================================================================

  const protectedRoutes: FastifyPluginAsync = async (scoped) => {
    scoped.addHook("preHandler", requireAuth);
    scoped.addHook("preHandler", requireTenant);

    // GET /api/v1/payments/invoices
    scoped.get("/invoices", async (request, reply) => {
      const tenantId = request.auth!.activeTenantId!;
      const userId = request.auth!.user.id;
      const portal = request.auth!.activeMembership?.portal || "operations";
      const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
      const client = adminClient ?? request.userClient!;

      const query = request.query as { ticketId?: string; customerAccountId?: string; status?: string };

      let dbQuery = client
        .from("invoices")
        .select(
          `
          *,
          tickets ( id, ticket_number, title ),
          customer_accounts ( id, name, account_number )
        `
        )
        .eq("tenant_id", tenantId);

      if (!isPlatformAdmin && portal === "customer") {
        const { data: links } = await client
          .from("customer_users")
          .select("customer_account_id")
          .eq("tenant_id", tenantId)
          .eq("user_id", userId)
          .eq("is_active", true);

        const accountIds = (links || []).map((l) => l.customer_account_id);
        if (accountIds.length === 0) return reply.send({ data: [] });
        dbQuery = dbQuery.in("customer_account_id", accountIds);
      }

      if (query.ticketId) dbQuery = dbQuery.eq("ticket_id", query.ticketId);
      if (query.customerAccountId) dbQuery = dbQuery.eq("customer_account_id", query.customerAccountId);
      if (query.status) dbQuery = dbQuery.eq("status", query.status);

      const { data: invoices, error } = await dbQuery.order("created_at", { ascending: false });

      if (error) {
        return reply.status(500).send({ error: { code: "FETCH_INVOICES_FAILED", message: error.message } });
      }

      return reply.send({ data: invoices || [] });
    });

    // GET /api/v1/payments/invoices/:id
    scoped.get("/invoices/:id", async (request, reply) => {
      const tenantId = request.auth!.activeTenantId!;
      const { id } = request.params as { id: string };
      const client = adminClient ?? request.userClient!;

      const { data: invoice, error } = await client
        .from("invoices")
        .select(
          `
          *,
          quotations (*),
          tickets ( id, ticket_number, title ),
          customer_accounts ( id, name, account_number, email, phone )
        `
        )
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .maybeSingle();

      if (error || !invoice) {
        return reply.status(404).send({ error: { code: "INVOICE_NOT_FOUND", message: "Invoice not found" } });
      }

      // Fetch recorded payments
      const { data: payments } = await client
        .from("payments")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("invoice_id", id)
        .order("created_at", { ascending: false });

      return reply.send({
        data: {
          ...invoice,
          payments: payments || [],
        },
      });
    });

    // POST /api/v1/payments/create-intent
    scoped.post("/create-intent", async (request, reply) => {
      const tenantId = request.auth!.activeTenantId!;
      const parseResult = createIntentSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: "Invalid payload", details: parseResult.error.flatten() },
        });
      }

      const client = adminClient ?? request.userClient!;
      const { invoiceId, idempotencyKey } = parseResult.data;

      const { data: invoice } = await client
        .from("invoices")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", invoiceId)
        .maybeSingle();

      if (!invoice) {
        return reply.status(404).send({ error: { code: "INVOICE_NOT_FOUND", message: "Invoice not found" } });
      }

      const remainingAmount = Number(invoice.total_amount) - Number(invoice.amount_paid || 0);
      if (remainingAmount <= 0) {
        return reply.status(400).send({ error: { code: "INVOICE_ALREADY_PAID", message: "Invoice is already fully paid" } });
      }

      // Call payment provider abstraction
      const intentResult = await paymentProvider.createPaymentIntent({
        tenantId,
        invoiceId,
        ticketId: invoice.ticket_id,
        amount: remainingAmount,
        currency: invoice.currency,
        idempotencyKey,
      });

      return reply.send({ data: intentResult });
    });

    // POST /api/v1/payments/record-manual
    scoped.post("/record-manual", async (request, reply) => {
      const tenantId = request.auth!.activeTenantId!;
      const userId = request.auth!.user.id;
      const portal = request.auth!.activeMembership?.portal || "operations";
      const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);

      if (!isPlatformAdmin && portal !== "operations") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only operations staff can record manual payments" } });
      }

      const parseResult = recordManualPaymentSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: "Invalid payload", details: parseResult.error.flatten() },
        });
      }

      const client = adminClient ?? request.userClient!;
      const { invoiceId, method, amount, providerReference, notes } = parseResult.data;

      const { data: invoice } = await client
        .from("invoices")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", invoiceId)
        .maybeSingle();

      if (!invoice) {
        return reply.status(404).send({ error: { code: "INVOICE_NOT_FOUND", message: "Invoice not found" } });
      }

      const nowIso = new Date().toISOString();
      const newPaid = Number(invoice.amount_paid || 0) + Number(amount);
      const isFullyPaid = newPaid >= Number(invoice.total_amount);

      // 1. Record payment
      const { data: paymentRecord } = await client
        .from("payments")
        .insert({
          tenant_id: tenantId,
          invoice_id: invoiceId,
          ticket_id: invoice.ticket_id,
          method,
          amount,
          currency: invoice.currency,
          status: "confirmed",
          provider: "manual_reconciliation",
          provider_reference: providerReference ?? `MAN-${Date.now()}`,
          collected_by: userId,
          confirmed_at: nowIso,
          metadata: { notes: notes ?? "Recorded manually by operations cashier" },
        })
        .select()
        .single();

      // 2. Update invoice
      await client
        .from("invoices")
        .update({
          amount_paid: newPaid,
          status: isFullyPaid ? "paid" : "partially_paid",
          paid_at: isFullyPaid ? nowIso : null,
          updated_at: nowIso,
        })
        .eq("tenant_id", tenantId)
        .eq("id", invoiceId);

      // 3. Unlock ticket if fully paid
      if (isFullyPaid) {
        const { data: ticket } = await client
          .from("tickets")
          .select("id, status")
          .eq("id", invoice.ticket_id)
          .maybeSingle();

        if (ticket && ticket.status === "awaiting_payment") {
          await client
            .from("tickets")
            .update({ status: "ready_for_assignment", updated_at: nowIso })
            .eq("id", invoice.ticket_id);

          await client.from("ticket_status_history").insert({
            tenant_id: tenantId,
            ticket_id: invoice.ticket_id,
            from_status: "awaiting_payment",
            to_status: "ready_for_assignment",
            changed_by: userId,
            reason: `Manual payment confirmed (${method}): SAR ${amount.toFixed(2)}`,
          });
        }
      }

      await logAudit(tenantId, userId, "payment.manual_recorded", "payment", paymentRecord?.id, null, paymentRecord);

      return reply.status(201).send({
        data: {
          payment: paymentRecord,
          invoiceStatus: isFullyPaid ? "paid" : "partially_paid",
          amountPaid: newPaid,
        },
      });
    });

    // POST /api/v1/payments/overrides (Commercial Exception Gate)
    scoped.post("/overrides", async (request, reply) => {
      const tenantId = request.auth!.activeTenantId!;
      const userId = request.auth!.user.id;
      const portal = request.auth!.activeMembership?.portal || "operations";
      const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);

      if (!isPlatformAdmin && portal !== "operations") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only operations managers can authorize commercial exceptions" } });
      }

      const parseResult = commercialOverrideSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: "Invalid payload", details: parseResult.error.flatten() },
        });
      }

      const client = adminClient ?? request.userClient!;
      const { ticketId, overrideType, reason } = parseResult.data;

      const { data: ticket } = await client
        .from("tickets")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", ticketId)
        .maybeSingle();

      if (!ticket) {
        return reply.status(404).send({ error: { code: "TICKET_NOT_FOUND", message: "Ticket not found" } });
      }

      const nowIso = new Date().toISOString();

      // 1. Record override
      const { data: override, error } = await client
        .from("commercial_overrides")
        .insert({
          tenant_id: tenantId,
          ticket_id: ticketId,
          authorized_by: userId,
          override_type: overrideType,
          reason,
        })
        .select()
        .single();

      if (error) {
        return reply.status(400).send({ error: { code: "OVERRIDE_FAILED", message: error.message } });
      }

      // 2. Unlock ticket to ready_for_assignment
      await client
        .from("tickets")
        .update({ status: "ready_for_assignment", updated_at: nowIso })
        .eq("tenant_id", tenantId)
        .eq("id", ticketId);

      await client.from("ticket_status_history").insert({
        tenant_id: tenantId,
        ticket_id: ticketId,
        from_status: ticket.status,
        to_status: "ready_for_assignment",
        changed_by: userId,
        reason: `Commercial Override Approved (${overrideType}): ${reason}`,
      });

      await client.from("ticket_events").insert({
        tenant_id: tenantId,
        ticket_id: ticketId,
        event_type: "status_change",
        actor_id: userId,
        actor_type: "staff",
        is_internal: true,
        body: `Commercial exception granted by operations supervisor (${overrideType}): ${reason}. Ticket unlocked for assignment without upfront payment.`,
      });

      await logAudit(tenantId, userId, "commercial.override_granted", "ticket", ticketId, null, override);

      return reply.status(201).send({
        data: {
          override,
          ticketStatus: "ready_for_assignment",
        },
      });
    });
  };

  await fastify.register(protectedRoutes);
};
