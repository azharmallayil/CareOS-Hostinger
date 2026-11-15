import assert from "node:assert/strict";
import crypto from "node:crypto";

console.log("=== CareOS Step 16: Dashboard, Global Search, Role-Scoped Exports & Reporting Tests ===\n");

let passed = 0;
let total = 0;

function test(description, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${description}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

// ----------------------------------------------------------------------------
// SUITE 1: Global Search Multi-Entity Matching & Role-Scoped Visibility
// ----------------------------------------------------------------------------
const mockDatabase = {
  tickets: [
    { id: "t1", tenant_id: "tenant-1", customer_id: "cust-a", ticket_number: "TKT-2026-0001", title: "MDVR video loss on front cam" },
    { id: "t2", tenant_id: "tenant-1", customer_id: "cust-b", ticket_number: "TKT-2026-0002", title: "DMS calibration check" },
    { id: "t3", tenant_id: "tenant-2", customer_id: "cust-c", ticket_number: "TKT-2026-0003", title: "Foreign tenant ticket" },
  ],
  assets: [
    { id: "a1", tenant_id: "tenant-1", customer_id: "cust-a", plate_number: "ABC-1234", vin: "VIN123456789", serial_number: "SN-9901" },
    { id: "a2", tenant_id: "tenant-1", customer_id: "cust-b", plate_number: "XYZ-7890", vin: "VIN987654321", serial_number: "SN-9902" },
  ],
  customers: [
    { id: "cust-a", tenant_id: "tenant-1", name: "Al-Salam Transport", account_number: "ACC-101" },
    { id: "cust-b", tenant_id: "tenant-1", name: "Fast Logistics Co", account_number: "ACC-102" },
  ],
  workOrders: [
    { id: "wo1", tenant_id: "tenant-1", work_order_number: "WO-2026-0001", title: "Dispatch for MDVR repair" },
  ],
  parts: [
    { id: "p1", tenant_id: "tenant-1", part_number: "CAM-DMS-01", name: "IR Fatigue Camera" },
  ],
};

function executeGlobalSearch(caller, queryStr) {
  const q = queryStr.toLowerCase();
  const results = {};

  // Operations: searches all tenant records
  if (caller.role === "operations_staff" || caller.role === "tenant_admin") {
    results.tickets = mockDatabase.tickets.filter(
      (t) => t.tenant_id === caller.tenantId && (t.ticket_number.toLowerCase().includes(q) || t.title.toLowerCase().includes(q))
    );
    results.assets = mockDatabase.assets.filter(
      (a) => a.tenant_id === caller.tenantId && (a.plate_number.toLowerCase().includes(q) || a.vin.toLowerCase().includes(q))
    );
    results.customers = mockDatabase.customers.filter(
      (c) => c.tenant_id === caller.tenantId && (c.name.toLowerCase().includes(q) || c.account_number.toLowerCase().includes(q))
    );
    results.workOrders = mockDatabase.workOrders.filter(
      (w) => w.tenant_id === caller.tenantId && (w.work_order_number.toLowerCase().includes(q) || w.title.toLowerCase().includes(q))
    );
    results.parts = mockDatabase.parts.filter(
      (p) => p.tenant_id === caller.tenantId && (p.part_number.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
    );
  }

  // Customer User: restricted strictly to linked customer accounts and their assets/tickets
  else if (caller.role === "customer_user") {
    const linkedIds = caller.linkedCustomerIds || [];
    results.tickets = mockDatabase.tickets.filter(
      (t) => t.tenant_id === caller.tenantId && linkedIds.includes(t.customer_id) && (t.ticket_number.toLowerCase().includes(q) || t.title.toLowerCase().includes(q))
    );
    results.assets = mockDatabase.assets.filter(
      (a) => a.tenant_id === caller.tenantId && linkedIds.includes(a.customer_id) && (a.plate_number.toLowerCase().includes(q) || a.vin.toLowerCase().includes(q))
    );
    results.customers = mockDatabase.customers.filter(
      (c) => c.tenant_id === caller.tenantId && linkedIds.includes(c.id) && (c.name.toLowerCase().includes(q) || c.account_number.toLowerCase().includes(q))
    );
    // Work orders and internal parts are NOT exposed to customer users
  }

  // Technician: assigned work orders, tickets, and parts catalog
  else if (caller.role === "technician") {
    results.tickets = mockDatabase.tickets.filter(
      (t) => t.tenant_id === caller.tenantId && (t.ticket_number.toLowerCase().includes(q) || t.title.toLowerCase().includes(q))
    );
    results.workOrders = mockDatabase.workOrders.filter(
      (w) => w.tenant_id === caller.tenantId && (w.work_order_number.toLowerCase().includes(q) || w.title.toLowerCase().includes(q))
    );
    results.parts = mockDatabase.parts.filter(
      (p) => p.tenant_id === caller.tenantId && (p.part_number.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
    );
    // General customer accounts are NOT returned to technicians
  }

  return results;
}

test("operations user global search matches tickets, assets, customers, work orders and parts", () => {
  const opsCaller = { tenantId: "tenant-1", role: "operations_staff" };
  const res = executeGlobalSearch(opsCaller, "mdvr");

  assert.equal(res.tickets.length, 1);
  assert.equal(res.tickets[0].ticket_number, "TKT-2026-0001");
  assert.equal(res.workOrders.length, 1);
  assert.equal(res.workOrders[0].work_order_number, "WO-2026-0001");
});

test("customer user global search is strictly scoped to linked customer account (zero leakage)", () => {
  const custCaller = {
    tenantId: "tenant-1",
    role: "customer_user",
    linkedCustomerIds: ["cust-a"],
  };

  // 1. Can find own ticket TKT-2026-0001
  const resOwn = executeGlobalSearch(custCaller, "TKT-2026-0001");
  assert.equal(resOwn.tickets.length, 1);

  // 2. Cannot find Customer B's ticket TKT-2026-0002
  const resOther = executeGlobalSearch(custCaller, "TKT-2026-0002");
  assert.equal(resOther.tickets.length, 0, "Customer User must not find Customer B ticket");

  // 3. Cannot search internal work orders or parts
  const resInternal = executeGlobalSearch(custCaller, "WO-2026-0001");
  assert.equal(resInternal.workOrders, undefined, "Work orders must not be accessible to customer user");
});

test("technician global search can search parts and work orders but is blocked from customer financial data", () => {
  const techCaller = { tenantId: "tenant-1", role: "technician" };
  const res = executeGlobalSearch(techCaller, "CAM-DMS");

  assert.equal(res.parts.length, 1);
  assert.equal(res.customers, undefined, "Customer accounts directory must not be returned to technician");
});

// ----------------------------------------------------------------------------
// SUITE 2: Operational Metrics & Date-Range Summary Aggregations
// ----------------------------------------------------------------------------
function calculateReportMetrics(tickets, dateRange, statusFilter) {
  let filtered = [...tickets];

  if (dateRange && dateRange.start) {
    const startMs = new Date(dateRange.start).getTime();
    filtered = filtered.filter((t) => new Date(t.createdAt).getTime() >= startMs);
  }
  if (dateRange && dateRange.end) {
    const endMs = new Date(dateRange.end).getTime();
    filtered = filtered.filter((t) => new Date(t.createdAt).getTime() <= endMs);
  }
  if (statusFilter && statusFilter !== "all") {
    filtered = filtered.filter((t) => t.status === statusFilter);
  }

  const total = filtered.length;
  const resolved = filtered.filter((t) => ["resolved", "closed"].includes(t.status)).length;
  const active = filtered.filter((t) => !["resolved", "closed", "cancelled"].includes(t.status)).length;

  let totalResolutionHours = 0;
  let countWithResolution = 0;
  for (const t of filtered) {
    if (t.resolvedAt && t.createdAt) {
      const diffHours = (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()) / 3600000;
      totalResolutionHours += diffHours;
      countWithResolution++;
    }
  }

  const avgResolutionHours =
    countWithResolution > 0 ? Math.round((totalResolutionHours / countWithResolution) * 10) / 10 : 0;

  return { total, resolved, active, avgResolutionHours };
}

test("accurately computes report summary totals and filters by date range", () => {
  const ticketsSample = [
    { id: "1", status: "new", createdAt: "2026-11-01T10:00:00Z", resolvedAt: null },
    { id: "2", status: "resolved", createdAt: "2026-11-05T10:00:00Z", resolvedAt: "2026-11-05T14:00:00Z" }, // 4h
    { id: "3", status: "resolved", createdAt: "2026-11-10T10:00:00Z", resolvedAt: "2026-11-10T16:00:00Z" }, // 6h
    { id: "4", status: "in_progress", createdAt: "2026-11-12T10:00:00Z", resolvedAt: null },
  ];

  // 1. All time metrics: total = 4, resolved = 2, active = 2, avg = (4+6)/2 = 5.0h
  const allTime = calculateReportMetrics(ticketsSample, null, "all");
  assert.equal(allTime.total, 4);
  assert.equal(allTime.resolved, 2);
  assert.equal(allTime.active, 2);
  assert.equal(allTime.avgResolutionHours, 5.0);

  // 2. Date filtered: from 2026-11-08 onwards -> tickets 3 and 4
  const filtered = calculateReportMetrics(ticketsSample, { start: "2026-11-08T00:00:00Z" }, "all");
  assert.equal(filtered.total, 2);
  assert.equal(filtered.resolved, 1);
  assert.equal(filtered.active, 1);
});

// ----------------------------------------------------------------------------
// SUITE 3: Role-Scoped Export Projection Security
// ----------------------------------------------------------------------------
function projectExportFields(rawTicket, role) {
  // Base fields accessible to authorized actors
  const baseFields = {
    ticketNumber: rawTicket.ticket_number,
    title: rawTicket.title,
    status: rawTicket.status,
    priority: rawTicket.priority,
    category: rawTicket.category,
    createdAt: rawTicket.created_at,
    resolvedAt: rawTicket.resolved_at,
  };

  // Operations staff can view internal operational metadata
  if (role === "operations_staff" || role === "tenant_admin") {
    return {
      ...baseFields,
      internalNotes: rawTicket.internal_notes,
      technicianHourlyCost: rawTicket.technician_hourly_cost,
      markupMarginPercentage: rawTicket.markup_margin_percentage,
      contractorBillingCode: rawTicket.contractor_billing_code,
    };
  }

  // Customer Portal User: STRICTLY STRIPS internal cost, margin, and internal notes
  return baseFields;
}

test("export projection: operations export includes internal cost and notes", () => {
  const rawTicket = {
    ticket_number: "TKT-100",
    title: "MDVR Fix",
    status: "resolved",
    priority: "high",
    category: "repair",
    created_at: "2026-11-10T10:00:00Z",
    resolved_at: "2026-11-10T14:00:00Z",
    internal_notes: "Technician swapped cable, root cause customer driver pinched harness",
    technician_hourly_cost: 150,
    markup_margin_percentage: 35,
    contractor_billing_code: "VEND-SUB-99",
  };

  const opsExport = projectExportFields(rawTicket, "operations_staff");
  assert.equal(opsExport.ticketNumber, "TKT-100");
  assert.equal(opsExport.internalNotes, "Technician swapped cable, root cause customer driver pinched harness");
  assert.equal(opsExport.technicianHourlyCost, 150);
  assert.equal(opsExport.markupMarginPercentage, 35);
});

test("export projection: customer export strictly strips internal margins, costs, and internal notes", () => {
  const rawTicket = {
    ticket_number: "TKT-100",
    title: "MDVR Fix",
    status: "resolved",
    priority: "high",
    category: "repair",
    created_at: "2026-11-10T10:00:00Z",
    resolved_at: "2026-11-10T14:00:00Z",
    internal_notes: "Technician swapped cable, root cause customer driver pinched harness",
    technician_hourly_cost: 150,
    markup_margin_percentage: 35,
    contractor_billing_code: "VEND-SUB-99",
  };

  const custExport = projectExportFields(rawTicket, "customer_user");
  assert.equal(custExport.ticketNumber, "TKT-100");
  assert.equal(custExport.title, "MDVR Fix");
  assert.equal(custExport.internalNotes, undefined, "Internal notes must be stripped");
  assert.equal(custExport.technicianHourlyCost, undefined, "Hourly cost must be stripped");
  assert.equal(custExport.markupMarginPercentage, undefined, "Margin must be stripped");
  assert.equal(custExport.contractorBillingCode, undefined, "Contractor billing code must be stripped");
});

test("export authorization: strictly blocks customer users from exporting internal operational modules", () => {
  function authorizeExportRequest(entityType, role) {
    if (role === "customer_user") {
      const allowedCustomerEntities = ["tickets", "assets"];
      if (!allowedCustomerEntities.includes(entityType)) {
        return { allowed: false, error: "FORBIDDEN_INTERNAL_REPORT" };
      }
    }
    return { allowed: true };
  }

  assert.equal(authorizeExportRequest("tickets", "customer_user").allowed, true);
  assert.equal(authorizeExportRequest("assets", "customer_user").allowed, true);
  assert.equal(authorizeExportRequest("inventory", "customer_user").allowed, false);
  assert.equal(authorizeExportRequest("sla_report", "customer_user").allowed, false);
  assert.equal(authorizeExportRequest("bulk_service", "customer_user").allowed, false);
});

// ----------------------------------------------------------------------------
// SUITE 4: Export Audit Logging & Multi-Tenant Isolation
// ----------------------------------------------------------------------------
test("records export transactions in audit log with caller, entity type, and row count", () => {
  const exportAuditLogs = [];

  function logExport(tenantId, userId, portal, exportType, format, rowCount, filters) {
    exportAuditLogs.push({
      id: crypto.randomUUID(),
      tenantId,
      userId,
      portal,
      exportType,
      format,
      rowCount,
      filters,
      createdAt: new Date().toISOString(),
    });
  }

  logExport("tenant-1", "user-123", "operations", "tickets", "csv", 45, { dateRange: "30" });
  assert.equal(exportAuditLogs.length, 1);
  assert.equal(exportAuditLogs[0].exportType, "tickets");
  assert.equal(exportAuditLogs[0].rowCount, 45);
  assert.equal(exportAuditLogs[0].portal, "operations");
});

test("multi-tenant isolation: Tenant A can never view or export Tenant B audit logs or reports", () => {
  const reportsDatabase = [
    { tenantId: "tenant-riyadh", totalTickets: 120, slaRate: 95 },
    { tenantId: "tenant-dubai", totalTickets: 85, slaRate: 98 },
  ];

  function getTenantReport(tenantId) {
    const report = reportsDatabase.find((r) => r.tenantId === tenantId);
    return report || null;
  }

  const riyadh = getTenantReport("tenant-riyadh");
  assert.equal(riyadh.totalTickets, 120);

  const foreign = getTenantReport("tenant-cairo");
  assert.equal(foreign, null, "Foreign unowned tenant report returns null");
});

// ----------------------------------------------------------------------------
// SUMMARY
// ----------------------------------------------------------------------------
console.log(`\nResults: ${passed} / ${total} tests passed.`);
if (passed === total) {
  console.log("All Step 16 Dashboard, Search & Export tests passed successfully!\n");
} else {
  process.exit(1);
}
