import { describe, it, expect, beforeAll } from "vitest";
import fastify, { type FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { requirePortal, requirePlatformAdmin } from "../middleware/guards.js";
import type { CareOSAuthContext } from "@careos/auth";

describe("API Authentication & Route Guards", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = fastify({ logger: false });
    await buildApp(app);

    // Register test routes protected by portal and admin guards
    app.get("/test/operations", { preHandler: [requirePortal("operations")] }, async () => ({
      success: true,
      portal: "operations",
    }));

    app.get("/test/technician", { preHandler: [requirePortal("technician")] }, async () => ({
      success: true,
      portal: "technician",
    }));

    app.get("/test/customer", { preHandler: [requirePortal("customer")] }, async () => ({
      success: true,
      portal: "customer",
    }));

    app.get("/test/admin", { preHandler: [requirePlatformAdmin] }, async () => ({
      success: true,
      portal: "admin",
    }));

    await app.ready();
  });

  it("rejects unauthenticated requests to /api/v1/auth/me with 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects unauthenticated access to protected portal routes with 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/test/operations",
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects unauthenticated requests to switch tenant with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/switch-tenant",
      payload: { tenantId: "11111111-1111-1111-1111-111111111111" },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects invitation verification when token query parameter is missing with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/invitations/verify",
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("enforces portal boundaries using mock auth context", async () => {
    // Create mock app with pre-populated auth context
    const testApp = fastify({ logger: false });

    const technicianContext: CareOSAuthContext = {
      user: {
        id: "u-tech-1",
        email: "tech@alpha.test",
        fullName: "Alex Tech",
        preferredLanguage: "en",
      },
      memberships: [
        {
          id: "m-1",
          tenantId: "t-alpha",
          tenantSlug: "alpha",
          tenantName: "Alpha Fleet",
          portal: "technician",
          isActive: true,
          roles: ["technician"],
          permissions: [],
        },
      ],
      activeMembership: {
        id: "m-1",
        tenantId: "t-alpha",
        tenantSlug: "alpha",
        tenantName: "Alpha Fleet",
        portal: "technician",
        isActive: true,
        roles: ["technician"],
        permissions: [],
      },
      activeTenantId: "t-alpha",
      isPlatformAdmin: false,
    };

    // Inject technician auth
    testApp.addHook("preHandler", async (req) => {
      req.auth = technicianContext;
    });

    testApp.get("/ops-only", { preHandler: [requirePortal("operations")] }, async () => ({ ok: true }));
    testApp.get("/tech-only", { preHandler: [requirePortal("technician")] }, async () => ({ ok: true }));
    testApp.get("/admin-only", { preHandler: [requirePlatformAdmin] }, async () => ({ ok: true }));

    await testApp.ready();

    // Permitted: technician accesses technician route
    const techRes = await testApp.inject({ method: "GET", url: "/tech-only" });
    expect(techRes.statusCode).toBe(200);

    // Blocked: technician cannot access operations portal
    const opsRes = await testApp.inject({ method: "GET", url: "/ops-only" });
    expect(opsRes.statusCode).toBe(403);
    expect(JSON.parse(opsRes.body).error.code).toBe("FORBIDDEN_PORTAL");

    // Blocked: technician cannot access platform admin portal
    const adminRes = await testApp.inject({ method: "GET", url: "/admin-only" });
    expect(adminRes.statusCode).toBe(403);
    expect(JSON.parse(adminRes.body).error.code).toBe("FORBIDDEN_ADMIN");
  });
});
