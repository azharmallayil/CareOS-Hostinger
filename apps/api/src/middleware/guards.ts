import type { FastifyRequest, FastifyReply } from "fastify";
import type { Portal } from "@careos/shared-types";
import type { PermissionAction } from "@careos/permissions";
import { canAccessPortal, hasPermission } from "@careos/auth";

/**
 * Pre-handler hook requiring a valid authenticated user session.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.auth) {
    void reply.status(401).send({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required to access this resource",
      },
    });
    return;
  }
}

/**
 * Pre-handler hook requiring the user to hold active access for the specified portal.
 */
export function requirePortal(portal: Portal) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!request.auth) {
      void reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      });
      return;
    }

    if (!canAccessPortal(request.auth, portal)) {
      void reply.status(403).send({
        error: {
          code: "FORBIDDEN_PORTAL",
          message: `You do not have active membership access to the '${portal}' portal`,
        },
      });
      return;
    }
  };
}

/**
 * Pre-handler hook requiring Platform Super Admin status (zero tenant affiliation).
 */
export async function requirePlatformAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.auth) {
    void reply.status(401).send({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });
    return;
  }

  if (!request.auth.isPlatformAdmin) {
    void reply.status(403).send({
      error: {
        code: "FORBIDDEN_ADMIN",
        message: "SaaS Platform Administrator privileges required",
      },
    });
    return;
  }
}

/**
 * Pre-handler hook requiring a specific functional permission in the active tenant context.
 */
export function requirePermission(action: PermissionAction) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!request.auth) {
      void reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      });
      return;
    }

    if (!hasPermission(request.auth, action)) {
      void reply.status(403).send({
        error: {
          code: "FORBIDDEN_INSUFFICIENT_PERMISSIONS",
          message: `Permission '${action}' is required for this operation`,
        },
      });
      return;
    }
  };
}

/**
 * Pre-handler hook requiring an active tenant selection.
 */
export async function requireTenant(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.auth) {
    void reply.status(401).send({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
    return;
  }

  if (!request.auth.activeTenantId) {
    void reply.status(400).send({
      error: {
        code: "TENANT_REQUIRED",
        message: "No active tenant selected or user has no active tenant memberships",
      },
    });
    return;
  }
}
