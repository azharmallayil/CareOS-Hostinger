import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createAdminClient } from "@careos/supabase-client";
import { requireAuth, requireTenant } from "../middleware/guards.js";
import {
  validateEvidenceFile,
  generateSignedStorageToken,
  ALLOWED_EVIDENCE_MIME_TYPES,
} from "../services/evidence-storage.js";

const uploadUrlSchema = z.object({
  workOrderId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  fileSizeBytes: z.number().int().min(1),
  stageName: z.enum(["arrival_checkin", "diagnosis", "execution", "checkout"]),
  evidenceType: z.enum(["photo", "video", "document", "signature", "odometer_reading"]),
});

const createEvidenceSchema = z.object({
  ticketId: z.string().uuid(),
  workOrderId: z.string().uuid(),
  requirementId: z.string().uuid().optional(),
  stageName: z.enum(["arrival_checkin", "diagnosis", "execution", "checkout"]),
  evidenceType: z.enum(["photo", "video", "document", "signature", "odometer_reading"]),
  fileName: z.string().min(1).max(255),
  storagePath: z.string().min(5),
  mimeType: z.string().min(1),
  fileSizeBytes: z.number().int().min(1),
  locationLat: z.number().min(-90).max(90).optional(),
  locationLng: z.number().min(-180).max(180).optional(),
  locationConsented: z.boolean().default(false),
  metadata: z.record(z.any()).default({}),
});

const reviewEvidenceSchema = z.object({
  status: z.enum(["verified", "rejected"]),
  reviewNotes: z.string().max(1000).optional(),
});

export const evidenceRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  // GET /api/v1/evidence/requirements
  fastify.get<{
    Querystring: {
      categoryCode?: string;
      stageName?: string;
    };
  }>(
    "/requirements",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      if (!tenantId || !adminClient) {
        return reply.send({ requirements: [] });
      }

      const { categoryCode, stageName } = request.query;

      let query = adminClient
        .from("service_evidence_requirements")
        .select("*")
        .eq("tenant_id", tenantId);

      if (categoryCode) {
        query = query.eq("service_category_code", categoryCode);
      }
      if (stageName) {
        query = query.eq("stage_name", stageName);
      }

      const { data, error } = await query;
      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ requirements: data || [] });
    }
  );

  // POST /api/v1/evidence/upload-url
  fastify.post(
    "/upload-url",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const userId = request.auth?.user.id;
      if (!tenantId || !userId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = uploadUrlSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const { workOrderId, fileName, mimeType, fileSizeBytes } = parsed.data;

      const validation = validateEvidenceFile(mimeType, fileSizeBytes);
      if (!validation.isValid) {
        return reply.status(400).send({ error: { code: "INVALID_FILE", message: validation.error } });
      }

      const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `tenants/${tenantId}/work-orders/${workOrderId}/${Date.now()}-${cleanFileName}`;

      const { token, expiresAt, signedUrl } = generateSignedStorageToken(storagePath, tenantId);

      return reply.send({
        storagePath,
        uploadToken: token,
        expiresAt,
        signedUploadUrl: signedUrl,
      });
    }
  );

  // POST /api/v1/evidence
  fastify.post(
    "/",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const userId = request.auth?.user.id;
      if (!tenantId || !userId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = createEvidenceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const b = parsed.data;

      const validation = validateEvidenceFile(b.mimeType, b.fileSizeBytes);
      if (!validation.isValid) {
        return reply.status(400).send({ error: { code: "INVALID_FILE", message: validation.error } });
      }

      const { data: evidence, error } = await adminClient
        .from("service_evidence")
        .insert({
          tenant_id: tenantId,
          ticket_id: b.ticketId,
          work_order_id: b.workOrderId,
          requirement_id: b.requirementId ?? null,
          stage_name: b.stageName,
          evidence_type: b.evidenceType,
          file_name: b.fileName,
          storage_path: b.storagePath,
          mime_type: b.mimeType,
          file_size_bytes: b.fileSizeBytes,
          uploaded_by: userId,
          location_lat: b.locationConsented ? b.locationLat ?? null : null,
          location_lng: b.locationConsented ? b.locationLng ?? null : null,
          location_consented: b.locationConsented,
          metadata: b.metadata,
          review_status: "pending_review",
          is_finalized: false,
        })
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.status(201).send({ evidence });
    }
  );

  // GET /api/v1/evidence/:id/download-url
  fastify.get<{ Params: { id: string } }>(
    "/:id/download-url",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const { id } = request.params;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const { data: ev, error } = await adminClient
        .from("service_evidence")
        .select("id, tenant_id, storage_path, file_name, mime_type")
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .single();

      if (error || !ev) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Evidence record not found" } });
      }

      const { expiresAt, signedUrl } = generateSignedStorageToken(ev.storage_path, tenantId);

      return reply.send({
        downloadUrl: signedUrl,
        expiresAt,
        fileName: ev.file_name,
        mimeType: ev.mime_type,
      });
    }
  );

  // POST /api/v1/evidence/:id/review
  fastify.post<{ Params: { id: string } }>(
    "/:id/review",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const userId = request.auth?.user.id;
      const { id } = request.params;

      if (!tenantId || !userId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const parsed = reviewEvidenceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.format() } });
      }

      const { status, reviewNotes } = parsed.data;

      const { data: updated, error } = await adminClient
        .from("service_evidence")
        .update({
          review_status: status,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({ evidence: updated });
    }
  );

  // POST /api/v1/evidence/:id/finalize
  fastify.post<{ Params: { id: string } }>(
    "/:id/finalize",
    { preHandler: [requireAuth, requireTenant] },
    async (request, reply) => {
      const tenantId = request.auth?.activeTenantId;
      const { id } = request.params;
      if (!tenantId || !adminClient) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }

      const { data: updated, error } = await adminClient
        .from("service_evidence")
        .update({
          is_finalized: true,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: { code: "DB_ERROR", message: error.message } });
      }

      return reply.send({
        evidence: updated,
        message: "Evidence finalized and locked against tampering",
      });
    }
  );
};
