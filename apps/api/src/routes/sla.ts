import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createAdminClient } from "@careos/supabase-client";
import { requireAuth, requireTenant } from "../middleware/guards.js";
import {
  calculateSlaTargetDate,
  pauseSlaClock,
  resumeSlaClock,
  evaluateSlaStatus,
  SlaPolicyConfig,
} from "../services/sla-engine.js";

const createPolicySchema = z.object({
  name: z.string().min(2).max(100),
  tier: z.enum(["standard", "gold", "platinum"]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  serviceCategoryCode: z.string().optional(),
  targetResponseHours: z.number().int().min(1).max(720).default(4),
  targetResolutionHours: z.number().int().min(1).max(720).default(24),
  businessHoursOnly: z.boolean().default(true),
  businessStartTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).default("08:00:00"),
  businessEndTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).default("18:00:00"),
  workingDays: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4]),
});

const pauseClockSchema = z.object({
  reason: z.string().min(3).max(500),
});

const createEntitlementSchema = z.object({
  contractId: z.string().uuid(),
  serviceCategoryCode: z.string().optional(),
  maxFreeVisits: z.number().int().min(0).optional(),
  labourDiscountPercentage: z.number().min(0).max(100).default(0),
  partsDiscountPercentage: z.number().min(0).max(100).default(0),
  slaTier: z.enum(["standard", "gold", "platinum"]).default("standard"),
  customResponseHours: z.number().int().min(1).optional(),
  customResolutionHours: z.number().int().min(1).optional(),
});

export const slaRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  // GET /api/v1/sla/policies
  fastify.get(
    "/policies",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ policies: [] });
      }

      const { data, error } = await adminClient
        .from("sla_policies")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("tier", { ascending: true });

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ policies: data || [] });
    }
  );

  // POST /api/v1/sla/policies
  fastify.post(
    "/policies",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = createPolicySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const b = parsed.data;

      const { data, error } = await adminClient
        .from("sla_policies")
        .insert({
          tenant_id: tenantId,
          name: b.name,
          tier: b.tier,
          priority: b.priority,
          service_category_code: b.serviceCategoryCode ?? null,
          target_response_hours: b.targetResponseHours,
          target_resolution_hours: b.targetResolutionHours,
          business_hours_only: b.businessHoursOnly,
          business_start_time: b.businessStartTime,
          business_end_time: b.businessEndTime,
          working_days: b.workingDays,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.status(201).send({ policy: data });
    }
  );

  // GET /api/v1/sla/tickets/:ticketId
  fastify.get<{ Params: { ticketId: string } }>(
    "/tickets/:ticketId",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const { ticketId } = request.params;
      if (!tenantId || !adminClient) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Ticket SLA not found" } });
      }

      const { data: instance, error } = await adminClient
        .from("sla_instances")
        .select(`
          *,
          policy:sla_policies(*),
          ticket:tickets(id, ticket_number, title, created_at, status)
        `)
        .eq("tenant_id", tenantId)
        .eq("ticket_id", ticketId)
        .single();

      if (error || !instance) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "SLA instance not found for ticket" } });
      }

      const ticketCreatedAt = new Date(instance.ticket.created_at);
      const evalStatus = evaluateSlaStatus(
        {
          id: instance.id,
          ticketId: instance.ticket_id,
          responseTargetAt: instance.response_target_at,
          responseActualAt: instance.response_actual_at,
          responseBreached: instance.response_breached,
          resolutionTargetAt: instance.resolution_target_at,
          resolutionActualAt: instance.resolution_actual_at,
          resolutionBreached: instance.resolution_breached,
          isPaused: instance.is_paused,
          lastPausedAt: instance.last_paused_at,
          totalPausedMinutes: instance.total_paused_minutes,
          pauseReason: instance.pause_reason,
        },
        ticketCreatedAt
      );

      return reply.send({
        instance,
        evaluation: evalStatus,
      });
    }
  );

  // POST /api/v1/sla/tickets/:ticketId/pause - Pause SLA clock
  fastify.post<{ Params: { ticketId: string } }>(
    "/tickets/:ticketId/pause",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const { ticketId } = request.params;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = pauseClockSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const { reason } = parsed.data;

      const { data: current } = await adminClient
        .from("sla_instances")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("ticket_id", ticketId)
        .single();

      if (!current) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "SLA instance not found" } });
      }

      const pausedData = pauseSlaClock(
        {
          id: current.id,
          ticketId: current.ticket_id,
          responseTargetAt: current.response_target_at,
          responseActualAt: current.response_actual_at,
          responseBreached: current.response_breached,
          resolutionTargetAt: current.resolution_target_at,
          resolutionActualAt: current.resolution_actual_at,
          resolutionBreached: current.resolution_breached,
          isPaused: current.is_paused,
          lastPausedAt: current.last_paused_at,
          totalPausedMinutes: current.total_paused_minutes,
          pauseReason: current.pause_reason,
        },
        reason
      );

      const { data: updated, error } = await adminClient
        .from("sla_instances")
        .update({
          is_paused: true,
          last_paused_at: pausedData.lastPausedAt,
          pause_reason: pausedData.pauseReason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", current.id)
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ instance: updated, message: "SLA clock paused" });
    }
  );

  // POST /api/v1/sla/tickets/:ticketId/resume - Resume SLA clock and adjust target
  fastify.post<{ Params: { ticketId: string } }>(
    "/tickets/:ticketId/resume",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const { ticketId } = request.params;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const { data: current } = await adminClient
        .from("sla_instances")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("ticket_id", ticketId)
        .single();

      if (!current) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "SLA instance not found" } });
      }

      const resumedData = resumeSlaClock({
        id: current.id,
        ticketId: current.ticket_id,
        responseTargetAt: current.response_target_at,
        responseActualAt: current.response_actual_at,
        responseBreached: current.response_breached,
        resolutionTargetAt: current.resolution_target_at,
        resolutionActualAt: current.resolution_actual_at,
        resolutionBreached: current.resolution_breached,
        isPaused: current.is_paused,
        lastPausedAt: current.last_paused_at,
        totalPausedMinutes: current.total_paused_minutes,
        pauseReason: current.pause_reason,
      });

      const { data: updated, error } = await adminClient
        .from("sla_instances")
        .update({
          is_paused: false,
          last_paused_at: null,
          pause_reason: null,
          total_paused_minutes: resumedData.totalPausedMinutes,
          resolution_target_at: resumedData.resolutionTargetAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", current.id)
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({
        instance: updated,
        message: `SLA clock resumed. Resolution target extended by ${resumedData.totalPausedMinutes - current.total_paused_minutes} minutes.`,
      });
    }
  );

  // POST /api/v1/sla/entitlements - Create contract entitlement
  fastify.post(
    "/entitlements",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = createEntitlementSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const b = parsed.data;

      const { data, error } = await adminClient
        .from("contract_entitlements")
        .insert({
          tenant_id: tenantId,
          contract_id: b.contractId,
          service_category_code: b.serviceCategoryCode ?? null,
          max_free_visits: b.maxFreeVisits ?? null,
          labour_discount_percentage: b.labourDiscountPercentage,
          parts_discount_percentage: b.partsDiscountPercentage,
          sla_tier: b.slaTier,
          custom_response_hours: b.customResponseHours ?? null,
          custom_resolution_hours: b.customResolutionHours ?? null,
        })
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.status(201).send({ entitlement: data });
    }
  );
};
