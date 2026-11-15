import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createAdminClient } from "@careos/supabase-client";
import { requireAuth, requireTenant } from "../middleware/guards.js";

const searchSchema = z.object({
  q: z.string().min(2).max(100),
  scope: z.enum(["all", "tickets", "assets", "customers", "work_orders", "parts"]).default("all"),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const searchRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  fastify.get(
    "/",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const user = request.auth?.user;
      if (!tenantId || !user || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = searchSchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const { q, scope, limit } = parsed.data;
      const searchPattern = `%${q}%`;

      // Determine user role and portal context
      const roles = request.auth?.activeMembership?.roles || [];
      const isCustomerUser = roles.includes("customer_user");
      const isTechnician = roles.includes("technician");

      // For customer users, find their linked customer account IDs
      let linkedCustomerIds: string[] = [];
      if (isCustomerUser) {
        const { data: customerLinks } = await adminClient
          .from("customer_user_links")
          .select("customer_account_id")
          .eq("tenant_id", tenantId)
          .eq("user_id", user.id)
          .eq("is_active", true);

        linkedCustomerIds = (customerLinks || []).map((l) => l.customer_account_id);
        if (linkedCustomerIds.length === 0) {
          return reply.send({ query: q, results: {}, totalMatches: 0 });
        }
      }

      const results: {
        tickets?: unknown[];
        assets?: unknown[];
        customers?: unknown[];
        workOrders?: unknown[];
        parts?: unknown[];
      } = {};

      let totalMatches = 0;

      // ── 1. Search Tickets ──────────────────────────────────────────────────
      if (scope === "all" || scope === "tickets") {
        let ticketQuery = adminClient
          .from("tickets")
          .select("id, ticket_number, title, status, priority, category, created_at, customer_id")
          .eq("tenant_id", tenantId)
          .or(`ticket_number.ilike.${searchPattern},title.ilike.${searchPattern}`)
          .limit(limit);

        if (isCustomerUser) {
          ticketQuery = ticketQuery.in("customer_id", linkedCustomerIds);
        }

        const { data: tickets } = await ticketQuery;
        if (tickets && tickets.length > 0) {
          results.tickets = tickets;
          totalMatches += tickets.length;
        }
      }

      // ── 2. Search Assets ───────────────────────────────────────────────────
      if (scope === "all" || scope === "assets") {
        let assetQuery = adminClient
          .from("assets")
          .select("id, plate_number, vin, serial_number, fleet_number, make, model, operational_status, customer_id")
          .eq("tenant_id", tenantId)
          .or(`plate_number.ilike.${searchPattern},vin.ilike.${searchPattern},serial_number.ilike.${searchPattern},fleet_number.ilike.${searchPattern}`)
          .limit(limit);

        if (isCustomerUser) {
          assetQuery = assetQuery.in("customer_id", linkedCustomerIds);
        }

        const { data: assets } = await assetQuery;
        if (assets && assets.length > 0) {
          results.assets = assets;
          totalMatches += assets.length;
        }
      }

      // ── 3. Search Customer Accounts (Operations & Customer Self-Search) ──
      if ((scope === "all" || scope === "customers") && !isTechnician) {
        let custQuery = adminClient
          .from("customer_accounts")
          .select("id, name, account_number, status, primary_phone, primary_email")
          .eq("tenant_id", tenantId)
          .or(`name.ilike.${searchPattern},account_number.ilike.${searchPattern}`)
          .limit(limit);

        if (isCustomerUser) {
          custQuery = custQuery.in("id", linkedCustomerIds);
        }

        const { data: customers } = await custQuery;
        if (customers && customers.length > 0) {
          results.customers = customers;
          totalMatches += customers.length;
        }
      }

      // ── 4. Search Work Orders (Operations & Technicians only) ──────────────
      if ((scope === "all" || scope === "work_orders") && !isCustomerUser) {
        const { data: wos } = await adminClient
          .from("work_orders")
          .select("id, work_order_number, title, status, priority, scheduled_date")
          .eq("tenant_id", tenantId)
          .or(`work_order_number.ilike.${searchPattern},title.ilike.${searchPattern}`)
          .limit(limit);

        if (wos && wos.length > 0) {
          results.workOrders = wos;
          totalMatches += wos.length;
        }
      }

      // ── 5. Search Parts Catalog (Operations & Technicians only) ────────────
      if ((scope === "all" || scope === "parts") && !isCustomerUser) {
        const { data: parts } = await adminClient
          .from("parts_catalog")
          .select("id, part_number, name, category, unit_of_measure, is_active")
          .eq("tenant_id", tenantId)
          .or(`part_number.ilike.${searchPattern},name.ilike.${searchPattern}`)
          .limit(limit);

        if (parts && parts.length > 0) {
          results.parts = parts;
          totalMatches += parts.length;
        }
      }

      return reply.send({
        query: q,
        scope,
        results,
        totalMatches,
      });
    }
  );
};
