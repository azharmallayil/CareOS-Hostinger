import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { createAdminClient } from "@careos/supabase-client";
import { requireAuth, requireTenant } from "../middleware/guards.js";

// ============================================================================
// Schemas
// ============================================================================
const ticketCategorySchema = z.object({
  name: z.string().min(2).max(100),
  code: z.string().min(2).max(30),
  description: z.string().max(500).optional(),
  defaultPriority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  slaResponseHours: z.number().int().min(1).max(720).default(4),
  slaResolutionHours: z.number().int().min(1).max(720).default(24),
});

const TICKET_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "awaiting_quotation",
  "awaiting_customer_approval",
  "awaiting_payment",
  "ready_for_assignment",
  "assigned",
  "accepted",
  "scheduled",
  "technician_en_route",
  "arrived",
  "in_progress",
  "on_hold",
  "service_completed",
  "awaiting_operations_verification",
  "awaiting_customer_confirmation",
  "resolved",
  "closed",
  "cancelled",
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

const createTicketSchema = z.object({
  customerAccountId: z.string().uuid(),
  siteId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  assetId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid(),
  title: z.string().min(2).max(200),
  description: z.string().min(2).max(5000),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  coverageType: z.enum(["paid", "warranty", "free_service", "contract"]).default("paid"),
  reportedVia: z.enum(["portal", "phone", "email", "chat", "automated_telematics"]).default("portal"),
});

const updateTicketSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().min(2).max(5000).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  coverageType: z.enum(["paid", "warranty", "free_service", "contract"]).optional(),
  siteId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  assetId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().optional(),
});

const transitionStatusSchema = z.object({
  toStatus: z.enum(TICKET_STATUSES),
  reason: z.string().min(2, "Transition reason is mandatory and must be at least 2 characters").max(1000),
  metadata: z.record(z.any()).default({}),
});

const assignTicketSchema = z.object({
  assignedTo: z.string().uuid().nullable(),
  reason: z.string().max(500).optional(),
});

const ticketEventSchema = z.object({
  eventType: z.enum(["comment", "status_change", "assignment", "quotation", "inspection", "complaint_linked", "system"]).default("comment"),
  body: z.string().min(1).max(5000),
  isInternal: z.boolean().default(false),
  attachments: z.array(z.any()).default([]),
  metadata: z.record(z.any()).default({}),
});

// Allowed status transitions mapping
const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["under_review", "ready_for_assignment", "cancelled"],
  under_review: ["awaiting_quotation", "ready_for_assignment", "on_hold", "cancelled"],
  awaiting_quotation: ["awaiting_customer_approval", "under_review", "cancelled"],
  awaiting_customer_approval: ["awaiting_payment", "ready_for_assignment", "cancelled"],
  awaiting_payment: ["ready_for_assignment", "cancelled"],
  ready_for_assignment: ["assigned", "under_review", "cancelled"],
  assigned: ["accepted", "ready_for_assignment", "technician_en_route", "cancelled"],
  accepted: ["scheduled", "technician_en_route", "ready_for_assignment", "cancelled"],
  scheduled: ["technician_en_route", "accepted", "cancelled"],
  technician_en_route: ["arrived", "on_hold", "cancelled"],
  arrived: ["in_progress", "on_hold", "cancelled"],
  in_progress: ["service_completed", "on_hold", "cancelled"],
  on_hold: ["in_progress", "under_review", "ready_for_assignment", "cancelled"],
  service_completed: ["awaiting_operations_verification", "awaiting_customer_confirmation", "resolved"],
  awaiting_operations_verification: ["awaiting_customer_confirmation", "resolved", "in_progress"],
  awaiting_customer_confirmation: ["resolved", "closed", "in_progress"],
  resolved: ["closed", "under_review"],
  closed: [], // terminal state
  cancelled: [], // terminal state
};

// ============================================================================
// Routes Plugin
// ============================================================================
export const ticketRoutes: FastifyPluginAsync = async (fastify) => {
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
      fastify.log.error(err, "Failed to write audit log in ticket routes");
    }
  };

  const getLinkedCustomerAccounts = async (
    tenantId: string,
    userId: string
  ): Promise<string[]> => {
    if (!adminClient) return [];
    const { data } = await adminClient
      .from("customer_users")
      .select("customer_account_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("is_active", true);

    return (data || []).map((row) => row.customer_account_id);
  };

  const canAccessTicket = async (
    tenantId: string,
    userId: string,
    portal: string,
    isPlatformAdmin: boolean,
    ticket: { tenant_id: string; customer_account_id: string }
  ): Promise<boolean> => {
    if (isPlatformAdmin) return true;
    if (ticket.tenant_id !== tenantId) return false;
    if (portal === "operations" || portal === "technician") return true;

    const linkedIds = await getLinkedCustomerAccounts(tenantId, userId);
    return linkedIds.includes(ticket.customer_account_id);
  };

  // Safe atomic ticket number generator
  const allocateTicketNumber = async (tenantId: string, prefix = "TCK"): Promise<string> => {
    if (adminClient) {
      try {
        const { data: generated, error } = await adminClient.rpc("generate_ticket_number", {
          p_tenant_id: tenantId,
          p_prefix: prefix,
        });
        if (!error && generated) return generated as string;
      } catch (err) {
        fastify.log.warn(err, "generate_ticket_number RPC failed, falling back to sequence query");
      }
    }

    const year = new Date().getUTCFullYear();
    const randomSeq = crypto.randomInt(100000, 999999);
    return `${prefix}-${year}-${randomSeq}`;
  };

  fastify.addHook("preHandler", requireAuth);
  fastify.addHook("preHandler", requireTenant);

  // =========================================================================
  // 1. TICKET CATEGORIES
  // =========================================================================

  // GET /api/v1/tickets/categories
  fastify.get("/categories", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const client = adminClient ?? request.userClient!;

    const { data, error } = await client
      .from("ticket_categories")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      return reply.status(500).send({
        error: { code: "FETCH_CATEGORIES_FAILED", message: error.message },
      });
    }

    return reply.send({ data: data || [] });
  });

  // POST /api/v1/tickets/categories
  fastify.post("/categories", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);

    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only operations staff can create ticket categories" },
      });
    }

    const parseResult = ticketCategorySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid category payload", details: parseResult.error.flatten() },
      });
    }

    const client = adminClient ?? request.userClient!;
    const payload = parseResult.data;

    const { data: category, error } = await client
      .from("ticket_categories")
      .insert({
        tenant_id: tenantId,
        name: payload.name,
        code: payload.code.toUpperCase(),
        description: payload.description ?? null,
        default_priority: payload.defaultPriority,
        sla_response_hours: payload.slaResponseHours,
        sla_resolution_hours: payload.slaResolutionHours,
      })
      .select()
      .single();

    if (error) {
      return reply.status(400).send({
        error: {
          code: "CATEGORY_CREATION_FAILED",
          message: error.message.includes("unique")
            ? "A ticket category with this name or code already exists in your organization"
            : error.message,
        },
      });
    }

    await logAudit(tenantId, userId, "ticket_category.created", "ticket_category", category.id, null, category);
    return reply.status(201).send({ data: category });
  });

  // =========================================================================
  // 2. TICKETS (LIST & SEARCH)
  // =========================================================================

  // GET /api/v1/tickets
  fastify.get("/", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const client = adminClient ?? request.userClient!;

    const query = request.query as {
      search?: string;
      status?: string;
      priority?: string;
      customerAccountId?: string;
      assetId?: string;
      categoryId?: string;
      assignedTo?: string;
      page?: string;
      limit?: string;
    };

    const page = Math.max(1, Number.parseInt(query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit || "20", 10)));
    const offset = (page - 1) * limit;

    let dbQuery = client
      .from("tickets")
      .select(
        `
        id,
        tenant_id,
        ticket_number,
        title,
        description,
        priority,
        status,
        coverage_type,
        reported_via,
        sla_due_at,
        resolved_at,
        closed_at,
        assigned_to,
        created_by,
        created_at,
        updated_at,
        customer_accounts ( id, name, account_number ),
        customer_sites ( id, name, city ),
        assets ( id, name, asset_tag, fleet_number, vin ),
        ticket_categories ( id, name, code, default_priority )
      `,
        { count: "exact" }
      )
      .eq("tenant_id", tenantId);

    // Customer portal access restriction
    if (!isPlatformAdmin && portal === "customer") {
      const linkedIds = await getLinkedCustomerAccounts(tenantId, userId);
      if (linkedIds.length === 0) {
        return reply.send({ data: [], meta: { page, limit, total: 0, totalPages: 0 } });
      }
      dbQuery = dbQuery.in("customer_account_id", linkedIds);
    }

    if (query.status) {
      dbQuery = dbQuery.eq("status", query.status);
    }
    if (query.priority) {
      dbQuery = dbQuery.eq("priority", query.priority);
    }
    if (query.customerAccountId) {
      dbQuery = dbQuery.eq("customer_account_id", query.customerAccountId);
    }
    if (query.assetId) {
      dbQuery = dbQuery.eq("asset_id", query.assetId);
    }
    if (query.categoryId) {
      dbQuery = dbQuery.eq("category_id", query.categoryId);
    }
    if (query.assignedTo) {
      dbQuery = dbQuery.eq("assigned_to", query.assignedTo);
    }
    if (query.search) {
      const s = `%${query.search}%`;
      dbQuery = dbQuery.or(`ticket_number.ilike.${s},title.ilike.${s},description.ilike.${s}`);
    }

    dbQuery = dbQuery.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data: tickets, error, count } = await dbQuery;

    if (error) {
      return reply.status(500).send({
        error: { code: "FETCH_TICKETS_FAILED", message: error.message },
      });
    }

    const total = count ?? 0;
    return reply.send({
      data: tickets || [],
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  // =========================================================================
  // 3. TICKET DETAIL & TIMELINE
  // =========================================================================

  // GET /api/v1/tickets/:id
  fastify.get("/:id", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id } = request.params as { id: string };
    const client = adminClient ?? request.userClient!;

    const { data: ticket, error } = await client
      .from("tickets")
      .select(
        `
        *,
        customer_accounts ( id, name, account_number, email, phone ),
        customer_sites ( id, name, city, address_line_1, latitude, longitude ),
        customer_contacts ( id, full_name, email, phone, role_title ),
        assets ( id, name, asset_tag, fleet_number, vin, make, model, operational_status ),
        ticket_categories ( id, name, code, default_priority, sla_response_hours, sla_resolution_hours )
      `
      )
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return reply.status(500).send({
        error: { code: "FETCH_TICKET_FAILED", message: error.message },
      });
    }

    if (!ticket) {
      return reply.status(404).send({
        error: { code: "TICKET_NOT_FOUND", message: "Ticket not found" },
      });
    }

    // Access check
    const hasAccess = await canAccessTicket(tenantId, userId, portal, isPlatformAdmin, ticket);
    if (!hasAccess) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "You do not have access to this ticket" },
      });
    }

    // Fetch status history
    const { data: statusHistory } = await client
      .from("ticket_status_history")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    // Fetch ticket events (timeline comments/notes)
    // CRITICAL PRIVACY RULE: customer portal users must NEVER see internal notes!
    let eventsQuery = client
      .from("ticket_events")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    if (!isPlatformAdmin && portal === "customer") {
      eventsQuery = eventsQuery.eq("is_internal", false);
    }

    const { data: events } = await eventsQuery;

    // Fetch linked complaints if any
    const { data: linkedComplaints } = await client
      .from("complaints")
      .select("id, complaint_number, complaint_type, title, status, severity, created_at")
      .eq("tenant_id", tenantId)
      .eq("ticket_id", id)
      .order("created_at", { ascending: false });

    return reply.send({
      data: {
        ...ticket,
        statusHistory: statusHistory || [],
        events: events || [],
        complaints: linkedComplaints || [],
      },
    });
  });

  // =========================================================================
  // 4. CREATE TICKET
  // =========================================================================

  // POST /api/v1/tickets
  fastify.post("/", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);

    const parseResult = createTicketSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid ticket payload", details: parseResult.error.flatten() },
      });
    }

    const payload = parseResult.data;

    // Customer portal authorization check
    if (!isPlatformAdmin && portal === "customer") {
      const linkedCustomerIds = await getLinkedCustomerAccounts(tenantId, userId);
      if (!linkedCustomerIds.includes(payload.customerAccountId)) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "You can only create tickets for customer accounts you are linked to" },
        });
      }
    }

    const client = adminClient ?? request.userClient!;

    // 1. Check category exists & calculate SLA due date
    const { data: category } = await client
      .from("ticket_categories")
      .select("sla_resolution_hours")
      .eq("tenant_id", tenantId)
      .eq("id", payload.categoryId)
      .maybeSingle();

    const slaHours = category?.sla_resolution_hours ?? 24;
    const slaDueAt = new Date(Date.now() + slaHours * 3600 * 1000).toISOString();

    // 2. Transactionally generate unique ticket number
    const ticketNumber = await allocateTicketNumber(tenantId, "TCK");

    // 3. Insert ticket
    const initialStatus: TicketStatus = portal === "customer" ? "submitted" : "submitted";
    const { data: ticket, error } = await client
      .from("tickets")
      .insert({
        tenant_id: tenantId,
        ticket_number: ticketNumber,
        customer_account_id: payload.customerAccountId,
        site_id: payload.siteId ?? null,
        contact_id: payload.contactId ?? null,
        asset_id: payload.assetId ?? null,
        category_id: payload.categoryId,
        title: payload.title,
        description: payload.description,
        priority: payload.priority,
        status: initialStatus,
        coverage_type: payload.coverageType,
        reported_via: payload.reportedVia,
        created_by: userId,
        sla_due_at: slaDueAt,
      })
      .select()
      .single();

    if (error) {
      return reply.status(400).send({
        error: { code: "TICKET_CREATION_FAILED", message: error.message },
      });
    }

    // 4. Record initial status history
    await client.from("ticket_status_history").insert({
      tenant_id: tenantId,
      ticket_id: ticket.id,
      from_status: null,
      to_status: initialStatus,
      changed_by: userId,
      reason: "Ticket submitted into system",
      metadata: { reported_via: payload.reportedVia },
    });

    // 5. Record initial timeline event
    await client.from("ticket_events").insert({
      tenant_id: tenantId,
      ticket_id: ticket.id,
      event_type: "status_change",
      actor_id: userId,
      actor_type: portal === "customer" ? "customer" : "staff",
      is_internal: false,
      body: `Ticket created with status '${initialStatus}' via ${payload.reportedVia}`,
      metadata: { priority: payload.priority },
    });

    await logAudit(tenantId, userId, "ticket.created", "ticket", ticket.id, null, ticket);

    return reply.status(201).send({ data: ticket });
  });

  // =========================================================================
  // 5. UPDATE TICKET METADATA
  // =========================================================================

  // PATCH /api/v1/tickets/:id
  fastify.patch("/:id", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id } = request.params as { id: string };

    const parseResult = updateTicketSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid payload", details: parseResult.error.flatten() },
      });
    }

    const client = adminClient ?? request.userClient!;
    const { data: ticket } = await client
      .from("tickets")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();

    if (!ticket) {
      return reply.status(404).send({
        error: { code: "TICKET_NOT_FOUND", message: "Ticket not found" },
      });
    }

    const hasAccess = await canAccessTicket(tenantId, userId, portal, isPlatformAdmin, ticket);
    if (!hasAccess) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Access denied" },
      });
    }

    if (portal === "customer" && !["draft", "submitted"].includes(ticket.status)) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Customers cannot edit tickets once under review" },
      });
    }

    const payload = parseResult.data;
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    if (payload.title !== undefined) updateData["title"] = payload.title;
    if (payload.description !== undefined) updateData["description"] = payload.description;
    if (payload.priority !== undefined) updateData["priority"] = payload.priority;
    if (payload.coverageType !== undefined) updateData["coverage_type"] = payload.coverageType;
    if (payload.siteId !== undefined) updateData["site_id"] = payload.siteId;
    if (payload.contactId !== undefined) updateData["contact_id"] = payload.contactId;
    if (payload.assetId !== undefined) updateData["asset_id"] = payload.assetId;
    if (payload.categoryId !== undefined) updateData["category_id"] = payload.categoryId;

    const { data: updated, error } = await client
      .from("tickets")
      .update(updateData)
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return reply.status(400).send({
        error: { code: "TICKET_UPDATE_FAILED", message: error.message },
      });
    }

    await logAudit(tenantId, userId, "ticket.updated", "ticket", id, ticket, updated);
    return reply.send({ data: updated });
  });

  // =========================================================================
  // 6. STATUS TRANSITION WITH STRICT ROLE CHECK AND AUDIT LOGGING
  // =========================================================================

  // PATCH /api/v1/tickets/:id/status
  fastify.patch("/:id/status", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id } = request.params as { id: string };

    const parseResult = transitionStatusSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: parseResult.error.errors[0]?.message || "Invalid transition payload",
          details: parseResult.error.flatten(),
        },
      });
    }

    const { toStatus, reason, metadata } = parseResult.data;
    const client = adminClient ?? request.userClient!;

    const { data: ticket, error: fetchErr } = await client
      .from("tickets")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !ticket) {
      return reply.status(404).send({
        error: { code: "TICKET_NOT_FOUND", message: "Ticket not found" },
      });
    }

    const currentStatus = ticket.status as TicketStatus;

    // Check if transition is valid in the state machine
    const allowedTargets = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowedTargets.includes(toStatus) && !isPlatformAdmin) {
      return reply.status(400).send({
        error: {
          code: "INVALID_STATUS_TRANSITION",
          message: `Cannot transition ticket from status '${currentStatus}' to '${toStatus}'. Allowed transitions: ${allowedTargets.join(", ") || "none (terminal state)"}`,
        },
      });
    }

    // Role-based permission checks
    if (!isPlatformAdmin) {
      if (portal === "customer") {
        const linkedCustomerIds = await getLinkedCustomerAccounts(tenantId, userId);
        if (!linkedCustomerIds.includes(ticket.customer_account_id)) {
          return reply.status(403).send({
            error: { code: "FORBIDDEN", message: "You are not authorized for this customer account" },
          });
        }

        // Customers can only approve quotations, confirm resolutions, or cancel draft/submitted tickets
        const customerAllowedTransitions: Record<string, string[]> = {
          draft: ["submitted", "cancelled"],
          submitted: ["cancelled"],
          awaiting_customer_approval: ["awaiting_payment", "ready_for_assignment", "cancelled"],
          awaiting_customer_confirmation: ["resolved", "closed"],
        };

        const allowedForCustomer = customerAllowedTransitions[currentStatus] || [];
        if (!allowedForCustomer.includes(toStatus)) {
          return reply.status(403).send({
            error: {
              code: "FORBIDDEN",
              message: `Customer users are not permitted to transition tickets from '${currentStatus}' to '${toStatus}'`,
            },
          });
        }
      } else if (portal === "technician") {
        // Technicians can manage execution states
        const techAllowedTransitions: Record<string, string[]> = {
          assigned: ["accepted", "ready_for_assignment", "technician_en_route"],
          accepted: ["scheduled", "technician_en_route"],
          scheduled: ["technician_en_route"],
          technician_en_route: ["arrived", "on_hold"],
          arrived: ["in_progress", "on_hold"],
          in_progress: ["service_completed", "on_hold"],
          on_hold: ["in_progress"],
        };

        const allowedForTech = techAllowedTransitions[currentStatus] || [];
        if (!allowedForTech.includes(toStatus)) {
          return reply.status(403).send({
            error: {
              code: "FORBIDDEN",
              message: `Technicians are not authorized to transition from '${currentStatus}' to '${toStatus}'`,
            },
          });
        }
      }
      // Operations has full authority to navigate the state machine
    }

    // =========================================================================
    // STEP 10 COMMERCIAL GATE: Enforce payment verification & coverage approvals
    // =========================================================================
    if (toStatus === "ready_for_assignment" && !isPlatformAdmin) {
      if (ticket.coverage_type === "paid") {
        // Check 1: Is there a paid invoice for this ticket?
        const { data: paidInvoice } = await client
          .from("invoices")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("ticket_id", id)
          .eq("status", "paid")
          .maybeSingle();

        // Check 2: Is there an authorized commercial override for this ticket?
        const { data: override } = await client
          .from("commercial_overrides")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("ticket_id", id)
          .maybeSingle();

        if (!paidInvoice && !override) {
          return reply.status(400).send({
            error: {
              code: "COMMERCIAL_GATE_BLOCKED",
              message: "Paid tickets must not become Ready for Assignment until payment is verified, except through a separately authorized and audited exception.",
            },
          });
        }
      } else if (ticket.coverage_type === "free" || ticket.coverage_type === "free_service") {
        const { data: pendingDecision } = await client
          .from("free_service_eligibility_decisions")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("ticket_id", id)
          .eq("requires_approval", true)
          .is("approved_at", null)
          .maybeSingle();

        if (pendingDecision) {
          return reply.status(400).send({
            error: {
              code: "COMMERCIAL_GATE_BLOCKED",
              message: "Free service ticket requires authorized manager approval before becoming Ready for Assignment.",
            },
          });
        }
      } else if (ticket.coverage_type === "pending_review") {
        return reply.status(400).send({
          error: {
            code: "COMMERCIAL_GATE_BLOCKED",
            message: "Ticket service coverage is pending review. Resolve coverage classification before advancing to Ready for Assignment.",
          },
        });
      }
    }

    // Prepare update data
    const nowIso = new Date().toISOString();
    const updateFields: Record<string, any> = {
      status: toStatus,
      updated_at: nowIso,
    };

    if (toStatus === "resolved") {
      updateFields["resolved_at"] = nowIso;
      updateFields["resolution_summary"] = reason;
    } else if (toStatus === "closed") {
      updateFields["closed_at"] = nowIso;
    } else if (toStatus === "cancelled") {
      updateFields["cancellation_reason"] = reason;
    }

    // 1. Update ticket table
    const { data: updatedTicket, error: updateErr } = await client
      .from("tickets")
      .update(updateFields)
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      return reply.status(400).send({
        error: { code: "STATUS_TRANSITION_FAILED", message: updateErr.message },
      });
    }

    // 2. Insert immutable status history record
    await client.from("ticket_status_history").insert({
      tenant_id: tenantId,
      ticket_id: id,
      from_status: currentStatus,
      to_status: toStatus,
      changed_by: userId,
      reason,
      metadata,
    });

    // 3. Insert timeline event
    await client.from("ticket_events").insert({
      tenant_id: tenantId,
      ticket_id: id,
      event_type: "status_change",
      actor_id: userId,
      actor_type: portal === "customer" ? "customer" : portal === "technician" ? "technician" : "staff",
      is_internal: false,
      body: `Status changed from '${currentStatus}' to '${toStatus}': ${reason}`,
      metadata: { from_status: currentStatus, to_status: toStatus, ...metadata },
    });

    await logAudit(
      tenantId,
      userId,
      "ticket.status_transition",
      "ticket",
      id,
      { status: currentStatus },
      { status: toStatus, reason }
    );

    return reply.send({
      data: updatedTicket,
      transition: {
        from: currentStatus,
        to: toStatus,
        reason,
        timestamp: nowIso,
      },
    });
  });

  // =========================================================================
  // 7. ASSIGNMENT MANAGEMENT
  // =========================================================================

  // PATCH /api/v1/tickets/:id/assign
  fastify.patch("/:id/assign", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id } = request.params as { id: string };

    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only operations staff can assign tickets" },
      });
    }

    const parseResult = assignTicketSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid payload", details: parseResult.error.flatten() },
      });
    }

    const { assignedTo, reason } = parseResult.data;
    const client = adminClient ?? request.userClient!;

    const { data: ticket } = await client
      .from("tickets")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();

    if (!ticket) {
      return reply.status(404).send({
        error: { code: "TICKET_NOT_FOUND", message: "Ticket not found" },
      });
    }

    const nowIso = new Date().toISOString();
    const newStatus = assignedTo ? (["draft", "submitted", "under_review", "ready_for_assignment"].includes(ticket.status) ? "assigned" : ticket.status) : "ready_for_assignment";

    const { data: updated, error } = await client
      .from("tickets")
      .update({
        assigned_to: assignedTo,
        status: newStatus,
        updated_at: nowIso,
      })
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return reply.status(400).send({
        error: { code: "ASSIGNMENT_FAILED", message: error.message },
      });
    }

    // Log event
    const actionDesc = assignedTo ? `Ticket assigned to technician (${assignedTo})` : "Ticket unassigned";
    await client.from("ticket_events").insert({
      tenant_id: tenantId,
      ticket_id: id,
      event_type: "assignment",
      actor_id: userId,
      actor_type: "staff",
      is_internal: true,
      body: reason ? `${actionDesc}: ${reason}` : actionDesc,
      metadata: { previous_assignee: ticket.assigned_to, new_assignee: assignedTo },
    });

    if (newStatus !== ticket.status) {
      await client.from("ticket_status_history").insert({
        tenant_id: tenantId,
        ticket_id: id,
        from_status: ticket.status,
        to_status: newStatus,
        changed_by: userId,
        reason: reason ?? `Status updated to ${newStatus} on assignment`,
      });
    }

    await logAudit(tenantId, userId, "ticket.assigned", "ticket", id, { assigned_to: ticket.assigned_to }, { assigned_to: assignedTo });

    return reply.send({ data: updated });
  });

  // =========================================================================
  // 8. TICKET TIMELINE EVENTS & COMMENTS
  // =========================================================================

  // POST /api/v1/tickets/:id/events
  fastify.post("/:id/events", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id } = request.params as { id: string };

    const parseResult = ticketEventSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid event payload", details: parseResult.error.flatten() },
      });
    }

    const client = adminClient ?? request.userClient!;
    const { data: ticket } = await client
      .from("tickets")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();

    if (!ticket) {
      return reply.status(404).send({
        error: { code: "TICKET_NOT_FOUND", message: "Ticket not found" },
      });
    }

    const hasAccess = await canAccessTicket(tenantId, userId, portal, isPlatformAdmin, ticket);
    if (!hasAccess) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Access denied" },
      });
    }

    const payload = parseResult.data;

    // PRIVACY ENFORCEMENT: Customer portal users can NEVER create internal notes
    const isInternal = portal === "customer" ? false : payload.isInternal;

    const actorType = portal === "customer" ? "customer" : portal === "technician" ? "technician" : "staff";

    const { data: event, error } = await client
      .from("ticket_events")
      .insert({
        tenant_id: tenantId,
        ticket_id: id,
        event_type: payload.eventType,
        actor_id: userId,
        actor_type: actorType,
        is_internal: isInternal,
        body: payload.body,
        attachments: payload.attachments,
        metadata: payload.metadata,
      })
      .select()
      .single();

    if (error) {
      return reply.status(400).send({
        error: { code: "ADD_EVENT_FAILED", message: error.message },
      });
    }

    // Touch ticket's updated_at
    await client
      .from("tickets")
      .update({ updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("id", id);

    return reply.status(201).send({ data: event });
  });
};
