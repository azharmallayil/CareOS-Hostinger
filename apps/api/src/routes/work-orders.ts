import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createAdminClient } from "@careos/supabase-client";
import { requireAuth, requireTenant } from "../middleware/guards.js";
import { APPROVED_REJECTION_REASONS } from "../services/dispatch-engine.js";

const rejectWorkOrderSchema = z.object({
  rejectionReason: z.enum(APPROVED_REJECTION_REASONS),
  rejectionExplanation: z.string().max(500).optional(),
});

const stageTransitionSchema = z.object({
  status: z.enum(["in_progress", "completed", "skipped"]),
  notes: z.string().max(1000).optional(),
});

const serviceVisitSchema = z.object({
  visitNumber: z.number().int().min(1).default(1),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  arrivalTime: z.string().optional(),
  departureTime: z.string().optional(),
  outcome: z.enum(["in_progress", "successful", "partial", "aborted", "parts_needed", "access_denied", "rescheduled"]),
  notes: z.string().max(1000).optional(),
  customerPresentName: z.string().max(100).optional(),
});

export const workOrderRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  // GET /api/v1/work-orders
  fastify.get<{
    Querystring: {
      technicianId?: string;
      ticketId?: string;
      status?: string;
      date?: string;
    };
  }>(
    "/",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ workOrders: [] });
      }

      const { technicianId, ticketId, status, date } = request.query;

      let query = adminClient
        .from("work_orders")
        .select(`
          id,
          work_order_number,
          ticket_id,
          technician_id,
          status,
          priority,
          scheduled_date,
          scheduled_window_start,
          scheduled_window_end,
          actual_checkin_at,
          actual_checkout_at,
          created_at,
          ticket:tickets(id, ticket_number, title),
          technician:technicians(id, full_name, email, phone),
          customer:customer_accounts(id, name, account_number),
          site:customer_sites(id, name, city, address_line1, latitude, longitude),
          asset:assets(id, make, model, year, vin, fleet_number)
        `)
        .eq("tenant_id", tenantId)
        .order("scheduled_date", { ascending: false });

      if (technicianId) {
        query = query.eq("technician_id", technicianId);
      }
      if (ticketId) {
        query = query.eq("ticket_id", ticketId);
      }
      if (status) {
        query = query.eq("status", status);
      }
      if (date) {
        query = query.eq("scheduled_date", date);
      }

      const { data, error } = await query;
      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ workOrders: data || [] });
    }
  );

  // GET /api/v1/work-orders/:id
  fastify.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const { id } = request.params;
      if (!tenantId || !adminClient) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Work order not found" } });
      }

      const { data: wo, error } = await adminClient
        .from("work_orders")
        .select(`
          *,
          ticket:tickets(*),
          technician:technicians(*),
          customer:customer_accounts(*),
          site:customer_sites(*),
          asset:assets(*),
          stages:work_order_stages(*),
          tasks:work_order_tasks(*),
          checklists:work_order_checklists(*),
          visits:service_visits(*),
          evidence:service_evidence(*)
        `)
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .single();

      if (error || !wo) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Work order not found" } });
      }

      return reply.send({ workOrder: wo });
    }
  );

  // POST /api/v1/work-orders/:id/accept
  fastify.post<{ Params: { id: string } }>(
    "/:id/accept",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const userId = request.auth?.user.id;
      const { id } = request.params;

      if (!tenantId || !userId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const { data: wo } = await adminClient
        .from("work_orders")
        .select("id, work_order_number, ticket_id, technician_id, status")
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .single();

      if (!wo) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Work order not found" } });
      }

      const { data: updated, error } = await adminClient
        .from("work_orders")
        .update({
          status: "accepted",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      if (wo.technician_id) {
        await adminClient
          .from("technician_assignment_history")
          .update({
            action: "accepted",
            responded_at: new Date().toISOString(),
          })
          .eq("work_order_id", id)
          .eq("technician_id", wo.technician_id)
          .is("responded_at", null);
      }

      await adminClient.from("ticket_events").insert({
        tenant_id: tenantId,
        ticket_id: wo.ticket_id,
        actor_id: userId,
        actor_role: "technician",
        event_type: "work_order_accepted",
        is_internal: false,
        body: `Work Order ${wo.work_order_number} was accepted by the assigned technician.`,
      });

      return reply.send({ workOrder: updated });
    }
  );

  // POST /api/v1/work-orders/:id/reject
  fastify.post<{ Params: { id: string } }>(
    "/:id/reject",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const userId = request.auth?.user.id;
      const { id } = request.params;

      if (!tenantId || !userId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = rejectWorkOrderSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const { rejectionReason, rejectionExplanation } = parsed.data;

      if (rejectionReason === "other" && (!rejectionExplanation || !rejectionExplanation.trim())) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: "An explanation is mandatory when rejection reason is 'other'" },
        });
      }

      const { data: wo } = await adminClient
        .from("work_orders")
        .select("id, work_order_number, ticket_id, technician_id")
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .single();

      if (!wo) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Work order not found" } });
      }

      const oldTechId = wo.technician_id;

      if (oldTechId) {
        await adminClient
          .from("technician_assignment_history")
          .update({
            action: "rejected",
            rejection_reason: rejectionReason,
            rejection_explanation: rejectionExplanation ?? null,
            responded_at: new Date().toISOString(),
            unassigned_at: new Date().toISOString(),
          })
          .eq("work_order_id", id)
          .eq("technician_id", oldTechId)
          .is("unassigned_at", null);
      }

      await adminClient
        .from("work_orders")
        .update({
          status: "cancelled",
          technician_id: null,
          resolution_notes: `Rejected by technician. Reason: ${rejectionReason}${rejectionExplanation ? ` - ${rejectionExplanation}` : ""}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      await adminClient
        .from("tickets")
        .update({
          status: "ready_for_assignment",
          updated_at: new Date().toISOString(),
        })
        .eq("id", wo.ticket_id);

      const reasonText = rejectionReason === "other" ? `Other (${rejectionExplanation})` : rejectionReason.replace(/_/g, " ");
      await adminClient.from("ticket_events").insert({
        tenant_id: tenantId,
        ticket_id: wo.ticket_id,
        actor_id: userId,
        actor_role: "technician",
        event_type: "work_order_rejected",
        is_internal: true,
        body: `Work Order ${wo.work_order_number} rejected by technician. Reason: ${reasonText}. Ticket returned to unassigned dispatch queue.`,
      });

      return reply.send({
        success: true,
        message: "Work order rejected and ticket returned to unassigned queue",
      });
    }
  );

  // POST /api/v1/work-orders/:id/stages/:stage/transition
  fastify.post<{ Params: { id: string; stage: string } }>(
    "/:id/stages/:stage/transition",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const { id, stage } = request.params;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = stageTransitionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const { status, notes } = parsed.data;

      const updateData: any = {
        status,
        notes: notes ?? null,
      };
      if (status === "in_progress") {
        updateData.started_at = new Date().toISOString();
      } else if (status === "completed") {
        updateData.completed_at = new Date().toISOString();
      }

      const { data: updatedStage, error: stageErr } = await adminClient
        .from("work_order_stages")
        .update(updateData)
        .eq("work_order_id", id)
        .eq("stage_name", stage)
        .select()
        .single();

      if (stageErr) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: stageErr.message } });
      }

      let woStatus = "in_progress";
      if (stage === "travel" && status === "in_progress") {
        woStatus = "en_route";
      } else if (stage === "arrival_checkin" && (status === "in_progress" || status === "completed")) {
        woStatus = "on_site";
        await adminClient
          .from("work_orders")
          .update({ actual_checkin_at: new Date().toISOString() })
          .eq("id", id);
      } else if (stage === "checkout" && status === "completed") {
        woStatus = "completed";
        await adminClient
          .from("work_orders")
          .update({ actual_checkout_at: new Date().toISOString() })
          .eq("id", id);
      }

      await adminClient
        .from("work_orders")
        .update({ status: woStatus, updated_at: new Date().toISOString() })
        .eq("id", id);

      return reply.send({ stage: updatedStage, workOrderStatus: woStatus });
    }
  );

  // POST /api/v1/work-orders/:id/visits
  fastify.post<{ Params: { id: string } }>(
    "/:id/visits",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const { id } = request.params;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = serviceVisitSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const b = parsed.data;

      const { data: wo } = await adminClient
        .from("work_orders")
        .select("id, ticket_id, technician_id")
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .single();

      if (!wo) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Work order not found" } });
      }

      const { data: visit, error } = await adminClient
        .from("service_visits")
        .insert({
          tenant_id: tenantId,
          ticket_id: wo.ticket_id,
          work_order_id: id,
          technician_id: wo.technician_id,
          visit_number: b.visitNumber,
          visit_date: b.visitDate,
          arrival_time: b.arrivalTime ?? new Date().toISOString(),
          departure_time: b.departureTime ?? null,
          outcome: b.outcome,
          notes: b.notes ?? null,
          customer_present_name: b.customerPresentName ?? null,
        })
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.status(201).send({ visit });
    }
  );
};
