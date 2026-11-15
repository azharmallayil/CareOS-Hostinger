import assert from "node:assert";
import crypto from "node:crypto";

console.log("=== CareOS Step 5: Organization Administration, RBAC & Portal Visibility Tests ===\n");

let passed = 0;
let total = 0;

function it(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

// ============================================================================
// Mock Domain Logic Mirroring apps/api/src/routes/organization.ts
// ============================================================================

function canAssignRole(callerAuth, targetRoleName, targetRoleTenantId) {
  if (!callerAuth) return { allowed: false, code: "UNAUTHORIZED" };
  const tenantId = callerAuth.activeTenantId;

  // Cross-tenant protection
  if (targetRoleTenantId !== tenantId) {
    return { allowed: false, code: "CROSS_TENANT_FORBIDDEN" };
  }

  // Privilege escalation check
  if (targetRoleName === "tenant_admin") {
    const isSelfAdmin =
      callerAuth.isPlatformAdmin ||
      callerAuth.activeMembership?.roles.includes("tenant_admin");
    if (!isSelfAdmin) {
      return { allowed: false, code: "FORBIDDEN_ESCALATION" };
    }
  }

  // Requires tenant:manage_users permission
  const hasPerm =
    callerAuth.isPlatformAdmin ||
    callerAuth.activeMembership?.permissions.includes("tenant:manage_users");
  if (!hasPerm) {
    return { allowed: false, code: "PERMISSION_DENIED" };
  }

  return { allowed: true };
}

function createInvitation({ email, portal, roleId, departmentId, callerAuth }) {
  if (!callerAuth) throw new Error("UNAUTHORIZED");
  if (!callerAuth.activeTenantId) throw new Error("TENANT_REQUIRED");

  const hasPerm =
    callerAuth.isPlatformAdmin ||
    callerAuth.activeMembership?.permissions.includes("tenant:manage_users");
  if (!hasPerm) throw new Error("PERMISSION_DENIED");

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const token = `inv_${crypto.randomBytes(16).toString("hex")}`;

  return {
    id: crypto.randomUUID(),
    tenant_id: callerAuth.activeTenantId,
    email,
    portal,
    role_id: roleId || null,
    department_id: departmentId || null,
    token,
    invited_by: callerAuth.userId,
    expires_at: expiresAt,
    accepted_at: null,
    revoked_at: null,
    created_at: new Date().toISOString(),
  };
}

function isInvitationValid(invitation) {
  if (invitation.revoked_at !== null) return false;
  if (invitation.accepted_at !== null) return false;
  if (new Date(invitation.expires_at) <= new Date()) return false;
  return true;
}

function canAccessPortal(auth, targetPortal) {
  if (!auth) return false;
  if (targetPortal === "admin") return Boolean(auth.isPlatformAdmin);
  if (auth.activeMembership) {
    return auth.activeMembership.isActive && auth.activeMembership.portal === targetPortal;
  }
  return (auth.memberships || []).some(
    (m) => m.isActive && m.portal === targetPortal
  );
}

function canSwitchTenant(auth, targetTenantId) {
  if (!auth) return false;
  if (auth.isPlatformAdmin) return true;
  return (auth.memberships || []).some(
    (m) => m.tenantId === targetTenantId && m.isActive
  );
}

// ============================================================================
// Test Suite 1: Role Assignment & Anti-Escalation
// ============================================================================
console.log("Suite 1: Role Assignment & Anti-Escalation Enforcement");

const tenantA = "11111111-1111-1111-1111-111111111111";
const tenantB = "22222222-2222-2222-2222-222222222222";

const adminCaller = {
  userId: "user-admin-1",
  activeTenantId: tenantA,
  isPlatformAdmin: false,
  activeMembership: {
    isActive: true,
    roles: ["tenant_admin"],
    permissions: ["tenant:manage_users", "tenant:update_settings"],
  },
};

const dispatcherCaller = {
  userId: "user-dispatcher-1",
  activeTenantId: tenantA,
  isPlatformAdmin: false,
  activeMembership: {
    isActive: true,
    roles: ["dispatcher"],
    permissions: ["tenant:manage_users"], // has manage_users, but NOT tenant_admin
  },
};

const standardOperator = {
  userId: "user-operator-1",
  activeTenantId: tenantA,
  isPlatformAdmin: false,
  activeMembership: {
    isActive: true,
    roles: ["technician"],
    permissions: ["ticket:read"],
  },
};

it("allows tenant_admin to assign standard roles", () => {
  const result = canAssignRole(adminCaller, "technician", tenantA);
  assert.strictEqual(result.allowed, true);
});

it("allows tenant_admin to assign tenant_admin role to another member", () => {
  const result = canAssignRole(adminCaller, "tenant_admin", tenantA);
  assert.strictEqual(result.allowed, true);
});

it("strictly prevents non-admin (dispatcher) from escalating privileges to tenant_admin", () => {
  const result = canAssignRole(dispatcherCaller, "tenant_admin", tenantA);
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.code, "FORBIDDEN_ESCALATION");
});

it("allows dispatcher to assign non-privileged technician role", () => {
  const result = canAssignRole(dispatcherCaller, "technician", tenantA);
  assert.strictEqual(result.allowed, true);
});

it("strictly blocks caller without tenant:manage_users from assigning any role", () => {
  const result = canAssignRole(standardOperator, "technician", tenantA);
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.code, "PERMISSION_DENIED");
});

it("strictly prevents assigning a role that belongs to Tenant B to a member of Tenant A", () => {
  const result = canAssignRole(adminCaller, "technician", tenantB);
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.code, "CROSS_TENANT_FORBIDDEN");
});

// ============================================================================
// Test Suite 2: Invitation Lifecycle & Token Security
// ============================================================================
console.log("\nSuite 2: Invitation Lifecycle & Token Verification");

it("creates an invitation with secure random token and 7-day expiration", () => {
  const inv = createInvitation({
    email: "newtech@example.com",
    portal: "technician",
    roleId: "role-tech-id",
    departmentId: "dept-service-id",
    callerAuth: adminCaller,
  });

  assert.ok(inv.token.startsWith("inv_"));
  assert.strictEqual(inv.token.length > 20, true);
  assert.strictEqual(inv.email, "newtech@example.com");
  assert.strictEqual(inv.portal, "technician");
  assert.strictEqual(inv.tenant_id, tenantA);
  assert.strictEqual(isInvitationValid(inv), true);
});

it("strictly denies invitation creation if caller lacks tenant:manage_users", () => {
  assert.throws(
    () => {
      createInvitation({
        email: "hack@example.com",
        portal: "operations",
        callerAuth: standardOperator,
      });
    },
    /PERMISSION_DENIED/
  );
});

it("invalidates an invitation when revoked", () => {
  const inv = createInvitation({
    email: "revoke_me@example.com",
    portal: "customer",
    callerAuth: adminCaller,
  });

  assert.strictEqual(isInvitationValid(inv), true);
  inv.revoked_at = new Date().toISOString();
  assert.strictEqual(isInvitationValid(inv), false);
});

it("invalidates an invitation once already accepted", () => {
  const inv = createInvitation({
    email: "accepted@example.com",
    portal: "customer",
    callerAuth: adminCaller,
  });

  assert.strictEqual(isInvitationValid(inv), true);
  inv.accepted_at = new Date().toISOString();
  assert.strictEqual(isInvitationValid(inv), false);
});

it("invalidates an expired invitation (past 7 days)", () => {
  const inv = createInvitation({
    email: "expired@example.com",
    portal: "operations",
    callerAuth: adminCaller,
  });

  // Manually backdate expiration to 8 days ago
  inv.expires_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  assert.strictEqual(isInvitationValid(inv), false);
});

// ============================================================================
// Test Suite 3: Portal Visibility & Shell Route Protection
// ============================================================================
console.log("\nSuite 3: Portal Visibility & Shell Route Protection");

const techUser = {
  userId: "user-tech-1",
  isPlatformAdmin: false,
  activeMembership: {
    tenantId: tenantA,
    portal: "technician",
    isActive: true,
    roles: ["technician"],
  },
  memberships: [
    { tenantId: tenantA, portal: "technician", isActive: true },
  ],
};

const customerUser = {
  userId: "user-cust-1",
  isPlatformAdmin: false,
  activeMembership: {
    tenantId: tenantA,
    portal: "customer",
    isActive: true,
    roles: ["customer_user"],
  },
  memberships: [
    { tenantId: tenantA, portal: "customer", isActive: true },
  ],
};

const opsUser = {
  userId: "user-ops-1",
  isPlatformAdmin: false,
  activeMembership: {
    tenantId: tenantA,
    portal: "operations",
    isActive: true,
    roles: ["tenant_admin"],
  },
  memberships: [
    { tenantId: tenantA, portal: "operations", isActive: true },
  ],
};

const platformAdminUser = {
  userId: "user-platform-super",
  isPlatformAdmin: true,
  activeMembership: null,
  memberships: [],
};

it("technician can enter /technician portal", () => {
  assert.strictEqual(canAccessPortal(techUser, "technician"), true);
});

it("technician is strictly blocked from entering /operations portal", () => {
  assert.strictEqual(canAccessPortal(techUser, "operations"), false);
});

it("technician is strictly blocked from entering /customer portal", () => {
  assert.strictEqual(canAccessPortal(techUser, "customer"), false);
});

it("technician is strictly blocked from entering /admin SaaS platform area", () => {
  assert.strictEqual(canAccessPortal(techUser, "admin"), false);
});

it("customer user can enter /customer portal", () => {
  assert.strictEqual(canAccessPortal(customerUser, "customer"), true);
});

it("customer user is strictly blocked from /operations and /technician", () => {
  assert.strictEqual(canAccessPortal(customerUser, "operations"), false);
  assert.strictEqual(canAccessPortal(customerUser, "technician"), false);
});

it("operations admin can enter /operations portal", () => {
  assert.strictEqual(canAccessPortal(opsUser, "operations"), true);
});

it("operations admin is blocked from entering SaaS /admin area without platform superadmin record", () => {
  assert.strictEqual(canAccessPortal(opsUser, "admin"), false);
});

it("platform admin can access /admin area", () => {
  assert.strictEqual(canAccessPortal(platformAdminUser, "admin"), true);
});

it("deactivated member is strictly blocked from all portals", () => {
  const inactiveUser = {
    userId: "user-inactive-1",
    isPlatformAdmin: false,
    activeMembership: {
      tenantId: tenantA,
      portal: "operations",
      isActive: false, // DEACTIVATED
      roles: ["tenant_admin"],
    },
    memberships: [
      { tenantId: tenantA, portal: "operations", isActive: false },
    ],
  };

  assert.strictEqual(canAccessPortal(inactiveUser, "operations"), false);
  assert.strictEqual(canAccessPortal(inactiveUser, "technician"), false);
  assert.strictEqual(canAccessPortal(inactiveUser, "customer"), false);
  assert.strictEqual(canAccessPortal(inactiveUser, "admin"), false);
});

// ============================================================================
// Test Suite 4: Tenant Switching Authorization
// ============================================================================
console.log("\nSuite 4: Cross-Tenant Switching Boundaries");

const multiTenantUser = {
  userId: "multi-org-user",
  isPlatformAdmin: false,
  activeMembership: {
    tenantId: tenantA,
    portal: "operations",
    isActive: true,
  },
  memberships: [
    { tenantId: tenantA, portal: "operations", isActive: true },
    { tenantId: tenantB, portal: "operations", isActive: true },
  ],
};

const foreignTenant = "99999999-9999-9999-9999-999999999999";

it("allows multi-tenant user to switch to authorized Tenant B", () => {
  assert.strictEqual(canSwitchTenant(multiTenantUser, tenantB), true);
});

it("strictly rejects switching to foreign unowned Tenant", () => {
  assert.strictEqual(canSwitchTenant(multiTenantUser, foreignTenant), false);
});

it("platform admin can inspect any tenant", () => {
  assert.strictEqual(canSwitchTenant(platformAdminUser, foreignTenant), true);
});

// ============================================================================
// Summary
// ============================================================================
console.log(`\nResults: ${passed} passed, ${total - passed} failed out of ${total} tests.`);
if (passed === total) {
  console.log("All Step 5 Organization Administration & Portal Shell tests PASSED successfully!\n");
} else {
  process.exit(1);
}
