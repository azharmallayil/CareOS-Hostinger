import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { createAdminClient } from "@careos/supabase-client";
import { requireAuth, requireTenant } from "../middleware/guards.js";

// ============================================================================
// Schemas
// ============================================================================
const assetCategorySchema = z.object({
  name: z.string().min(2).max(100),
  code: z.string().min(2).max(30),
  description: z.string().max(500).optional(),
  assetType: z.enum(["vehicle", "trailer", "heavy_machinery", "stationary_equipment", "marine", "other"]).default("vehicle"),
  customAttributesSchema: z.array(z.any()).default([]),
});

const assetSchema = z.object({
  customerAccountId: z.string().uuid(),
  siteId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid(),
  assetTag: z.string().min(2).max(50).optional(),
  fleetNumber: z.string().max(50).nullable().optional(),
  name: z.string().min(2).max(200),
  vin: z.string().max(50).nullable().optional(),
  plateNumber: z.string().max(30).nullable().optional(),
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  modelYear: z.number().int().min(1950).max(2100).nullable().optional(),
  color: z.string().max(50).nullable().optional(),
  engineNumber: z.string().max(100).nullable().optional(),
  fuelType: z.enum(["diesel", "gasoline", "electric", "hybrid", "cng", "other"]).nullable().optional(),
  operationalStatus: z.enum(["active", "inactive", "maintenance", "decommissioned", "impounded"]).default("active"),
  serviceStatus: z.enum(["operational", "needs_service", "service_in_progress", "critical_fault"]).default("operational"),
  odometerReading: z.number().min(0).nullable().optional(),
  engineHours: z.number().min(0).nullable().optional(),
  warrantyExpiryDate: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  customAttributes: z.record(z.any()).default({}),
});

const updateAssetSchema = assetSchema.partial();

const bulkImportAssetSchema = z.object({
  assets: z.array(assetSchema).min(1).max(500),
});

// ============================================================================
// Routes Plugin
// ============================================================================
export const assetRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  const logAudit = async (
    tenantId: string,
    userId: string,
    action: string,
    resourceType: string,
    resourceId?: string | null,
    oldData?: unknown,
    newData?: unknown
  ) => {
    if (!adminClient) return;
    try {
      await adminClient.from("audit_logs").insert({
        tenant_id: tenantId,
        user_id: userId,
        action,
        resource_type: resourceType,
        resource_id: resourceId ?? null,
        old_data: oldData ?? null,
        new_data: newData ?? null,
      });
    } catch (err) {
      fastify.log.error(err, "Failed to write audit log in asset routes");
    }
  };

  // Require auth and tenant context for all asset routes
  fastify.addHook("preHandler", requireAuth);
  fastify.addHook("preHandler", requireTenant);

  // =========================================================================
  // 1. ASSET CATEGORIES
  // =========================================================================

  // GET /api/v1/assets/categories
  fastify.get("/categories", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const client = adminClient ?? request.userClient!;

    const { data: categories, error } = await client
      .from("asset_categories")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      return reply.status(500).send({
        error: { code: "FETCH_CATEGORIES_FAILED", message: error.message },
      });
    }

    return reply.send({ data: categories });
  });

  // POST /api/v1/assets/categories
  fastify.post("/categories", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);

    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only operations staff can create asset categories" },
      });
    }

    const parseResult = assetCategorySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid category payload", details: parseResult.error.flatten() },
      });
    }

    const client = adminClient ?? request.userClient!;
    const payload = parseResult.data;

    const { data: category, error } = await client
      .from("asset_categories")
      .insert({
        tenant_id: tenantId,
        name: payload.name,
        code: payload.code.toUpperCase(),
        description: payload.description ?? null,
        asset_type: payload.assetType,
        custom_attributes_schema: payload.customAttributesSchema,
      })
      .select()
      .single();

    if (error) {
      return reply.status(400).send({
        error: {
          code: "CATEGORY_CREATION_FAILED",
          message: error.message.includes("unique")
            ? "An asset category with this name or code already exists in your organization"
            : error.message,
        },
      });
    }

    await logAudit(tenantId, userId, "asset_category.created", "asset_categories", category.id, null, category);
    return reply.status(201).send({ data: category });
  });

  // =========================================================================
  // 2. ASSETS / FLEET REGISTRY (LIST & GET)
  // =========================================================================

  // GET /api/v1/assets
  fastify.get("/", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const client = adminClient ?? request.userClient!;

    const query = request.query as {
      search?: string;
      customerAccountId?: string;
      siteId?: string;
      categoryId?: string;
      operationalStatus?: string;
      serviceStatus?: string;
      page?: string;
      limit?: string;
    };

    const page = Math.max(1, parseInt(query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || "20", 10)));
    const offset = (page - 1) * limit;

    // Security scope: if customer portal user, constrain to linked customer_accounts
    let allowedCustomerIds: string[] | null = null;
    if (!isPlatformAdmin && portal === "customer") {
      const { data: userLinks } = await client
        .from("customer_users")
        .select("customer_account_id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .eq("is_active", true);

      allowedCustomerIds = (userLinks || []).map((l: any) => l.customer_account_id);
      if (allowedCustomerIds.length === 0) {
        return reply.send({
          data: [],
          meta: { total: 0, page, limit, totalPages: 0 },
        });
      }
    }

    let dbQuery = client
      .from("assets")
      .select(
        `
        id,
        asset_tag,
        fleet_number,
        name,
        vin,
        plate_number,
        make,
        model,
        model_year,
        color,
        operational_status,
        service_status,
        odometer_reading,
        engine_hours,
        created_at,
        customer_accounts (
          id,
          name,
          account_number
        ),
        customer_sites (
          id,
          name,
          city
        ),
        asset_categories (
          id,
          name,
          code,
          asset_type
        )
      `,
        { count: "exact" }
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (allowedCustomerIds !== null) {
      dbQuery = dbQuery.in("customer_account_id", allowedCustomerIds);
    } else if (query.customerAccountId) {
      dbQuery = dbQuery.eq("customer_account_id", query.customerAccountId);
    }

    if (query.siteId) {
      dbQuery = dbQuery.eq("site_id", query.siteId);
    }

    if (query.categoryId) {
      dbQuery = dbQuery.eq("category_id", query.categoryId);
    }

    if (query.operationalStatus) {
      dbQuery = dbQuery.eq("operational_status", query.operationalStatus);
    }

    if (query.serviceStatus) {
      dbQuery = dbQuery.eq("service_status", query.serviceStatus);
    }

    if (query.search) {
      const term = `%${query.search}%`;
      dbQuery = dbQuery.or(
        `name.ilike.${term},asset_tag.ilike.${term},fleet_number.ilike.${term},vin.ilike.${term},plate_number.ilike.${term},make.ilike.${term},model.ilike.${term}`
      );
    }

    const { data: assets, error, count } = await dbQuery;

    if (error) {
      return reply.status(500).send({
        error: { code: "FETCH_ASSETS_FAILED", message: error.message },
      });
    }

    const total = count || 0;
    return reply.send({
      data: assets,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  // GET /api/v1/assets/:id
  fastify.get("/:id", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id } = request.params as { id: string };
    const client = adminClient ?? request.userClient!;

    const { data: asset, error } = await client
      .from("assets")
      .select(`
        *,
        customer_accounts (
          id,
          name,
          account_number,
          email,
          phone
        ),
        customer_sites (
          id,
          name,
          code,
          address_line1,
          city,
          latitude,
          longitude
        ),
        asset_categories (
          id,
          name,
          code,
          asset_type
        )
      `)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (error || !asset) {
      return reply.status(404).send({
        error: { code: "ASSET_NOT_FOUND", message: "Asset not found" },
      });
    }

    // Customer Portal verification: Verify user is linked to this asset's customer account
    if (!isPlatformAdmin && portal === "customer") {
      const { data: link } = await client
        .from("customer_users")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("customer_account_id", asset.customer_account_id)
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      if (!link) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "You do not have permission to view this asset" },
        });
      }
    }

    return reply.send({ data: asset });
  });

  // GET /api/v1/assets/:id/history
  fastify.get("/:id/history", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const { id } = request.params as { id: string };
    const client = adminClient ?? request.userClient!;

    const { data: history, error } = await client
      .from("asset_assignments")
      .select(`
        id,
        assignment_type,
        start_date,
        end_date,
        reason,
        notes,
        created_at,
        customer_accounts (
          id,
          name,
          account_number
        ),
        customer_sites (
          id,
          name,
          city
        ),
        profiles:assigned_by (
          id,
          full_name,
          email
        )
      `)
      .eq("tenant_id", tenantId)
      .eq("asset_id", id)
      .order("start_date", { ascending: false });

    if (error) {
      return reply.status(500).send({
        error: { code: "FETCH_HISTORY_FAILED", message: error.message },
      });
    }

    return reply.send({ data: history });
  });

  // =========================================================================
  // 3. CREATE & UPDATE ASSETS (Operations Only)
  // =========================================================================

  // POST /api/v1/assets
  fastify.post("/", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);

    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only operations staff can register assets" },
      });
    }

    const parseResult = assetSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid asset data", details: parseResult.error.flatten() },
      });
    }

    const client = adminClient ?? request.userClient!;
    const payload = parseResult.data;

    // Auto-generate human-friendly asset tag if not provided
    const assetTag =
      payload.assetTag ||
      `AST-${Date.now().toString().slice(-5)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;

    const { data: asset, error } = await client
      .from("assets")
      .insert({
        tenant_id: tenantId,
        customer_account_id: payload.customerAccountId,
        site_id: payload.siteId ?? null,
        category_id: payload.categoryId,
        asset_tag: assetTag,
        fleet_number: payload.fleetNumber ?? null,
        name: payload.name,
        vin: payload.vin ? payload.vin.toUpperCase() : null,
        plate_number: payload.plateNumber ?? null,
        make: payload.make,
        model: payload.model,
        model_year: payload.modelYear ?? null,
        color: payload.color ?? null,
        engine_number: payload.engineNumber ?? null,
        fuel_type: payload.fuelType ?? null,
        operational_status: payload.operationalStatus,
        service_status: payload.serviceStatus,
        odometer_reading: payload.odometerReading ?? null,
        engine_hours: payload.engineHours ?? null,
        warranty_expiry_date: payload.warrantyExpiryDate ?? null,
        notes: payload.notes ?? null,
        custom_attributes: payload.customAttributes,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      return reply.status(400).send({
        error: {
          code: "ASSET_CREATION_FAILED",
          message: error.message.includes("vin")
            ? "A vehicle/asset with this VIN already exists in your organization"
            : error.message.includes("asset_tag")
            ? "An asset with this asset tag already exists"
            : error.message,
        },
      });
    }

    await logAudit(tenantId, userId, "asset.created", "assets", asset.id, null, asset);
    return reply.status(201).send({ data: asset });
  });

  // PATCH /api/v1/assets/:id
  fastify.patch("/:id", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id } = request.params as { id: string };

    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only operations staff can modify assets" },
      });
    }

    const parseResult = updateAssetSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid asset updates", details: parseResult.error.flatten() },
      });
    }

    const client = adminClient ?? request.userClient!;
    const payload = parseResult.data;

    const { data: existing } = await client
      .from("assets")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (!existing) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Asset not found" },
      });
    }

    const updates: Record<string, unknown> = {};
    if (payload.customerAccountId !== undefined) updates["customer_account_id"] = payload.customerAccountId;
    if (payload.siteId !== undefined) updates["site_id"] = payload.siteId;
    if (payload.categoryId !== undefined) updates["category_id"] = payload.categoryId;
    if (payload.fleetNumber !== undefined) updates["fleet_number"] = payload.fleetNumber;
    if (payload.name !== undefined) updates["name"] = payload.name;
    if (payload.vin !== undefined) updates["vin"] = payload.vin ? payload.vin.toUpperCase() : null;
    if (payload.plateNumber !== undefined) updates["plate_number"] = payload.plateNumber;
    if (payload.make !== undefined) updates["make"] = payload.make;
    if (payload.model !== undefined) updates["model"] = payload.model;
    if (payload.modelYear !== undefined) updates["model_year"] = payload.modelYear;
    if (payload.color !== undefined) updates["color"] = payload.color;
    if (payload.engineNumber !== undefined) updates["engine_number"] = payload.engineNumber;
    if (payload.fuelType !== undefined) updates["fuel_type"] = payload.fuelType;
    if (payload.operationalStatus !== undefined) updates["operational_status"] = payload.operationalStatus;
    if (payload.serviceStatus !== undefined) updates["service_status"] = payload.serviceStatus;
    if (payload.odometerReading !== undefined) updates["odometer_reading"] = payload.odometerReading;
    if (payload.engineHours !== undefined) updates["engine_hours"] = payload.engineHours;
    if (payload.warrantyExpiryDate !== undefined) updates["warranty_expiry_date"] = payload.warrantyExpiryDate;
    if (payload.notes !== undefined) updates["notes"] = payload.notes;

    const { data: updated, error } = await client
      .from("assets")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      return reply.status(400).send({
        error: { code: "ASSET_UPDATE_FAILED", message: error.message },
      });
    }

    await logAudit(tenantId, userId, "asset.updated", "assets", id, existing, updated);
    return reply.send({ data: updated });
  });

  // POST /api/v1/assets/bulk-import
  fastify.post("/bulk-import", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);

    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only operations staff can import assets" },
      });
    }

    const parseResult = bulkImportAssetSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid import payload", details: parseResult.error.flatten() },
      });
    }

    const client = adminClient ?? request.userClient!;
    const rawAssets = parseResult.data.assets;

    const inserted: any[] = [];
    const errors: Array<{ row: number; name: string; error: string }> = [];

    for (let i = 0; i < rawAssets.length; i++) {
      const row = rawAssets[i]!;
      const tag =
        row.assetTag ||
        `AST-${Date.now().toString().slice(-5)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;

      const { data, error } = await client
        .from("assets")
        .insert({
          tenant_id: tenantId,
          customer_account_id: row.customerAccountId,
          site_id: row.siteId ?? null,
          category_id: row.categoryId,
          asset_tag: tag,
          fleet_number: row.fleetNumber ?? null,
          name: row.name,
          vin: row.vin ? row.vin.toUpperCase() : null,
          plate_number: row.plateNumber ?? null,
          make: row.make,
          model: row.model,
          model_year: row.modelYear ?? null,
          color: row.color ?? null,
          fuel_type: row.fuelType ?? null,
          operational_status: row.operationalStatus,
          service_status: row.serviceStatus,
          odometer_reading: row.odometerReading ?? null,
          created_by: userId,
        })
        .select()
        .single();

      if (error) {
        errors.push({ row: i + 1, name: row.name, error: error.message });
      } else {
        inserted.push(data);
      }
    }

    await logAudit(tenantId, userId, "asset.bulk_imported", "assets", null, null, {
      totalRequested: rawAssets.length,
      successCount: inserted.length,
      failureCount: errors.length,
    });

    return reply.status(errors.length > 0 && inserted.length === 0 ? 400 : 200).send({
      data: {
        successCount: inserted.length,
        failureCount: errors.length,
        errors,
      },
    });
  });
};
