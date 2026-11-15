import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createAdminClient } from "@careos/supabase-client";
import { requireAuth, requireTenant } from "../middleware/guards.js";

const reportSummarySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  customerId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
});

const exportSchema = z.object({
  entityType: z.enum(["tickets", "customers", "assets", "sla_report", "inventory", "bulk_service"]),
  format: z.enum(["csv", "json"]).default("csv"),
  filters: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    customerId: z.string().uuid().optional(),
    status: z.string().optional(),
  }).default({}),
});

/**
 * Formats an array of plain objects into RFC 4180 compliant CSV.
 */
function toCsv(rows: Record<string, unknown>[], headers: { key: string; label: string }[]): string {
  if (rows.length === 0) {
    return headers.map((h) => `"${h.label}"`).join(",") + "\n";
  }

  const headerLine = headers.map((h) => `"${h.label.replace(/"/g, '""')}"`).join(",");
  const dataLines = rows.map((row) =>
    headers
      .map((h) => {
        const val = row[h.key];
        if (val === null || val === undefined) return '""';
        const str = typeof val === "object" ? JSON.stringify(val) : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      })
      .join(",")
  );

  return [headerLine, ...dataLines].join("\n");
}

export const reportRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  // ── 1. Comprehensive Operational Summary ───────────────────────────────────
  fastify.get(
    "/summary",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const user = request.auth?.user;
      if (!tenantId || !user || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = reportSummarySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const { startDate, endDate, customerId, status, priority } = parsed.data;

      // Check if caller is customer portal user
      const roles = request.auth?.activeMembership?.roles || [];
      const isCustomerUser = roles.includes("customer_user");

      let effectiveCustomerId = customerId;
      if (isCustomerUser) {
        const { data: customerLinks } = await adminClient
          .from("customer_user_links")
          .select("customer_account_id")
          .eq("tenant_id", tenantId)
          .eq("user_id", user.id)
          .eq("is_active", true);

        const linkedIds = (customerLinks || []).map((l) => l.customer_account_id);
        if (linkedIds.length === 0) {
          return reply.send({
            ticketsSummary: { total: 0, resolved: 0, active: 0, avgResolutionHours: 0 },
            slaSummary: { complianceRate: 100, breached: 0, total: 0 },
            breakdownByStatus: {},
            breakdownByPriority: {},
            breakdownByCategory: {},
          });
        }
        effectiveCustomerId = linkedIds[0];
      }

      // Query tickets with filters
      let ticketQuery = adminClient
        .from("tickets")
        .select("id, status, priority, category, created_at, resolved_at")
        .eq("tenant_id", tenantId);

      if (effectiveCustomerId) ticketQuery = ticketQuery.eq("customer_id", effectiveCustomerId);
      if (status) ticketQuery = ticketQuery.eq("status", status);
      if (priority) ticketQuery = ticketQuery.eq("priority", priority);
      if (startDate) ticketQuery = ticketQuery.gte("created_at", startDate);
      if (endDate) ticketQuery = ticketQuery.lte("created_at", endDate);

      const { data: tickets, error: ticketErr } = await ticketQuery;
      if (ticketErr) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: ticketErr.message } });
      }

      const ticketList = tickets || [];
      const totalTickets = ticketList.length;
      const closedStatuses = ["resolved", "closed", "cancelled"];
      const resolvedTickets = ticketList.filter((t) => ["resolved", "closed"].includes(t.status)).length;
      const activeTickets = ticketList.filter((t) => !closedStatuses.includes(t.status)).length;

      // Avg resolution time calculation
      let totalResolutionMinutes = 0;
      let countWithResolution = 0;
      for (const t of ticketList) {
        if (t.resolved_at && t.created_at) {
          const diffMs = new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime();
          if (diffMs > 0) {
            totalResolutionMinutes += diffMs / 60000;
            countWithResolution++;
          }
        }
      }
      const avgResolutionHours =
        countWithResolution > 0
          ? Math.round((totalResolutionMinutes / countWithResolution / 60) * 10) / 10
          : 0;

      // Distributions
      const breakdownByStatus: Record<string, number> = {};
      const breakdownByPriority: Record<string, number> = {};
      const breakdownByCategory: Record<string, number> = {};

      for (const t of ticketList) {
        breakdownByStatus[t.status] = (breakdownByStatus[t.status] || 0) + 1;
        breakdownByPriority[t.priority] = (breakdownByPriority[t.priority] || 0) + 1;
        const cat = t.category || "general";
        breakdownByCategory[cat] = (breakdownByCategory[cat] || 0) + 1;
      }

      // SLA Instances summary
      const { data: slaList } = await adminClient
        .from("sla_instances")
        .select("id, resolution_breached, response_breached")
        .eq("tenant_id", tenantId);

      const slas = slaList || [];
      const totalSla = slas.length;
      const breachedSla = slas.filter((s) => s.resolution_breached || s.response_breached).length;
      const slaComplianceRate =
        totalSla > 0 ? Math.round(((totalSla - breachedSla) / totalSla) * 100) : 100;

      // Low stock count (internal only)
      let lowStockCount = 0;
      if (!isCustomerUser) {
        const { count } = await adminClient
          .from("stock_levels")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .lte("quantity_on_hand", 5);
        lowStockCount = count ?? 0;
      }

      // Bulk service progress
      let activeBulkCampaigns = 0;
      if (!isCustomerUser) {
        const { count } = await adminClient
          .from("bulk_service_requests")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .in("status", ["approved", "in_progress", "scheduled"]);
        activeBulkCampaigns = count ?? 0;
      }

      return reply.send({
        ticketsSummary: {
          total: totalTickets,
          resolved: resolvedTickets,
          active: activeTickets,
          avgResolutionHours,
        },
        slaSummary: {
          complianceRate: slaComplianceRate,
          breached: breachedSla,
          total: totalSla,
        },
        breakdownByStatus,
        breakdownByPriority,
        breakdownByCategory,
        operationalAlerts: {
          lowStockCount,
          activeBulkCampaigns,
        },
      });
    }
  );

  // ── 2. Role-Scoped Data Export (CSV & JSON) ─────────────────────────────────
  fastify.post(
    "/export",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const user = request.auth?.user;
      if (!tenantId || !user || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = exportSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const { entityType, format, filters } = parsed.data;

      // Check caller roles
      const roles = request.auth?.activeMembership?.roles || [];
      const isCustomerUser = roles.includes("customer_user");
      const portal = isCustomerUser ? "customer" : "operations";

      // If customer user, disallow internal-only export entities
      if (isCustomerUser && ["inventory", "sla_report", "bulk_service"].includes(entityType)) {
        return reply.status(403).send({
          error: {
            code: "FORBIDDEN",
            message: "Customer portal users are not authorized to export internal operational reports.",
          },
        });
      }

      let rows: Record<string, unknown>[] = [];
      let headers: { key: string; label: string }[] = [];

      // ── Tickets Export ─────────────────────────────────────────────────────
      if (entityType === "tickets") {
        let query = adminClient
          .from("tickets")
          .select("id, ticket_number, title, status, priority, category, created_at, resolved_at, customer:customer_accounts(name)")
          .eq("tenant_id", tenantId);

        if (filters.startDate) query = query.gte("created_at", filters.startDate);
        if (filters.endDate) query = query.lte("created_at", filters.endDate);
        if (filters.status) query = query.eq("status", filters.status);

        if (isCustomerUser) {
          const { data: customerLinks } = await adminClient
            .from("customer_user_links")
            .select("customer_account_id")
            .eq("tenant_id", tenantId)
            .eq("user_id", user.id);

          const ids = (customerLinks || []).map((l) => l.customer_account_id);
          query = query.in("customer_id", ids);
        }

        const { data } = await query;
        rows = (data || []).map((t: any) => ({
          ticketNumber: t.ticket_number,
          title: t.title,
          customerName: t.customer?.name || "N/A",
          status: t.status,
          priority: t.priority,
          category: t.category,
          createdAt: t.created_at,
          resolvedAt: t.resolved_at || "",
        }));

        headers = [
          { key: "ticketNumber", label: "Ticket Number" },
          { key: "title", label: "Title" },
          { key: "customerName", label: "Customer" },
          { key: "status", label: "Status" },
          { key: "priority", label: "Priority" },
          { key: "category", label: "Category" },
          { key: "createdAt", label: "Created Date" },
          { key: "resolvedAt", label: "Resolved Date" },
        ];
      }

      // ── Assets Export ──────────────────────────────────────────────────────
      else if (entityType === "assets") {
        let query = adminClient
          .from("assets")
          .select("id, plate_number, vin, serial_number, fleet_number, make, model, year, operational_status, customer:customer_accounts(name)")
          .eq("tenant_id", tenantId);

        const { data } = await query;
        rows = (data || []).map((a: any) => ({
          plateNumber: a.plate_number,
          fleetNumber: a.fleet_number || "",
          vin: a.vin || "",
          serialNumber: a.serial_number || "",
          makeModel: `${a.make || ""} ${a.model || ""}`.trim(),
          year: a.year || "",
          status: a.operational_status,
          customer: a.customer?.name || "Unassigned",
        }));

        headers = [
          { key: "plateNumber", label: "Plate Number" },
          { key: "fleetNumber", label: "Fleet Number" },
          { key: "vin", label: "VIN" },
          { key: "serialNumber", label: "Serial Number" },
          { key: "makeModel", label: "Make / Model" },
          { key: "year", label: "Year" },
          { key: "status", label: "Operational Status" },
          { key: "customer", label: "Customer Account" },
        ];
      }

      // ── Customer Accounts Export (Operations Only) ─────────────────────────
      else if (entityType === "customers") {
        const { data } = await adminClient
          .from("customer_accounts")
          .select("account_number, name, status, primary_phone, primary_email, created_at")
          .eq("tenant_id", tenantId);

        rows = (data || []).map((c: any) => ({
          accountNumber: c.account_number,
          name: c.name,
          status: c.status,
          phone: c.primary_phone || "",
          email: c.primary_email || "",
          createdAt: c.created_at,
        }));

        headers = [
          { key: "accountNumber", label: "Account Number" },
          { key: "name", label: "Customer Name" },
          { key: "status", label: "Status" },
          { key: "phone", label: "Phone" },
          { key: "email", label: "Email" },
          { key: "createdAt", label: "Registered Date" },
        ];
      }

      // ── Inventory Export (Operations Only) ─────────────────────────────────
      else if (entityType === "inventory") {
        const { data } = await adminClient
          .from("parts_catalog")
          .select("part_number, name, category, unit_of_measure, is_active, stock:stock_levels(quantity_on_hand)")
          .eq("tenant_id", tenantId);

        rows = (data || []).map((p: any) => {
          const qty = (p.stock || []).reduce((acc: number, s: any) => acc + (s.quantity_on_hand || 0), 0);
          return {
            partNumber: p.part_number,
            name: p.name,
            category: p.category,
            unitOfMeasure: p.unit_of_measure,
            stockOnHand: qty,
            isActive: p.is_active ? "Active" : "Inactive",
          };
        });

        headers = [
          { key: "partNumber", label: "Part Number" },
          { key: "name", label: "Description" },
          { key: "category", label: "Category" },
          { key: "unitOfMeasure", label: "UOM" },
          { key: "stockOnHand", label: "Stock On Hand" },
          { key: "isActive", label: "Status" },
        ];
      }

      // ── Log Export in Audit Table ──────────────────────────────────────────
      await adminClient.from("export_audit_logs").insert({
        tenant_id: tenantId,
        user_id: user.id,
        portal,
        export_type: entityType,
        format,
        row_count: rows.length,
        filters_applied: filters,
        ip_address: request.ip,
      });

      // ── Format Output ──────────────────────────────────────────────────────
      const filename = `careos-${entityType}-${Date.now()}.${format}`;

      if (format === "json") {
        void reply.header("Content-Disposition", `attachment; filename="${filename}"`);
        void reply.header("Content-Type", "application/json");
        return reply.send({
          exportType: entityType,
          exportedAt: new Date().toISOString(),
          rowCount: rows.length,
          data: rows,
        });
      }

      // Return CSV
      const csvContent = toCsv(rows, headers);
      void reply.header("Content-Disposition", `attachment; filename="${filename}"`);
      void reply.header("Content-Type", "text/csv; charset=utf-8");
      return reply.send(csvContent);
    }
  );
};
