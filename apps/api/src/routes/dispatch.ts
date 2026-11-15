import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createAdminClient } from "@careos/supabase-client";
import { requireAuth, requireTenant } from "../middleware/guards.js";
import {
  computeTechnicianRecommendations,
  TechnicianCandidate,
  TicketDispatchContext,
} from "../services/dispatch-engine.js";

const assignTechnicianSchema = z.object({
  ticketId: z.string().uuid(),
  technicianId: z.string().uuid(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduledWindowStart: z.string().default("09:00:00"),
  scheduledWindowEnd: z.string().default("12:00:00"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
});

const reassignTechnicianSchema = z.object({
  workOrderId: z.string().uuid(),
  newTechnicianId: z.string().uuid(),
  reassignmentReason: z.string().min(3).max(500),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const dispatchRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  // GET /api/v1/dispatch/queue
  fastify.get(
    "/queue",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ queue: [] });
      }

      const { data: tickets, error } = await adminClient
        .from("tickets")
        .select(`
          id,
          ticket_number,
          title,
          description,
          status,
          priority,
          coverage_type,
          created_at,
          customer:customer_accounts(id, name, account_number),
          site:customer_sites(id, name, city, latitude, longitude),
          asset:assets(id, make, model, year, vin, fleet_number),
          category:ticket_categories(id, code, name)
        `)
        .eq("tenant_id", tenantId)
        .in("status", ["ready_for_assignment", "unassigned", "reassigned"])
        .order("created_at", { ascending: false });

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ queue: tickets || [] });
    }
  );

  // GET /api/v1/dispatch/recommendations
  fastify.get<{ Querystring: { ticketId: string; scheduledDate?: string } }>(
    "/recommendations",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const { ticketId, scheduledDate = new Date().toISOString().split("T")[0] } = request.query;

      if (!ticketId) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "ticketId query parameter required" } });
      }

      if (!tenantId || !adminClient) {
        return reply.send({ ticketId, scheduledDate, recommendations: [] });
      }

      const { data: ticket, error: ticketError } = await adminClient
        .from("tickets")
        .select(`
          id,
          priority,
          category:ticket_categories(code),
          site:customer_sites(city, postal_code, latitude, longitude)
        `)
        .eq("tenant_id", tenantId)
        .eq("id", ticketId)
        .single();

      if (ticketError || !ticket) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Ticket not found" } });
      }

      const { data: techs, error: techsError } = await adminClient
        .from("technicians")
        .select(`
          id,
          full_name,
          email,
          phone,
          status,
          max_active_work_orders,
          avg_rating,
          last_location_lat,
          last_location_lng,
          last_location_updated_at,
          skills:technician_skills(skill_code),
          territories:technician_territories(
            territory:service_territories(city, name)
          )
        `)
        .eq("tenant_id", tenantId);

      if (techsError) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: techsError.message } });
      }

      const { data: activeWOs } = await adminClient
        .from("work_orders")
        .select("technician_id")
        .eq("tenant_id", tenantId)
        .in("status", ["assigned", "accepted", "en_route", "on_site", "in_progress"]);

      const workloadMap = new Map<string, number>();
      (activeWOs || []).forEach((wo: any) => {
        if (wo.technician_id) {
          workloadMap.set(wo.technician_id, (workloadMap.get(wo.technician_id) || 0) + 1);
        }
      });

      const { data: availList } = await adminClient
        .from("technician_availability")
        .select("technician_id, status")
        .eq("tenant_id", tenantId)
        .eq("date", scheduledDate);

      const leaveSet = new Set<string>();
      (availList || []).forEach((a: any) => {
        if (["time_off", "sick_leave"].includes(a.status)) {
          leaveSet.add(a.technician_id);
        }
      });

      const candidates: TechnicianCandidate[] = (techs || []).map((t: any) => {
        const skills = (t.skills || []).map((s: any) => s.skill_code);
        const territories = (t.territories || []).map((tr: any) => tr.territory?.city || "");

        return {
          id: t.id,
          fullName: t.full_name,
          email: t.email,
          phone: t.phone || undefined,
          status: t.status,
          maxActiveWorkOrders: t.max_active_work_orders || 4,
          currentWorkload: workloadMap.get(t.id) || 0,
          avgRating: Number(t.avg_rating) || 5.0,
          skills,
          territories,
          workingToday: true,
          onLeave: leaveSet.has(t.id),
          lastLocation:
            t.last_location_lat && t.last_location_lng
              ? {
                  lat: Number(t.last_location_lat),
                  lng: Number(t.last_location_lng),
                  updatedAt: t.last_location_updated_at,
                }
              : undefined,
        };
      });

      const dispatchContext: TicketDispatchContext = {
        ticketId,
        categoryCode: (ticket as any).category?.code,
        priority: ticket.priority as any,
        scheduledDate: scheduledDate ?? new Date().toISOString().slice(0, 10),
        customerSite: (ticket as any).site
          ? {
              city: (ticket as any).site.city || undefined,
              postalCode: (ticket as any).site.postal_code || undefined,
              latitude: (ticket as any).site.latitude ? Number((ticket as any).site.latitude) : undefined,
              longitude: (ticket as any).site.longitude ? Number((ticket as any).site.longitude) : undefined,
            }
          : undefined,
      };

      const recommendations = computeTechnicianRecommendations(candidates, dispatchContext);

      return reply.send({
        ticketId,
        scheduledDate,
        recommendations,
      });
    }
  );

  // POST /api/v1/dispatch/assign
  fastify.post(
    "/assign",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const userId = request.auth?.user.id;
      if (!tenantId || !userId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = assignTechnicianSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const {
        ticketId,
        technicianId,
        scheduledDate,
        scheduledWindowStart,
        scheduledWindowEnd,
        priority,
      } = parsed.data;

      const { data: ticket, error: ticketError } = await adminClient
        .from("tickets")
        .select("id, ticket_number, customer_account_id, customer_site_id, asset_id, status")
        .eq("tenant_id", tenantId)
        .eq("id", ticketId)
        .single();

      if (ticketError || !ticket) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Ticket not found" } });
      }

      const { data: tech } = await adminClient
        .from("technicians")
        .select("id, full_name")
        .eq("tenant_id", tenantId)
        .eq("id", technicianId)
        .single();

      if (!tech) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Technician not found" } });
      }

      const { data: woNumberData } = await adminClient.rpc(
        "generate_work_order_number",
        { p_tenant_id: tenantId }
      );

      const workOrderNumber = (woNumberData as string) || `WO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

      const { data: workOrder, error: woError } = await adminClient
        .from("work_orders")
        .insert({
          tenant_id: tenantId,
          work_order_number: workOrderNumber,
          ticket_id: ticketId,
          technician_id: technicianId,
          customer_account_id: ticket.customer_account_id,
          customer_site_id: ticket.customer_site_id,
          asset_id: ticket.asset_id,
          status: "assigned",
          priority,
          scheduled_date: scheduledDate,
          scheduled_window_start: scheduledWindowStart,
          scheduled_window_end: scheduledWindowEnd,
          created_by: userId,
        })
        .select()
        .single();

      if (woError) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: woError.message } });
      }

      const stages = [
        { stage_name: "dispatch", stage_order: 1, status: "completed" },
        { stage_name: "travel", stage_order: 2, status: "pending" },
        { stage_name: "arrival_checkin", stage_order: 3, status: "pending" },
        { stage_name: "diagnosis", stage_order: 4, status: "pending" },
        { stage_name: "execution", stage_order: 5, status: "pending" },
        { stage_name: "checkout", stage_order: 6, status: "pending" },
      ].map((st) => ({
        tenant_id: tenantId,
        work_order_id: workOrder.id,
        stage_name: st.stage_name,
        stage_order: st.stage_order,
        status: st.status,
      }));

      await adminClient.from("work_order_stages").insert(stages);

      await adminClient.from("technician_assignment_history").insert({
        tenant_id: tenantId,
        ticket_id: ticketId,
        work_order_id: workOrder.id,
        technician_id: technicianId,
        action: "assigned",
        actor_id: userId,
        assigned_at: new Date().toISOString(),
      });

      await adminClient
        .from("tickets")
        .update({ status: "scheduled", updated_at: new Date().toISOString() })
        .eq("id", ticketId);

      await adminClient.from("ticket_events").insert({
        tenant_id: tenantId,
        ticket_id: ticketId,
        actor_id: userId,
        actor_role: "operations",
        event_type: "technician_assigned",
        is_internal: false,
        body: `Technician ${tech.full_name} assigned under Work Order ${workOrderNumber}. Scheduled for ${scheduledDate} (${scheduledWindowStart}-${scheduledWindowEnd}).`,
      });

      return reply.status(201).send({
        workOrder,
        message: `Work Order ${workOrderNumber} created and assigned to ${tech.full_name}`,
      });
    }
  );

  // POST /api/v1/dispatch/reassign
  fastify.post(
    "/reassign",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const userId = request.auth?.user.id;
      if (!tenantId || !userId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = reassignTechnicianSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const { workOrderId, newTechnicianId, reassignmentReason, scheduledDate } = parsed.data;

      const { data: wo } = await adminClient
        .from("work_orders")
        .select("id, work_order_number, ticket_id, technician_id, scheduled_date")
        .eq("tenant_id", tenantId)
        .eq("id", workOrderId)
        .single();

      if (!wo) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Work order not found" } });
      }

      const oldTechId = wo.technician_id;

      if (oldTechId) {
        await adminClient
          .from("technician_assignment_history")
          .update({
            unassigned_at: new Date().toISOString(),
            reassignment_reason: reassignmentReason,
          })
          .eq("work_order_id", workOrderId)
          .eq("technician_id", oldTechId)
          .is("unassigned_at", null);
      }

      await adminClient.from("technician_assignment_history").insert({
        tenant_id: tenantId,
        ticket_id: wo.ticket_id,
        work_order_id: workOrderId,
        technician_id: newTechnicianId,
        action: "reassigned",
        actor_id: userId,
        reassignment_reason: reassignmentReason,
      });

      const updatePayload: any = {
        technician_id: newTechnicianId,
        status: "assigned",
        updated_at: new Date().toISOString(),
      };
      if (scheduledDate) {
        updatePayload.scheduled_date = scheduledDate;
      }

      await adminClient
        .from("work_orders")
        .update(updatePayload)
        .eq("id", workOrderId);

      await adminClient.from("ticket_events").insert({
        tenant_id: tenantId,
        ticket_id: wo.ticket_id,
        actor_id: userId,
        actor_role: "operations",
        event_type: "technician_reassigned",
        is_internal: false,
        body: `Work Order ${wo.work_order_number} reassigned to new technician. Reason: ${reassignmentReason}`,
      });

      return reply.send({
        success: true,
        message: `Work Order ${wo.work_order_number} successfully reassigned.`,
      });
    }
  );
};
