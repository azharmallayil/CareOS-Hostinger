import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import {
  createUserClient,
  createAdminClient,
  type SupabaseClient,
} from "@careos/supabase-client";
import {
  extractBearerToken,
  resolveAuthContext,
  resolveActiveMembership,
  type CareOSAuthContext,
} from "@careos/auth";
import type { Portal } from "@careos/shared-types";

declare module "fastify" {
  interface FastifyRequest {
    auth: CareOSAuthContext | null;
    userClient: SupabaseClient | null;
  }
}

export const authPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseAnonKey = process.env["SUPABASE_ANON_KEY"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!supabaseUrl || !supabaseAnonKey) {
    fastify.log.warn(
      "SUPABASE_URL or SUPABASE_ANON_KEY missing; auth plugin operating in degraded mode"
    );
  }

  // Admin client for system operations (never exposed directly to requests)
  const adminClient =
    supabaseUrl && supabaseServiceKey
      ? createAdminClient(supabaseUrl, supabaseServiceKey)
      : null;

  fastify.decorateRequest("auth", null);
  fastify.decorateRequest("userClient", null);

  fastify.addHook("preHandler", async (request: FastifyRequest) => {
    // 1. Extract Bearer token from header or cookie
    const authHeader = request.headers.authorization;
    let token = extractBearerToken(authHeader);

    if (!token && request.cookies && typeof request.cookies["careos_token"] === "string") {
      token = request.cookies["careos_token"];
    }

    if (!token || !supabaseUrl || !supabaseAnonKey) {
      request.auth = null;
      request.userClient = null;
      return;
    }

    // 2. Create scoped user client with their JWT (RLS policies apply)
    const userClient = createUserClient(supabaseUrl, supabaseAnonKey, token);
    request.userClient = userClient;

    try {
      // 3. Verify user identity with Supabase Auth
      const {
        data: { user },
        error,
      } = await userClient.auth.getUser();

      if (error || !user) {
        request.auth = null;
        return;
      }

      // 4. Check for tenant/portal preference override headers
      const headerTenantId = request.headers["x-tenant-id"] as string | undefined;
      const headerPortal = request.headers["x-portal"] as Portal | undefined;

      // 5. Resolve full auth context (profile, memberships, roles, permissions)
      // Use admin client if available to ensure system tables can be resolved reliably
      const clientForContext = adminClient ?? userClient;
      const authContext = await resolveAuthContext(
        clientForContext,
        user.id,
        headerTenantId,
        headerPortal
      );

      if (!authContext) {
        request.auth = null;
        return;
      }

      // If headerTenantId was requested, enforce that the user actually belongs to it
      if (headerTenantId && authContext.activeTenantId !== headerTenantId) {
        const targetMem = authContext.memberships.find(
          (m) => m.tenantId === headerTenantId && m.isActive
        );
        if (targetMem) {
          authContext.activeTenantId = headerTenantId;
          authContext.activeMembership = targetMem;
        }
      }

      request.auth = authContext;
    } catch (err) {
      request.log.error(err, "Failed to resolve authentication session");
      request.auth = null;
    }
  });
});
