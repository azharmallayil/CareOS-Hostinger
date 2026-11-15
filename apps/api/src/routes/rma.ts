import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createAdminClient } from "@careos/supabase-client";
import { requireAuth, requireTenant } from "../middleware/guards.js";

const createRmaCaseSchema = z.object({
  ticketId: z.string().uuid().optional(),
  workOrderId: z.string().uuid().optional(),
  assetId: z.string().uuid(),
  customerAccountId: z.string().uuid(),
  warrantyId: z.string().uuid().optional(),
  reasonForReturn: z.string().min(5).max(1000),
  oemName: z.string().max(100).optional(),
  oemReferenceNumber: z.string().max(100).optional(),
});

const addRmaItemSchema = z.object({
  itemType: z.string().min(2).max(100),
  partNumber: z.string().min(2).max(100),
  serialNumber: z.string().min(2).max(100),
  faultDescription: z.string().min(5).max(1000),
});

const updateRmaStatusSchema = z.object({
  status: z.enum([
    "draft",
    "authorized",
    "item_received",
    "inspected",
    "shipped_to_oem",
    "repaired",
    "replaced",
    "rejected",
    "closed",
  ]),
  resolutionSummary: z.string().max(2000).optional(),
});

export const rmaRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  // GET /api/v1/rma
  fastify.get(
    "/",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ rmaCases: [] });
      }

      const { data, error } = await adminClient
        .from("rma_cases")
        .select(`
          id,
          case_number,
          ticket_id,
          work_order_id,
          asset_id,
          customer_account_id,
          status,
          reason_for_return,
          oem_name,
          oem_reference_number,
          authorized_at,
          created_at,
          customer:customer_accounts(id, name, account_number),
          asset:assets(id, make, model, year, vin, fleet_number),
          ticket:tickets(id, ticket_number, title),
          items:rma_items(id, item_type, serial_number, part_number, inspection_result, action_taken)
        `)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ rmaCases: data || [] });
    }
  );

  // GET /api/v1/rma/:id
  fastify.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const { id } = request.params;
      if (!tenantId || !adminClient) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "RMA case not found" } });
      }

      const { data: rmaCase, error } = await adminClient
        .from("rma_cases")
        .select(`
          *,
          customer:customer_accounts(*),
          asset:assets(*),
          ticket:tickets(*),
          warranty:warranties(*),
          items:rma_items(*)
        `)
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .single();

      if (error || !rmaCase) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "RMA case not found" } });
      }

      return reply.send({ rmaCase });
    }
  );

  // POST /api/v1/rma
  fastify.post(
    "/",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const userId = request.auth?.user.id;
      if (!tenantId || !userId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = createRmaCaseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const b = parsed.data;

      const { data: caseNumData } = await adminClient.rpc("generate_rma_case_number", {
        p_tenant_id: tenantId,
      });
      const caseNumber = (caseNumData as string) || `RMA-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;

      const { data, error } = await adminClient
        .from("rma_cases")
        .insert({
          tenant_id: tenantId,
          case_number: caseNumber,
          ticket_id: b.ticketId ?? null,
          work_order_id: b.workOrderId ?? null,
          asset_id: b.assetId,
          customer_account_id: b.customerAccountId,
          warranty_id: b.warrantyId ?? null,
          status: "authorized",
          reason_for_return: b.reasonForReturn,
          oem_name: b.oemName ?? null,
          oem_reference_number: b.oemReferenceNumber ?? null,
          authorized_by: userId,
          authorized_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      if (b.ticketId) {
        await adminClient.from("ticket_events").insert({
          tenant_id: tenantId,
          ticket_id: b.ticketId,
          actor_id: userId,
          actor_role: "operations",
          event_type: "rma_case_opened",
          is_internal: false,
          body: `RMA Case ${caseNumber} authorized for defective equipment. Reason: ${b.reasonForReturn}`,
        });
      }

      return reply.status(201).send({ rmaCase: data });
    }
  );

  // POST /api/v1/rma/:id/items
  fastify.post<{ Params: { id: string } }>(
    "/:id/items",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const { id } = request.params;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = addRmaItemSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const b = parsed.data;

      const { data, error } = await adminClient
        .from("rma_items")
        .insert({
          tenant_id: tenantId,
          rma_case_id: id,
          item_type: b.itemType,
          part_number: b.partNumber,
          serial_number: b.serialNumber,
          fault_description: b.faultDescription,
        })
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.status(201).send({ item: data });
    }
  );

  // PATCH /api/v1/rma/:id/status
  fastify.post<{ Params: { id: string } }>(
    "/:id/status",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const { id } = request.params;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = updateRmaStatusSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const { status, resolutionSummary } = parsed.data;

      const { data, error } = await adminClient
        .from("rma_cases")
        .update({
          status,
          resolution_summary: resolutionSummary ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ rmaCase: data });
    }
  );
};
