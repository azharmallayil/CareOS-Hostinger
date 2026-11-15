import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createAdminClient } from "@careos/supabase-client";
import { requireAuth, requireTenant } from "../middleware/guards.js";

const bulkItemSchema = z.object({
  assetId: z.string().uuid().optional(),
  assetIdentifier: z.string().optional(),
  customerAccountId: z.string().uuid(),
  customerSiteId: z.string().uuid().optional(),
  categoryCode: z.string().min(2),
  title: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
});

const createBulkServiceSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(1000).optional(),
  source: z.enum(["csv_upload", "api", "manual"]).default("manual"),
  defaultCategoryCode: z.string().default("periodic_maintenance"),
  defaultPriority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  items: z.array(bulkItemSchema).min(1),
});

export const bulkServiceRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  // GET /api/v1/bulk-service
  fastify.get(
    "/",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ bulkRequests: [] });
      }

      const { data, error } = await adminClient
        .from("bulk_service_requests")
        .select(`
          id,
          batch_number,
          name,
          description,
          source,
          status,
          total_items,
          created_items,
          failed_items,
          default_category_code,
          default_priority,
          created_at,
          completed_at
        `)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ bulkRequests: data || [] });
    }
  );

  // GET /api/v1/bulk-service/:id
  fastify.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const { id } = request.params;
      if (!tenantId || !adminClient) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Bulk request not found" } });
      }

      const { data: requestRecord, error: reqError } = await adminClient
        .from("bulk_service_requests")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .single();

      if (reqError || !requestRecord) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Bulk request not found" } });
      }

      const { data: items, error: itemsError } = await adminClient
        .from("bulk_service_request_items")
        .select(`
          id,
          row_number,
          asset_id,
          asset_identifier,
          category_code,
          description,
          priority,
          status,
          error_message,
          ticket_id,
          ticket:tickets(
            id,
            ticket_number,
            title,
            status,
            coverage_type
          ),
          asset:assets(
            id,
            vin,
            fleet_number,
            make,
            model
          )
        `)
        .eq("bulk_request_id", id)
        .order("row_number", { ascending: true });

      if (itemsError) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: itemsError.message } });
      }

      return reply.send({
        bulkRequest: requestRecord,
        items: items || [],
      });
    }
  );

  // POST /api/v1/bulk-service
  fastify.post(
    "/",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const userId = request.auth?.user.id;
      if (!tenantId || !userId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = createBulkServiceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const {
        name,
        description,
        source,
        defaultCategoryCode,
        defaultPriority,
        items,
      } = parsed.data;

      const { data: batchNumData } = await adminClient.rpc(
        "generate_bulk_batch_number",
        { p_tenant_id: tenantId }
      );
      const batchNumber = (batchNumData as string) || `BSR-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;

      const { data: bulkRequest, error: createError } = await adminClient
        .from("bulk_service_requests")
        .insert({
          tenant_id: tenantId,
          batch_number: batchNumber,
          name,
          description: description ?? null,
          source,
          status: "processing",
          total_items: items.length,
          created_items: 0,
          failed_items: 0,
          default_category_code: defaultCategoryCode,
          default_priority: defaultPriority,
          created_by: userId,
        })
        .select()
        .single();

      if (createError) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: createError.message } });
      }

      let createdCount = 0;
      let failedCount = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item) continue;

        let resolvedAssetId = item.assetId;

        if (!resolvedAssetId && item.assetIdentifier) {
          const { data: assetData } = await adminClient
            .from("assets")
            .select("id")
            .eq("tenant_id", tenantId)
            .or(`vin.eq.${item.assetIdentifier},fleet_number.eq.${item.assetIdentifier}`)
            .single();

          if (assetData) {
            resolvedAssetId = assetData.id;
          }
        }

        if (!resolvedAssetId) {
          failedCount++;
          await adminClient.from("bulk_service_request_items").insert({
            tenant_id: tenantId,
            bulk_request_id: bulkRequest.id,
            row_number: i + 1,
            asset_identifier: item.assetIdentifier ?? null,
            customer_account_id: item.customerAccountId,
            customer_site_id: item.customerSiteId ?? null,
            category_code: item.categoryCode || defaultCategoryCode,
            description: item.description ?? null,
            priority: item.priority || defaultPriority,
            status: "failed",
            error_message: "Asset could not be resolved in tenant asset registry",
          });
          continue;
        }

        const { data: ticketNumData } = await adminClient.rpc(
          "generate_ticket_number",
          { p_tenant_id: tenantId }
        );
        const ticketNumber = (ticketNumData as string) || `TCK-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

        const { data: ticket, error: ticketErr } = await adminClient
          .from("tickets")
          .insert({
            tenant_id: tenantId,
            ticket_number: ticketNumber,
            title: item.title || `Bulk Service: ${name} (Asset #${i + 1})`,
            description: item.description || `Created via bulk service campaign ${batchNumber}`,
            customer_account_id: item.customerAccountId,
            customer_site_id: item.customerSiteId ?? null,
            asset_id: resolvedAssetId,
            priority: item.priority || defaultPriority,
            status: "ready_for_assignment",
            coverage_type: "paid",
            created_by: userId,
          })
          .select()
          .single();

        if (ticketErr) {
          failedCount++;
          await adminClient.from("bulk_service_request_items").insert({
            tenant_id: tenantId,
            bulk_request_id: bulkRequest.id,
            row_number: i + 1,
            asset_id: resolvedAssetId,
            customer_account_id: item.customerAccountId,
            category_code: item.categoryCode || defaultCategoryCode,
            status: "failed",
            error_message: ticketErr.message,
          });
        } else {
          createdCount++;
          await adminClient.from("bulk_service_request_items").insert({
            tenant_id: tenantId,
            bulk_request_id: bulkRequest.id,
            row_number: i + 1,
            asset_id: resolvedAssetId,
            customer_account_id: item.customerAccountId,
            customer_site_id: item.customerSiteId ?? null,
            category_code: item.categoryCode || defaultCategoryCode,
            description: item.description ?? null,
            priority: item.priority || defaultPriority,
            status: "created",
            ticket_id: ticket.id,
            processed_at: new Date().toISOString(),
          });
        }
      }

      const finalStatus =
        failedCount === 0 ? "completed" : createdCount === 0 ? "failed" : "partial";

      const { data: finalizedRequest } = await adminClient
        .from("bulk_service_requests")
        .update({
          status: finalStatus,
          created_items: createdCount,
          failed_items: failedCount,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", bulkRequest.id)
        .select()
        .single();

      return reply.status(201).send({
        bulkRequest: finalizedRequest,
        createdItemsCount: createdCount,
        failedItemsCount: failedCount,
        message: `Bulk service campaign ${batchNumber} processed. Created ${createdCount} independent single-asset tickets.`,
      });
    }
  );
};
