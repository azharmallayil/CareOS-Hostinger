import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { createAdminClient } from "@careos/supabase-client";
import { requireAuth, requireTenant } from "../middleware/guards.js";

// ============================================================================
// Schemas
// ============================================================================
const customerAccountSchema = z.object({
  name: z.string().min(2).max(200),
  accountNumber: z.string().min(2).max(50).optional(),
  accountType: z.enum(["commercial", "residential", "enterprise", "government"]).default("commercial"),
  status: z.enum(["active", "suspended", "archived", "lead"]).default("active"),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  taxId: z.string().max(50).nullable().optional(),
  website: z.string().url().nullable().optional(),
  currency: z.string().length(3).default("SAR"),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  billingAddress: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
      country: z.string().default("Saudi Arabia"),
    })
    .default({ country: "Saudi Arabia" }),
  notes: z.string().max(2000).nullable().optional(),
});

const updateCustomerAccountSchema = customerAccountSchema.partial();

const customerSiteSchema = z.object({
  name: z.string().min(2).max(150),
  code: z.string().max(30).nullable().optional(),
  isPrimary: z.boolean().default(false),
  status: z.enum(["active", "inactive", "under_maintenance", "decommissioned"]).default("active"),
  addressLine1: z.string().min(3).max(255),
  addressLine2: z.string().max(255).nullable().optional(),
  city: z.string().min(2).max(100),
  state: z.string().max(100).nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  country: z.string().default("Saudi Arabia"),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  geofenceRadiusMeters: z.number().int().min(10).max(5000).default(150),
  accessInstructions: z.string().max(2000).nullable().optional(),
  contactName: z.string().max(150).nullable().optional(),
  contactPhone: z.string().max(50).nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
});

const updateCustomerSiteSchema = customerSiteSchema.partial();

const customerContactSchema = z.object({
  fullName: z.string().min(2).max(150),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  mobile: z.string().max(50).nullable().optional(),
  jobTitle: z.string().max(100).nullable().optional(),
  department: z.string().max(100).nullable().optional(),
  siteId: z.string().uuid().nullable().optional(),
  isPrimary: z.boolean().default(false),
  isBillingContact: z.boolean().default(false),
  isServiceContact: z.boolean().default(false),
  notes: z.string().max(1000).nullable().optional(),
});

const updateCustomerContactSchema = customerContactSchema.partial();

const linkCustomerUserSchema = z.object({
  userId: z.string().uuid(),
  portalRole: z.enum(["customer_admin", "customer_user", "customer_viewer"]).default("customer_user"),
  contactId: z.string().uuid().nullable().optional(),
});

// ============================================================================
// Routes Plugin
// ============================================================================
export const customerRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  // Helper for audit logging
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
      fastify.log.error(err, "Failed to write audit log in customer routes");
    }
  };

  // Helper to check if caller can access this specific customer account
  const verifyCustomerAccountAccess = async (
    tenantId: string,
    userId: string,
    customerAccountId: string,
    portal: string,
    isPlatformAdmin: boolean
  ): Promise<boolean> => {
    if (isPlatformAdmin) return true;
    if (portal === "operations" || portal === "technician") return true;

    // For customer portal users, check explicit customer_users link
    if (!adminClient) return false;
    const { data: link } = await adminClient
      .from("customer_users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("customer_account_id", customerAccountId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    return Boolean(link);
  };

  // Require auth and tenant context for all customer routes
  fastify.addHook("preHandler", requireAuth);
  fastify.addHook("preHandler", requireTenant);

  // =========================================================================
  // 1. CUSTOMER ACCOUNTS (LIST & GET)
  // =========================================================================

  // GET /api/v1/customers
  fastify.get("/", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const client = adminClient ?? request.userClient!;

    const query = request.query as {
      search?: string;
      status?: string;
      type?: string;
      page?: string;
      limit?: string;
    };

    const page = Math.max(1, parseInt(query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || "20", 10)));
    const offset = (page - 1) * limit;

    // Security scope: if customer portal user, constrain to linked customer_accounts
    let allowedAccountIds: string[] | null = null;
    if (!isPlatformAdmin && portal === "customer") {
      const { data: userLinks } = await client
        .from("customer_users")
        .select("customer_account_id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .eq("is_active", true);

      allowedAccountIds = (userLinks || []).map((l: any) => l.customer_account_id);
      if (allowedAccountIds.length === 0) {
        return reply.send({
          data: [],
          meta: { total: 0, page, limit, totalPages: 0 },
        });
      }
    }

    let dbQuery = client
      .from("customer_accounts")
      .select(
        `
        id,
        account_number,
        name,
        account_type,
        status,
        email,
        phone,
        tax_id,
        website,
        currency,
        payment_terms_days,
        billing_address,
        created_at,
        updated_at,
        customer_sites (count),
        customer_contacts (count)
      `,
        { count: "exact" }
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (allowedAccountIds !== null) {
      dbQuery = dbQuery.in("id", allowedAccountIds);
    }

    if (query.status) {
      dbQuery = dbQuery.eq("status", query.status);
    }

    if (query.type) {
      dbQuery = dbQuery.eq("account_type", query.type);
    }

    if (query.search) {
      const term = `%${query.search}%`;
      dbQuery = dbQuery.or(`name.ilike.${term},account_number.ilike.${term},email.ilike.${term}`);
    }

    const { data: accounts, error, count } = await dbQuery;

    if (error) {
      return reply.status(500).send({
        error: { code: "FETCH_CUSTOMERS_FAILED", message: error.message },
      });
    }

    const total = count || 0;
    return reply.send({
      data: accounts,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  // GET /api/v1/customers/:id
  fastify.get("/:id", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id } = request.params as { id: string };

    const allowed = await verifyCustomerAccountAccess(
      tenantId,
      userId,
      id,
      portal,
      isPlatformAdmin
    );

    if (!allowed) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "You do not have access to this customer account" },
      });
    }

    const client = adminClient ?? request.userClient!;
    const { data: account, error } = await client
      .from("customer_accounts")
      .select(`
        *,
        customer_sites (
          id,
          name,
          code,
          is_primary,
          status,
          city,
          address_line1
        ),
        customer_contacts (
          id,
          full_name,
          email,
          phone,
          job_title,
          is_primary,
          is_billing_contact,
          is_service_contact
        )
      `)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (error || !account) {
      return reply.status(404).send({
        error: { code: "CUSTOMER_NOT_FOUND", message: "Customer account not found" },
      });
    }

    return reply.send({ data: account });
  });

  // =========================================================================
  // 2. CREATE & UPDATE CUSTOMER ACCOUNTS (Operations Only)
  // =========================================================================

  // POST /api/v1/customers
  fastify.post("/", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);

    // Only operations staff or platform admins can create customer accounts
    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Customer creation is restricted to operations staff" },
      });
    }

    const parseResult = customerAccountSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid customer account data",
          details: parseResult.error.flatten(),
        },
      });
    }

    const client = adminClient ?? request.userClient!;
    const payload = parseResult.data;

    // Auto-generate account number if not provided
    const accountNumber =
      payload.accountNumber ||
      `CUST-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;

    const { data: account, error } = await client
      .from("customer_accounts")
      .insert({
        tenant_id: tenantId,
        account_number: accountNumber,
        name: payload.name,
        account_type: payload.accountType,
        status: payload.status,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        tax_id: payload.taxId ?? null,
        website: payload.website ?? null,
        currency: payload.currency,
        payment_terms_days: payload.paymentTermsDays,
        billing_address: payload.billingAddress,
        notes: payload.notes ?? null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      return reply.status(400).send({
        error: {
          code: "CUSTOMER_CREATION_FAILED",
          message: error.message.includes("unique")
            ? "A customer account with this name or number already exists in your organization"
            : error.message,
        },
      });
    }

    await logAudit(
      tenantId,
      userId,
      "customer_account.created",
      "customer_accounts",
      account.id,
      null,
      account
    );

    return reply.status(201).send({ data: account });
  });

  // PATCH /api/v1/customers/:id
  fastify.patch("/:id", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id } = request.params as { id: string };

    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only operations staff can modify customer accounts" },
      });
    }

    const parseResult = updateCustomerAccountSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid updates", details: parseResult.error.flatten() },
      });
    }

    const client = adminClient ?? request.userClient!;
    const payload = parseResult.data;

    // Fetch existing for audit
    const { data: existing } = await client
      .from("customer_accounts")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (!existing) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Customer account not found" },
      });
    }

    const updates: Record<string, unknown> = {};
    if (payload.name !== undefined) updates["name"] = payload.name;
    if (payload.accountType !== undefined) updates["account_type"] = payload.accountType;
    if (payload.status !== undefined) updates["status"] = payload.status;
    if (payload.email !== undefined) updates["email"] = payload.email;
    if (payload.phone !== undefined) updates["phone"] = payload.phone;
    if (payload.taxId !== undefined) updates["tax_id"] = payload.taxId;
    if (payload.website !== undefined) updates["website"] = payload.website;
    if (payload.currency !== undefined) updates["currency"] = payload.currency;
    if (payload.paymentTermsDays !== undefined) updates["payment_terms_days"] = payload.paymentTermsDays;
    if (payload.billingAddress !== undefined) updates["billing_address"] = payload.billingAddress;
    if (payload.notes !== undefined) updates["notes"] = payload.notes;

    const { data: updated, error } = await client
      .from("customer_accounts")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      return reply.status(400).send({
        error: { code: "UPDATE_FAILED", message: error.message },
      });
    }

    await logAudit(
      tenantId,
      userId,
      "customer_account.updated",
      "customer_accounts",
      id,
      existing,
      updated
    );

    return reply.send({ data: updated });
  });

  // =========================================================================
  // 3. CUSTOMER SITES & BRANCHES
  // =========================================================================

  // GET /api/v1/customers/:id/sites
  fastify.get("/:id/sites", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id: customerAccountId } = request.params as { id: string };

    const allowed = await verifyCustomerAccountAccess(
      tenantId,
      userId,
      customerAccountId,
      portal,
      isPlatformAdmin
    );

    if (!allowed) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Access denied to customer sites" },
      });
    }

    const client = adminClient ?? request.userClient!;
    const { data: sites, error } = await client
      .from("customer_sites")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("customer_account_id", customerAccountId)
      .order("is_primary", { ascending: false })
      .order("name", { ascending: true });

    if (error) {
      return reply.status(500).send({
        error: { code: "FETCH_SITES_FAILED", message: error.message },
      });
    }

    return reply.send({ data: sites });
  });

  // POST /api/v1/customers/:id/sites
  fastify.post("/:id/sites", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id: customerAccountId } = request.params as { id: string };

    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only operations staff can create customer sites" },
      });
    }

    const parseResult = customerSiteSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid site payload", details: parseResult.error.flatten() },
      });
    }

    const client = adminClient ?? request.userClient!;
    const payload = parseResult.data;

    // If marked primary, unset existing primary sites for this account
    if (payload.isPrimary) {
      await client
        .from("customer_sites")
        .update({ is_primary: false })
        .eq("tenant_id", tenantId)
        .eq("customer_account_id", customerAccountId);
    }

    const { data: site, error } = await client
      .from("customer_sites")
      .insert({
        tenant_id: tenantId,
        customer_account_id: customerAccountId,
        name: payload.name,
        code: payload.code ?? null,
        is_primary: payload.isPrimary,
        status: payload.status,
        address_line1: payload.addressLine1,
        address_line2: payload.addressLine2 ?? null,
        city: payload.city,
        state: payload.state ?? null,
        postal_code: payload.postalCode ?? null,
        country: payload.country,
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
        geofence_radius_meters: payload.geofenceRadiusMeters,
        access_instructions: payload.accessInstructions ?? null,
        contact_name: payload.contactName ?? null,
        contact_phone: payload.contactPhone ?? null,
        contact_email: payload.contactEmail ?? null,
      })
      .select()
      .single();

    if (error) {
      return reply.status(400).send({
        error: { code: "SITE_CREATION_FAILED", message: error.message },
      });
    }

    await logAudit(
      tenantId,
      userId,
      "customer_site.created",
      "customer_sites",
      site.id,
      null,
      site
    );

    return reply.status(201).send({ data: site });
  });

  // PATCH /api/v1/customers/:id/sites/:siteId
  fastify.patch("/:id/sites/:siteId", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id: customerAccountId, siteId } = request.params as { id: string; siteId: string };

    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only operations staff can modify customer sites" },
      });
    }

    const parseResult = updateCustomerSiteSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid site payload" },
      });
    }

    const client = adminClient ?? request.userClient!;
    const payload = parseResult.data;

    if (payload.isPrimary) {
      await client
        .from("customer_sites")
        .update({ is_primary: false })
        .eq("tenant_id", tenantId)
        .eq("customer_account_id", customerAccountId);
    }

    const updates: Record<string, unknown> = {};
    if (payload.name !== undefined) updates["name"] = payload.name;
    if (payload.code !== undefined) updates["code"] = payload.code;
    if (payload.isPrimary !== undefined) updates["is_primary"] = payload.isPrimary;
    if (payload.status !== undefined) updates["status"] = payload.status;
    if (payload.addressLine1 !== undefined) updates["address_line1"] = payload.addressLine1;
    if (payload.addressLine2 !== undefined) updates["address_line2"] = payload.addressLine2;
    if (payload.city !== undefined) updates["city"] = payload.city;
    if (payload.state !== undefined) updates["state"] = payload.state;
    if (payload.postalCode !== undefined) updates["postal_code"] = payload.postalCode;
    if (payload.country !== undefined) updates["country"] = payload.country;
    if (payload.latitude !== undefined) updates["latitude"] = payload.latitude;
    if (payload.longitude !== undefined) updates["longitude"] = payload.longitude;
    if (payload.geofenceRadiusMeters !== undefined) updates["geofence_radius_meters"] = payload.geofenceRadiusMeters;
    if (payload.accessInstructions !== undefined) updates["access_instructions"] = payload.accessInstructions;
    if (payload.contactName !== undefined) updates["contact_name"] = payload.contactName;
    if (payload.contactPhone !== undefined) updates["contact_phone"] = payload.contactPhone;
    if (payload.contactEmail !== undefined) updates["contact_email"] = payload.contactEmail;

    const { data: updated, error } = await client
      .from("customer_sites")
      .update(updates)
      .eq("id", siteId)
      .eq("customer_account_id", customerAccountId)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      return reply.status(400).send({
        error: { code: "SITE_UPDATE_FAILED", message: error.message },
      });
    }

    await logAudit(
      tenantId,
      userId,
      "customer_site.updated",
      "customer_sites",
      siteId,
      null,
      updated
    );

    return reply.send({ data: updated });
  });

  // DELETE /api/v1/customers/:id/sites/:siteId
  fastify.delete("/:id/sites/:siteId", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id: customerAccountId, siteId } = request.params as { id: string; siteId: string };

    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only operations staff can delete customer sites" },
      });
    }

    const client = adminClient ?? request.userClient!;
    const { error } = await client
      .from("customer_sites")
      .delete()
      .eq("id", siteId)
      .eq("customer_account_id", customerAccountId)
      .eq("tenant_id", tenantId);

    if (error) {
      return reply.status(400).send({
        error: { code: "SITE_DELETE_FAILED", message: error.message },
      });
    }

    await logAudit(
      tenantId,
      userId,
      "customer_site.deleted",
      "customer_sites",
      siteId
    );

    return reply.send({ data: { success: true } });
  });

  // =========================================================================
  // 4. CUSTOMER CONTACTS
  // =========================================================================

  // GET /api/v1/customers/:id/contacts
  fastify.get("/:id/contacts", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id: customerAccountId } = request.params as { id: string };

    const allowed = await verifyCustomerAccountAccess(
      tenantId,
      userId,
      customerAccountId,
      portal,
      isPlatformAdmin
    );

    if (!allowed) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Access denied to customer contacts" },
      });
    }

    const client = adminClient ?? request.userClient!;
    const { data: contacts, error } = await client
      .from("customer_contacts")
      .select("*, customer_sites (id, name)")
      .eq("tenant_id", tenantId)
      .eq("customer_account_id", customerAccountId)
      .order("is_primary", { ascending: false })
      .order("full_name", { ascending: true });

    if (error) {
      return reply.status(500).send({
        error: { code: "FETCH_CONTACTS_FAILED", message: error.message },
      });
    }

    return reply.send({ data: contacts });
  });

  // POST /api/v1/customers/:id/contacts
  fastify.post("/:id/contacts", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id: customerAccountId } = request.params as { id: string };

    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only operations staff can create contacts" },
      });
    }

    const parseResult = customerContactSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid contact data", details: parseResult.error.flatten() },
      });
    }

    const client = adminClient ?? request.userClient!;
    const payload = parseResult.data;

    if (payload.isPrimary) {
      await client
        .from("customer_contacts")
        .update({ is_primary: false })
        .eq("tenant_id", tenantId)
        .eq("customer_account_id", customerAccountId);
    }

    const { data: contact, error } = await client
      .from("customer_contacts")
      .insert({
        tenant_id: tenantId,
        customer_account_id: customerAccountId,
        site_id: payload.siteId ?? null,
        full_name: payload.fullName,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        mobile: payload.mobile ?? null,
        job_title: payload.jobTitle ?? null,
        department: payload.department ?? null,
        is_primary: payload.isPrimary,
        is_billing_contact: payload.isBillingContact,
        is_service_contact: payload.isServiceContact,
        notes: payload.notes ?? null,
      })
      .select()
      .single();

    if (error) {
      return reply.status(400).send({
        error: { code: "CONTACT_CREATION_FAILED", message: error.message },
      });
    }

    await logAudit(
      tenantId,
      userId,
      "customer_contact.created",
      "customer_contacts",
      contact.id,
      null,
      contact
    );

    return reply.status(201).send({ data: contact });
  });

  // PATCH /api/v1/customers/:id/contacts/:contactId
  fastify.patch("/:id/contacts/:contactId", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id: customerAccountId, contactId } = request.params as { id: string; contactId: string };

    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only operations staff can modify contacts" },
      });
    }

    const parseResult = updateCustomerContactSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid contact updates" },
      });
    }

    const client = adminClient ?? request.userClient!;
    const payload = parseResult.data;

    if (payload.isPrimary) {
      await client
        .from("customer_contacts")
        .update({ is_primary: false })
        .eq("tenant_id", tenantId)
        .eq("customer_account_id", customerAccountId);
    }

    const updates: Record<string, unknown> = {};
    if (payload.fullName !== undefined) updates["full_name"] = payload.fullName;
    if (payload.email !== undefined) updates["email"] = payload.email;
    if (payload.phone !== undefined) updates["phone"] = payload.phone;
    if (payload.mobile !== undefined) updates["mobile"] = payload.mobile;
    if (payload.jobTitle !== undefined) updates["job_title"] = payload.jobTitle;
    if (payload.department !== undefined) updates["department"] = payload.department;
    if (payload.siteId !== undefined) updates["site_id"] = payload.siteId;
    if (payload.isPrimary !== undefined) updates["is_primary"] = payload.isPrimary;
    if (payload.isBillingContact !== undefined) updates["is_billing_contact"] = payload.isBillingContact;
    if (payload.isServiceContact !== undefined) updates["is_service_contact"] = payload.isServiceContact;
    if (payload.notes !== undefined) updates["notes"] = payload.notes;

    const { data: updated, error } = await client
      .from("customer_contacts")
      .update(updates)
      .eq("id", contactId)
      .eq("customer_account_id", customerAccountId)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      return reply.status(400).send({
        error: { code: "CONTACT_UPDATE_FAILED", message: error.message },
      });
    }

    await logAudit(
      tenantId,
      userId,
      "customer_contact.updated",
      "customer_contacts",
      contactId,
      null,
      updated
    );

    return reply.send({ data: updated });
  });

  // DELETE /api/v1/customers/:id/contacts/:contactId
  fastify.delete("/:id/contacts/:contactId", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id: customerAccountId, contactId } = request.params as { id: string; contactId: string };

    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only operations staff can delete contacts" },
      });
    }

    const client = adminClient ?? request.userClient!;
    const { error } = await client
      .from("customer_contacts")
      .delete()
      .eq("id", contactId)
      .eq("customer_account_id", customerAccountId)
      .eq("tenant_id", tenantId);

    if (error) {
      return reply.status(400).send({
        error: { code: "CONTACT_DELETE_FAILED", message: error.message },
      });
    }

    await logAudit(
      tenantId,
      userId,
      "customer_contact.deleted",
      "customer_contacts",
      contactId
    );

    return reply.send({ data: { success: true } });
  });

  // =========================================================================
  // 5. CUSTOMER PORTAL USER LINKS
  // =========================================================================

  // GET /api/v1/customers/:id/users
  fastify.get("/:id/users", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id: customerAccountId } = request.params as { id: string };

    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only operations staff can manage customer portal links" },
      });
    }

    const client = adminClient ?? request.userClient!;
    const { data: users, error } = await client
      .from("customer_users")
      .select(`
        id,
        user_id,
        portal_role,
        is_active,
        created_at,
        profiles:user_id (
          id,
          full_name,
          email,
          avatar_url
        ),
        customer_contacts:contact_id (
          id,
          full_name,
          job_title
        )
      `)
      .eq("tenant_id", tenantId)
      .eq("customer_account_id", customerAccountId);

    if (error) {
      return reply.status(500).send({
        error: { code: "FETCH_CUSTOMER_USERS_FAILED", message: error.message },
      });
    }

    return reply.send({ data: users });
  });

  // POST /api/v1/customers/:id/users
  fastify.post("/:id/users", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id: customerAccountId } = request.params as { id: string };

    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only operations staff can link customer portal users" },
      });
    }

    const parseResult = linkCustomerUserSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid link payload" },
      });
    }

    const client = adminClient ?? request.userClient!;
    const { userId: targetUserId, portalRole, contactId } = parseResult.data;

    // Ensure the target user has a membership with portal = 'customer' for this tenant
    const { data: mem } = await client
      .from("tenant_memberships")
      .select("id, portal")
      .eq("tenant_id", tenantId)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (!mem) {
      return reply.status(400).send({
        error: {
          code: "USER_MEMBERSHIP_REQUIRED",
          message: "The target user must be a member of this tenant organization first",
        },
      });
    }

    const { data: link, error } = await client
      .from("customer_users")
      .upsert(
        {
          tenant_id: tenantId,
          customer_account_id: customerAccountId,
          user_id: targetUserId,
          portal_role: portalRole,
          contact_id: contactId ?? null,
          is_active: true,
        },
        { onConflict: "tenant_id,customer_account_id,user_id" }
      )
      .select()
      .single();

    if (error) {
      return reply.status(400).send({
        error: { code: "USER_LINK_FAILED", message: error.message },
      });
    }

    await logAudit(
      tenantId,
      userId,
      "customer_user.linked",
      "customer_users",
      link.id,
      null,
      { targetUserId, customerAccountId, portalRole }
    );

    return reply.status(201).send({ data: link });
  });

  // DELETE /api/v1/customers/:id/users/:targetUserId
  fastify.delete("/:id/users/:targetUserId", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const userId = request.auth!.user.id;
    const portal = request.auth!.activeMembership?.portal || "operations";
    const isPlatformAdmin = Boolean(request.auth!.isPlatformAdmin);
    const { id: customerAccountId, targetUserId } = request.params as {
      id: string;
      targetUserId: string;
    };

    if (!isPlatformAdmin && portal !== "operations") {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only operations staff can unlink customer portal users" },
      });
    }

    const client = adminClient ?? request.userClient!;
    const { error } = await client
      .from("customer_users")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("customer_account_id", customerAccountId)
      .eq("user_id", targetUserId);

    if (error) {
      return reply.status(400).send({
        error: { code: "UNLINK_FAILED", message: error.message },
      });
    }

    await logAudit(
      tenantId,
      userId,
      "customer_user.unlinked",
      "customer_users",
      customerAccountId,
      { targetUserId }
    );

    return reply.send({ data: { success: true } });
  });
};
