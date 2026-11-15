import { describe, it, expect } from "vitest";
import {
  extractBearerToken,
  decodeJWTPayload,
  isTokenExpired,
  canAccessPortal,
  canSwitchTenant,
  hasPermission,
  hasRole,
  type CareOSAuthContext,
} from "../index.js";

describe("@careos/auth - JWT utilities", () => {
  it("extracts token from standard Bearer Authorization header", () => {
    expect(extractBearerToken("Bearer token-123")).toBe("token-123");
    expect(extractBearerToken("bearer token-456")).toBe("token-456");
    expect(extractBearerToken(["Bearer token-789"])).toBe("token-789");
  });

  it("returns null for missing, malformed, or non-Bearer headers", () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Basic dXNlcjpwYXNz")).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
  });

  it("decodes payload and detects token expiration accurately", () => {
    const pastExp = Math.floor(Date.now() / 1000) - 300;
    const futureExp = Math.floor(Date.now() / 1000) + 3600;

    const makeToken = (exp: number) => {
      const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({ sub: "user-1", exp })).toString("base64url");
      return `${header}.${payload}.mockSignature`;
    };

    const expiredToken = makeToken(pastExp);
    const freshToken = makeToken(futureExp);

    expect(decodeJWTPayload(expiredToken)?.sub).toBe("user-1");
    expect(isTokenExpired(expiredToken)).toBe(true);
    expect(isTokenExpired(freshToken)).toBe(false);
    expect(isTokenExpired("invalid.jwt.token")).toBe(true);
  });
});

describe("@careos/auth - Portal Access Guards", () => {
  const operationsUser: CareOSAuthContext = {
    user: {
      id: "u-ops-1",
      email: "ops@alpha.com",
      fullName: "Ops User",
      preferredLanguage: "en",
    },
    memberships: [
      {
        id: "m-1",
        tenantId: "t-alpha",
        tenantSlug: "alpha",
        tenantName: "Alpha Fleet",
        portal: "operations",
        isActive: true,
        roles: ["tenant_admin"],
        permissions: ["all:manage"],
      },
    ],
    activeMembership: {
      id: "m-1",
      tenantId: "t-alpha",
      tenantSlug: "alpha",
      tenantName: "Alpha Fleet",
      portal: "operations",
      isActive: true,
      roles: ["tenant_admin"],
      permissions: ["all:manage"],
    },
    activeTenantId: "t-alpha",
    isPlatformAdmin: false,
  };

  const technicianUser: CareOSAuthContext = {
    user: {
      id: "u-tech-1",
      email: "tech@alpha.com",
      fullName: "Tech User",
      preferredLanguage: "en",
    },
    memberships: [
      {
        id: "m-2",
        tenantId: "t-alpha",
        tenantSlug: "alpha",
        tenantName: "Alpha Fleet",
        portal: "technician",
        isActive: true,
        roles: ["technician"],
        permissions: ["work_order:read", "work_order:update_status"],
      },
    ],
    activeMembership: {
      id: "m-2",
      tenantId: "t-alpha",
      tenantSlug: "alpha",
      tenantName: "Alpha Fleet",
      portal: "technician",
      isActive: true,
      roles: ["technician"],
      permissions: ["work_order:read", "work_order:update_status"],
    },
    activeTenantId: "t-alpha",
    isPlatformAdmin: false,
  };

  const customerUser: CareOSAuthContext = {
    user: {
      id: "u-cust-1",
      email: "cust@client.com",
      fullName: "Customer User",
      preferredLanguage: "ar",
    },
    memberships: [
      {
        id: "m-3",
        tenantId: "t-alpha",
        tenantSlug: "alpha",
        tenantName: "Alpha Fleet",
        portal: "customer",
        isActive: true,
        roles: ["customer_individual"],
        permissions: ["ticket:create", "ticket:read"],
      },
    ],
    activeMembership: {
      id: "m-3",
      tenantId: "t-alpha",
      tenantSlug: "alpha",
      tenantName: "Alpha Fleet",
      portal: "customer",
      isActive: true,
      roles: ["customer_individual"],
      permissions: ["ticket:create", "ticket:read"],
    },
    activeTenantId: "t-alpha",
    isPlatformAdmin: false,
  };

  const platformAdmin: CareOSAuthContext = {
    user: {
      id: "u-admin-1",
      email: "super@careos.platform",
      fullName: "Platform Admin",
      preferredLanguage: "en",
    },
    memberships: [],
    activeMembership: null,
    activeTenantId: null,
    isPlatformAdmin: true,
  };

  const inactiveUser: CareOSAuthContext = {
    user: {
      id: "u-inactive-1",
      email: "inactive@alpha.com",
      fullName: "Inactive User",
      preferredLanguage: "en",
    },
    memberships: [
      {
        id: "m-4",
        tenantId: "t-alpha",
        tenantSlug: "alpha",
        tenantName: "Alpha Fleet",
        portal: "operations",
        isActive: false, // Inactive!
        roles: ["csr"],
        permissions: ["ticket:read"],
      },
    ],
    activeMembership: {
      id: "m-4",
      tenantId: "t-alpha",
      tenantSlug: "alpha",
      tenantName: "Alpha Fleet",
      portal: "operations",
      isActive: false,
      roles: ["csr"],
      permissions: ["ticket:read"],
    },
    activeTenantId: "t-alpha",
    isPlatformAdmin: false,
  };

  it("enforces portal boundaries strictly per role and membership", () => {
    // Operations user
    expect(canAccessPortal(operationsUser, "operations")).toBe(true);
    expect(canAccessPortal(operationsUser, "technician")).toBe(false);
    expect(canAccessPortal(operationsUser, "customer")).toBe(false);
    expect(canAccessPortal(operationsUser, "admin")).toBe(false);

    // Technician user
    expect(canAccessPortal(technicianUser, "technician")).toBe(true);
    expect(canAccessPortal(technicianUser, "operations")).toBe(false);
    expect(canAccessPortal(technicianUser, "customer")).toBe(false);
    expect(canAccessPortal(technicianUser, "admin")).toBe(false);

    // Customer user
    expect(canAccessPortal(customerUser, "customer")).toBe(true);
    expect(canAccessPortal(customerUser, "operations")).toBe(false);
    expect(canAccessPortal(customerUser, "technician")).toBe(false);
    expect(canAccessPortal(customerUser, "admin")).toBe(false);

    // Platform admin
    expect(canAccessPortal(platformAdmin, "admin")).toBe(true);

    // Inactive user loses portal access
    expect(canAccessPortal(inactiveUser, "operations")).toBe(false);

    // Unauthenticated access
    expect(canAccessPortal(null, "operations")).toBe(false);
    expect(canAccessPortal(undefined, "admin")).toBe(false);
  });
});

describe("@careos/auth - Cross-Tenant Switching and Permissions", () => {
  const multiTenantUser: CareOSAuthContext = {
    user: {
      id: "u-multi-1",
      email: "multi@careos.com",
      fullName: "Multi User",
      preferredLanguage: "en",
    },
    memberships: [
      {
        id: "m-alpha",
        tenantId: "t-alpha",
        tenantSlug: "alpha",
        tenantName: "Alpha Services",
        portal: "operations",
        isActive: true,
        roles: ["dispatcher"],
        permissions: ["ticket:read", "ticket:create"],
      },
      {
        id: "m-beta",
        tenantId: "t-beta",
        tenantSlug: "beta",
        tenantName: "Beta Logistics",
        portal: "operations",
        isActive: true,
        roles: ["tenant_manager"],
        permissions: ["ticket:read", "work_order:create"],
      },
      {
        id: "m-gamma-deactivated",
        tenantId: "t-gamma",
        tenantSlug: "gamma",
        tenantName: "Gamma Fleet",
        portal: "operations",
        isActive: false, // Inactive
        roles: ["tenant_admin"],
        permissions: ["all:manage"],
      },
    ],
    activeMembership: {
      id: "m-alpha",
      tenantId: "t-alpha",
      tenantSlug: "alpha",
      tenantName: "Alpha Services",
      portal: "operations",
      isActive: true,
      roles: ["dispatcher"],
      permissions: ["ticket:read", "ticket:create"],
    },
    activeTenantId: "t-alpha",
    isPlatformAdmin: false,
  };

  it("authorizes tenant switching only for active memberships", () => {
    // Permitted: t-beta is an active membership
    expect(canSwitchTenant(multiTenantUser, "t-beta")).toBe(true);

    // Blocked: t-gamma membership is deactivated
    expect(canSwitchTenant(multiTenantUser, "t-gamma")).toBe(false);

    // Blocked: t-unauthorized is not among user memberships
    expect(canSwitchTenant(multiTenantUser, "t-unauthorized")).toBe(false);
  });

  it("enforces role and action permissions in active tenant context", () => {
    expect(hasRole(multiTenantUser, "dispatcher")).toBe(true);
    expect(hasRole(multiTenantUser, "tenant_admin")).toBe(false);

    expect(hasPermission(multiTenantUser, "ticket:create")).toBe(true);
    expect(hasPermission(multiTenantUser, "ticket:read")).toBe(true);
    // Dispatcher does not have tenant:manage_users
    expect(hasPermission(multiTenantUser, "tenant:manage_users")).toBe(false);
  });
});
