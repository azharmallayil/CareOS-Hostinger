import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { createAdminClient } from "@careos/supabase-client";
import { requireAuth, requireTenant } from "../middleware/guards.js";

// ============================================================================
// Schemas
// ============================================================================
const COMPLAINT_STATUSES = [
  "submitted",
  "under_investigation",
  "action_required",
  "resolved",
  "closed",
  "rejected",
] as const;

export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

const createComplaintSchema = z.object({
  complaintType: z.enum(["service", "platform"]),
  customerAccountId: z.string().uuid(),
  ticketId: z.string().uuid().nullable().optional(),
  title: z.string().min(2).max(200),
  description: z.string().min(5).max(5000),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
});

const updateComplaintStatusSchema = z.object({
  status: z.enum(COMPLAINT_STATUSES),
  resolutionSummary: z.string().max(2000).optional(),
  customerUpdate: z.string().max(2000).optional(),
  internalNotes: z.string().max(2000).optional(),
});

const complaintEventSchema = z.object({
  eventType: z.enum(["note", "status_change", "customer_communication", "resolution"]).default("note"),
  body: z.string().min(1).max(5000),
  isInternal: z.boolean().default(false),
});

// ============================================================================
// Routes Plugin
// ============================================================================
export const complaintRoutes: FastifyPluginAsync = async (fastify) => {
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
      fastify.log.error(err, "Failed to write audit log in complaint routes");
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

  // Safe atomic complaint number generator
  const allocateComplaintNumber = async (tenantId: string): Promise<string> => {
    if (adminClient) {
      try {
        const { data: generated, error } = await adminClient.rpc("generate_complaint_number", {
          p_tenant_id: tenantId,
        });
        if (!error && generated) return generated as string;
      } catch (err) {
        fastify.log.warn(err, "generate_complaint_number RPC failed, falling back to sequence generation");
      }
    }

    const year = new Date().getUTCFullYear();
    const randomSeq = crypto.randomInt(100000, 999999);
    return `CMP-${year}-${randomSeq}`;
  };

  fastify.addHook("preHandler", requireAuth);
  fastify.addHook("preHandler", requireTenant);

  // =========================================================================
  // 1. LIST COMPLAINTS
  // =========================================================================

  // GET /api/v1/complaints
  fastify.get("/", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const client = adminClient ?? request.userClient!;

    const query = request.query as {
      search?: string;
      status?: string;
      severity?: string;
      complaintType?: string;
      customerAccountId?: string;
      ticketId?: string;
      page?: string;
      limit?: string;
    };

    const page = Math.max(1, Number.parseInt(query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit || "20", 10)));
    const offset = (page - 1) * limit;

    let dbQuery = client
      .from("complaints")
      .select(
        `
        id,
        tenant_id,
        complaint_number,
        complaint_type,
        title,
        description,
        severity,
        status,
        customer_account_id,
        ticket_id,
        assigned_manager_id,
        created_by,
        resolved_at,
        closed_at,
        created_at,
        updated_at,
        customer_accounts ( id, name, account_number ),
        tickets ( id, ticket_number, title )
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
    if (query.severity) {
      dbQuery = dbQuery.eq("severity", query.severity);
    }
    if (query.complaintType) {
      dbQuery = dbQuery.eq("complaint_type", query.complaintType);
    }
    if (query.customerAccountId) {
      dbQuery = dbQuery.eq("customer_account_id", query.customerAccountId);
    }
    if (query.ticketId) {
      dbQuery = dbQuery.eq("ticket_id", query.ticketId);
    }
    if (query.search) {
      const s = `%${query.search}%`;
      dbQuery = dbQuery.or(`complaint_number.ilike.${s},title.ilike.${s},description.ilike.${s}`);
    }

    dbQuery = dbQuery.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data: complaints, error, count } = await dbQuery;

    if (error) {
      return reply.status(500).send({
        error: { code: "FETCH_COMPLAINTS_FAILED", message: error.message },
      });
    }

    const total = count ?? 0;
    return reply.send({
      data: complaints || [],
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  // =========================================================================
  // 2. GET COMPLAINT DETAIL & TIMELINE
  // =========================================================================

  // GET /api/v1/complaints/:id
  fastify.get("/:id", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id } = request.params as { id: string };
    const client = adminClient ?? request.userClient!;

    const { data: complaint, error } = await client
      .from("complaints")
      .select(
        `
        *,
        customer_accounts ( id, name, account_number, email, phone ),
        tickets ( id, ticket_number, title, status, priority )
      `
      )
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return reply.status(500).send({
        error: { code: "FETCH_COMPLAINT_FAILED", message: error.message },
      });
    }

    if (!complaint) {
      return reply.status(404).send({
        error: { code: "COMPLAINT_NOT_FOUND", message: "Complaint not found" },
      });
    }

    // Access authorization check
    if (!isPlatformAdmin && portal === "customer") {
      const linkedIds = await getLinkedCustomerAccounts(tenantId, userId);
      if (!linkedIds.includes(complaint.customer_account_id)) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "You do not have access to this complaint" },
        });
      }
    }

    // Fetch complaint events
    // Customer portal users must NEVER see internal investigation notes!
    let eventsQuery = client
      .from("complaint_events")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("complaint_id", id)
      .order("created_at", { ascending: true });

    if (!isPlatformAdmin && portal === "customer") {
      eventsQuery = eventsQuery.eq("is_internal", false);
    }

    const { data: events } = await eventsQuery;

    // Mask internal investigation notes for customers
    const responseData = { ...complaint };
    if (!isPlatformAdmin && portal === "customer") {
      delete responseData.internal_investigation_notes;
    }

    return reply.send({
      data: {
        ...responseData,
        events: events || [],
      },
    });
  });

  // =========================================================================
  // 3. CREATE COMPLAINT
  // =========================================================================

  // POST /api/v1/complaints
  fastify.post("/", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);

    const parseResult = createComplaintSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid complaint payload", details: parseResult.error.flatten() },
      });
    }

    const payload = parseResult.data;

    if (!isPlatformAdmin && portal === "customer") {
      const linkedCustomerIds = await getLinkedCustomerAccounts(tenantId, userId);
      if (!linkedCustomerIds.includes(payload.customerAccountId)) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "You can only file complaints for customer accounts you are linked to" },
        });
      }
    }

    const client = adminClient ?? request.userClient!;

    // If ticket is provided, verify ticket exists in tenant
    if (payload.ticketId) {
      const { data: ticket } = await client
        .from("tickets")
        .select("id, ticket_number, customer_account_id")
        .eq("tenant_id", tenantId)
        .eq("id", payload.ticketId)
        .maybeSingle();

      if (!ticket) {
        return reply.status(400).send({
          error: { code: "INVALID_TICKET", message: "The specified ticket does not exist in this tenant" },
        });
      }

      if (ticket.customer_account_id !== payload.customerAccountId) {
        return reply.status(400).send({
          error: { code: "TICKET_CUSTOMER_MISMATCH", message: "Ticket does not belong to the selected customer account" },
        });
      }
    }

    // Generate atomic complaint number
    const complaintNumber = await allocateComplaintNumber(tenantId);

    // Insert complaint
    const { data: complaint, error } = await client
      .from("complaints")
      .insert({
        tenant_id: tenantId,
        complaint_number: complaintNumber,
        complaint_type: payload.complaintType,
        customer_account_id: payload.customerAccountId,
        ticket_id: payload.ticketId ?? null,
        title: payload.title,
        description: payload.description,
        severity: payload.severity,
        status: "submitted",
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      return reply.status(400).send({
        error: { code: "COMPLAINT_CREATION_FAILED", message: error.message },
      });
    }

    // Create initial timeline event
    await client.from("complaint_events").insert({
      tenant_id: tenantId,
      complaint_id: complaint.id,
      actor_id: userId,
      is_internal: false,
      event_type: "status_change",
      body: `Complaint filed (${payload.complaintType.toUpperCase()} - Severity: ${payload.severity.toUpperCase()})`,
    });

    // NOTE: Complaints link to ticket without modifying the ticket's audit history,
    // satisfying Step 9 requirements: "Complaints have a separate lifecycle and may link to a ticket, but must not alter ticket audit history."

    await logAudit(tenantId, userId, "complaint.created", "complaint", complaint.id, null, complaint);

    return reply.status(201).send({ data: complaint });
  });

  // =========================================================================
  // 4. UPDATE COMPLAINT STATUS & INVESTIGATION
  // =========================================================================

  // PATCH /api/v1/complaints/:id/status
  fastify.patch("/:id/status", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id } = request.params as { id: string };

    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only operations managers can update complaint statuses" },
      });
    }

    const parseResult = updateComplaintStatusSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid payload", details: parseResult.error.flatten() },
      });
    }

    const { status, resolutionSummary, customerUpdate, internalNotes } = parseResult.data;
    const client = adminClient ?? request.userClient!;

    const { data: complaint } = await client
      .from("complaints")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();

    if (!complaint) {
      return reply.status(404).send({
        error: { code: "COMPLAINT_NOT_FOUND", message: "Complaint not found" },
      });
    }

    const nowIso = new Date().toISOString();
    const updateData: Record<string, any> = {
      status,
      updated_at: nowIso,
    };

    if (resolutionSummary !== undefined) updateData["resolution_summary"] = resolutionSummary;
    if (customerUpdate !== undefined) updateData["customer_update"] = customerUpdate;
    if (internalNotes !== undefined) updateData["internal_investigation_notes"] = internalNotes;
    if (status === "resolved") updateData["resolved_at"] = nowIso;
    if (status === "closed" || status === "rejected") updateData["closed_at"] = nowIso;

    const { data: updated, error } = await client
      .from("complaints")
      .update(updateData)
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return reply.status(400).send({
        error: { code: "COMPLAINT_UPDATE_FAILED", message: error.message },
      });
    }

    // Add status change event
    await client.from("complaint_events").insert({
      tenant_id: tenantId,
      complaint_id: id,
      actor_id: userId,
      is_internal: false,
      event_type: status === "resolved" ? "resolution" : "status_change",
      body: `Complaint status updated from '${complaint.status}' to '${status}'. ${resolutionSummary ? `Summary: ${resolutionSummary}` : ""}`,
    });

    if (internalNotes) {
      await client.from("complaint_events").insert({
        tenant_id: tenantId,
        complaint_id: id,
        actor_id: userId,
        is_internal: true,
        event_type: "note",
        body: `Internal investigation update: ${internalNotes}`,
      });
    }

    await logAudit(tenantId, userId, "complaint.status_updated", "complaint", id, complaint, updated);

    return reply.send({ data: updated });
  });

  // =========================================================================
  // 5. ADD COMPLAINT EVENT / NOTE
  // =========================================================================

  // POST /api/v1/complaints/:id/events
  fastify.post("/:id/events", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id } = request.params as { id: string };

    const parseResult = complaintEventSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid event payload", details: parseResult.error.flatten() },
      });
    }

    const client = adminClient ?? request.userClient!;
    const { data: complaint } = await client
      .from("complaints")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();

    if (!complaint) {
      return reply.status(404).send({
        error: { code: "COMPLAINT_NOT_FOUND", message: "Complaint not found" },
      });
    }

    if (!isPlatformAdmin && portal === "customer") {
      const linkedCustomerIds = await getLinkedCustomerAccounts(tenantId, userId);
      if (!linkedCustomerIds.includes(complaint.customer_account_id)) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "Access denied" },
        });
      }
    }

    const payload = parseResult.data;
    const isInternal = portal === "customer" ? false : payload.isInternal;

    const { data: event, error } = await client
      .from("complaint_events")
      .insert({
        tenant_id: tenantId,
        complaint_id: id,
        actor_id: userId,
        is_internal: isInternal,
        event_type: payload.eventType,
        body: payload.body,
      })
      .select()
      .single();

    if (error) {
      return reply.status(400).send({
        error: { code: "ADD_EVENT_FAILED", message: error.message },
      });
    }

    await client
      .from("complaints")
      .update({ updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("id", id);

    return reply.status(201).send({ data: event });
  });
};
