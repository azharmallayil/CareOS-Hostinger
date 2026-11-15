import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { createAdminClient } from "@careos/supabase-client";
import { requireAuth, requireTenant, requirePermission } from "../middleware/guards.js";

const updateSettingsSchema = z.object({
  name: z.string().min(2).optional(),
  branding: z
    .object({
      primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      logoUrl: z.string().url().nullable().optional(),
    })
    .optional(),
  timezone: z.string().optional(),
  currency: z.string().length(3).optional(),
  defaultLanguage: z.enum(["en", "ar"]).optional(),
  notificationConfig: z
    .object({
      emailNotifications: z.boolean().optional(),
      smsNotifications: z.boolean().optional(),
    })
    .optional(),
});

const createDepartmentSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  parentDepartmentId: z.string().uuid().nullable().optional(),
});

const updateDepartmentSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  parentDepartmentId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

const createInvitationSchema = z.object({
  email: z.string().email(),
  portal: z.enum(["operations", "technician", "customer"]),
  roleId: z.string().uuid().optional(),
  departmentId: z.string().uuid().nullable().optional(),
});

const assignRoleSchema = z.object({
  roleId: z.string().uuid(),
});

export const organizationRoutes: FastifyPluginAsync = async (fastify) => {
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
      fastify.log.error(err, "Failed to write audit log");
    }
  };

  // All organization routes require authenticated session with an active tenant
  fastify.addHook("preHandler", requireAuth);
  fastify.addHook("preHandler", requireTenant);

  // =========================================================================
  // 1. TENANT PROFILE & SETTINGS
  // =========================================================================

  // GET /api/v1/organization/settings
  fastify.get(
    "/settings",
    { preHandler: [requirePermission("tenant:read_settings")] },
    async (request, reply) => {
      const tenantId = request.auth!.activeTenantId!;
      const client = request.userClient ?? adminClient!;

      const { data: tenant, error: tenantErr } = await client
        .from("tenants")
        .select("id, slug, name, status, plan, created_at, updated_at")
        .eq("id", tenantId)
        .single();

      if (tenantErr || !tenant) {
        return reply.status(404).send({
          error: { code: "TENANT_NOT_FOUND", message: "Tenant details not found" },
        });
      }

      const { data: settings } = await client
        .from("tenant_settings")
        .select("branding, feature_flags, notification_config, updated_at")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      return reply.send({
        data: {
          tenant,
          settings: settings ?? {
            branding: { primaryColor: "#2563EB", accentColor: "#0EA5E9" },
            feature_flags: {},
            notification_config: { emailNotifications: true, smsNotifications: true },
          },
        },
      });
    }
  );

  // PATCH /api/v1/organization/settings
  fastify.patch(
    "/settings",
    { preHandler: [requirePermission("tenant:update_settings")] },
    async (request, reply) => {
      const tenantId = request.auth!.activeTenantId!;
      const userId = request.auth!.user.id;
      const parseResult = updateSettingsSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid settings payload",
            details: parseResult.error.flatten(),
          },
        });
      }

      const payload = parseResult.data;
      const client = adminClient ?? request.userClient!;

      // 1. Update tenant name if provided
      if (payload.name) {
        await client
          .from("tenants")
          .update({ name: payload.name })
          .eq("id", tenantId);
      }

      // 2. Fetch existing settings for audit diff
      const { data: existingSettings } = await client
        .from("tenant_settings")
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      const updatedBranding = {
        ...(existingSettings?.branding || {}),
        ...(payload.branding || {}),
        ...(payload.timezone && { timezone: payload.timezone }),
        ...(payload.currency && { currency: payload.currency }),
        ...(payload.defaultLanguage && { defaultLanguage: payload.defaultLanguage }),
      };

      const updatedNotifications = {
        ...(existingSettings?.notification_config || {}),
        ...(payload.notificationConfig || {}),
      };

      const { data: savedSettings, error: saveErr } = await client
        .from("tenant_settings")
        .upsert(
          {
            tenant_id: tenantId,
            branding: updatedBranding,
            notification_config: updatedNotifications,
          },
          { onConflict: "tenant_id" }
        )
        .select()
        .single();

      if (saveErr) {
        return reply.status(500).send({
          error: { code: "SETTINGS_UPDATE_FAILED", message: saveErr.message },
        });
      }

      // Audit log
      await logAudit(
        tenantId,
        userId,
        "tenant_settings.updated",
        "tenant_settings",
        tenantId,
        existingSettings,
        savedSettings
      );

      return reply.send({
        data: savedSettings,
      });
    }
  );

  // =========================================================================
  // 2. DEPARTMENTS & BRANCHES
  // =========================================================================

  // GET /api/v1/organization/departments
  fastify.get("/departments", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const client = request.userClient ?? adminClient!;

    const { data: departments, error } = await client
      .from("departments")
      .select("id, name, description, parent_department_id, is_active, created_at, updated_at")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true });

    if (error) {
      return reply.status(500).send({
        error: { code: "DEPARTMENTS_FETCH_FAILED", message: error.message },
      });
    }

    return reply.send({
      data: departments,
    });
  });

  // POST /api/v1/organization/departments
  fastify.post(
    "/departments",
    { preHandler: [requirePermission("tenant:manage_users")] },
    async (request, reply) => {
      const tenantId = request.auth!.activeTenantId!;
      const userId = request.auth!.user.id;
      const parseResult = createDepartmentSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid department data",
            details: parseResult.error.flatten(),
          },
        });
      }

      const client = adminClient ?? request.userClient!;
      const { name, description, parentDepartmentId } = parseResult.data;

      const { data: dept, error } = await client
        .from("departments")
        .insert({
          tenant_id: tenantId,
          name,
          description,
          parent_department_id: parentDepartmentId ?? null,
        })
        .select()
        .single();

      if (error) {
        return reply.status(400).send({
          error: {
            code: "DEPARTMENT_CREATION_FAILED",
            message: error.message.includes("unique")
              ? "A department with this name already exists in your organization"
              : error.message,
          },
        });
      }

      await logAudit(
        tenantId,
        userId,
        "department.created",
        "departments",
        dept.id,
        null,
        dept
      );

      return reply.status(201).send({
        data: dept,
      });
    }
  );

  // PATCH /api/v1/organization/departments/:id
  fastify.patch(
    "/departments/:id",
    { preHandler: [requirePermission("tenant:manage_users")] },
    async (request, reply) => {
      const tenantId = request.auth!.activeTenantId!;
      const userId = request.auth!.user.id;
      const { id } = request.params as { id: string };
      const parseResult = updateDepartmentSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid department updates",
          },
        });
      }

      const client = adminClient ?? request.userClient!;
      const { name, description, parentDepartmentId, isActive } = parseResult.data;

      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates["name"] = name;
      if (description !== undefined) updates["description"] = description;
      if (parentDepartmentId !== undefined) updates["parent_department_id"] = parentDepartmentId;
      if (isActive !== undefined) updates["is_active"] = isActive;

      const { data: updated, error } = await client
        .from("departments")
        .update(updates)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();

      if (error) {
        return reply.status(400).send({
          error: { code: "DEPARTMENT_UPDATE_FAILED", message: error.message },
        });
      }

      await logAudit(
        tenantId,
        userId,
        "department.updated",
        "departments",
        id,
        null,
        updated
      );

      return reply.send({
        data: updated,
      });
    }
  );

  // =========================================================================
  // 3. MEMBERSHIPS & ROLE ASSIGNMENT
  // =========================================================================

  // GET /api/v1/organization/members
  fastify.get(
    "/members",
    { preHandler: [requirePermission("tenant:manage_users")] },
    async (request, reply) => {
      const tenantId = request.auth!.activeTenantId!;
      const client = adminClient ?? request.userClient!;

      const { data: members, error } = await client
        .from("tenant_memberships")
        .select(`
          id,
          user_id,
          portal,
          department_id,
          is_active,
          joined_at,
          deactivated_at,
          created_at,
          departments (
            id,
            name
          ),
          profiles:user_id (
            id,
            full_name,
            email,
            phone,
            avatar_url
          ),
          membership_roles (
            roles (
              id,
              name,
              display_name,
              is_system_role
            )
          )
        `)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) {
        return reply.status(500).send({
          error: { code: "MEMBERS_FETCH_FAILED", message: error.message },
        });
      }

      return reply.send({
        data: members,
      });
    }
  );

  // PATCH /api/v1/organization/members/:id
  fastify.patch(
    "/members/:id",
    { preHandler: [requirePermission("tenant:manage_users")] },
    async (request, reply) => {
      const tenantId = request.auth!.activeTenantId!;
      const userId = request.auth!.user.id;
      const { id } = request.params as { id: string };

      const memberSchema = z.object({
        isActive: z.boolean().optional(),
        departmentId: z.string().uuid().nullable().optional(),
      });

      const parseResult = memberSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: "Invalid updates" },
        });
      }

      const client = adminClient ?? request.userClient!;
      const { isActive, departmentId } = parseResult.data;

      const updates: Record<string, unknown> = {};
      if (isActive !== undefined) {
        updates["is_active"] = isActive;
        if (!isActive) updates["deactivated_at"] = new Date().toISOString();
      }
      if (departmentId !== undefined) updates["department_id"] = departmentId;

      const { data: updated, error } = await client
        .from("tenant_memberships")
        .update(updates)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();

      if (error) {
        return reply.status(400).send({
          error: { code: "MEMBER_UPDATE_FAILED", message: error.message },
        });
      }

      await logAudit(
        tenantId,
        userId,
        isActive === false ? "member.deactivated" : "member.updated",
        "tenant_memberships",
        id,
        null,
        updated
      );

      return reply.send({
        data: updated,
      });
    }
  );

  // POST /api/v1/organization/members/:id/roles
  fastify.post(
    "/members/:id/roles",
    { preHandler: [requirePermission("tenant:manage_users")] },
    async (request, reply) => {
      const tenantId = request.auth!.activeTenantId!;
      const userId = request.auth!.user.id;
      const { id: membershipId } = request.params as { id: string };

      const parseResult = assignRoleSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: "Role ID required" },
        });
      }

      const { roleId } = parseResult.data;
      const client = adminClient ?? request.userClient!;

      // Verify the role belongs to this tenant
      const { data: targetRole, error: roleErr } = await client
        .from("roles")
        .select("id, name, is_system_role")
        .eq("id", roleId)
        .eq("tenant_id", tenantId)
        .single();

      if (roleErr || !targetRole) {
        return reply.status(404).send({
          error: { code: "ROLE_NOT_FOUND", message: "Role does not exist in this tenant" },
        });
      }

      // Privilege escalation prevention: only tenant_admin or platform admin can assign tenant_admin
      if (targetRole.name === "tenant_admin") {
        const isSelfAdmin =
          request.auth!.isPlatformAdmin ||
          request.auth!.activeMembership?.roles.includes("tenant_admin");

        if (!isSelfAdmin) {
          return reply.status(403).send({
            error: {
              code: "FORBIDDEN_ESCALATION",
              message: "Only tenant administrators can grant the tenant_admin role",
            },
          });
        }
      }

      const { data: assignment, error: assignErr } = await client
        .from("membership_roles")
        .upsert(
          {
            membership_id: membershipId,
            role_id: roleId,
            tenant_id: tenantId,
            assigned_by: userId,
            assigned_at: new Date().toISOString(),
          },
          { onConflict: "membership_id,role_id" }
        )
        .select()
        .single();

      if (assignErr) {
        return reply.status(400).send({
          error: { code: "ROLE_ASSIGNMENT_FAILED", message: assignErr.message },
        });
      }

      await logAudit(
        tenantId,
        userId,
        "role.assigned",
        "membership_roles",
        membershipId,
        null,
        { roleId, roleName: targetRole.name }
      );

      return reply.status(201).send({
        data: assignment,
      });
    }
  );

  // DELETE /api/v1/organization/members/:id/roles/:roleId
  fastify.delete(
    "/members/:id/roles/:roleId",
    { preHandler: [requirePermission("tenant:manage_users")] },
    async (request, reply) => {
      const tenantId = request.auth!.activeTenantId!;
      const userId = request.auth!.user.id;
      const { id: membershipId, roleId } = request.params as {
        id: string;
        roleId: string;
      };

      const client = adminClient ?? request.userClient!;

      const { error } = await client
        .from("membership_roles")
        .delete()
        .eq("membership_id", membershipId)
        .eq("role_id", roleId)
        .eq("tenant_id", tenantId);

      if (error) {
        return reply.status(400).send({
          error: { code: "ROLE_REVOKE_FAILED", message: error.message },
        });
      }

      await logAudit(
        tenantId,
        userId,
        "role.revoked",
        "membership_roles",
        membershipId,
        { roleId },
        null
      );

      return reply.send({
        data: { success: true },
      });
    }
  );

  // =========================================================================
  // 4. ROLES & PERMISSIONS
  // =========================================================================

  // GET /api/v1/organization/roles
  fastify.get("/roles", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const client = request.userClient ?? adminClient!;

    const { data: roles, error } = await client
      .from("roles")
      .select(`
        id,
        name,
        display_name,
        description,
        is_system_role,
        is_active,
        role_permissions (
          permissions (
            id,
            action,
            resource
          )
        )
      `)
      .eq("tenant_id", tenantId)
      .order("is_system_role", { ascending: false });

    if (error) {
      return reply.status(500).send({
        error: { code: "ROLES_FETCH_FAILED", message: error.message },
      });
    }

    return reply.send({
      data: roles,
    });
  });

  // GET /api/v1/organization/permissions
  fastify.get("/permissions", async (request, reply) => {
    const tenantId = request.auth!.activeTenantId!;
    const client = request.userClient ?? adminClient!;

    const { data: perms, error } = await client
      .from("permissions")
      .select("id, action, resource, conditions")
      .eq("tenant_id", tenantId);

    if (error) {
      return reply.status(500).send({
        error: { code: "PERMISSIONS_FETCH_FAILED", message: error.message },
      });
    }

    return reply.send({
      data: perms,
    });
  });

  // =========================================================================
  // 5. INVITATIONS LIFECYCLE
  // =========================================================================

  // GET /api/v1/organization/invitations
  fastify.get(
    "/invitations",
    { preHandler: [requirePermission("tenant:manage_users")] },
    async (request, reply) => {
      const tenantId = request.auth!.activeTenantId!;
      const client = adminClient ?? request.userClient!;

      const { data: invitations, error } = await client
        .from("tenant_invitations")
        .select(`
          id,
          email,
          portal,
          token,
          expires_at,
          accepted_at,
          revoked_at,
          created_at,
          roles (
            id,
            name,
            display_name
          ),
          departments (
            id,
            name
          )
        `)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) {
        return reply.status(500).send({
          error: { code: "INVITATIONS_FETCH_FAILED", message: error.message },
        });
      }

      return reply.send({
        data: invitations,
      });
    }
  );

  // POST /api/v1/organization/invitations
  fastify.post(
    "/invitations",
    { preHandler: [requirePermission("tenant:manage_users")] },
    async (request, reply) => {
      const tenantId = request.auth!.activeTenantId!;
      const userId = request.auth!.user.id;
      const parseResult = createInvitationSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid invitation payload",
            details: parseResult.error.flatten(),
          },
        });
      }

      const client = adminClient ?? request.userClient!;
      const { email, portal, roleId, departmentId } = parseResult.data;

      // 7-day expiration
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const token = `inv_${crypto.randomBytes(24).toString("hex")}`;

      const { data: invitation, error } = await client
        .from("tenant_invitations")
        .insert({
          tenant_id: tenantId,
          email,
          portal,
          role_id: roleId ?? null,
          department_id: departmentId ?? null,
          token,
          invited_by: userId,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (error) {
        return reply.status(400).send({
          error: { code: "INVITATION_CREATION_FAILED", message: error.message },
        });
      }

      await logAudit(
        tenantId,
        userId,
        "invitation.created",
        "tenant_invitations",
        invitation.id,
        null,
        { email, portal, roleId }
      );

      return reply.status(201).send({
        data: invitation,
      });
    }
  );

  // DELETE /api/v1/organization/invitations/:id
  fastify.delete(
    "/invitations/:id",
    { preHandler: [requirePermission("tenant:manage_users")] },
    async (request, reply) => {
      const tenantId = request.auth!.activeTenantId!;
      const userId = request.auth!.user.id;
      const { id } = request.params as { id: string };

      const client = adminClient ?? request.userClient!;

      const { data: revoked, error } = await client
        .from("tenant_invitations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();

      if (error) {
        return reply.status(400).send({
          error: { code: "INVITATION_REVOKE_FAILED", message: error.message },
        });
      }

      await logAudit(
        tenantId,
        userId,
        "invitation.revoked",
        "tenant_invitations",
        id,
        null,
        revoked
      );

      return reply.send({
        data: revoked,
      });
    }
  );

  // =========================================================================
  // 6. AUDIT LOGS
  // =========================================================================

  // GET /api/v1/organization/audit-logs
  fastify.get(
    "/audit-logs",
    { preHandler: [requirePermission("audit_log:read")] },
    async (request, reply) => {
      const tenantId = request.auth!.activeTenantId!;
      const client = adminClient ?? request.userClient!;

      const { data: logs, error } = await client
        .from("audit_logs")
        .select(`
          id,
          user_id,
          action,
          resource_type,
          resource_id,
          old_data,
          new_data,
          created_at,
          profiles:user_id (
            id,
            full_name,
            email
          )
        `)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        return reply.status(500).send({
          error: { code: "AUDIT_LOGS_FETCH_FAILED", message: error.message },
        });
      }

      return reply.send({
        data: logs,
      });
    }
  );
};
