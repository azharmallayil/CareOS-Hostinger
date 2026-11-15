import type { FastifyPluginAsync } from "fastify";
import { createAdminClient } from "@careos/supabase-client";
import { requireAuth, requireTenant } from "../middleware/guards.js";

export const serviceIntelligenceRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  // GET /api/v1/intelligence/overview
  fastify.get(
    "/overview",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({
          totalTickets: 0,
          activeTickets: 0,
          resolvedTickets: 0,
          overdueTickets: 0,
          slaComplianceRate: 100,
          avgResolutionHours: 0,
          escalatedTicketsCount: 0,
        });
      }

      // Fetch all tenant tickets
      const { data: tickets, error: ticketError } = await adminClient
        .from("tickets")
        .select("id, status, created_at, resolved_at")
        .eq("tenant_id", tenantId);

      if (ticketError) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: ticketError.message } });
      }

      const allTickets = tickets || [];
      const totalTickets = allTickets.length;
      const closedStatuses = ["resolved", "closed", "cancelled"];
      const activeTickets = allTickets.filter((t) => !closedStatuses.includes(t.status)).length;
      const resolvedTickets = allTickets.filter((t) => ["resolved", "closed"].includes(t.status)).length;

      // Calculate avg resolution hours
      let totalResolutionMinutes = 0;
      let countWithResolutionTime = 0;
      for (const t of allTickets) {
        if (t.resolved_at && t.created_at) {
          const diffMs = new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime();
          if (diffMs > 0) {
            totalResolutionMinutes += diffMs / (1000 * 60);
            countWithResolutionTime++;
          }
        }
      }
      const avgResolutionHours =
        countWithResolutionTime > 0
          ? Math.round((totalResolutionMinutes / countWithResolutionTime / 60) * 10) / 10
          : 0;

      // Fetch SLA instances for tenant
      const { data: slaInstances } = await adminClient
        .from("sla_instances")
        .select("id, resolution_breached, response_breached, resolution_target_at, resolution_actual_at, is_paused")
        .eq("tenant_id", tenantId);

      const allSla = slaInstances || [];
      const nowIso = new Date().toISOString();
      const overdueTickets = allSla.filter(
        (s) =>
          s.resolution_breached ||
          (!s.resolution_actual_at && !s.is_paused && s.resolution_target_at < nowIso)
      ).length;

      const totalSlaCount = allSla.length;
      const breachedCount = allSla.filter((s) => s.resolution_breached).length;
      const slaComplianceRate =
        totalSlaCount > 0
          ? Math.round(((totalSlaCount - breachedCount) / totalSlaCount) * 100)
          : 100;

      // Escalation count
      const { count: escalatedTicketsCount } = await adminClient
        .from("escalation_history")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId);

      return reply.send({
        totalTickets,
        activeTickets,
        resolvedTickets,
        overdueTickets,
        slaComplianceRate,
        avgResolutionHours,
        escalatedTicketsCount: escalatedTicketsCount ?? 0,
      });
    }
  );

  // GET /api/v1/intelligence/sla-compliance
  fastify.get(
    "/sla-compliance",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({
          byPriority: {},
          overallComplianceRate: 100,
        });
      }

      const { data: instances, error } = await adminClient
        .from("sla_instances")
        .select(`
          id,
          resolution_breached,
          response_breached,
          ticket:tickets(priority)
        `)
        .eq("tenant_id", tenantId);

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      const byPriority: Record<string, { total: number; breached: number; compliant: number; rate: number }> = {
        critical: { total: 0, breached: 0, compliant: 0, rate: 100 },
        high: { total: 0, breached: 0, compliant: 0, rate: 100 },
        medium: { total: 0, breached: 0, compliant: 0, rate: 100 },
        low: { total: 0, breached: 0, compliant: 0, rate: 100 },
      };

      for (const inst of instances || []) {
        const ticketPriority = (inst.ticket as { priority?: string } | null)?.priority ?? "medium";
        if (!byPriority[ticketPriority]) {
          byPriority[ticketPriority] = { total: 0, breached: 0, compliant: 0, rate: 100 };
        }
        byPriority[ticketPriority].total++;
        if (inst.resolution_breached || inst.response_breached) {
          byPriority[ticketPriority].breached++;
        } else {
          byPriority[ticketPriority].compliant++;
        }
      }

      for (const key of Object.keys(byPriority)) {
        const p = byPriority[key];
        if (p) {
          p.rate = p.total > 0 ? Math.round((p.compliant / p.total) * 100) : 100;
        }
      }

      return reply.send({ byPriority });
    }
  );

  // GET /api/v1/intelligence/service-volume
  fastify.get(
    "/service-volume",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ byCategory: {}, byStatus: {} });
      }

      const { data: tickets, error } = await adminClient
        .from("tickets")
        .select("category, status")
        .eq("tenant_id", tenantId);

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      const byCategory: Record<string, number> = {};
      const byStatus: Record<string, number> = {};

      for (const t of tickets || []) {
        const cat = t.category || "general";
        const st = t.status || "new";
        byCategory[cat] = (byCategory[cat] || 0) + 1;
        byStatus[st] = (byStatus[st] || 0) + 1;
      }

      return reply.send({ byCategory, byStatus });
    }
  );

  // GET /api/v1/intelligence/technician-workload
  fastify.get(
    "/technician-workload",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ technicians: [] });
      }

      // Fetch technicians
      const { data: techs, error: techError } = await adminClient
        .from("technician_profiles")
        .select("id, full_name, is_active, skills, service_territory_id")
        .eq("tenant_id", tenantId);

      if (techError) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: techError.message } });
      }

      // Fetch active work orders per technician
      const { data: workOrders } = await adminClient
        .from("work_orders")
        .select("technician_id, status")
        .eq("tenant_id", tenantId);

      const woList = workOrders || [];

      const technicianStats = (techs || []).map((t) => {
        const assignedWos = woList.filter((wo) => wo.technician_id === t.id);
        const activeCount = assignedWos.filter((wo) =>
          ["assigned", "accepted", "in_progress", "on_site"].includes(wo.status)
        ).length;
        const completedCount = assignedWos.filter((wo) => wo.status === "completed").length;

        return {
          id: t.id,
          name: t.full_name,
          isActive: t.is_active,
          skills: t.skills || [],
          activeJobs: activeCount,
          completedJobs: completedCount,
          utilizationPercentage: Math.min(Math.round((activeCount / 4) * 100), 100), // 4 concurrent capacity nominal
        };
      });

      return reply.send({ technicians: technicianStats });
    }
  );

  // GET /api/v1/intelligence/customer-history
  fastify.get(
    "/customer-history",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ customers: [] });
      }

      const { data: customers, error } = await adminClient
        .from("customer_accounts")
        .select("id, name, account_number, status")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true })
        .limit(20);

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      const { data: tickets } = await adminClient
        .from("tickets")
        .select("id, customer_id, status, created_at")
        .eq("tenant_id", tenantId);

      const ticketList = tickets || [];

      const summaries = (customers || []).map((c) => {
        const custTickets = ticketList.filter((t) => t.customer_id === c.id);
        const openTickets = custTickets.filter(
          (t) => !["resolved", "closed", "cancelled"].includes(t.status)
        ).length;

        return {
          id: c.id,
          name: c.name,
          accountNumber: c.account_number,
          status: c.status,
          totalTickets: custTickets.length,
          openTickets,
        };
      });

      return reply.send({ customers: summaries });
    }
  );
};
