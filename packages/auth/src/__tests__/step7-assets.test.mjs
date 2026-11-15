import assert from "node:assert";
import crypto from "node:crypto";

console.log("=== CareOS Step 7: Fleet & Asset Registry, History & Tenant Isolation Tests ===\n");

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
// In-Memory Database & Logic Mirroring Step 7 Migration & Fastify Routes
// ============================================================================

const tenantA = "11111111-1111-1111-1111-111111111111";
const tenantB = "22222222-2222-2222-2222-222222222222";

const db = {
  assetCategories: [],
  assets: [],
  assetAssignments: [],
  customerAccounts: [],
  customerSites: [],
  customerUsers: [],
  auditLogs: [],
};

function resetDb() {
  db.assetCategories = [];
  db.assets = [];
  db.assetAssignments = [];
  db.customerAccounts = [];
  db.customerSites = [];
  db.customerUsers = [];
  db.auditLogs = [];
}

function createCategory(tenantId, callerAuth, payload) {
  if (!callerAuth) throw new Error("UNAUTHORIZED");
  if (!callerAuth.isPlatformAdmin && callerAuth.portal !== "operations") {
    throw new Error("FORBIDDEN: Operations role required");
  }

  const existing = db.assetCategories.find(
    (c) =>
      c.tenant_id === tenantId &&
      (c.name.toLowerCase() === payload.name.toLowerCase() ||
        c.code.toUpperCase() === payload.code.toUpperCase())
  );

  if (existing) {
    throw new Error("UNIQUE_VIOLATION: Asset category name or code already exists in this tenant");
  }

  const cat = {
    id: payload.id || crypto.randomUUID(),
    tenant_id: tenantId,
    name: payload.name,
    code: payload.code.toUpperCase(),
    asset_type: payload.assetType || "vehicle",
    is_active: true,
    created_at: new Date().toISOString(),
  };

  db.assetCategories.push(cat);
  return cat;
}

function createAsset(tenantId, callerAuth, payload) {
  if (!callerAuth) throw new Error("UNAUTHORIZED");
  if (!callerAuth.isPlatformAdmin && callerAuth.portal !== "operations") {
    throw new Error("FORBIDDEN: Operations role required");
  }
  if (callerAuth.activeTenantId !== tenantId) throw new Error("CROSS_TENANT_FORBIDDEN");

  // Validate required fields
  if (!payload.name || !payload.make || !payload.model || !payload.customerAccountId || !payload.categoryId) {
    throw new Error("VALIDATION_ERROR: Missing mandatory asset fields");
  }

  const tag =
    payload.assetTag ||
    `AST-${Date.now().toString().slice(-4)}-${crypto.randomBytes(2).toString("hex")}`;
  const vin = payload.vin ? payload.vin.toUpperCase() : null;

  // Uniqueness check: asset_tag per tenant
  if (db.assets.some((a) => a.tenant_id === tenantId && a.asset_tag === tag)) {
    throw new Error("UNIQUE_VIOLATION: Asset tag already exists in this tenant");
  }

  // Uniqueness check: VIN per tenant
  if (vin && db.assets.some((a) => a.tenant_id === tenantId && a.vin === vin)) {
    throw new Error("UNIQUE_VIOLATION: VIN already exists in this tenant");
  }

  // Uniqueness check: fleet_number per customer account
  if (
    payload.fleetNumber &&
    db.assets.some(
      (a) =>
        a.tenant_id === tenantId &&
        a.customer_account_id === payload.customerAccountId &&
        a.fleet_number === payload.fleetNumber
    )
  ) {
    throw new Error("UNIQUE_VIOLATION: Fleet number already exists for this customer account");
  }

  const asset = {
    id: payload.id || crypto.randomUUID(),
    tenant_id: tenantId,
    customer_account_id: payload.customerAccountId,
    site_id: payload.siteId || null,
    category_id: payload.categoryId,
    asset_tag: tag,
    fleet_number: payload.fleetNumber || null,
    name: payload.name,
    vin,
    plate_number: payload.plateNumber || null,
    make: payload.make,
    model: payload.model,
    model_year: payload.modelYear || null,
    operational_status: payload.operationalStatus || "active",
    service_status: payload.serviceStatus || "operational",
    odometer_reading: payload.odometerReading || 0,
    created_at: new Date().toISOString(),
  };

  db.assets.push(asset);

  // Trigger: Initial assignment record created automatically
  db.assetAssignments.push({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    asset_id: asset.id,
    customer_account_id: asset.customer_account_id,
    site_id: asset.site_id,
    assignment_type: "initial",
    start_date: asset.created_at,
    end_date: null,
    reason: "Initial asset registration",
  });

  db.auditLogs.push({
    tenant_id: tenantId,
    user_id: callerAuth.userId,
    action: "asset.created",
    resource_type: "assets",
    resource_id: asset.id,
  });

  return asset;
}

function updateAsset(tenantId, assetId, callerAuth, updates) {
  if (!callerAuth) throw new Error("UNAUTHORIZED");
  if (!callerAuth.isPlatformAdmin && callerAuth.portal !== "operations") {
    throw new Error("FORBIDDEN");
  }

  const asset = db.assets.find((a) => a.id === assetId && a.tenant_id === tenantId);
  if (!asset) throw new Error("ASSET_NOT_FOUND");

  const oldCustomerId = asset.customer_account_id;
  const oldSiteId = asset.site_id;

  // Apply updates
  if (updates.name !== undefined) asset.name = updates.name;
  if (updates.operationalStatus !== undefined) asset.operational_status = updates.operationalStatus;
  if (updates.serviceStatus !== undefined) asset.service_status = updates.serviceStatus;
  if (updates.odometerReading !== undefined) asset.odometer_reading = updates.odometerReading;

  // Location / Customer transfer logic mirroring database trigger
  if (
    (updates.siteId !== undefined && updates.siteId !== oldSiteId) ||
    (updates.customerAccountId !== undefined && updates.customerAccountId !== oldCustomerId)
  ) {
    const isCustomerTransfer =
      updates.customerAccountId !== undefined && updates.customerAccountId !== oldCustomerId;

    if (updates.customerAccountId !== undefined) asset.customer_account_id = updates.customerAccountId;
    if (updates.siteId !== undefined) asset.site_id = updates.siteId;

    // Close previous assignment
    const currentAssignment = db.assetAssignments.find(
      (h) => h.asset_id === assetId && h.end_date === null
    );
    if (currentAssignment) {
      currentAssignment.end_date = new Date().toISOString();
    }

    // Insert new assignment
    db.assetAssignments.push({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      asset_id: assetId,
      customer_account_id: asset.customer_account_id,
      site_id: asset.site_id,
      assignment_type: isCustomerTransfer ? "ownership_transfer" : "site_transfer",
      start_date: new Date().toISOString(),
      end_date: null,
      reason: updates.reason || (isCustomerTransfer ? "Ownership transfer" : "Site transfer"),
    });
  }

  return asset;
}

function canAccessAsset(callerAuth, tenantId, assetId) {
  if (!callerAuth) return false;
  if (!callerAuth.isPlatformAdmin && callerAuth.activeTenantId !== tenantId) return false;

  if (callerAuth.isPlatformAdmin || callerAuth.portal === "operations" || callerAuth.portal === "technician") {
    return true;
  }

  // Customer portal user: must be linked to the customer account owning this asset
  if (callerAuth.portal === "customer") {
    const asset = db.assets.find((a) => a.id === assetId && a.tenant_id === tenantId);
    if (!asset) return false;

    return db.customerUsers.some(
      (cu) =>
        cu.tenant_id === tenantId &&
        cu.customer_account_id === asset.customer_account_id &&
        cu.user_id === callerAuth.userId &&
        cu.is_active === true
    );
  }

  return false;
}

function getAccessibleAssets(callerAuth, tenantId) {
  if (!callerAuth) return [];
  if (!callerAuth.isPlatformAdmin && callerAuth.activeTenantId !== tenantId) return [];

  if (callerAuth.isPlatformAdmin || callerAuth.portal === "operations" || callerAuth.portal === "technician") {
    return db.assets.filter((a) => a.tenant_id === tenantId);
  }

  if (callerAuth.portal === "customer") {
    const linkedCustomerIds = db.customerUsers
      .filter((cu) => cu.tenant_id === tenantId && cu.user_id === callerAuth.userId && cu.is_active)
      .map((cu) => cu.customer_account_id);

    return db.assets.filter(
      (a) => a.tenant_id === tenantId && linkedCustomerIds.includes(a.customer_account_id)
    );
  }

  return [];
}

// ============================================================================
// Test Suite 1: Asset Categories & Creation Constraints
// ============================================================================
console.log("Suite 1: Asset Categories & Creation Integrity");
resetDb();

const opsCallerA = {
  userId: "ops-user-1",
  activeTenantId: tenantA,
  portal: "operations",
  isPlatformAdmin: false,
};

const custUser1 = {
  userId: "cust-user-1",
  activeTenantId: tenantA,
  portal: "customer",
  isPlatformAdmin: false,
};

const custUser2 = {
  userId: "cust-user-2",
  activeTenantId: tenantA,
  portal: "customer",
  isPlatformAdmin: false,
};

it("allows operations staff to create asset categories", () => {
  const cat = createCategory(tenantA, opsCallerA, {
    id: "cat-hcv",
    name: "Heavy Commercial Vehicle",
    code: "HCV",
    assetType: "vehicle",
  });

  assert.strictEqual(cat.name, "Heavy Commercial Vehicle");
  assert.strictEqual(cat.code, "HCV");
  assert.strictEqual(cat.tenant_id, tenantA);
});

it("enforces unique category code and name per tenant", () => {
  assert.throws(
    () => {
      createCategory(tenantA, opsCallerA, {
        name: "Different Name",
        code: "HCV", // Duplicate code
      });
    },
    /UNIQUE_VIOLATION/
  );
});

it("allows operations staff to register a vehicle with VIN and fleet number", () => {
  const asset = createAsset(tenantA, opsCallerA, {
    id: "asset-trk-1",
    name: "Actros 1845 Long Haul Truck",
    customerAccountId: "cust-acc-1",
    siteId: "site-depot-1",
    categoryId: "cat-hcv",
    assetTag: "AST-1001",
    fleetNumber: "FLT-01",
    vin: "WDB9634031L123456",
    plateNumber: "1234 KSA",
    make: "Mercedes-Benz",
    model: "Actros",
    modelYear: 2023,
    odometerReading: 45000,
  });

  assert.strictEqual(asset.name, "Actros 1845 Long Haul Truck");
  assert.strictEqual(asset.vin, "WDB9634031L123456");
  assert.strictEqual(asset.fleet_number, "FLT-01");
});

it("enforces unique VIN constraint per tenant", () => {
  assert.throws(
    () => {
      createAsset(tenantA, opsCallerA, {
        name: "Duplicate VIN Vehicle",
        customerAccountId: "cust-acc-1",
        categoryId: "cat-hcv",
        assetTag: "AST-1002",
        vin: "WDB9634031L123456", // Duplicate VIN
        make: "Mercedes",
        model: "Actros",
      });
    },
    /UNIQUE_VIOLATION/
  );
});

it("enforces unique Asset Tag per tenant", () => {
  assert.throws(
    () => {
      createAsset(tenantA, opsCallerA, {
        name: "Duplicate Tag Vehicle",
        customerAccountId: "cust-acc-1",
        categoryId: "cat-hcv",
        assetTag: "AST-1001", // Duplicate Tag
        vin: "NEWVIN12345678901",
        make: "Volvo",
        model: "FH",
      });
    },
    /UNIQUE_VIOLATION/
  );
});

it("enforces unique customer fleet number within the same customer account", () => {
  assert.throws(
    () => {
      createAsset(tenantA, opsCallerA, {
        name: "Duplicate Fleet No Vehicle",
        customerAccountId: "cust-acc-1", // Same customer
        categoryId: "cat-hcv",
        fleetNumber: "FLT-01", // Duplicate fleet #
        make: "MAN",
        model: "TGX",
      });
    },
    /UNIQUE_VIOLATION/
  );
});

// ============================================================================
// Test Suite 2: History-Aware Assignments & Location Transfers
// ============================================================================
console.log("\nSuite 2: History-Aware Location Transfers & Assignment Timeline");

it("automatically records initial assignment on asset registration", () => {
  const history = db.assetAssignments.filter((h) => h.asset_id === "asset-trk-1");
  assert.strictEqual(history.length, 1);
  assert.strictEqual(history[0].assignment_type, "initial");
  assert.strictEqual(history[0].site_id, "site-depot-1");
  assert.strictEqual(history[0].end_date, null); // Active
});

it("automatically closes previous assignment and creates new record on site transfer", () => {
  // Transfer asset-trk-1 to site-depot-2
  updateAsset(tenantA, "asset-trk-1", opsCallerA, {
    siteId: "site-depot-2",
    reason: "Relocated to Jeddah Logistics Hub",
  });

  const history = db.assetAssignments.filter((h) => h.asset_id === "asset-trk-1");
  assert.strictEqual(history.length, 2);

  // Initial assignment should now be closed
  const initialAssign = history.find((h) => h.assignment_type === "initial");
  assert.ok(initialAssign.end_date !== null);

  // New site_transfer assignment should be active
  const transferAssign = history.find((h) => h.assignment_type === "site_transfer");
  assert.ok(transferAssign);
  assert.strictEqual(transferAssign.site_id, "site-depot-2");
  assert.strictEqual(transferAssign.end_date, null);
  assert.strictEqual(transferAssign.reason, "Relocated to Jeddah Logistics Hub");
});

it("automatically creates ownership_transfer record on customer transfer", () => {
  // Transfer asset-trk-1 to cust-acc-2
  updateAsset(tenantA, "asset-trk-1", opsCallerA, {
    customerAccountId: "cust-acc-2",
    siteId: "site-acc2-branch",
    reason: "Sold to Beta Logistics",
  });

  const history = db.assetAssignments.filter((h) => h.asset_id === "asset-trk-1");
  assert.strictEqual(history.length, 3);

  const latest = history[history.length - 1];
  assert.strictEqual(latest.assignment_type, "ownership_transfer");
  assert.strictEqual(latest.customer_account_id, "cust-acc-2");
  assert.strictEqual(latest.end_date, null);
});

// ============================================================================
// Test Suite 3: Tenant & Customer Portal Scope Isolation (Zero Leakage)
// ============================================================================
console.log("\nSuite 3: Cross-Account & Tenant Scope Isolation");

// Create second asset owned by cust-acc-1
createAsset(tenantA, opsCallerA, {
  id: "asset-acc1-reefer",
  name: "Carrier Vector Reefer Unit 01",
  customerAccountId: "cust-acc-1",
  categoryId: "cat-hcv",
  make: "Carrier",
  model: "Vector 1550",
});

// Create third asset owned by cust-acc-2
createAsset(tenantA, opsCallerA, {
  id: "asset-acc2-van",
  name: "Toyota Hilux Service Van",
  customerAccountId: "cust-acc-2",
  categoryId: "cat-hcv",
  make: "Toyota",
  model: "Hilux",
});

// Customer user 1 is linked ONLY to cust-acc-1
db.customerUsers.push({
  id: "cu-link-1",
  tenant_id: tenantA,
  customer_account_id: "cust-acc-1",
  user_id: custUser1.userId,
  is_active: true,
});

// Customer user 2 is linked ONLY to cust-acc-2
db.customerUsers.push({
  id: "cu-link-2",
  tenant_id: tenantA,
  customer_account_id: "cust-acc-2",
  user_id: custUser2.userId,
  is_active: true,
});

it("allows Customer User 1 to view assets belonging to Customer Account 1", () => {
  assert.strictEqual(
    canAccessAsset(custUser1, tenantA, "asset-acc1-reefer"),
    true
  );
});

it("STRICTLY BLOCKS Customer User 1 from accessing Customer Account 2's asset (Zero Leakage)", () => {
  assert.strictEqual(
    canAccessAsset(custUser1, tenantA, "asset-acc2-van"),
    false
  );
});

it("allows Customer User 2 to view assets belonging to Customer Account 2", () => {
  assert.strictEqual(
    canAccessAsset(custUser2, tenantA, "asset-acc2-van"),
    true
  );
});

it("STRICTLY BLOCKS Customer User 2 from accessing Customer Account 1's asset", () => {
  assert.strictEqual(
    canAccessAsset(custUser2, tenantA, "asset-acc1-reefer"),
    false
  );
});

it("filters customer portal asset directory to return ONLY Customer User 1's owned assets", () => {
  const assetsForUser1 = getAccessibleAssets(custUser1, tenantA);
  assert.strictEqual(assetsForUser1.length, 1);
  assert.strictEqual(assetsForUser1[0].id, "asset-acc1-reefer");
});

it("filters customer portal asset directory to return ONLY Customer User 2's owned assets", () => {
  const assetsForUser2 = getAccessibleAssets(custUser2, tenantA);
  // User 2 owns asset-acc2-van and the transferred asset-trk-1
  assert.strictEqual(assetsForUser2.length, 2);
  const ids = assetsForUser2.map((a) => a.id);
  assert.ok(ids.includes("asset-acc2-van"));
  assert.ok(ids.includes("asset-trk-1"));
});

it("allows operations staff to see all assets in their tenant", () => {
  const allTenantAAssets = getAccessibleAssets(opsCallerA, tenantA);
  assert.strictEqual(allTenantAAssets.length, 3);
});

it("strictly prevents operations staff in Tenant B from seeing Tenant A assets", () => {
  const opsCallerB = {
    userId: "ops-user-b",
    activeTenantId: tenantB,
    portal: "operations",
    isPlatformAdmin: false,
  };

  const assetsForB = getAccessibleAssets(opsCallerB, tenantA);
  assert.strictEqual(assetsForB.length, 0);
});

// ============================================================================
// Summary
// ============================================================================
console.log(`\nResults: ${passed} passed, ${total - passed} failed out of ${total} tests.`);
if (passed === total) {
  console.log("All Step 7 Fleet & Asset Registry, History & Isolation tests PASSED successfully!\n");
} else {
  process.exit(1);
}
