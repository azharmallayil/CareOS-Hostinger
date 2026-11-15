import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createAdminClient } from "@careos/supabase-client";
import { requireAuth, requireTenant } from "../middleware/guards.js";

const createPlanSchema = z.object({
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(100),
  description: z.string().max(1000).optional(),
  triggerType: z.enum(["interval_months", "interval_km", "interval_engine_hours", "one_time"]),
  intervalMonths: z.number().int().min(1).optional(),
  intervalKm: z.number().int().min(1).optional(),
  intervalEngineHours: z.number().int().min(1).optional(),
  serviceCategoryCode: z.string().optional(),
  checklistTemplate: z.array(z.any()).default([]),
});

const createScheduleSchema = z.object({
  planId: z.string().uuid(),
  assetId: z.string().uuid(),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  nextDueOdometerKm: z.number().int().min(0).optional(),
});

const createRecordSchema = z.object({
  planId: z.string().uuid(),
  assetId: z.string().uuid(),
  ticketId: z.string().uuid().optional(),
  workOrderId: z.string().uuid().optional(),
  performedBy: z.string().uuid().optional(),
  odometerKm: z.number().int().min(0).optional(),
  engineHours: z.number().int().min(0).optional(),
  findings: z.string().max(2000).optional(),
  notes: z.string().max(1000).optional(),
});

export const maintenanceRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  // GET /api/v1/maintenance/plans
  fastify.get(
    "/plans",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ plans: [] });
      }

      const { data, error } = await adminClient
        .from("maintenance_plans")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true });

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ plans: data || [] });
    }
  );

  // POST /api/v1/maintenance/plans
  fastify.post(
    "/plans",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = createPlanSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const b = parsed.data;

      const { data, error } = await adminClient
        .from("maintenance_plans")
        .insert({
          tenant_id: tenantId,
          code: b.code,
          name: b.name,
          description: b.description ?? null,
          trigger_type: b.triggerType,
          interval_months: b.intervalMonths ?? null,
          interval_km: b.intervalKm ?? null,
          interval_engine_hours: b.intervalEngineHours ?? null,
          service_category_code: b.serviceCategoryCode ?? null,
          checklist_template: b.checklistTemplate,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.status(201).send({ plan: data });
    }
  );

  // GET /api/v1/maintenance/schedules
  fastify.get<{ Querystring: { assetId?: string; status?: string } }>(
    "/schedules",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ schedules: [] });
      }

      const { assetId, status } = request.query;

      let query = adminClient
        .from("maintenance_schedules")
        .select(`
          *,
          plan:maintenance_plans(*),
          asset:assets(id, make, model, year, vin, fleet_number)
        `)
        .eq("tenant_id", tenantId);

      if (assetId) {
        query = query.eq("asset_id", assetId);
      }
      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ schedules: data || [] });
    }
  );

  // POST /api/v1/maintenance/schedules
  fastify.post(
    "/schedules",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = createScheduleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const b = parsed.data;

      const { data, error } = await adminClient
        .from("maintenance_schedules")
        .insert({
          tenant_id: tenantId,
          plan_id: b.planId,
          asset_id: b.assetId,
          next_due_date: b.nextDueDate ?? null,
          next_due_odometer_km: b.nextDueOdometerKm ?? null,
          status: "upcoming",
        })
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.status(201).send({ schedule: data });
    }
  );

  // POST /api/v1/maintenance/records
  fastify.post(
    "/records",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = createRecordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const b = parsed.data;

      const { data, error } = await adminClient
        .from("maintenance_records")
        .insert({
          tenant_id: tenantId,
          plan_id: b.planId,
          asset_id: b.assetId,
          ticket_id: b.ticketId ?? null,
          work_order_id: b.workOrderId ?? null,
          performed_by: b.performedBy ?? null,
          odometer_km: b.odometerKm ?? null,
          engine_hours: b.engineHours ?? null,
          findings: b.findings ?? null,
          notes: b.notes ?? null,
        })
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      // Update schedule record if exists
      await adminClient
        .from("maintenance_schedules")
        .update({
          last_performed_at: new Date().toISOString(),
          last_odometer_km: b.odometerKm ?? null,
          status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("plan_id", b.planId)
        .eq("asset_id", b.assetId);

      return reply.status(201).send({ record: data });
    }
  );
};
