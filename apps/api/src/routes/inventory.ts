import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createAdminClient } from "@careos/supabase-client";
import { requireAuth, requireTenant } from "../middleware/guards.js";

const createPartSchema = z.object({
  partNumber: z.string().min(2).max(50),
  name: z.string().min(2).max(100),
  description: z.string().max(1000).optional(),
  category: z.enum(["wiring", "devices", "antennas", "sensors", "mounting", "consumables", "other"]),
  unitOfMeasure: z.enum(["unit", "meter", "kit", "set"]).default("unit"),
  unitCost: z.number().min(0).default(0),
  unitPrice: z.number().min(0).default(0),
  reorderThreshold: z.number().int().min(0).default(5),
  isSerialized: z.boolean().default(false),
});

const createLocationSchema = z.object({
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(100),
  locationType: z.enum(["warehouse", "branch_stockroom", "technician_van", "quarantine"]),
  technicianId: z.string().uuid().optional(),
  address: z.string().max(255).optional(),
});

const stockMovementSchema = z.object({
  sourceLocationId: z.string().uuid().optional(),
  destinationLocationId: z.string().uuid().optional(),
  partId: z.string().uuid(),
  quantity: z.number().int().min(1),
  movementType: z.enum([
    "receive",
    "transfer",
    "technician_issue",
    "work_order_consumed",
    "adjustment_positive",
    "adjustment_negative",
    "scrap",
    "rma_quarantine",
  ]),
  referenceType: z.enum(["work_order", "ticket", "rma_case", "adjustment_audit", "initial_stock"]).optional(),
  referenceId: z.string().uuid().optional(),
  serialNumbers: z.array(z.string()).default([]),
  reason: z.string().min(3).max(500),
  authorizedBy: z.string().uuid().optional(),
});

const consumePartsSchema = z.object({
  workOrderId: z.string().uuid(),
  ticketId: z.string().uuid(),
  partId: z.string().uuid(),
  stockLocationId: z.string().uuid(),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().min(0).default(0),
  serialNumbers: z.array(z.string()).default([]),
  isBillable: z.boolean().default(true),
  warrantyCovered: z.boolean().default(false),
});

export const inventoryRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  // GET /api/v1/inventory/parts
  fastify.get(
    "/parts",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ parts: [] });
      }

      const { data, error } = await adminClient
        .from("parts_catalog")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true });

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ parts: data || [] });
    }
  );

  // POST /api/v1/inventory/parts
  fastify.post(
    "/parts",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = createPartSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const b = parsed.data;

      const { data, error } = await adminClient
        .from("parts_catalog")
        .insert({
          tenant_id: tenantId,
          part_number: b.partNumber,
          name: b.name,
          description: b.description ?? null,
          category: b.category,
          unit_of_measure: b.unitOfMeasure,
          unit_cost: b.unitCost,
          unit_price: b.unitPrice,
          reorder_threshold: b.reorderThreshold,
          is_serialized: b.isSerialized,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.status(201).send({ part: data });
    }
  );

  // GET /api/v1/inventory/locations
  fastify.get(
    "/locations",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ locations: [] });
      }

      const { data, error } = await adminClient
        .from("stock_locations")
        .select(`
          *,
          technician:technicians(id, full_name, email)
        `)
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true });

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ locations: data || [] });
    }
  );

  // POST /api/v1/inventory/locations
  fastify.post(
    "/locations",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = createLocationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const b = parsed.data;

      const { data, error } = await adminClient
        .from("stock_locations")
        .insert({
          tenant_id: tenantId,
          code: b.code,
          name: b.name,
          location_type: b.locationType,
          technician_id: b.technicianId ?? null,
          address: b.address ?? null,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.status(201).send({ location: data });
    }
  );

  // GET /api/v1/inventory/levels
  fastify.get(
    "/levels",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ levels: [] });
      }

      const { data, error } = await adminClient
        .from("stock_levels")
        .select(`
          *,
          part:parts_catalog(*),
          location:stock_locations(*)
        `)
        .eq("tenant_id", tenantId);

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ levels: data || [] });
    }
  );

  // GET /api/v1/inventory/low-stock - Low-stock alerts
  fastify.get(
    "/low-stock",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ lowStock: [] });
      }

      const { data: levels, error } = await adminClient
        .from("stock_levels")
        .select(`
          *,
          part:parts_catalog(*),
          location:stock_locations(*)
        `)
        .eq("tenant_id", tenantId);

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      const lowStockItems = (levels || []).filter((item: any) => {
        const threshold = item.part?.reorder_threshold ?? 5;
        return item.quantity_on_hand <= threshold;
      });

      return reply.send({ lowStock: lowStockItems });
    }
  );

  // POST /api/v1/inventory/movements - Audited stock movements & authorized manual adjustments
  fastify.post(
    "/movements",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const userId = request.auth?.user.id;
      if (!tenantId || !userId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = stockMovementSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const b = parsed.data;

      // Authorization check for manual adjustments
      if (
        (b.movementType === "adjustment_positive" || b.movementType === "adjustment_negative") &&
        !b.authorizedBy
      ) {
        return reply.status(400).send({
          error: {
            code: "AUTHORIZATION_REQUIRED",
            message: "Manual stock adjustments require explicit supervisor authorization (authorizedBy)",
          },
        });
      }

      // Record immutable movement
      const { data: movement, error: movErr } = await adminClient
        .from("stock_movements")
        .insert({
          tenant_id: tenantId,
          source_location_id: b.sourceLocationId ?? null,
          destination_location_id: b.destinationLocationId ?? null,
          part_id: b.partId,
          quantity: b.quantity,
          movement_type: b.movementType,
          reference_type: b.referenceType ?? null,
          reference_id: b.referenceId ?? null,
          serial_numbers: b.serialNumbers,
          reason: b.reason,
          performed_by: userId,
          authorized_by: b.authorizedBy ?? null,
        })
        .select()
        .single();

      if (movErr) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: movErr.message } });
      }

      // Adjust stock levels
      if (b.destinationLocationId) {
        const { data: existingDest } = await adminClient
          .from("stock_levels")
          .select("id, quantity_on_hand")
          .eq("stock_location_id", b.destinationLocationId)
          .eq("part_id", b.partId)
          .single();

        if (existingDest) {
          await adminClient
            .from("stock_levels")
            .update({
              quantity_on_hand: existingDest.quantity_on_hand + b.quantity,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingDest.id);
        } else {
          await adminClient.from("stock_levels").insert({
            tenant_id: tenantId,
            stock_location_id: b.destinationLocationId,
            part_id: b.partId,
            quantity_on_hand: b.quantity,
          });
        }
      }

      if (b.sourceLocationId) {
        const { data: existingSrc } = await adminClient
          .from("stock_levels")
          .select("id, quantity_on_hand")
          .eq("stock_location_id", b.sourceLocationId)
          .eq("part_id", b.partId)
          .single();

        if (existingSrc) {
          const newQty = Math.max(0, existingSrc.quantity_on_hand - b.quantity);
          await adminClient
            .from("stock_levels")
            .update({
              quantity_on_hand: newQty,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingSrc.id);
        }
      }

      return reply.status(201).send({ movement });
    }
  );

  // POST /api/v1/inventory/consume - Consumes parts on work order
  fastify.post(
    "/consume",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const userId = request.auth?.user.id;
      if (!tenantId || !userId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = consumePartsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const b = parsed.data;

      // Check available quantity
      const { data: level } = await adminClient
        .from("stock_levels")
        .select("id, quantity_on_hand")
        .eq("stock_location_id", b.stockLocationId)
        .eq("part_id", b.partId)
        .single();

      if (!level || level.quantity_on_hand < b.quantity) {
        return reply.status(400).send({
          error: {
            code: "INSUFFICIENT_STOCK",
            message: `Insufficient stock on hand at selected location (available: ${level?.quantity_on_hand ?? 0}, requested: ${b.quantity})`,
          },
        });
      }

      // Record parts usage
      const { data: usage, error: useErr } = await adminClient
        .from("work_order_parts_usage")
        .insert({
          tenant_id: tenantId,
          work_order_id: b.workOrderId,
          ticket_id: b.ticketId,
          part_id: b.partId,
          stock_location_id: b.stockLocationId,
          quantity: b.quantity,
          unit_price: b.unitPrice,
          serial_numbers: b.serialNumbers,
          is_billable: b.isBillable,
          warranty_covered: b.warrantyCovered,
          consumed_by: userId,
        })
        .select()
        .single();

      if (useErr) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: useErr.message } });
      }

      // Deduct stock level
      await adminClient
        .from("stock_levels")
        .update({
          quantity_on_hand: level.quantity_on_hand - b.quantity,
          updated_at: new Date().toISOString(),
        })
        .eq("id", level.id);

      // Record stock movement audit
      await adminClient.from("stock_movements").insert({
        tenant_id: tenantId,
        source_location_id: b.stockLocationId,
        part_id: b.partId,
        quantity: b.quantity,
        movement_type: "work_order_consumed",
        reference_type: "work_order",
        reference_id: b.workOrderId,
        serial_numbers: b.serialNumbers,
        reason: `Consumed on Work Order`,
        performed_by: userId,
      });

      return reply.status(201).send({ usage });
    }
  );
};
