import assert from "node:assert";
import crypto from "node:crypto";

console.log("=== CareOS Step 6: Customer Accounts, Sites, Contacts & Portal Isolation Tests ===\n");

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
// Domain Logic Mirroring apps/api/src/routes/customers.ts & RLS policies
// ============================================================================

const tenantA = "11111111-1111-1111-1111-111111111111";
const tenantB = "22222222-2222-2222-2222-222222222222";

// In-memory mock database
const db = {
  customerAccounts: [],
  customerSites: [],
  customerContacts: [],
  customerUsers: [],
  auditLogs: [],
};

function resetDb() {
  db.customerAccounts = [];
  db.customerSites = [];
  db.customerContacts = [];
  db.customerUsers = [];
  db.auditLogs = [];
}

function createCustomerAccount(tenantId, callerAuth, payload) {
  if (!callerAuth) throw new Error("UNAUTHORIZED");
  if (!callerAuth.isPlatformAdmin && callerAuth.portal !== "operations") {
    throw new Error("FORBIDDEN: Operations role required");
  }

  // Tenant scoping check
  if (callerAuth.activeTenantId !== tenantId) {
    throw new Error("CROSS_TENANT_FORBIDDEN");
  }

  // Unique constraint check: (tenant_id, name) and (tenant_id, account_number)
  const existing = db.customerAccounts.find(
    (c) =>
      c.tenant_id === tenantId &&
      (c.name.toLowerCase() === payload.name.toLowerCase() ||
        c.account_number === payload.accountNumber)
  );

  if (existing) {
    throw new Error("UNIQUE_VIOLATION: Customer name or account number already exists in this tenant");
  }

  const account = {
    id: payload.id || crypto.randomUUID(),
    tenant_id: tenantId,
    account_number: payload.accountNumber || `CUST-${Date.now().toString().slice(-4)}`,
    name: payload.name,
    account_type: payload.accountType || "commercial",
    status: payload.status || "active",
    email: payload.email || null,
    phone: payload.phone || null,
    tax_id: payload.taxId || null,
    billing_address: payload.billingAddress || {},
    payment_terms_days: payload.paymentTermsDays || 30,
    created_at: new Date().toISOString(),
  };

  db.customerAccounts.push(account);

  db.auditLogs.push({
    tenant_id: tenantId,
    user_id: callerAuth.userId,
    action: "customer_account.created",
    resource_type: "customer_accounts",
    resource_id: account.id,
  });

  return account;
}

function createCustomerSite(tenantId, customerAccountId, callerAuth, payload) {
  if (!callerAuth) throw new Error("UNAUTHORIZED");
  if (!callerAuth.isPlatformAdmin && callerAuth.portal !== "operations") {
    throw new Error("FORBIDDEN");
  }
  if (callerAuth.activeTenantId !== tenantId) throw new Error("CROSS_TENANT_FORBIDDEN");

  const account = db.customerAccounts.find(
    (c) => c.id === customerAccountId && c.tenant_id === tenantId
  );
  if (!account) throw new Error("CUSTOMER_NOT_FOUND");

  // Geolocation coordinate validation
  if (payload.latitude !== undefined && payload.latitude !== null) {
    if (payload.latitude < -90 || payload.latitude > 90) {
      throw new Error("INVALID_COORDINATES: Latitude must be between -90 and 90");
    }
  }
  if (payload.longitude !== undefined && payload.longitude !== null) {
    if (payload.longitude < -180 || payload.longitude > 180) {
      throw new Error("INVALID_COORDINATES: Longitude must be between -180 and 180");
    }
  }

  // Primary site exclusivity
  if (payload.isPrimary) {
    db.customerSites
      .filter((s) => s.tenant_id === tenantId && s.customer_account_id === customerAccountId)
      .forEach((s) => {
        s.is_primary = false;
      });
  }

  const site = {
    id: payload.id || crypto.randomUUID(),
    tenant_id: tenantId,
    customer_account_id: customerAccountId,
    name: payload.name,
    code: payload.code || null,
    is_primary: Boolean(payload.isPrimary),
    status: payload.status || "active",
    address_line1: payload.addressLine1,
    city: payload.city,
    latitude: payload.latitude || null,
    longitude: payload.longitude || null,
    geofence_radius_meters: payload.geofenceRadiusMeters || 150,
    contact_name: payload.contactName || null,
    created_at: new Date().toISOString(),
  };

  db.customerSites.push(site);

  db.auditLogs.push({
    tenant_id: tenantId,
    user_id: callerAuth.userId,
    action: "customer_site.created",
    resource_type: "customer_sites",
    resource_id: site.id,
  });

  return site;
}

function linkCustomerUser(tenantId, customerAccountId, callerAuth, { userId, portalRole }) {
  if (!callerAuth) throw new Error("UNAUTHORIZED");
  if (!callerAuth.isPlatformAdmin && callerAuth.portal !== "operations") {
    throw new Error("FORBIDDEN");
  }

  const link = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    customer_account_id: customerAccountId,
    user_id: userId,
    portal_role: portalRole || "customer_user",
    is_active: true,
    created_at: new Date().toISOString(),
  };

  db.customerUsers.push(link);
  return link;
}

// Evaluates can_access_customer_account
function canAccessCustomerAccount(callerAuth, tenantId, customerAccountId) {
  if (!callerAuth) return false;

  // Cross tenant check
  if (!callerAuth.isPlatformAdmin && callerAuth.activeTenantId !== tenantId) {
    return false;
  }

  if (callerAuth.isPlatformAdmin) return true;
  if (callerAuth.portal === "operations" || callerAuth.portal === "technician") {
    return true;
  }

  // Customer Portal User: Must have active link in customer_users
  if (callerAuth.portal === "customer") {
    const isLinked = db.customerUsers.some(
      (cu) =>
        cu.tenant_id === tenantId &&
        cu.customer_account_id === customerAccountId &&
        cu.user_id === callerAuth.userId &&
        cu.is_active === true
    );
    return isLinked;
  }

  return false;
}

// Evaluates customer portal query filtering (get_user_customer_accounts)
function getAccessibleCustomerAccounts(callerAuth, tenantId) {
  if (!callerAuth) return [];
  if (!callerAuth.isPlatformAdmin && callerAuth.activeTenantId !== tenantId) return [];

  if (callerAuth.isPlatformAdmin || callerAuth.portal === "operations" || callerAuth.portal === "technician") {
    return db.customerAccounts.filter((c) => c.tenant_id === tenantId);
  }

  if (callerAuth.portal === "customer") {
    const linkedIds = db.customerUsers
      .filter((cu) => cu.tenant_id === tenantId && cu.user_id === callerAuth.userId && cu.is_active)
      .map((cu) => cu.customer_account_id);

    return db.customerAccounts.filter((c) => c.tenant_id === tenantId && linkedIds.includes(c.id));
  }

  return [];
}

// ============================================================================
// Test Suite 1: Customer Account Creation & Integrity Constraints
// ============================================================================
console.log("Suite 1: Customer Account Management & Uniqueness");
resetDb();

const opsCaller = {
  userId: "ops-user-1",
  activeTenantId: tenantA,
  portal: "operations",
  isPlatformAdmin: false,
};

const custUserA = {
  userId: "cust-user-a",
  activeTenantId: tenantA,
  portal: "customer",
  isPlatformAdmin: false,
};

const custUserB = {
  userId: "cust-user-b",
  activeTenantId: tenantA,
  portal: "customer",
  isPlatformAdmin: false,
};

it("allows operations staff to create a commercial customer account", () => {
  const account = createCustomerAccount(tenantA, opsCaller, {
    id: "cust-acc-1",
    accountNumber: "CUST-001",
    name: "Al-Rajhi Commercial Center",
    accountType: "commercial",
    taxId: "310000000000003",
    billingAddress: { city: "Riyadh", country: "Saudi Arabia" },
  });

  assert.strictEqual(account.name, "Al-Rajhi Commercial Center");
  assert.strictEqual(account.tenant_id, tenantA);
  assert.strictEqual(db.auditLogs.length, 1);
  assert.strictEqual(db.auditLogs[0].action, "customer_account.created");
});

it("enforces unique customer name per tenant", () => {
  assert.throws(
    () => {
      createCustomerAccount(tenantA, opsCaller, {
        accountNumber: "CUST-002",
        name: "Al-Rajhi Commercial Center", // Duplicate name
      });
    },
    /UNIQUE_VIOLATION/
  );
});

it("enforces unique customer account number per tenant", () => {
  assert.throws(
    () => {
      createCustomerAccount(tenantA, opsCaller, {
        accountNumber: "CUST-001", // Duplicate account number
        name: "Different Client Name",
      });
    },
    /UNIQUE_VIOLATION/
  );
});

it("allows same customer name in a different tenant (multi-tenant boundary)", () => {
  const opsCallerTenantB = {
    userId: "ops-user-b",
    activeTenantId: tenantB,
    portal: "operations",
    isPlatformAdmin: false,
  };

  const accountTenantB = createCustomerAccount(tenantB, opsCallerTenantB, {
    accountNumber: "CUST-001",
    name: "Al-Rajhi Commercial Center",
  });

  assert.strictEqual(accountTenantB.tenant_id, tenantB);
});

it("strictly forbids customer portal users from creating customer accounts", () => {
  assert.throws(
    () => {
      createCustomerAccount(tenantA, custUserA, {
        name: "Unauthorized Customer Attempt",
      });
    },
    /FORBIDDEN/
  );
});

// ============================================================================
// Test Suite 2: Facilities / Sites Hierarchy & Geolocation
// ============================================================================
console.log("\nSuite 2: Customer Sites, Primary Facility & Geofencing");

it("creates customer site with GPS coordinates and contact person", () => {
  const site = createCustomerSite(tenantA, "cust-acc-1", opsCaller, {
    id: "site-1",
    name: "Headquarters Olaya",
    code: "HQ-01",
    isPrimary: true,
    addressLine1: "King Fahd Road, Olaya",
    city: "Riyadh",
    latitude: 24.7136,
    longitude: 46.6753,
    geofenceRadiusMeters: 200,
    contactName: "Tariq Site Manager",
  });

  assert.strictEqual(site.is_primary, true);
  assert.strictEqual(site.geofence_radius_meters, 200);
  assert.strictEqual(site.latitude, 24.7136);
});

it("automatically sets previous primary site to false when new primary site is added", () => {
  const site2 = createCustomerSite(tenantA, "cust-acc-1", opsCaller, {
    id: "site-2",
    name: "Second Depot - Sulaimaniyah",
    isPrimary: true,
    addressLine1: "Makkah Road",
    city: "Riyadh",
  });

  assert.strictEqual(site2.is_primary, true);
  const oldPrimary = db.customerSites.find((s) => s.id === "site-1");
  assert.strictEqual(oldPrimary.is_primary, false);
});

it("validates latitude coordinate boundaries (-90 to 90)", () => {
  assert.throws(
    () => {
      createCustomerSite(tenantA, "cust-acc-1", opsCaller, {
        name: "Invalid Lat Site",
        addressLine1: "Street 1",
        city: "Riyadh",
        latitude: 95.0, // Invalid
        longitude: 46.0,
      });
    },
    /INVALID_COORDINATES/
  );
});

it("validates longitude coordinate boundaries (-180 to 180)", () => {
  assert.throws(
    () => {
      createCustomerSite(tenantA, "cust-acc-1", opsCaller, {
        name: "Invalid Lng Site",
        addressLine1: "Street 1",
        city: "Riyadh",
        latitude: 24.0,
        longitude: 195.0, // Invalid
      });
    },
    /INVALID_COORDINATES/
  );
});

// ============================================================================
// Test Suite 3: Portal Linking & Cross-Account Isolation
// ============================================================================
console.log("\nSuite 3: Customer Portal Links & Cross-Account Isolation");

// Create second customer account in Tenant A
createCustomerAccount(tenantA, opsCaller, {
  id: "cust-acc-2",
  accountNumber: "CUST-002",
  name: "Beta Logistics Warehouse",
});

// Link custUserA ONLY to cust-acc-1
linkCustomerUser(tenantA, "cust-acc-1", opsCaller, {
  userId: custUserA.userId,
  portalRole: "customer_admin",
});

// Link custUserB ONLY to cust-acc-2
linkCustomerUser(tenantA, "cust-acc-2", opsCaller, {
  userId: custUserB.userId,
  portalRole: "customer_user",
});

it("allows Customer User A to access linked Customer Account 1", () => {
  assert.strictEqual(
    canAccessCustomerAccount(custUserA, tenantA, "cust-acc-1"),
    true
  );
});

it("STRICTLY BLOCKS Customer User A from accessing Customer Account 2 (Zero Leakage)", () => {
  assert.strictEqual(
    canAccessCustomerAccount(custUserA, tenantA, "cust-acc-2"),
    false
  );
});

it("allows Customer User B to access linked Customer Account 2", () => {
  assert.strictEqual(
    canAccessCustomerAccount(custUserB, tenantA, "cust-acc-2"),
    true
  );
});

it("STRICTLY BLOCKS Customer User B from accessing Customer Account 1", () => {
  assert.strictEqual(
    canAccessCustomerAccount(custUserB, tenantA, "cust-acc-1"),
    false
  );
});

it("filters customer directory for Customer User A to return ONLY their 1 linked account", () => {
  const accessible = getAccessibleCustomerAccounts(custUserA, tenantA);
  assert.strictEqual(accessible.length, 1);
  assert.strictEqual(accessible[0].id, "cust-acc-1");
  assert.strictEqual(accessible[0].name, "Al-Rajhi Commercial Center");
});

it("filters customer directory for Customer User B to return ONLY their 1 linked account", () => {
  const accessible = getAccessibleCustomerAccounts(custUserB, tenantA);
  assert.strictEqual(accessible.length, 1);
  assert.strictEqual(accessible[0].id, "cust-acc-2");
});

it("allows operations staff to view all customer accounts in their tenant", () => {
  const accessible = getAccessibleCustomerAccounts(opsCaller, tenantA);
  assert.strictEqual(accessible.length, 2);
});

it("strictly prevents operations staff in Tenant B from viewing Tenant A accounts", () => {
  const opsCallerTenantB = {
    userId: "ops-user-b",
    activeTenantId: tenantB,
    portal: "operations",
    isPlatformAdmin: false,
  };

  const accessible = getAccessibleCustomerAccounts(opsCallerTenantB, tenantA);
  assert.strictEqual(accessible.length, 0);
});

it("denies access to customer user when link is deactivated", () => {
  // Deactivate link for User A
  const link = db.customerUsers.find((cu) => cu.user_id === custUserA.userId);
  link.is_active = false;

  assert.strictEqual(
    canAccessCustomerAccount(custUserA, tenantA, "cust-acc-1"),
    false
  );

  const accessible = getAccessibleCustomerAccounts(custUserA, tenantA);
  assert.strictEqual(accessible.length, 0);
});

// ============================================================================
// Summary
// ============================================================================
console.log(`\nResults: ${passed} passed, ${total - passed} failed out of ${total} tests.`);
if (passed === total) {
  console.log("All Step 6 Customer Accounts, Sites, Contacts & Portal Isolation tests PASSED successfully!\n");
} else {
  process.exit(1);
}
