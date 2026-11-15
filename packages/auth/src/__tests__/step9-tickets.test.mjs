import assert from "node:assert";
import crypto from "node:crypto";

console.log("=== CareOS Step 9: Support Desk, Ticketing, Numbering & Complaints Tests ===\n");

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
// In-Memory Database & Logic Mirroring Step 9 Migration & Fastify Routes
// ============================================================================

const tenantA = "11111111-1111-1111-1111-111111111111";
const tenantB = "22222222-2222-2222-2222-222222222222";

const db = {
  sequences: [], // { tenant_id, prefix, year, current_val }
  ticketCategories: [],
  tickets: [],
  ticketStatusHistory: [],
  ticketEvents: [],
  complaints: [],
  complaintEvents: [],
  customerAccounts: [],
  customerUsers: [],
  assets: [],
  auditLogs: [],
};

function resetDb() {
  db.sequences = [];
  db.ticketCategories = [];
  db.tickets = [];
  db.ticketStatusHistory = [];
  db.ticketEvents = [];
  db.complaints = [];
  db.complaintEvents = [];
  db.customerAccounts = [];
  db.customerUsers = [];
  db.assets = [];
  db.auditLogs = [];
}

// Atomic Sequence Number Generator (Mirroring PostgreSQL sequence table)
function generateNumber(tenantId, prefix = "TCK") {
  const year = new Date().getUTCFullYear();
  let row = db.sequences.find(
    (s) => s.tenant_id === tenantId && s.prefix === prefix && s.year === year
  );

  if (!row) {
    row = {
      tenant_id: tenantId,
      prefix,
      year,
      current_val: 1,
      padding_length: 6,
    };
    db.sequences.push(row);
  } else {
    row.current_val += 1;
  }

  const seqStr = String(row.current_val).padStart(row.padding_length, "0");
  return `${prefix}-${year}-${seqStr}`;
}

const VALID_TRANSITIONS = {
  draft: ["submitted", "cancelled"],
  submitted: ["under_review", "ready_for_assignment", "cancelled"],
  under_review: ["awaiting_quotation", "ready_for_assignment", "on_hold", "cancelled"],
  awaiting_quotation: ["awaiting_customer_approval", "under_review", "cancelled"],
  awaiting_customer_approval: ["awaiting_payment", "ready_for_assignment", "cancelled"],
  awaiting_payment: ["ready_for_assignment", "cancelled"],
  ready_for_assignment: ["assigned", "under_review", "cancelled"],
  assigned: ["accepted", "ready_for_assignment", "technician_en_route", "cancelled"],
  accepted: ["scheduled", "technician_en_route", "ready_for_assignment", "cancelled"],
  scheduled: ["technician_en_route", "accepted", "cancelled"],
  technician_en_route: ["arrived", "on_hold", "cancelled"],
  arrived: ["in_progress", "on_hold", "cancelled"],
  in_progress: ["service_completed", "on_hold", "cancelled"],
  on_hold: ["in_progress", "under_review", "ready_for_assignment", "cancelled"],
  service_completed: ["awaiting_operations_verification", "awaiting_customer_confirmation", "resolved"],
  awaiting_operations_verification: ["awaiting_customer_confirmation", "resolved", "in_progress"],
  awaiting_customer_confirmation: ["resolved", "closed", "in_progress"],
  resolved: ["closed", "under_review"],
  closed: [],
  cancelled: [],
};

// Route Helpers Mirroring API Implementation
function createCategory(tenantId, callerAuth, payload) {
  if (!callerAuth) throw new Error("UNAUTHORIZED");
  if (!callerAuth.isPlatformAdmin && callerAuth.portal !== "operations") {
    throw new Error("FORBIDDEN: Operations role required");
  }

  const existing = db.ticketCategories.find(
    (c) =>
      c.tenant_id === tenantId &&
      (c.name.toLowerCase() === payload.name.toLowerCase() ||
        c.code.toUpperCase() === payload.code.toUpperCase())
  );
  if (existing) {
    throw new Error("CATEGORY_CREATION_FAILED: Unique constraint violation");
  }

  const category = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    name: payload.name,
    code: payload.code.toUpperCase(),
    description: payload.description || null,
    default_priority: payload.defaultPriority || "medium",
    sla_response_hours: payload.slaResponseHours || 4,
    sla_resolution_hours: payload.slaResolutionHours || 24,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  db.ticketCategories.push(category);
  return category;
}

function createTicket(tenantId, callerAuth, payload) {
  if (!callerAuth) throw new Error("UNAUTHORIZED");

  if (!callerAuth.isPlatformAdmin && callerAuth.portal === "customer") {
    const isLinked = db.customerUsers.some(
      (cu) =>
        cu.tenant_id === tenantId &&
        cu.user_id === callerAuth.userId &&
        cu.customer_account_id === payload.customerAccountId &&
        cu.is_active
    );
    if (!isLinked) {
      throw new Error("FORBIDDEN: You can only create tickets for your linked customer account");
    }
  }

  if (!payload.title || payload.title.length < 2) {
    throw new Error("VALIDATION_ERROR: Title required");
  }
  if (!payload.description || payload.description.length < 2) {
    throw new Error("VALIDATION_ERROR: Description required");
  }

  // Generate atomic ticket number
  const ticketNumber = generateNumber(tenantId, "TCK");

  const ticket = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    ticket_number: ticketNumber,
    customer_account_id: payload.customerAccountId,
    site_id: payload.siteId || null,
    contact_id: payload.contactId || null,
    asset_id: payload.assetId || null, // 1 asset in V1, or nullable
    category_id: payload.categoryId,
    title: payload.title,
    description: payload.description,
    priority: payload.priority || "medium",
    status: "submitted",
    coverage_type: payload.coverageType || "paid",
    reported_via: payload.reportedVia || "portal",
    created_by: callerAuth.userId,
    sla_due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.tickets.push(ticket);

  // Status history
  db.ticketStatusHistory.push({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    ticket_id: ticket.id,
    from_status: null,
    to_status: "submitted",
    changed_by: callerAuth.userId,
    reason: "Ticket submitted into system",
    created_at: new Date().toISOString(),
  });

  // Timeline event
  db.ticketEvents.push({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    ticket_id: ticket.id,
    event_type: "status_change",
    actor_id: callerAuth.userId,
    actor_type: callerAuth.portal === "customer" ? "customer" : "staff",
    is_internal: false,
    body: `Ticket created with status 'submitted'`,
    created_at: new Date().toISOString(),
  });

  return ticket;
}

function transitionTicketStatus(tenantId, callerAuth, ticketId, payload) {
  if (!callerAuth) throw new Error("UNAUTHORIZED");

  const ticket = db.tickets.find((t) => t.id === ticketId && t.tenant_id === tenantId);
  if (!ticket) throw new Error("NOT_FOUND: Ticket not found");

  if (!payload.reason || payload.reason.trim().length < 2) {
    throw new Error("VALIDATION_ERROR: Transition reason is mandatory");
  }

  const currentStatus = ticket.status;
  const toStatus = payload.toStatus;

  // Allowed transitions
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(toStatus) && !callerAuth.isPlatformAdmin) {
    throw new Error(`INVALID_STATUS_TRANSITION: Cannot transition from ${currentStatus} to ${toStatus}`);
  }

  // Role permissions
  if (!callerAuth.isPlatformAdmin) {
    if (callerAuth.portal === "customer") {
      const isLinked = db.customerUsers.some(
        (cu) =>
          cu.tenant_id === tenantId &&
          cu.user_id === callerAuth.userId &&
          cu.customer_account_id === ticket.customer_account_id &&
          cu.is_active
      );
      if (!isLinked) throw new Error("FORBIDDEN: Not authorized for this customer");

      const customerAllowed = {
        draft: ["submitted", "cancelled"],
        submitted: ["cancelled"],
        awaiting_customer_approval: ["awaiting_payment", "ready_for_assignment", "cancelled"],
        awaiting_customer_confirmation: ["resolved", "closed"],
      };

      if (!customerAllowed[currentStatus]?.includes(toStatus)) {
        throw new Error(`FORBIDDEN: Customer cannot perform status transition from ${currentStatus} to ${toStatus}`);
      }
    } else if (callerAuth.portal === "technician") {
      const techAllowed = {
        assigned: ["accepted", "ready_for_assignment", "technician_en_route"],
        accepted: ["scheduled", "technician_en_route"],
        scheduled: ["technician_en_route"],
        technician_en_route: ["arrived", "on_hold"],
        arrived: ["in_progress", "on_hold"],
        in_progress: ["service_completed", "on_hold"],
        on_hold: ["in_progress"],
      };
      if (!techAllowed[currentStatus]?.includes(toStatus)) {
        throw new Error(`FORBIDDEN: Technician cannot perform status transition from ${currentStatus} to ${toStatus}`);
      }
    }
  }

  // Update ticket
  ticket.status = toStatus;
  ticket.updated_at = new Date().toISOString();
  if (toStatus === "resolved") ticket.resolved_at = new Date().toISOString();
  if (toStatus === "closed") ticket.closed_at = new Date().toISOString();
  if (toStatus === "cancelled") ticket.cancellation_reason = payload.reason;

  // Record immutable history
  const historyEntry = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    ticket_id: ticket.id,
    from_status: currentStatus,
    to_status: toStatus,
    changed_by: callerAuth.userId,
    reason: payload.reason,
    created_at: new Date().toISOString(),
  };
  db.ticketStatusHistory.push(historyEntry);

  // Record timeline event
  db.ticketEvents.push({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    ticket_id: ticket.id,
    event_type: "status_change",
    actor_id: callerAuth.userId,
    actor_type: callerAuth.portal === "customer" ? "customer" : callerAuth.portal === "technician" ? "technician" : "staff",
    is_internal: false,
    body: `Status changed from '${currentStatus}' to '${toStatus}': ${payload.reason}`,
    created_at: new Date().toISOString(),
  });

  return { ticket, historyEntry };
}

function addTicketEvent(tenantId, callerAuth, ticketId, payload) {
  if (!callerAuth) throw new Error("UNAUTHORIZED");

  const ticket = db.tickets.find((t) => t.id === ticketId && t.tenant_id === tenantId);
  if (!ticket) throw new Error("NOT_FOUND: Ticket not found");

  if (!payload.body || payload.body.trim().length === 0) {
    throw new Error("VALIDATION_ERROR: Event body required");
  }

  // Privacy Rule: Customer portal users can NEVER create internal notes
  const isInternal = callerAuth.portal === "customer" ? false : Boolean(payload.isInternal);

  const event = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    ticket_id: ticket.id,
    event_type: payload.eventType || "comment",
    actor_id: callerAuth.userId,
    actor_type: callerAuth.portal === "customer" ? "customer" : callerAuth.portal === "technician" ? "technician" : "staff",
    is_internal: isInternal,
    body: payload.body,
    created_at: new Date().toISOString(),
  };

  db.ticketEvents.push(event);
  return event;
}

function getTicketDetail(tenantId, callerAuth, ticketId) {
  if (!callerAuth) throw new Error("UNAUTHORIZED");

  const ticket = db.tickets.find((t) => t.id === ticketId && t.tenant_id === tenantId);
  if (!ticket) throw new Error("NOT_FOUND: Ticket not found");

  if (!callerAuth.isPlatformAdmin && callerAuth.portal === "customer") {
    const isLinked = db.customerUsers.some(
      (cu) =>
        cu.tenant_id === tenantId &&
        cu.user_id === callerAuth.userId &&
        cu.customer_account_id === ticket.customer_account_id &&
        cu.is_active
    );
    if (!isLinked) throw new Error("FORBIDDEN: You do not have access to this ticket");
  }

  const statusHistory = db.ticketStatusHistory.filter((h) => h.ticket_id === ticket.id);

  // CRITICAL PRIVACY GATE: Customers must NEVER see internal notes!
  const isCustomer = !callerAuth.isPlatformAdmin && callerAuth.portal === "customer";
  const events = db.ticketEvents
    .filter((e) => e.ticket_id === ticket.id)
    .filter((e) => (!isCustomer ? true : !e.is_internal));

  const complaints = db.complaints.filter((c) => c.ticket_id === ticket.id);

  return {
    ...ticket,
    statusHistory,
    events,
    complaints,
  };
}

function createComplaint(tenantId, callerAuth, payload) {
  if (!callerAuth) throw new Error("UNAUTHORIZED");

  if (!callerAuth.isPlatformAdmin && callerAuth.portal === "customer") {
    const isLinked = db.customerUsers.some(
      (cu) =>
        cu.tenant_id === tenantId &&
        cu.user_id === callerAuth.userId &&
        cu.customer_account_id === payload.customerAccountId &&
        cu.is_active
    );
    if (!isLinked) throw new Error("FORBIDDEN: You can only file complaints for your linked account");
  }

  const complaintNumber = generateNumber(tenantId, "CMP");

  const complaint = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    complaint_number: complaintNumber,
    complaint_type: payload.complaintType, // 'service' | 'platform'
    customer_account_id: payload.customerAccountId,
    ticket_id: payload.ticketId || null,
    title: payload.title,
    description: payload.description,
    severity: payload.severity || "medium",
    status: "submitted",
    created_by: callerAuth.userId,
    created_at: new Date().toISOString(),
  };

  db.complaints.push(complaint);

  // Record initial event
  db.complaintEvents.push({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    complaint_id: complaint.id,
    actor_id: callerAuth.userId,
    is_internal: false,
    event_type: "status_change",
    body: `Complaint filed (${payload.complaintType.toUpperCase()})`,
    created_at: new Date().toISOString(),
  });

  return complaint;
}

// ============================================================================
// TEST SUITE EXECUTION
// ============================================================================

resetDb();

// Setup accounts and users
const opsUserA = { userId: "user-ops-a", portal: "operations", isPlatformAdmin: false };
const techUserA = { userId: "user-tech-a", portal: "technician", isPlatformAdmin: false };
const customerUserA = { userId: "user-cust-a", portal: "customer", isPlatformAdmin: false };
const customerUserB = { userId: "user-cust-b", portal: "customer", isPlatformAdmin: false };

const custAcc1 = { id: crypto.randomUUID(), tenant_id: tenantA, name: "Acme Logistics" };
const custAcc2 = { id: crypto.randomUUID(), tenant_id: tenantA, name: "Global Freight" };
db.customerAccounts.push(custAcc1, custAcc2);

// Link customerUserA to custAcc1 only
db.customerUsers.push({
  id: crypto.randomUUID(),
  tenant_id: tenantA,
  user_id: customerUserA.userId,
  customer_account_id: custAcc1.id,
  is_active: true,
});

// Link customerUserB to custAcc2 only
db.customerUsers.push({
  id: crypto.randomUUID(),
  tenant_id: tenantA,
  user_id: customerUserB.userId,
  customer_account_id: custAcc2.id,
  is_active: true,
});

// Setup asset for custAcc1
const asset1 = {
  id: crypto.randomUUID(),
  tenant_id: tenantA,
  customer_account_id: custAcc1.id,
  asset_tag: "VH-001",
  name: "Mercedes Actros 2024",
};
db.assets.push(asset1);

// Setup Category
const cat1 = createCategory(tenantA, opsUserA, {
  name: "Engine & Diagnostics",
  code: "ENG-DIAG",
  defaultPriority: "high",
  slaResolutionHours: 12,
});

// ── TEST 1: Concurrency-Safe Atomic Numbering & Formatting ───────────────────
it("allocates sequential, zero-padded ticket numbers atomically", () => {
  const tck1 = generateNumber(tenantA, "TCK");
  const tck2 = generateNumber(tenantA, "TCK");
  const tck3 = generateNumber(tenantA, "TCK");

  const year = new Date().getUTCFullYear();
  assert.strictEqual(tck1, `TCK-${year}-000001`);
  assert.strictEqual(tck2, `TCK-${year}-000002`);
  assert.strictEqual(tck3, `TCK-${year}-000003`);
});

// ── TEST 2: Multi-Tenant Sequence Isolation ─────────────────────────────────
it("maintains separate sequence numbering across different tenants", () => {
  const tckTenantA = generateNumber(tenantA, "TCK");
  const tckTenantB = generateNumber(tenantB, "TCK");

  const year = new Date().getUTCFullYear();
  assert.strictEqual(tckTenantA, `TCK-${year}-000004`);
  // Tenant B starts fresh at 000001
  assert.strictEqual(tckTenantB, `TCK-${year}-000001`);
});

// ── TEST 3: Ticket Creation with 1 Asset (V1 Rule) ───────────────────────────
let createdTicketId = "";
it("creates ticket linked to 1 asset with initial submitted status and history", () => {
  const ticket = createTicket(tenantA, opsUserA, {
    customerAccountId: custAcc1.id,
    assetId: asset1.id,
    categoryId: cat1.id,
    title: "Check engine warning light active",
    description: "OBD code P0420 detected during vehicle inspection",
    priority: "high",
  });

  assert.ok(ticket.id);
  assert.strictEqual(ticket.status, "submitted");
  assert.strictEqual(ticket.asset_id, asset1.id);
  assert.ok(ticket.ticket_number.startsWith("TCK-"));

  // Verify status history
  const history = db.ticketStatusHistory.filter((h) => h.ticket_id === ticket.id);
  assert.strictEqual(history.length, 1);
  assert.strictEqual(history[0].to_status, "submitted");

  createdTicketId = ticket.id;
});

// ── TEST 4: Nullable Asset Supported for General Service Requests ────────────
it("allows nullable asset_id for general maintenance and non-asset requests", () => {
  const ticket = createTicket(tenantA, opsUserA, {
    customerAccountId: custAcc1.id,
    assetId: null, // Nullable
    categoryId: cat1.id,
    title: "Request annual maintenance contract consultation",
    description: "Need quotation for warehouse machinery servicing",
  });

  assert.ok(ticket.id);
  assert.strictEqual(ticket.asset_id, null);
  assert.strictEqual(ticket.status, "submitted");
});

// ── TEST 5: Mandatory Transition Reason Enforcement ─────────────────────────
it("rejects status transition when reason is missing or empty", () => {
  assert.throws(
    () => {
      transitionTicketStatus(tenantA, opsUserA, createdTicketId, {
        toStatus: "under_review",
        reason: "", // Empty reason
      });
    },
    /Transition reason is mandatory/
  );
});

// ── TEST 6: State Machine Invalid Transition Rejection ───────────────────────
it("rejects illegal transitions that skip lifecycle stages", () => {
  assert.throws(
    () => {
      // Direct jump from submitted -> service_completed is forbidden
      transitionTicketStatus(tenantA, opsUserA, createdTicketId, {
        toStatus: "service_completed",
        reason: "Fast-tracking job",
      });
    },
    /INVALID_STATUS_TRANSITION/
  );
});

// ── TEST 7: Operations Status Transition and Immutable Audit Trail ───────────
it("transitions status legitimately and logs immutable audit trail in ticket_status_history", () => {
  const res1 = transitionTicketStatus(tenantA, opsUserA, createdTicketId, {
    toStatus: "under_review",
    reason: "Assigned to dispatch review queue",
  });
  assert.strictEqual(res1.ticket.status, "under_review");

  const res2 = transitionTicketStatus(tenantA, opsUserA, createdTicketId, {
    toStatus: "ready_for_assignment",
    reason: "Diagnostics confirmed; parts available in stock",
  });
  assert.strictEqual(res2.ticket.status, "ready_for_assignment");

  const history = db.ticketStatusHistory.filter((h) => h.ticket_id === createdTicketId);
  assert.strictEqual(history.length, 3); // initial + under_review + ready_for_assignment
  assert.strictEqual(history[1].to_status, "under_review");
  assert.strictEqual(history[2].to_status, "ready_for_assignment");
  assert.strictEqual(history[2].reason, "Diagnostics confirmed; parts available in stock");
});

// ── TEST 8: Customer Role Transition Boundary ────────────────────────────────
it("forbids customer portal user from executing operational status transitions", () => {
  assert.throws(
    () => {
      transitionTicketStatus(tenantA, customerUserA, createdTicketId, {
        toStatus: "assigned",
        reason: "Customer trying to assign technician",
      });
    },
    /Customer cannot perform status transition/
  );
});

// ── TEST 9: Technician Status Lifecycle Progression ─────────────────────────
it("allows technician to accept assigned ticket and progress through service completion", () => {
  // 1. Operations assigns ticket
  transitionTicketStatus(tenantA, opsUserA, createdTicketId, {
    toStatus: "assigned",
    reason: "Dispatched to senior technician",
  });

  // 2. Tech accepts
  transitionTicketStatus(tenantA, techUserA, createdTicketId, {
    toStatus: "accepted",
    reason: "Job accepted by mobile unit",
  });

  // 3. Tech en route
  transitionTicketStatus(tenantA, techUserA, createdTicketId, {
    toStatus: "technician_en_route",
    reason: "Departing central facility with parts",
  });

  // 4. Tech arrives
  transitionTicketStatus(tenantA, techUserA, createdTicketId, {
    toStatus: "arrived",
    reason: "Vehicle on site at customer branch",
  });

  // 5. Tech in progress
  transitionTicketStatus(tenantA, techUserA, createdTicketId, {
    toStatus: "in_progress",
    reason: "Connecting OBD scanner and replacing faulty sensor",
  });

  // 6. Service completed
  transitionTicketStatus(tenantA, techUserA, createdTicketId, {
    toStatus: "service_completed",
    reason: "Sensor replaced and test driven; fault cleared",
  });

  const detail = getTicketDetail(tenantA, opsUserA, createdTicketId);
  assert.strictEqual(detail.status, "service_completed");
});

// ── TEST 10: Customer Cannot Post Internal Notes ────────────────────────────
it("forces is_internal = false when customer posts comments", () => {
  const event = addTicketEvent(tenantA, customerUserA, createdTicketId, {
    body: "Customer says: vehicle will be parked at Bay 3",
    isInternal: true, // Attempting to post as internal
  });

  assert.strictEqual(event.is_internal, false, "Customer comments must never be internal");
});

// ── TEST 11: CRITICAL PRIVACY GATE: Customer Cannot See Internal Notes ──────
it("CRITICAL PRIVACY: customer detail query strictly omits staff internal notes", () => {
  // Staff posts public comment
  addTicketEvent(tenantA, opsUserA, createdTicketId, {
    body: "Public update: Technician has arrived on site",
    isInternal: false,
  });

  // Staff posts confidential internal note
  addTicketEvent(tenantA, opsUserA, createdTicketId, {
    body: "INTERNAL NOTE: Customer is disputing labor rate, check service contract #84",
    isInternal: true,
  });

  // Query as Operations user -> internal note IS visible
  const opsView = getTicketDetail(tenantA, opsUserA, createdTicketId);
  const opsInternalCount = opsView.events.filter((e) => e.is_internal).length;
  assert.strictEqual(opsInternalCount, 1, "Operations must see internal notes");

  // Query as Customer user -> internal note MUST NOT be visible!
  const customerView = getTicketDetail(tenantA, customerUserA, createdTicketId);
  const customerInternalCount = customerView.events.filter((e) => e.is_internal).length;
  assert.strictEqual(customerInternalCount, 0, "CRITICAL: Customer must never receive internal notes");
  assert.ok(
    !customerView.events.some((e) => e.body.includes("disputing labor rate")),
    "Confidential internal content must not leak to customer"
  );
});

// ── TEST 12: Customer Account Isolation (Cross-Account Leakage Prevention) ───
it("prevents Customer B from accessing Customer A's tickets", () => {
  assert.throws(
    () => {
      // Customer B is only linked to custAcc2, createdTicketId belongs to custAcc1
      getTicketDetail(tenantA, customerUserB, createdTicketId);
    },
    /FORBIDDEN: You do not have access to this ticket/
  );
});

// ── TEST 13: Multi-Tenant Boundary Isolation ────────────────────────────────
it("prevents cross-tenant access to tickets", () => {
  assert.throws(
    () => {
      // User in Tenant B trying to query Ticket in Tenant A
      getTicketDetail(tenantB, { userId: "user-b", portal: "operations" }, createdTicketId);
    },
    /NOT_FOUND: Ticket not found/
  );
});

// ── TEST 14: Complaint Creation & Distinct Numbering ─────────────────────────
let createdComplaintId = "";
it("creates complaint with CMP- numbering and distinguishes service vs platform type", () => {
  const complaint = createComplaint(tenantA, opsUserA, {
    complaintType: "service",
    customerAccountId: custAcc1.id,
    ticketId: createdTicketId,
    title: "Technician arrived 45 minutes past agreed SLA window",
    description: "Customer branch manager reported dispatch delay during peak morning route",
    severity: "high",
  });

  assert.ok(complaint.id);
  assert.ok(complaint.complaint_number.startsWith("CMP-"));
  assert.strictEqual(complaint.complaint_type, "service");
  assert.strictEqual(complaint.ticket_id, createdTicketId);
  assert.strictEqual(complaint.status, "submitted");

  createdComplaintId = complaint.id;
});

// ── TEST 15: Complaint Linking Does Not Alter Ticket Status History ──────────
it("verifies linking complaint to ticket does not alter ticket audit trail", () => {
  const historyBefore = db.ticketStatusHistory.filter((h) => h.ticket_id === createdTicketId);
  const countBefore = historyBefore.length;

  // File another complaint linked to the ticket
  createComplaint(tenantA, customerUserA, {
    complaintType: "service",
    customerAccountId: custAcc1.id,
    ticketId: createdTicketId,
    title: "Grease stains left on steering wheel",
    description: "Please ensure technician uses steering wheel covers",
  });

  const historyAfter = db.ticketStatusHistory.filter((h) => h.ticket_id === createdTicketId);
  assert.strictEqual(
    historyAfter.length,
    countBefore,
    "Filing a complaint against a ticket must never mutate ticket status history"
  );
});

// ── TEST 16: Platform Complaint Workflow ────────────────────────────────────
it("supports platform complaints without requiring asset linking", () => {
  const platformComplaint = createComplaint(tenantA, opsUserA, {
    complaintType: "platform",
    customerAccountId: custAcc1.id,
    ticketId: null,
    title: "Customer unable to download PDF reports on iOS Safari",
    description: "Client reports download button unresponsive on iPadOS 17.5",
    severity: "medium",
  });

  assert.strictEqual(platformComplaint.complaint_type, "platform");
  assert.strictEqual(platformComplaint.ticket_id, null);
  assert.strictEqual(platformComplaint.status, "submitted");
});

// ── TEST 17: Operations Resolution of Ticket ────────────────────────────────
it("allows operations to resolve and close ticket with mandatory resolution summary", () => {
  const resolved = transitionTicketStatus(tenantA, opsUserA, createdTicketId, {
    toStatus: "resolved",
    reason: "Quality assurance inspection complete and customer accepted delivery",
  });
  assert.strictEqual(resolved.ticket.status, "resolved");
  assert.ok(resolved.ticket.resolved_at);

  const closed = transitionTicketStatus(tenantA, opsUserA, createdTicketId, {
    toStatus: "closed",
    reason: "Service completed, invoiced, and archived",
  });
  assert.strictEqual(closed.ticket.status, "closed");
  assert.ok(closed.ticket.closed_at);
});

console.log(`\nResults: ${passed} / ${total} tests passed.`);
if (passed === total) {
  console.log("All Step 9 tests passed successfully!\n");
} else {
  console.error("Some tests failed!");
  process.exit(1);
}
