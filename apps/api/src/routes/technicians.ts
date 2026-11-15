import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createAdminClient } from "@careos/supabase-client";
import { requireAuth, requireTenant } from "../middleware/guards.js";

const createTechnicianSchema = z.object({
  userId: z.string().uuid(),
  employeeId: z.string().optional(),
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  homeZonePostcode: z.string().optional(),
  homeZoneName: z.string().optional(),
  homeLatitude: z.number().min(-90).max(90).optional(),
  homeLongitude: z.number().min(-180).max(180).optional(),
  maxActiveWorkOrders: z.number().int().min(1).max(20).default(4),
  skillCodes: z
    .array(
      z.object({
        code: z.string().min(2),
        name: z.string().min(2),
        proficiency: z.enum(["apprentice", "standard", "senior", "master"]).default("standard"),
      })
    )
    .optional(),
});

const locationPingSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(10000).optional(),
});

export const technicianRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  // GET /api/v1/technicians
  fastify.get(
    "/",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ technicians: [] });
      }

      const { data, error } = await adminClient
        .from("technicians")
        .select(`
          id,
          employee_id,
          full_name,
          email,
          phone,
          status,
          home_zone_name,
          home_zone_postcode,
          max_active_work_orders,
          avg_rating,
          location_sharing_enabled,
          last_location_lat,
          last_location_lng,
          last_location_updated_at,
          created_at,
          skills:technician_skills(skill_code, skill_name, proficiency_level, certified),
          territories:technician_territories(
            territory:service_territories(id, code, name, city)
          )
        `)
        .eq("tenant_id", tenantId)
        .order("full_name", { ascending: true });

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ technicians: data || [] });
    }
  );

  // GET /api/v1/technicians/me (Mobile bootstrap & profile endpoint)
  fastify.get(
    "/me",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const userId = request.auth?.user.id;
      if (!tenantId || !userId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const { data: tech, error } = await adminClient
        .from("technicians")
        .select(`
          *,
          skills:technician_skills(*),
          territories:technician_territories(*, territory:service_territories(*)),
          working_hours:technician_working_hours(*),
          availability:technician_availability(*)
        `)
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .single();

      if (error || !tech) {
        return reply.status(404).send({
          error: { code: "TECHNICIAN_PROFILE_NOT_FOUND", message: "Technician profile not found for user" },
        });
      }

      // Count active work orders assigned to this technician
      const { count } = await adminClient
        .from("work_orders")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("technician_id", tech.id)
        .in("status", ["assigned", "accepted", "in_progress", "on_site"]);

      return reply.send({
        technician: tech,
        activeWorkOrdersCount: count ?? 0,
      });
    }
  );

  // GET /api/v1/technicians/:id
  fastify.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const { id } = request.params;
      if (!tenantId || !adminClient) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Technician not found" } });
      }

      const { data: tech, error } = await adminClient
        .from("technicians")
        .select(`
          *,
          skills:technician_skills(*),
          territories:technician_territories(*, territory:service_territories(*)),
          working_hours:technician_working_hours(*),
          availability:technician_availability(*)
        `)
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .single();

      if (error || !tech) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Technician not found" } });
      }

      return reply.send({ technician: tech });
    }
  );

  // POST /api/v1/technicians
  fastify.post(
    "/",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.status(400).send({ error: { code: "TENANT_REQUIRED", message: "Missing tenant context" } });
      }

      const parsed = createTechnicianSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const b = parsed.data;

      const { data: tech, error: techError } = await adminClient
        .from("technicians")
        .insert({
          tenant_id: tenantId,
          user_id: b.userId,
          employee_id: b.employeeId ?? null,
          full_name: b.fullName,
          email: b.email,
          phone: b.phone ?? null,
          home_zone_postcode: b.homeZonePostcode ?? null,
          home_zone_name: b.homeZoneName ?? null,
          home_latitude: b.homeLatitude ?? null,
          home_longitude: b.homeLongitude ?? null,
          max_active_work_orders: b.maxActiveWorkOrders,
          status: "active",
        })
        .select()
        .single();

      if (techError) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: techError.message } });
      }

      if (b.skillCodes && b.skillCodes.length > 0) {
        const skillsToInsert = b.skillCodes.map((s) => ({
          tenant_id: tenantId,
          technician_id: tech.id,
          skill_code: s.code,
          skill_name: s.name,
          proficiency_level: s.proficiency,
          certified: true,
        }));
        await adminClient.from("technician_skills").insert(skillsToInsert);
      }

      const defaultHours = [1, 2, 3, 4, 5].map((day) => ({
        tenant_id: tenantId,
        technician_id: tech.id,
        day_of_week: day,
        start_time: "08:00:00",
        end_time: "17:00:00",
        is_working_day: true,
      }));
      await adminClient.from("technician_working_hours").insert(defaultHours);

      return reply.status(201).send({ technician: tech });
    }
  );

  // POST /api/v1/technicians/location-ping
  fastify.post(
    "/location-ping",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const userId = request.auth?.user.id;
      if (!tenantId || !userId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = locationPingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const { latitude, longitude, accuracyMeters } = parsed.data;

      const { data: tech } = await adminClient
        .from("technicians")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .single();

      if (!tech) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Technician profile not found" } });
      }

      await adminClient
        .from("technicians")
        .update({
          last_location_lat: latitude,
          last_location_lng: longitude,
          last_location_updated_at: new Date().toISOString(),
          location_sharing_enabled: true,
        })
        .eq("id", tech.id);

      await adminClient.from("technician_location_pings").insert({
        tenant_id: tenantId,
        technician_id: tech.id,
        latitude,
        longitude,
        accuracy_meters: accuracyMeters ?? null,
      });

      return reply.send({
        success: true,
        message: "Location updated. Active only while technician portal tab remains open.",
      });
    }
  );
};
