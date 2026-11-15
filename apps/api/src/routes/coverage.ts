import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { createAdminClient } from "@careos/supabase-client";
import { determineCoverage } from "@careos/coverage-engine";
import { requireAuth, requireTenant } from "../middleware/guards.js";

// ============================================================================
// Schemas
// ============================================================================
const evaluateCoverageSchema = z.object({
  ticketId: z.string().uuid(),
});

const createWarrantySchema = z.object({
  assetId: z.string().uuid(),
  warrantyType: z.enum(["manufacturer", "extended", "dealer", "service_contract"]),
  provider: z.string().min(2).max(100),
  referenceNumber: z.string().max(50).optional(),
  startsAt: z.string(),
  expiresAt: z.string(),
  coversParts: z.boolean().default(true),
  coversLabour: z.boolean().default(true),
  termsDocumentUrl: z.string().url().optional(),
  notes: z.string().max(1000).optional(),
});

const createContractSchema = z.object({
  customerAccountId: z.string().uuid(),
  contractNumber: z.string().min(2).max(50),
  name: z.string().min(2).max(150),
  coversCategories: z.array(z.string()).default([]),
  includesParts: z.boolean().default(false),
  includesLabour: z.boolean().default(true),
  freeVisitsPerYear: z.number().int().min(0).max(365).optional(),
  startsAt: z.string(),
  expiresAt: z.string(),
  monthlyFee: z.number().min(0).optional(),
  currency: z.string().length(3).default("SAR"),
});

const createFreeServiceRuleSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  priority: z.number().int().default(100),
  eligibleAccountTypes: z.array(z.string()).default(["commercial", "residential", "enterprise", "government"]),
  eligibleAccountIds: z.array(z.string().uuid()).optional(),
  eligibleAssetCategories: z.array(z.string()).optional(),
  eligibleServiceCategories: z.array(z.string()).optional(),
  effectiveFrom: z.string(),
  effectiveUntil: z.string().optional(),
  maxVisitsPerAsset: z.number().int().min(1).optional(),
  visitPeriod: z.enum(["day", "month", "quarter", "year", "lifetime"]).optional(),
  coversLabour: z.boolean().default(true),
  coversParts: z.boolean().default(false),
  coversTravelCharge: z.boolean().default(false),
  requiresApproval: z.boolean().default(false),
  approverRole: z.string().optional(),
  exclusions: z.array(z.any()).default([]),
  conditions: z.array(z.any()).default([]),
});

// ============================================================================
// Coverage Routes Plugin
// ============================================================================
export const coverageRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  fastify.addHook("preHandler", requireAuth);
  fastify.addHook("preHandler", requireTenant);

  // =========================================================================
  // 1. EVALUATE SERVICE COVERAGE FOR TICKET
  // =========================================================================

  // POST /api/v1/coverage/evaluate
  fastify.post("/evaluate", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const client = adminClient ?? request.userClient!;

    const parseResult = evaluateCoverageSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid payload", details: parseResult.error.flatten() },
      });
    }

    const { ticketId } = parseResult.data;

    // 1. Fetch ticket details
    const { data: ticket, error: ticketErr } = await client
      .from("tickets")
      .select("*, customer_accounts(id, account_type), assets(id, category_id, created_at), ticket_categories(name, code)")
      .eq("tenant_id", tenantId)
      .eq("id", ticketId)
      .maybeSingle();

    if (ticketErr || !ticket) {
      return reply.status(404).send({
        error: { code: "TICKET_NOT_FOUND", message: "Ticket not found" },
      });
    }

    // 2. Fetch active warranties for asset
    let warranties: any[] = [];
    if (ticket.asset_id) {
      const { data: wList } = await client
        .from("warranties")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("asset_id", ticket.asset_id)
        .eq("status", "active");
      warranties = wList || [];
    }

    // 3. Fetch active contracts for customer account
    const { data: cList } = await client
      .from("contracts")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("customer_account_id", ticket.customer_account_id)
      .eq("status", "active");
    const contracts = cList || [];

    // 4. Fetch enabled free-service rules and versions
    const { data: rList } = await client
      .from("free_service_rules")
      .select("*, free_service_rule_versions(*)")
      .eq("tenant_id", tenantId)
      .eq("is_enabled", true)
      .order("priority", { ascending: true });

    const freeServiceRules = (rList || []).map((r) => {
      const approvedVersion = Array.isArray(r.free_service_rule_versions)
        ? r.free_service_rule_versions.find((v: any) => v.status === "approved") || r.free_service_rule_versions[0]
        : r.free_service_rule_versions;
      return {
        rule: r,
        version: approvedVersion,
      };
    }).filter((r) => Boolean(r.version));

    // 5. Evaluate coverage using pure engine
    const reportDate = new Date();
    const serviceCategoryName = ticket.ticket_categories?.name || "General Maintenance";

    const coverageResult = determineCoverage({
      reportDate,
      tenantId,
      customerAccount: {
        id: ticket.customer_account_id,
        account_type: ticket.customer_accounts?.account_type || "commercial",
      } as any,
      asset: ticket.asset_id
        ? {
            id: ticket.asset_id,
            category: ticket.assets?.category_id || "vehicle",
            installation_date: ticket.assets?.created_at,
          } as any
        : null,
      serviceCategory: serviceCategoryName,
      warranties: warranties as any,
      contracts: contracts as any,
      freeServiceRules: freeServiceRules as any,
      priorFreeServiceVisitCounts: {},
      priorComplaintCounts: [],
    });

    // 6. Update ticket coverage_type
    await client
      .from("tickets")
      .update({
        coverage_type: coverageResult.coverageType,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("id", ticketId);

    // 7. Persist free service eligibility decision if evaluated
    let decisionRecord = null;
    if (coverageResult.eligibilityDecision) {
      const { data: dRec } = await client
        .from("free_service_eligibility_decisions")
        .insert({
          tenant_id: tenantId,
          ticket_id: ticketId,
          rule_id: coverageResult.eligibilityDecision.rule_id,
          rule_version_id: coverageResult.eligibilityDecision.rule_version_id,
          is_eligible: coverageResult.eligibilityDecision.is_eligible,
          explanation: coverageResult.eligibilityDecision.explanation,
          requires_approval: coverageResult.eligibilityDecision.requires_approval,
        })
        .select()
        .single();
      decisionRecord = dRec;
    }

    return reply.send({
      data: {
        ticketId,
        coverageType: coverageResult.coverageType,
        decision: coverageResult.decision,
        ambiguous: coverageResult.ambiguous,
        eligibilityDecision: decisionRecord,
      },
    });
  });

  // =========================================================================
  // 2. WARRANTIES
  // =========================================================================

  // GET /api/v1/coverage/warranties
  fastify.get("/warranties", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const client = adminClient ?? request.userClient!;
    const query = request.query as { assetId?: string; status?: string };

    let dbQuery = client.from("warranties").select("*, assets(name, asset_tag)").eq("tenant_id", tenantId);
    if (query.assetId) dbQuery = dbQuery.eq("asset_id", query.assetId);
    if (query.status) dbQuery = dbQuery.eq("status", query.status);

    const { data, error } = await dbQuery.order("created_at", { ascending: false });
    if (error) {
      return reply.status(500).send({ error: { code: "FETCH_WARRANTIES_FAILED", message: error.message } });
    }
    return reply.send({ data: data || [] });
  });

  // POST /api/v1/coverage/warranties
  fastify.post("/warranties", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const portal = request.auth!.activeMembership?.portal || "operations";
    if (portal !== "operations" && !request.auth!.isPlatformAdmin) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Operations role required" } });
    }

    const parseResult = createWarrantySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid payload", details: parseResult.error.flatten() },
      });
    }

    const client = adminClient ?? request.userClient!;
    const p = parseResult.data;

    const { data: warranty, error } = await client
      .from("warranties")
      .insert({
        tenant_id: tenantId,
        asset_id: p.assetId,
        warranty_type: p.warrantyType,
        provider: p.provider,
        reference_number: p.referenceNumber ?? null,
        starts_at: p.startsAt,
        expires_at: p.expiresAt,
        covers_parts: p.coversParts,
        covers_labour: p.coversLabour,
        terms_document_url: p.termsDocumentUrl ?? null,
        notes: p.notes ?? null,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      return reply.status(400).send({ error: { code: "CREATE_WARRANTY_FAILED", message: error.message } });
    }

    return reply.status(201).send({ data: warranty });
  });

  // =========================================================================
  // 3. SERVICE CONTRACTS
  // =========================================================================

  // GET /api/v1/coverage/contracts
  fastify.get("/contracts", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const client = adminClient ?? request.userClient!;
    const query = request.query as { customerAccountId?: string; status?: string };

    let dbQuery = client.from("contracts").select("*, customer_accounts(name, account_number)").eq("tenant_id", tenantId);
    if (query.customerAccountId) dbQuery = dbQuery.eq("customer_account_id", query.customerAccountId);
    if (query.status) dbQuery = dbQuery.eq("status", query.status);

    const { data, error } = await dbQuery.order("created_at", { ascending: false });
    if (error) {
      return reply.status(500).send({ error: { code: "FETCH_CONTRACTS_FAILED", message: error.message } });
    }
    return reply.send({ data: data || [] });
  });

  // POST /api/v1/coverage/contracts
  fastify.post("/contracts", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const portal = request.auth!.activeMembership?.portal || "operations";
    if (portal !== "operations" && !request.auth!.isPlatformAdmin) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Operations role required" } });
    }

    const parseResult = createContractSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid payload", details: parseResult.error.flatten() },
      });
    }

    const client = adminClient ?? request.userClient!;
    const p = parseResult.data;

    const { data: contract, error } = await client
      .from("contracts")
      .insert({
        tenant_id: tenantId,
        customer_account_id: p.customerAccountId,
        contract_number: p.contractNumber,
        name: p.name,
        covers_categories: p.coversCategories,
        includes_parts: p.includesParts,
        includes_labour: p.includesLabour,
        free_visits_per_year: p.freeVisitsPerYear ?? null,
        starts_at: p.startsAt,
        expires_at: p.expiresAt,
        monthly_fee: p.monthlyFee ?? null,
        currency: p.currency,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      return reply.status(400).send({ error: { code: "CREATE_CONTRACT_FAILED", message: error.message } });
    }

    return reply.status(201).send({ data: contract });
  });

  // =========================================================================
  // 4. FREE SERVICE RULES (OQ-09 Engine)
  // =========================================================================

  // GET /api/v1/coverage/free-service-rules
  fastify.get("/free-service-rules", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const client = adminClient ?? request.userClient!;

    const { data, error } = await client
      .from("free_service_rules")
      .select("*, free_service_rule_versions(*)")
      .eq("tenant_id", tenantId)
      .order("priority", { ascending: true });

    if (error) {
      return reply.status(500).send({ error: { code: "FETCH_RULES_FAILED", message: error.message } });
    }
    return reply.send({ data: data || [] });
  });

  // POST /api/v1/coverage/free-service-rules
  fastify.post("/free-service-rules", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    if (portal !== "operations" && !request.auth!.isPlatformAdmin) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Operations role required" } });
    }

    const parseResult = createFreeServiceRuleSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid payload", details: parseResult.error.flatten() },
      });
    }

    const client = adminClient ?? request.userClient!;
    const p = parseResult.data;

    // 1. Insert master rule
    const { data: rule, error: rErr } = await client
      .from("free_service_rules")
      .insert({
        tenant_id: tenantId,
        name: p.name,
        description: p.description ?? null,
        is_enabled: true,
        priority: p.priority,
        created_by: userId,
      })
      .select()
      .single();

    if (rErr) {
      return reply.status(400).send({ error: { code: "CREATE_RULE_FAILED", message: rErr.message } });
    }

    // 2. Insert approved version 1
    const { data: version, error: vErr } = await client
      .from("free_service_rule_versions")
      .insert({
        rule_id: rule.id,
        tenant_id: tenantId,
        version_number: 1,
        eligible_account_types: p.eligibleAccountTypes,
        eligible_account_ids: p.eligibleAccountIds ?? null,
        eligible_asset_categories: p.eligibleAssetCategories ?? null,
        eligible_service_categories: p.eligibleServiceCategories ?? null,
        effective_from: p.effectiveFrom,
        effective_until: p.effectiveUntil ?? null,
        max_visits_per_asset: p.maxVisitsPerAsset ?? null,
        visit_period: p.visitPeriod ?? null,
        covers_labour: p.coversLabour,
        covers_parts: p.coversParts,
        covers_travel_charge: p.coversTravelCharge,
        requires_approval: p.requiresApproval,
        approver_role: p.approverRole ?? null,
        exclusions: p.exclusions,
        conditions: p.conditions,
        status: "approved",
        authored_by: userId,
        approved_by: userId,
        approved_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (vErr) {
      return reply.status(400).send({ error: { code: "CREATE_RULE_VERSION_FAILED", message: vErr.message } });
    }

    // Link current version
    await client
      .from("free_service_rules")
      .update({ current_version_id: version.id })
      .eq("tenant_id", tenantId)
      .eq("id", rule.id);

    return reply.status(201).send({ data: { ...rule, current_version: version } });
  });

  // POST /api/v1/coverage/free-service-decisions/:id/approve
  fastify.post("/free-service-decisions/:id/approve", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    if (portal !== "operations" && !request.auth!.isPlatformAdmin) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Operations manager role required" } });
    }

    const { id } = request.params as { id: string };
    const body = (request.body as { notes?: string }) || {};
    const client = adminClient ?? request.userClient!;

    const { data: decision, error } = await client
      .from("free_service_eligibility_decisions")
      .update({
        requires_approval: false,
        approved_by: userId,
        approved_at: new Date().toISOString(),
        approval_notes: body.notes || "Free service approved by operations manager",
      })
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .select()
      .single();

    if (error || !decision) {
      return reply.status(400).send({ error: { code: "DECISION_APPROVAL_FAILED", message: error?.message || "Not found" } });
    }

    // Update ticket coverage_type to free
    await client
      .from("tickets")
      .update({ coverage_type: "free_service", updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("id", decision.ticket_id);

    return reply.send({ data: decision });
  });
};
