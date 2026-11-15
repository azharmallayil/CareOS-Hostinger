import assert from "node:assert";

// ── JWT verification helpers ──────────────────────────────────────────────────
function extractBearerToken(headerValue) {
  if (!headerValue) return null;
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!raw) return null;
  const parts = raw.trim().split(" ");
  if (parts.length === 2 && parts[0]?.toLowerCase() === "bearer" && parts[1]) {
    return parts[1];
  }
  return null;
}

function decodeJWTPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[1]) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function isTokenExpired(token, thresholdSeconds = 0) {
  const payload = decodeJWTPayload(token);
  if (!payload || !payload.exp) return true;
  const nowInSeconds = Math.floor(Date.now() / 1000);
  return payload.exp <= nowInSeconds + thresholdSeconds;
}

// ── Guard helpers ─────────────────────────────────────────────────────────────
function canAccessPortal(auth, targetPortal) {
  if (!auth) return false;
  if (targetPortal === "admin") return Boolean(auth.isPlatformAdmin);
  if (auth.activeMembership) {
    return auth.activeMembership.isActive && auth.activeMembership.portal === targetPortal;
  }
  return (auth.memberships || []).some((m) => m.isActive && m.portal === targetPortal);
}

function canSwitchTenant(auth, targetTenantId) {
  if (!auth) return false;
  if (auth.isPlatformAdmin) return true;
  return (auth.memberships || []).some((m) => m.tenantId === targetTenantId && m.isActive);
}

function hasRole(auth, roleName) {
  if (!auth) return false;
  if (auth.isPlatformAdmin) return true;
  if (!auth.activeMembership || !auth.activeMembership.isActive) return false;
  return auth.activeMembership.roles.includes(roleName);
}

function hasPermission(auth, action) {
  if (!auth) return false;
  if (auth.isPlatformAdmin) return true;
  if (!auth.activeMembership || !auth.activeMembership.isActive) return false;
  return auth.activeMembership.permissions.includes(action);
}

console.log("Running CareOS Step 4 Auth & Portal Guard Tests...\n");

// Test 1: Bearer Token Extraction
assert.strictEqual(extractBearerToken("Bearer token-abc-123"), "token-abc-123");
assert.strictEqual(extractBearerToken("bearer token-xyz-789"), "token-xyz-789");
assert.strictEqual(extractBearerToken(["Bearer token-array"]), "token-array");
assert.strictEqual(extractBearerToken(undefined), null);
assert.strictEqual(extractBearerToken(""), null);
assert.strictEqual(extractBearerToken("Basic user:pass"), null);
assert.strictEqual(extractBearerToken("Malformed"), null);
console.log("✔ Test 1: Bearer token extraction passed");

// Test 2: Token Expiration
const now = Math.floor(Date.now() / 1000);
const expiredToken = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: "u1", exp: now - 600 })).toString("base64url")}.sig`;
const activeToken = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: "u1", exp: now + 3600 })).toString("base64url")}.sig`;

assert.strictEqual(isTokenExpired(expiredToken), true);
assert.strictEqual(isTokenExpired(activeToken), false);
assert.strictEqual(isTokenExpired("garbled.token"), true);
console.log("✔ Test 2: JWT expiration detection passed");

// Test 3: Fixtures
const customerCtx = {
  user: { id: "u-cust", email: "cust@client.com" },
  memberships: [{ id: "m1", tenantId: "t-alpha", portal: "customer", isActive: true, roles: ["customer_user"], permissions: ["ticket:create", "ticket:read"] }],
  activeMembership: { id: "m1", tenantId: "t-alpha", portal: "customer", isActive: true, roles: ["customer_user"], permissions: ["ticket:create", "ticket:read"] },
  activeTenantId: "t-alpha",
  isPlatformAdmin: false,
};

const technicianCtx = {
  user: { id: "u-tech", email: "tech@alpha.com" },
  memberships: [{ id: "m2", tenantId: "t-alpha", portal: "technician", isActive: true, roles: ["technician"], permissions: ["work_order:read", "work_order:update_status"] }],
  activeMembership: { id: "m2", tenantId: "t-alpha", portal: "technician", isActive: true, roles: ["technician"], permissions: ["work_order:read", "work_order:update_status"] },
  activeTenantId: "t-alpha",
  isPlatformAdmin: false,
};

const operationsCtx = {
  user: { id: "u-ops", email: "ops@alpha.com" },
  memberships: [
    { id: "m3", tenantId: "t-alpha", portal: "operations", isActive: true, roles: ["dispatcher"], permissions: ["ticket:create", "ticket:assign_dispatcher"] },
    { id: "m4", tenantId: "t-beta", portal: "operations", isActive: true, roles: ["tenant_manager"], permissions: ["all"] },
    { id: "m5", tenantId: "t-gamma", portal: "operations", isActive: false, roles: ["tenant_admin"], permissions: ["all"] }, // Inactive
  ],
  activeMembership: { id: "m3", tenantId: "t-alpha", portal: "operations", isActive: true, roles: ["dispatcher"], permissions: ["ticket:create", "ticket:assign_dispatcher"] },
  activeTenantId: "t-alpha",
  isPlatformAdmin: false,
};

const platformAdminCtx = {
  user: { id: "u-admin", email: "super@careos.platform" },
  memberships: [],
  activeMembership: null,
  activeTenantId: null,
  isPlatformAdmin: true,
};

// Test 4: Unauthenticated Access Rejection
assert.strictEqual(canAccessPortal(null, "operations"), false);
assert.strictEqual(canAccessPortal(null, "technician"), false);
assert.strictEqual(canAccessPortal(null, "customer"), false);
assert.strictEqual(canAccessPortal(null, "admin"), false);
console.log("✔ Test 3: Unauthenticated access rejected for all portals");

// Test 5: Customer Portal Boundaries
assert.strictEqual(canAccessPortal(customerCtx, "customer"), true);
assert.strictEqual(canAccessPortal(customerCtx, "operations"), false);
assert.strictEqual(canAccessPortal(customerCtx, "technician"), false);
assert.strictEqual(canAccessPortal(customerCtx, "admin"), false);
console.log("✔ Test 4: Customer portal boundaries enforced (cannot access ops, tech, or admin)");

// Test 6: Technician Portal Boundaries
assert.strictEqual(canAccessPortal(technicianCtx, "technician"), true);
assert.strictEqual(canAccessPortal(technicianCtx, "operations"), false);
assert.strictEqual(canAccessPortal(technicianCtx, "customer"), false);
assert.strictEqual(canAccessPortal(technicianCtx, "admin"), false);
console.log("✔ Test 5: Technician portal boundaries enforced (cannot access ops, customer, or admin)");

// Test 7: Operations Portal Boundaries
assert.strictEqual(canAccessPortal(operationsCtx, "operations"), true);
assert.strictEqual(canAccessPortal(operationsCtx, "technician"), false);
assert.strictEqual(canAccessPortal(operationsCtx, "customer"), false);
assert.strictEqual(canAccessPortal(operationsCtx, "admin"), false);
console.log("✔ Test 6: Operations portal boundaries enforced (cannot access tech, customer, or admin)");

// Test 8: Platform Admin Boundaries
assert.strictEqual(canAccessPortal(platformAdminCtx, "admin"), true);
assert.strictEqual(canAccessPortal(operationsCtx, "admin"), false);
assert.strictEqual(canAccessPortal(customerCtx, "admin"), false);
assert.strictEqual(canAccessPortal(technicianCtx, "admin"), false);
console.log("✔ Test 7: Platform Admin portal boundaries enforced (only platform admin permitted)");

// Test 9: Cross-Tenant Switching
assert.strictEqual(canSwitchTenant(operationsCtx, "t-beta"), true, "Must permit switching to active tenant membership t-beta");
assert.strictEqual(canSwitchTenant(operationsCtx, "t-gamma"), false, "Must block switching to deactivated tenant membership t-gamma");
assert.strictEqual(canSwitchTenant(operationsCtx, "t-rogue"), false, "Must block switching to unassociated tenant t-rogue");
assert.strictEqual(canSwitchTenant(platformAdminCtx, "t-rogue"), true, "Platform admin can inspect any tenant");
console.log("✔ Test 8: Cross-tenant switching authorization enforced");

// Test 10: Role and Permission Boundary Checks
assert.strictEqual(hasRole(operationsCtx, "dispatcher"), true);
assert.strictEqual(hasRole(operationsCtx, "tenant_admin"), false);
assert.strictEqual(hasPermission(operationsCtx, "ticket:create"), true);
assert.strictEqual(hasPermission(operationsCtx, "tenant:manage_users"), false);
console.log("✔ Test 9: Active context roles and permissions enforced");

console.log("\n========================================================");
console.log("ALL STEP 4 AUTHENTICATION & ROUTE GUARD TESTS PASSED!");
console.log("========================================================");
