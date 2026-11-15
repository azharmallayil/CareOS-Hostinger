import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { createAdminClient } from "@careos/supabase-client";
import { calculateQuotationTotals, type LineItemInput } from "../services/pricing.js";
import { requireAuth, requireTenant } from "../middleware/guards.js";

// ============================================================================
// Schemas
// ============================================================================
const lineItemSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["labour", "part", "travel", "fee"]),
  description: z.string().min(2).max(200),
  quantity: z.number().min(0.01),
  unitPrice: z.number().min(0),
  discountAmount: z.number().min(0).default(0),
  taxRate: z.number().min(0).max(1).default(0.15),
});

const createQuotationSchema = z.object({
  ticketId: z.string().uuid(),
  validUntilDays: z.number().int().min(1).max(90).default(14),
  termsAndConditions: z.string().max(2000).optional(),
  notes: z.string().max(1000).optional(),
  lineItems: z.array(lineItemSchema).min(1),
});

const newQuotationVersionSchema = z.object({
  changeReason: z.string().min(2).max(500),
  termsAndConditions: z.string().max(2000).optional(),
  notes: z.string().max(1000).optional(),
  lineItems: z.array(lineItemSchema).min(1),
});

const rejectQuotationSchema = z.object({
  reason: z.string().min(3, "Rejection reason is mandatory").max(1000),
});

// ============================================================================
// Quotation Routes Plugin
// ============================================================================
export const quotationRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

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
      fastify.log.error(err, "Failed to write audit log in quotation routes");
    }
  };

  const allocateNumber = async (tenantId: string, prefix: string, rpcFunc: string): Promise<string> => {
    if (adminClient) {
      try {
        const { data: generated, error } = await adminClient.rpc(rpcFunc, { p_tenant_id: tenantId });
        if (!error && generated) return generated as string;
      } catch (err) {
        fastify.log.warn(err, `${rpcFunc} RPC failed, generating fallback`);
      }
    }
    const year = new Date().getUTCFullYear();
    const rand = crypto.randomInt(100000, 999999);
    return `${prefix}-${year}-${rand}`;
  };

  fastify.addHook("preHandler", requireAuth);
  fastify.addHook("preHandler", requireTenant);

  // =========================================================================
  // 1. LIST QUOTATIONS
  // =========================================================================

  // GET /api/v1/quotations
  fastify.get("/", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const client = adminClient ?? request.userClient!;

    const query = request.query as {
      ticketId?: string;
      customerAccountId?: string;
      status?: string;
    };

    let dbQuery = client
      .from("quotations")
      .select(
        `
        id,
        tenant_id,
        quotation_number,
        ticket_id,
        customer_account_id,
        status,
        current_version,
        subtotal,
        tax_rate,
        tax_amount,
        total_amount,
        currency,
        valid_until,
        sent_at,
        customer_approved_at,
        customer_rejected_at,
        created_at,
        updated_at,
        tickets ( id, ticket_number, title ),
        customer_accounts ( id, name, account_number )
      `
      )
      .eq("tenant_id", tenantId);

    // If customer user, restrict to their customer account
    if (!isPlatformAdmin && portal === "customer") {
      const { data: links } = await client
        .from("customer_users")
        .select("customer_account_id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .eq("is_active", true);

      const accountIds = (links || []).map((l) => l.customer_account_id);
      if (accountIds.length === 0) {
        return reply.send({ data: [] });
      }
      dbQuery = dbQuery.in("customer_account_id", accountIds);
    }

    if (query.ticketId) dbQuery = dbQuery.eq("ticket_id", query.ticketId);
    if (query.customerAccountId) dbQuery = dbQuery.eq("customer_account_id", query.customerAccountId);
    if (query.status) dbQuery = dbQuery.eq("status", query.status);

    const { data: quotations, error } = await dbQuery.order("created_at", { ascending: false });

    if (error) {
      return reply.status(500).send({
        error: { code: "FETCH_QUOTATIONS_FAILED", message: error.message },
      });
    }

    return reply.send({ data: quotations || [] });
  });

  // =========================================================================
  // 2. GET QUOTATION DETAIL (WITH VERSIONS & LINE ITEMS)
  // =========================================================================

  // GET /api/v1/quotations/:id
  fastify.get("/:id", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id } = request.params as { id: string };
    const client = adminClient ?? request.userClient!;

    const { data: quote, error } = await client
      .from("quotations")
      .select(
        `
        *,
        tickets ( id, ticket_number, title, status, priority ),
        customer_accounts ( id, name, account_number, email, phone )
      `
      )
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();

    if (error || !quote) {
      return reply.status(404).send({
        error: { code: "QUOTATION_NOT_FOUND", message: "Quotation not found" },
      });
    }

    // Customer check
    if (!isPlatformAdmin && portal === "customer") {
      const { data: link } = await client
        .from("customer_users")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .eq("customer_account_id", quote.customer_account_id)
        .eq("is_active", true)
        .maybeSingle();

      if (!link) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "Access denied" },
        });
      }
    }

    // Fetch quotation versions and current line items
    const { data: versions } = await client
      .from("quotation_versions")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("quotation_id", id)
      .order("version_number", { ascending: false });

    const currentVersionRecord = versions?.find((v) => v.version_number === quote.current_version) || versions?.[0];

    return reply.send({
      data: {
        ...quote,
        currentVersionData: currentVersionRecord,
        versions: versions || [],
      },
    });
  });

  // =========================================================================
  // 3. CREATE QUOTATION (VERSION 1)
  // =========================================================================

  // POST /api/v1/quotations
  fastify.post("/", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);

    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only operations staff can create quotations" },
      });
    }

    const parseResult = createQuotationSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid payload", details: parseResult.error.flatten() },
      });
    }

    const client = adminClient ?? request.userClient!;
    const { ticketId, validUntilDays, termsAndConditions, notes, lineItems } = parseResult.data;

    // Verify ticket exists
    const { data: ticket, error: ticketErr } = await client
      .from("tickets")
      .select("id, tenant_id, customer_account_id, status")
      .eq("tenant_id", tenantId)
      .eq("id", ticketId)
      .maybeSingle();

    if (ticketErr || !ticket) {
      return reply.status(404).send({
        error: { code: "TICKET_NOT_FOUND", message: "Ticket not found" },
      });
    }

    // Calculate totals using pricing service
    const pricing = calculateQuotationTotals(lineItems as LineItemInput[], 0.15, "SAR");

    // Generate quotation number
    const quotationNumber = await allocateNumber(tenantId, "QT", "generate_quotation_number");
    const validUntil = new Date(Date.now() + validUntilDays * 86400 * 1000).toISOString();

    // 1. Insert quotation
    const { data: quotation, error: quoteErr } = await client
      .from("quotations")
      .insert({
        tenant_id: tenantId,
        quotation_number: quotationNumber,
        ticket_id: ticketId,
        customer_account_id: ticket.customer_account_id,
        status: "draft",
        current_version: 1,
        subtotal: pricing.subtotal,
        tax_rate: pricing.taxRate,
        tax_amount: pricing.taxAmount,
        total_amount: pricing.totalAmount,
        currency: pricing.currency,
        valid_until: validUntil,
        terms_and_conditions: termsAndConditions ?? "Standard CareOS Service Terms Apply. Payment due within validity period.",
        notes: notes ?? null,
        created_by: userId,
      })
      .select()
      .single();

    if (quoteErr) {
      return reply.status(400).send({
        error: { code: "QUOTATION_CREATION_FAILED", message: quoteErr.message },
      });
    }

    // 2. Insert quotation version 1
    const { data: versionRecord } = await client
      .from("quotation_versions")
      .insert({
        quotation_id: quotation.id,
        tenant_id: tenantId,
        version_number: 1,
        line_items: pricing.lineItems,
        subtotal: pricing.subtotal,
        tax_rate: pricing.taxRate,
        tax_amount: pricing.taxAmount,
        total_amount: pricing.totalAmount,
        change_reason: "Initial quotation created",
        created_by: userId,
      })
      .select()
      .single();

    // Update ticket status to awaiting_quotation if submitted
    if (ticket.status === "submitted" || ticket.status === "under_review") {
      await client
        .from("tickets")
        .update({ status: "awaiting_quotation", updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("id", ticketId);
    }

    await logAudit(tenantId, userId, "quotation.created", "quotation", quotation.id, null, quotation);

    return reply.status(201).send({
      data: {
        ...quotation,
        version: versionRecord,
      },
    });
  });

  // =========================================================================
  // 4. ADD NEW QUOTATION VERSION (REVISE QUOTATION)
  // =========================================================================

  // POST /api/v1/quotations/:id/versions
  fastify.post("/:id/versions", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id } = request.params as { id: string };

    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only operations staff can revise quotations" },
      });
    }

    const parseResult = newQuotationVersionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid payload", details: parseResult.error.flatten() },
      });
    }

    const client = adminClient ?? request.userClient!;
    const { data: currentQuote } = await client
      .from("quotations")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();

    if (!currentQuote) {
      return reply.status(404).send({
        error: { code: "QUOTATION_NOT_FOUND", message: "Quotation not found" },
      });
    }

    const nextVersionNumber = currentQuote.current_version + 1;
    const { changeReason, termsAndConditions, notes, lineItems } = parseResult.data;

    // Calculate totals
    const pricing = calculateQuotationTotals(lineItems as LineItemInput[], 0.15, "SAR");

    // 1. Insert new version
    const { data: versionRecord, error: vErr } = await client
      .from("quotation_versions")
      .insert({
        quotation_id: id,
        tenant_id: tenantId,
        version_number: nextVersionNumber,
        line_items: pricing.lineItems,
        subtotal: pricing.subtotal,
        tax_rate: pricing.taxRate,
        tax_amount: pricing.taxAmount,
        total_amount: pricing.totalAmount,
        change_reason: changeReason,
        created_by: userId,
      })
      .select()
      .single();

    if (vErr) {
      return reply.status(400).send({
        error: { code: "VERSION_CREATION_FAILED", message: vErr.message },
      });
    }

    // 2. Update quotation record
    const { data: updatedQuote, error: qErr } = await client
      .from("quotations")
      .update({
        current_version: nextVersionNumber,
        subtotal: pricing.subtotal,
        tax_rate: pricing.taxRate,
        tax_amount: pricing.taxAmount,
        total_amount: pricing.totalAmount,
        status: "draft", // Reset to draft until sent
        terms_and_conditions: termsAndConditions ?? currentQuote.terms_and_conditions,
        notes: notes ?? currentQuote.notes,
        customer_rejected_at: null,
        rejection_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .select()
      .single();

    if (qErr) {
      return reply.status(400).send({
        error: { code: "QUOTATION_UPDATE_FAILED", message: qErr.message },
      });
    }

    await logAudit(
      tenantId,
      userId,
      "quotation.version_added",
      "quotation",
      id,
      { version: currentQuote.current_version },
      { version: nextVersionNumber, changeReason }
    );

    return reply.status(201).send({
      data: {
        ...updatedQuote,
        version: versionRecord,
      },
    });
  });

  // =========================================================================
  // 5. SEND QUOTATION TO CUSTOMER
  // =========================================================================

  // POST /api/v1/quotations/:id/send
  fastify.post("/:id/send", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id } = request.params as { id: string };

    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only operations staff can send quotations" } });
    }

    const client = adminClient ?? request.userClient!;
    const nowIso = new Date().toISOString();

    const { data: quote, error } = await client
      .from("quotations")
      .update({
        status: "sent",
        sent_at: nowIso,
        updated_at: nowIso,
      })
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .select()
      .single();

    if (error || !quote) {
      return reply.status(400).send({ error: { code: "SEND_FAILED", message: error?.message || "Not found" } });
    }

    // Update ticket state to awaiting_customer_approval
    await client
      .from("tickets")
      .update({ status: "awaiting_customer_approval", updated_at: nowIso })
      .eq("tenant_id", tenantId)
      .eq("id", quote.ticket_id);

    // Record ticket event
    await client.from("ticket_events").insert({
      tenant_id: tenantId,
      ticket_id: quote.ticket_id,
      event_type: "quotation",
      actor_id: userId,
      actor_type: "staff",
      is_internal: false,
      body: `Quotation ${quote.quotation_number} (v${quote.current_version}) sent to customer for SAR ${quote.total_amount.toFixed(2)}`,
    });

    return reply.send({ data: quote });
  });

  // =========================================================================
  // 6. CUSTOMER APPROVE QUOTATION (AUTOMATICALLY ISSUES INVOICE)
  // =========================================================================

  // POST /api/v1/quotations/:id/approve
  fastify.post("/:id/approve", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id } = request.params as { id: string };
    const client = adminClient ?? request.userClient!;

    const { data: quote } = await client
      .from("quotations")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();

    if (!quote) {
      return reply.status(404).send({ error: { code: "QUOTATION_NOT_FOUND", message: "Quotation not found" } });
    }

    // Authorize customer user
    if (!isPlatformAdmin && portal === "customer") {
      const { data: link } = await client
        .from("customer_users")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .eq("customer_account_id", quote.customer_account_id)
        .eq("is_active", true)
        .maybeSingle();

      if (!link) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Not authorized for this customer account" } });
      }
    }

    const nowIso = new Date().toISOString();

    // 1. Mark quotation approved
    const { data: updatedQuote, error: qErr } = await client
      .from("quotations")
      .update({
        status: "approved",
        customer_approved_at: nowIso,
        approved_by_user_id: userId,
        updated_at: nowIso,
      })
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .select()
      .single();

    if (qErr) {
      return reply.status(400).send({ error: { code: "APPROVAL_FAILED", message: qErr.message } });
    }

    // 2. Automatically generate Invoice
    const invoiceNumber = await allocateNumber(tenantId, "INV", "generate_invoice_number");
    const dueDate = new Date(Date.now() + 30 * 86400 * 1000).toISOString().split("T")[0];

    const { data: invoice } = await client
      .from("invoices")
      .insert({
        tenant_id: tenantId,
        invoice_number: invoiceNumber,
        quotation_id: quote.id,
        ticket_id: quote.ticket_id,
        customer_account_id: quote.customer_account_id,
        status: quote.total_amount === 0 ? "paid" : "issued",
        subtotal: quote.subtotal,
        tax_rate: quote.tax_rate,
        tax_amount: quote.tax_amount,
        total_amount: quote.total_amount,
        amount_paid: quote.total_amount === 0 ? quote.total_amount : 0,
        currency: quote.currency,
        due_date: dueDate,
        paid_at: quote.total_amount === 0 ? nowIso : null,
      })
      .select()
      .single();

    // 3. Progress Ticket status: if zero total, move to ready_for_assignment, otherwise awaiting_payment
    const nextTicketStatus = quote.total_amount === 0 ? "ready_for_assignment" : "awaiting_payment";

    await client
      .from("tickets")
      .update({ status: nextTicketStatus, updated_at: nowIso })
      .eq("tenant_id", tenantId)
      .eq("id", quote.ticket_id);

    // Record ticket event
    await client.from("ticket_events").insert({
      tenant_id: tenantId,
      ticket_id: quote.ticket_id,
      event_type: "quotation",
      actor_id: userId,
      actor_type: portal === "customer" ? "customer" : "staff",
      is_internal: false,
      body: `Customer approved quotation ${quote.quotation_number}. Invoice ${invoice?.invoice_number || ""} generated. Ticket status moved to '${nextTicketStatus}'.`,
    });

    return reply.send({
      data: {
        quotation: updatedQuote,
        invoice,
        ticketStatus: nextTicketStatus,
      },
    });
  });

  // =========================================================================
  // 7. CUSTOMER REJECT QUOTATION (REQUIRES REASON)
  // =========================================================================

  // POST /api/v1/quotations/:id/reject
  fastify.post("/:id/reject", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id } = request.params as { id: string };

    const parseResult = rejectQuotationSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Mandatory rejection reason required", details: parseResult.error.flatten() },
      });
    }

    const client = adminClient ?? request.userClient!;
    const { reason } = parseResult.data;

    const { data: quote } = await client
      .from("quotations")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();

    if (!quote) {
      return reply.status(404).send({ error: { code: "QUOTATION_NOT_FOUND", message: "Quotation not found" } });
    }

    if (!isPlatformAdmin && portal === "customer") {
      const { data: link } = await client
        .from("customer_users")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .eq("customer_account_id", quote.customer_account_id)
        .eq("is_active", true)
        .maybeSingle();

      if (!link) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Not authorized for this customer account" } });
      }
    }

    const nowIso = new Date().toISOString();

    const { data: updatedQuote, error } = await client
      .from("quotations")
      .update({
        status: "rejected",
        customer_rejected_at: nowIso,
        rejection_reason: reason,
        updated_at: nowIso,
      })
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return reply.status(400).send({ error: { code: "REJECTION_FAILED", message: error.message } });
    }

    // Log ticket event
    await client.from("ticket_events").insert({
      tenant_id: tenantId,
      ticket_id: quote.ticket_id,
      event_type: "quotation",
      actor_id: userId,
      actor_type: portal === "customer" ? "customer" : "staff",
      is_internal: false,
      body: `Customer rejected quotation ${quote.quotation_number}: ${reason}`,
    });

    return reply.send({ data: updatedQuote });
  });
};
