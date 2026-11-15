import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createAdminClient } from "@careos/supabase-client";
import { canSwitchTenant } from "@careos/auth";
import { requireAuth } from "../middleware/guards.js";

const switchTenantSchema = z.object({
  tenantId: z.string().uuid(),
});

const verifyInvitationSchema = z.object({
  token: z.string().min(10),
});

const acceptInvitationSchema = z.object({
  token: z.string().min(10),
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  // ── GET /api/v1/auth/me ────────────────────────────────────────────────────
  fastify.get("/me", { preHandler: [requireAuth] }, async (request, reply) => {
    return reply.send({
      data: request.auth,
    });
  });

  // ── POST /api/v1/auth/switch-tenant ────────────────────────────────────────
  fastify.get("/switch-tenant", { preHandler: [requireAuth] }, async (request, reply) => {
    return reply.status(405).send({
      error: { code: "METHOD_NOT_ALLOWED", message: "Use POST to switch tenant" },
    });
  });

  fastify.post("/switch-tenant", { preHandler: [requireAuth] }, async (request, reply) => {
    const parseResult = switchTenantSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid tenant ID provided",
          details: parseResult.error.flatten(),
        },
      });
    }

    const { tenantId } = parseResult.data;
    const authContext = request.auth!;

    // Check if user is allowed to switch to this tenant
    if (!canSwitchTenant(authContext, tenantId)) {
      return reply.status(403).send({
        error: {
          code: "FORBIDDEN_CROSS_TENANT",
          message: "You do not have an active membership in the requested tenant",
        },
      });
    }

    // Locate target membership
    const targetMembership = authContext.memberships.find(
      (m) => m.tenantId === tenantId && m.isActive
    );

    const updatedContext = {
      ...authContext,
      activeTenantId: tenantId,
      activeMembership: targetMembership ?? null,
    };

    return reply.send({
      data: updatedContext,
    });
  });

  // ── GET /api/v1/auth/invitations/verify ────────────────────────────────────
  fastify.get("/invitations/verify", async (request, reply) => {
    const parseResult = verifyInvitationSchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invitation token is required",
        },
      });
    }

    if (!adminClient) {
      return reply.status(503).send({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Database service not configured",
        },
      });
    }

    const { token } = parseResult.data;

    const { data: invitation, error } = await adminClient
      .from("tenant_invitations")
      .select(`
        id,
        email,
        portal,
        expires_at,
        accepted_at,
        revoked_at,
        tenants (
          id,
          name,
          slug
        ),
        roles (
          id,
          name,
          display_name
        )
      `)
      .eq("token", token)
      .maybeSingle();

    if (error || !invitation) {
      return reply.status(404).send({
        error: {
          code: "INVITATION_NOT_FOUND",
          message: "The invitation token is invalid or does not exist",
        },
      });
    }

    const isExpired = new Date(invitation.expires_at) < new Date();
    const isAccepted = Boolean(invitation.accepted_at);
    const isRevoked = Boolean(invitation.revoked_at);
    const isValid = !isExpired && !isAccepted && !isRevoked;

    return reply.send({
      data: {
        isValid,
        isExpired,
        isAccepted,
        isRevoked,
        email: invitation.email,
        portal: invitation.portal,
        tenant: invitation.tenants,
        role: invitation.roles,
        expiresAt: invitation.expires_at,
      },
    });
  });

  // ── POST /api/v1/auth/invitations/accept ───────────────────────────────────
  fastify.post(
    "/invitations/accept",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = acceptInvitationSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Valid invitation token is required",
          },
        });
      }

      if (!adminClient) {
        return reply.status(503).send({
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Database service not configured",
          },
        });
      }

      const { token } = parseResult.data;
      const user = request.auth!.user;

      // 1. Fetch invitation
      const { data: invitation, error: fetchError } = await adminClient
        .from("tenant_invitations")
        .select("*")
        .eq("token", token)
        .maybeSingle();

      if (fetchError || !invitation) {
        return reply.status(404).send({
          error: {
            code: "INVITATION_NOT_FOUND",
            message: "The invitation token is invalid or has expired",
          },
        });
      }

      // 2. Validate state
      if (invitation.accepted_at) {
        return reply.status(400).send({
          error: {
            code: "INVITATION_ALREADY_ACCEPTED",
            message: "This invitation has already been accepted",
          },
        });
      }

      if (invitation.revoked_at) {
        return reply.status(400).send({
          error: {
            code: "INVITATION_REVOKED",
            message: "This invitation was revoked by the administrator",
          },
        });
      }

      if (new Date(invitation.expires_at) < new Date()) {
        return reply.status(400).send({
          error: {
            code: "INVITATION_EXPIRED",
            message: "This invitation has expired",
          },
        });
      }

      // 3. Create or reactivate tenant membership
      const { data: membership, error: memError } = await adminClient
        .from("tenant_memberships")
        .upsert(
          {
            tenant_id: invitation.tenant_id,
            user_id: user.id,
            portal: invitation.portal,
            department_id: invitation.department_id,
            is_active: true,
            joined_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id,user_id,portal" }
        )
        .select()
        .single();

      if (memError || !membership) {
        request.log.error(memError, "Failed to create tenant membership");
        return reply.status(500).send({
          error: {
            code: "MEMBERSHIP_CREATION_FAILED",
            message: "Failed to create tenant membership",
          },
        });
      }

      // 4. Assign role if specified
      if (invitation.role_id) {
        await adminClient.from("membership_roles").upsert(
          {
            membership_id: membership.id,
            role_id: invitation.role_id,
            tenant_id: invitation.tenant_id,
            assigned_at: new Date().toISOString(),
          },
          { onConflict: "membership_id,role_id" }
        );
      }

      // 5. Mark invitation as accepted
      await adminClient
        .from("tenant_invitations")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invitation.id);

      return reply.send({
        data: {
          success: true,
          tenantId: invitation.tenant_id,
          portal: invitation.portal,
          membershipId: membership.id,
        },
      });
    }
  );
};
