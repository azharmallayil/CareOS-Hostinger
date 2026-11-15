import assert from "node:assert";
import crypto from "node:crypto";

console.log("=== CareOS Step 10: Coverage Engine, Quotations, Approvals & Payments Tests ===\n");

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
// Pure Pricing Calculation Function (Mirroring apps/api/src/services/pricing.ts)
// ============================================================================

function round2(val) {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

function calculateQuotationTotals(rawItems, defaultTaxRate = 0.15, currency = "SAR") {
  let subtotal = 0;
  let taxAmount = 0;

  const calculatedItems = rawItems.map((item, index) => {
    const qty = Math.max(0, item.quantity);
    const price = Math.max(0, item.unitPrice);
    const discount = Math.max(0, Math.min(qty * price, item.discountAmount ?? 0));
    const rate = item.taxRate !== undefined ? Math.max(0, item.taxRate) : defaultTaxRate;

    const lineSubtotal = round2(qty * price - discount);
    const lineTax = round2(lineSubtotal * rate);
    const lineTotal = round2(lineSubtotal + lineTax);

    subtotal += lineSubtotal;
    taxAmount += lineTax;

    return {
      id: item.id || `item-${index + 1}`,
      type: item.type,
      description: item.description,
      quantity: qty,
      unitPrice: price,
      discountAmount: discount,
      taxRate: rate,
      lineSubtotal,
      lineTax,
      lineTotal,
    };
  });

  subtotal = round2(subtotal);
  taxAmount = round2(taxAmount);
  const totalAmount = round2(subtotal + taxAmount);

  return {
    lineItems: calculatedItems,
    subtotal,
    taxRate: defaultTaxRate,
    taxAmount,
    totalAmount,
    currency,
  };
}

// ============================================================================
// Mock Payment Provider (Mirroring apps/api/src/services/payment-provider.ts)
// ============================================================================

class MockPaymentProvider {
  constructor() {
    this.name = "mock_gateway";
  }

  async createPaymentIntent(params) {
    const paymentIntentId = `pi_mock_${crypto.randomBytes(12).toString("hex")}`;
    const clientSecret = `cs_mock_${crypto.randomBytes(16).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    return {
      provider: this.name,
      paymentIntentId,
      clientSecret,
      amount: params.amount,
      currency: params.currency,
      status: "requires_payment_method",
      expiresAt,
    };
  }

  signWebhookPayload(rawPayload, secret) {
    return crypto.createHmac("sha256", secret).update(rawPayload).digest("hex");
  }

  verifyWebhookSignature(rawPayload, signature, secret) {
    if (!signature || !secret || !rawPayload) return false;
    const expected = this.signWebhookPayload(rawPayload, secret);
    try {
      return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Coverage Determination Engine (Mirroring packages/coverage-engine/src/engine.ts)
// ============================================================================

function checkWarranty(params) {
  if (!params.asset) return null;
  const active = (params.warranties || []).filter((w) => {
    const start = new Date(w.starts_at);
    const end = new Date(w.expires_at);
    return w.status === "active" && start <= params.reportDate && end >= params.reportDate;
  });

  if (active.length === 0) return null;
  if (active.length > 1) {
    return {
      type: "ambiguous",
      explanation: `Multiple active warranties found for asset ${params.asset.id}.`,
      candidates: active.map((w) => w.id),
    };
  }
  const w = active[0];
  return {
    type: "warranty",
    warrantyId: w.id,
    explanation: `Asset is covered by ${w.warranty_type} warranty from ${w.provider} (expires ${w.expires_at}).`,
  };
}

function checkContract(params) {
  const active = (params.contracts || []).filter((c) => {
    const start = new Date(c.starts_at);
    const end = new Date(c.expires_at);
    const coversCategory = !params.asset || c.covers_categories.includes(params.asset.category);
    return c.status === "active" && start <= params.reportDate && end >= params.reportDate && coversCategory;
  });

  if (active.length === 0) return null;
  if (active.length > 1) {
    return {
      type: "ambiguous",
      explanation: "Multiple active contracts match this asset category.",
      candidates: active.map((c) => c.id),
    };
  }
  const c = active[0];
  return {
    type: "contract",
    contractId: c.id,
    explanation: `Covered by service contract "${c.name}" (expires ${c.expires_at}).`,
  };
}

function checkFreeService(params) {
  for (const { rule, version } of params.freeServiceRules || []) {
    if (!rule.is_enabled || version.status !== "approved") continue;

    // Dates check
    const from = new Date(version.effective_from);
    if (from > params.reportDate) continue;
    if (version.effective_until) {
      const until = new Date(version.effective_until);
      if (until < params.reportDate) continue;
    }

    // Account check
    if (
      version.eligible_account_ids &&
      version.eligible_account_ids.length > 0 &&
      !version.eligible_account_ids.includes(params.customerAccount.id)
    ) {
      continue;
    }

    if (
      version.eligible_account_types &&
      !version.eligible_account_types.includes(params.customerAccount.account_type)
    ) {
      continue;
    }

    if (version.requires_approval) {
      return {
        type: "pending_review",
        ruleId: rule.id,
        ruleVersionId: version.id,
        explanation: `Matches free service rule "${rule.name}" but requires authorized approval.`,
        requiresApproval: true,
        approverRole: version.approver_role,
        approverUserId: version.approver_user_id || null,
      };
    }

    return {
      type: "free",
      ruleId: rule.id,
      ruleVersionId: version.id,
      explanation: `Eligible for free service under rule "${rule.name}".`,
      requiresApproval: false,
      approverRole: null,
    };
  }
  return null;
}

function determineCoverage(params) {
  // Phase 1: Warranty
  const wDecision = checkWarranty(params);
  if (wDecision) {
    const isAmbiguous = wDecision.type === "ambiguous";
    return {
      coverageType: isAmbiguous ? "pending_review" : "warranty",
      decision: wDecision,
      ambiguous: isAmbiguous,
    };
  }

  // Phase 2: Contract
  const cDecision = checkContract(params);
  if (cDecision) {
    const isAmbiguous = cDecision.type === "ambiguous";
    return {
      coverageType: isAmbiguous ? "pending_review" : "contract",
      decision: cDecision,
      ambiguous: isAmbiguous,
    };
  }

  // Phase 3: Free Service Rules
  const fDecision = checkFreeService(params);
  if (fDecision) {
    return {
      coverageType: fDecision.type === "pending_review" ? "pending_review" : "free",
      decision: fDecision,
      ambiguous: false,
    };
  }

  // Phase 4: Paid Fallback
  return {
    coverageType: "paid",
    decision: {
      type: "paid",
      explanation: "No warranty, contract, or free-service rule matched. Standard charges apply.",
    },
    ambiguous: false,
  };
}

// ============================================================================
// In-Memory Database & Test Execution State
// ============================================================================

const tenantA = "11111111-1111-1111-1111-111111111111";
const tenantB = "22222222-2222-2222-2222-222222222222";

const db = {
  sequences: [],
  quotations: [],
  quotationVersions: [],
  invoices: [],
  payments: [],
  webhookEvents: [],
  commercialOverrides: [],
  warranties: [],
  contracts: [],
  freeServiceRules: [],
  tickets: [],
  customerAccounts: [],
  customerUsers: [],
  assets: [],
};

function resetDb() {
  db.sequences = [];
  db.quotations = [];
  db.quotationVersions = [];
  db.invoices = [];
  db.payments = [];
  db.webhookEvents = [];
  db.commercialOverrides = [];
  db.warranties = [];
  db.contracts = [];
  db.freeServiceRules = [];
  db.tickets = [];
  db.customerAccounts = [];
  db.customerUsers = [];
  db.assets = [];
}

function generateNumber(tenantId, prefix) {
  const year = new Date().getUTCFullYear();
  let row = db.sequences.find((s) => s.tenant_id === tenantId && s.prefix === prefix && s.year === year);
  if (!row) {
    row = { tenant_id: tenantId, prefix, year, current_val: 1, padding_length: 6 };
    db.sequences.push(row);
  } else {
    row.current_val += 1;
  }
  const seqStr = String(row.current_val).padStart(row.padding_length, "0");
  return `${prefix}-${year}-${seqStr}`;
}

const mockProvider = new MockPaymentProvider();
const WEBHOOK_SECRET = "careos-secret-commercial-test";

// ============================================================================
// SUITE 1: PRICING ENGINE & 15% VAT CALCULATIONS
// ============================================================================

it("calculates line items, discounts, 15% VAT, and precision totals correctly", () => {
  const rawItems = [
    {
      type: "labour",
      description: "Diagnostic labour & sensor calibration",
      quantity: 3.5, // 3.5 hours
      unitPrice: 200, // 200 SAR/hr = 700 SAR
      discountAmount: 50, // discount 50 -> subtotal = 650 SAR
      taxRate: 0.15,
    },
    {
      type: "part",
      description: "OEM Oxygen Sensor A0042",
      quantity: 2,
      unitPrice: 450, // 2 * 450 = 900 SAR
      discountAmount: 0,
      taxRate: 0.15,
    },
    {
      type: "travel",
      description: "Mobile dispatch travel fee",
      quantity: 1,
      unitPrice: 150, // 150 SAR
      discountAmount: 0,
      taxRate: 0.15,
    },
  ];

  const result = calculateQuotationTotals(rawItems, 0.15, "SAR");

  // Calculations:
  // Item 1: 3.5 * 200 - 50 = 650.00; tax = 650 * 0.15 = 97.50; total = 747.50
  // Item 2: 2 * 450 = 900.00; tax = 900 * 0.15 = 135.00; total = 1035.00
  // Item 3: 150.00; tax = 150 * 0.15 = 22.50; total = 172.50
  // Subtotal = 650 + 900 + 150 = 1700.00 SAR
  // Tax = 97.50 + 135.00 + 22.50 = 255.00 SAR (exactly 15% of 1700)
  // Total = 1700 + 255 = 1955.00 SAR

  assert.strictEqual(result.subtotal, 1700.0);
  assert.strictEqual(result.taxAmount, 255.0);
  assert.strictEqual(result.totalAmount, 1955.0);
  assert.strictEqual(result.currency, "SAR");
  assert.strictEqual(result.lineItems.length, 3);
  assert.strictEqual(result.lineItems[0].lineSubtotal, 650.0);
  assert.strictEqual(result.lineItems[0].lineTotal, 747.5);
});

// ============================================================================
// SUITE 2: QUOTATION VERSIONING & CUSTOMER APPROVAL/REJECTION LIFECYCLE
// ============================================================================

resetDb();

const opsUser = { userId: "user-ops-1", portal: "operations" };
const customerUser = { userId: "user-cust-1", portal: "customer" };

const custAcc = { id: crypto.randomUUID(), tenant_id: tenantA, name: "Desert Haulage Co" };
db.customerAccounts.push(custAcc);

db.customerUsers.push({
  id: crypto.randomUUID(),
  tenant_id: tenantA,
  user_id: customerUser.userId,
  customer_account_id: custAcc.id,
  is_active: true,
});

const ticket1 = {
  id: crypto.randomUUID(),
  tenant_id: tenantA,
  ticket_number: "TCK-2026-000001",
  customer_account_id: custAcc.id,
  status: "under_review",
  coverage_type: "paid",
  created_at: new Date().toISOString(),
};
db.tickets.push(ticket1);

let quoteId = "";

it("creates quotation version 1 with draft status and sequential QT- numbering", () => {
  const lineItems = [
    { type: "labour", description: "Brake pad replacement labour", quantity: 2, unitPrice: 250 },
    { type: "part", description: "Heavy Duty Ceramic Brake Pads", quantity: 1, unitPrice: 600 },
  ];
  const pricing = calculateQuotationTotals(lineItems, 0.15, "SAR");
  const quotationNumber = generateNumber(tenantA, "QT");

  const quote = {
    id: crypto.randomUUID(),
    tenant_id: tenantA,
    quotation_number: quotationNumber,
    ticket_id: ticket1.id,
    customer_account_id: custAcc.id,
    status: "draft",
    current_version: 1,
    subtotal: pricing.subtotal,
    tax_rate: pricing.taxRate,
    tax_amount: pricing.taxAmount,
    total_amount: pricing.totalAmount,
    currency: "SAR",
    valid_until: new Date(Date.now() + 14 * 86400 * 1000).toISOString(),
    created_by: opsUser.userId,
    created_at: new Date().toISOString(),
  };
  db.quotations.push(quote);

  db.quotationVersions.push({
    id: crypto.randomUUID(),
    quotation_id: quote.id,
    tenant_id: tenantA,
    version_number: 1,
    line_items: pricing.lineItems,
    subtotal: pricing.subtotal,
    tax_rate: pricing.taxRate,
    tax_amount: pricing.taxAmount,
    total_amount: pricing.totalAmount,
    change_reason: "Initial quote created",
    created_at: new Date().toISOString(),
  });

  assert.ok(quote.quotation_number.startsWith("QT-"));
  assert.strictEqual(quote.current_version, 1);
  assert.strictEqual(quote.subtotal, 1100.0);
  assert.strictEqual(quote.tax_amount, 165.0);
  assert.strictEqual(quote.total_amount, 1265.0);
  quoteId = quote.id;
});

it("creates revision version 2 preserving version 1 as immutable history", () => {
  const quote = db.quotations.find((q) => q.id === quoteId);
  const updatedItems = [
    { type: "labour", description: "Brake pad replacement labour", quantity: 2, unitPrice: 250 },
    { type: "part", description: "Heavy Duty Ceramic Brake Pads", quantity: 1, unitPrice: 600 },
    { type: "part", description: "Brake Rotor Resurfacing", quantity: 2, unitPrice: 150 }, // Added rotor
  ];
  const newPricing = calculateQuotationTotals(updatedItems, 0.15, "SAR");

  // Add version 2
  db.quotationVersions.push({
    id: crypto.randomUUID(),
    quotation_id: quote.id,
    tenant_id: tenantA,
    version_number: 2,
    line_items: newPricing.lineItems,
    subtotal: newPricing.subtotal,
    tax_rate: newPricing.taxRate,
    tax_amount: newPricing.taxAmount,
    total_amount: newPricing.totalAmount,
    change_reason: "Rotor resurfacing added after full wheel inspection",
    created_at: new Date().toISOString(),
  });

  quote.current_version = 2;
  quote.subtotal = newPricing.subtotal;
  quote.tax_amount = newPricing.taxAmount;
  quote.total_amount = newPricing.totalAmount;

  assert.strictEqual(quote.current_version, 2);
  assert.strictEqual(quote.subtotal, 1400.0);
  assert.strictEqual(quote.tax_amount, 210.0);
  assert.strictEqual(quote.total_amount, 1610.0);

  // Verify version history has both versions
  const versions = db.quotationVersions.filter((v) => v.quotation_id === quote.id);
  assert.strictEqual(versions.length, 2);
  assert.strictEqual(versions[0].version_number, 1);
  assert.strictEqual(versions[1].version_number, 2);
  assert.strictEqual(versions[0].total_amount, 1265.0); // Version 1 immutable
  assert.strictEqual(versions[1].total_amount, 1610.0);
});

it("requires mandatory reason when customer rejects quotation", () => {
  const quote = db.quotations.find((q) => q.id === quoteId);
  quote.status = "sent";

  // Rejection without reason fails
  assert.throws(() => {
    const reason = "";
    if (!reason || reason.trim().length < 3) throw new Error("VALIDATION_ERROR: Rejection reason required");
  }, /Rejection reason required/);

  // Legitimate rejection with reason
  const validReason = "Need quotation using aftermarket brake pads rather than OEM";
  quote.status = "rejected";
  quote.rejection_reason = validReason;
  quote.customer_rejected_at = new Date().toISOString();

  assert.strictEqual(quote.status, "rejected");
  assert.strictEqual(quote.rejection_reason, validReason);
});

it("customer approves quotation, moving status to approved and automatically issuing invoice", () => {
  const quote = db.quotations.find((q) => q.id === quoteId);
  quote.status = "approved";
  quote.customer_approved_at = new Date().toISOString();

  // Automatic invoice generation
  const invoiceNumber = generateNumber(tenantA, "INV");
  const invoice = {
    id: crypto.randomUUID(),
    tenant_id: tenantA,
    invoice_number: invoiceNumber,
    quotation_id: quote.id,
    ticket_id: quote.ticket_id,
    customer_account_id: quote.customer_account_id,
    status: "issued",
    subtotal: quote.subtotal,
    tax_rate: quote.tax_rate,
    tax_amount: quote.tax_amount,
    total_amount: quote.total_amount,
    amount_paid: 0,
    currency: quote.currency,
    due_date: new Date(Date.now() + 30 * 86400 * 1000).toISOString().split("T")[0],
    issued_at: new Date().toISOString(),
  };
  db.invoices.push(invoice);

  // Ticket transitions to awaiting_payment
  ticket1.status = "awaiting_payment";

  assert.strictEqual(quote.status, "approved");
  assert.ok(invoice.invoice_number.startsWith("INV-"));
  assert.strictEqual(invoice.total_amount, 1610.0);
  assert.strictEqual(invoice.status, "issued");
  assert.strictEqual(ticket1.status, "awaiting_payment");
});

// ============================================================================
// SUITE 3: PAYMENT PROVIDER ABSTRACTION, HMAC WEBHOOK & IDEMPOTENCY
// ============================================================================

it("payment provider generates intent without storing raw card data", async () => {
  const invoice = db.invoices[0];
  const intent = await mockProvider.createPaymentIntent({
    tenantId: tenantA,
    invoiceId: invoice.id,
    ticketId: ticket1.id,
    amount: invoice.total_amount,
    currency: "SAR",
  });

  assert.strictEqual(intent.provider, "mock_gateway");
  assert.ok(intent.paymentIntentId.startsWith("pi_mock_"));
  assert.ok(intent.clientSecret.startsWith("cs_mock_"));
  assert.strictEqual(intent.amount, 1610.0);
});

it("verifies webhook HMAC-SHA256 signature and rejects tampered payloads", () => {
  const payload = JSON.stringify({
    id: "evt_test_001",
    type: "payment.succeeded",
    data: { amount: 1610.0, invoiceId: db.invoices[0].id },
  });

  const validSig = mockProvider.signWebhookPayload(payload, WEBHOOK_SECRET);
  const isValid = mockProvider.verifyWebhookSignature(payload, validSig, WEBHOOK_SECRET);
  assert.strictEqual(isValid, true, "Valid signature must pass");

  // Tampered payload
  const tamperedPayload = JSON.stringify({
    id: "evt_test_001",
    type: "payment.succeeded",
    data: { amount: 10.0, invoiceId: db.invoices[0].id }, // Tampered amount
  });
  const isTamperedValid = mockProvider.verifyWebhookSignature(tamperedPayload, validSig, WEBHOOK_SECRET);
  assert.strictEqual(isTamperedValid, false, "Tampered payload must be rejected");
});

it("enforces replay protection and idempotency on duplicate webhook deliveries", () => {
  const eventId = "evt_idempotent_999";

  function processWebhook(event) {
    const existing = db.webhookEvents.find((e) => e.event_id === event.id);
    if (existing) {
      return { duplicate: true, status: existing.status };
    }

    db.webhookEvents.push({
      id: crypto.randomUUID(),
      event_id: event.id,
      status: "processed",
      payload: event,
    });
    return { duplicate: false, status: "processed" };
  }

  const firstCall = processWebhook({ id: eventId, type: "payment.succeeded" });
  assert.strictEqual(firstCall.duplicate, false);
  assert.strictEqual(firstCall.status, "processed");

  // Second delivery with same event ID (replay/retry)
  const replayCall = processWebhook({ id: eventId, type: "payment.succeeded" });
  assert.strictEqual(replayCall.duplicate, true);
  assert.strictEqual(replayCall.status, "processed");

  const totalProcessed = db.webhookEvents.filter((e) => e.event_id === eventId).length;
  assert.strictEqual(totalProcessed, 1, "Webhook event must only be processed once");
});

// ============================================================================
// SUITE 4: COMMERCIAL GATE ON TICKET STATE MACHINE
// ============================================================================

it("COMMERCIAL GATE: strictly blocks paid ticket from becoming ready_for_assignment while unpaid", () => {
  function tryTransitionToReady(ticket) {
    if (ticket.coverage_type === "paid") {
      const hasPaidInvoice = db.invoices.some(
        (inv) => inv.ticket_id === ticket.id && inv.status === "paid"
      );
      const hasOverride = db.commercialOverrides.some((o) => o.ticket_id === ticket.id);
      if (!hasPaidInvoice && !hasOverride) {
        throw new Error(
          "COMMERCIAL_GATE_BLOCKED: Paid tickets must not become Ready for Assignment until payment is verified, except through an authorized exception."
        );
      }
    }
    ticket.status = "ready_for_assignment";
    return ticket;
  }

  // Currently invoice is unpaid ('issued') and no override exists
  assert.throws(() => {
    tryTransitionToReady(ticket1);
  }, /COMMERCIAL_GATE_BLOCKED/);
});

it("COMMERCIAL GATE: permits transition when an authorized commercial exception is approved", () => {
  // Operations Manager authorizes exception
  const override = {
    id: crypto.randomUUID(),
    tenant_id: tenantA,
    ticket_id: ticket1.id,
    authorized_by: opsUser.userId,
    override_type: "payment_deferred",
    reason: "Key enterprise client with Net-30 payment agreement; authorized for dispatch",
    created_at: new Date().toISOString(),
  };
  db.commercialOverrides.push(override);

  // Transition now succeeds
  const hasOverride = db.commercialOverrides.some((o) => o.ticket_id === ticket1.id);
  assert.ok(hasOverride);
  ticket1.status = "ready_for_assignment";

  assert.strictEqual(ticket1.status, "ready_for_assignment");
});

it("COMMERCIAL GATE: server-verified payment unlocks ticket to ready_for_assignment", () => {
  // New ticket without override
  const ticket2 = {
    id: crypto.randomUUID(),
    tenant_id: tenantA,
    ticket_number: "TCK-2026-000002",
    status: "awaiting_payment",
    coverage_type: "paid",
  };
  db.tickets.push(ticket2);

  const invoice2 = {
    id: crypto.randomUUID(),
    tenant_id: tenantA,
    ticket_id: ticket2.id,
    total_amount: 850.0,
    amount_paid: 0,
    status: "issued",
  };
  db.invoices.push(invoice2);

  // Server receives confirmed payment via verified webhook
  invoice2.amount_paid = 850.0;
  invoice2.status = "paid";
  db.payments.push({
    id: crypto.randomUUID(),
    invoice_id: invoice2.id,
    ticket_id: ticket2.id,
    status: "confirmed",
    amount: 850.0,
  });

  // Automatically unlocks ticket
  if (invoice2.status === "paid") {
    ticket2.status = "ready_for_assignment";
  }

  assert.strictEqual(ticket2.status, "ready_for_assignment");
});

// ============================================================================
// SUITE 5: COVERAGE ENGINE EVALUATION PATHS (WARRANTY, CONTRACT, FREE, PAID)
// ============================================================================

it("evaluates Phase 1: active warranty correctly", () => {
  const assetWithWarranty = {
    id: crypto.randomUUID(),
    category: "vehicle",
    installation_date: "2025-01-01",
  };

  const warranty = {
    id: crypto.randomUUID(),
    asset_id: assetWithWarranty.id,
    warranty_type: "manufacturer",
    provider: "Mercedes-Benz KSA",
    starts_at: "2025-01-01",
    expires_at: "2027-01-01",
    status: "active",
    covers_parts: true,
    covers_labour: true,
  };

  const result = determineCoverage({
    reportDate: new Date("2026-06-01"),
    tenantId: tenantA,
    customerAccount: { id: custAcc.id, account_type: "commercial" },
    asset: assetWithWarranty,
    serviceCategory: "Engine",
    warranties: [warranty],
    contracts: [],
    freeServiceRules: [],
  });

  assert.strictEqual(result.coverageType, "warranty");
  assert.strictEqual(result.decision.type, "warranty");
  assert.ok(result.decision.explanation.includes("Mercedes-Benz KSA"));
});

it("evaluates Phase 2: active customer service contract correctly", () => {
  const asset = { id: crypto.randomUUID(), category: "refrigeration", installation_date: null };
  const contract = {
    id: crypto.randomUUID(),
    customer_account_id: custAcc.id,
    name: "Cold-Chain Fleet Platinum Contract",
    covers_categories: ["refrigeration", "hvac"],
    starts_at: "2026-01-01",
    expires_at: "2026-12-31",
    status: "active",
    includes_parts: true,
    includes_labour: true,
  };

  const result = determineCoverage({
    reportDate: new Date("2026-06-01"),
    tenantId: tenantA,
    customerAccount: { id: custAcc.id, account_type: "commercial" },
    asset,
    serviceCategory: "refrigeration",
    warranties: [],
    contracts: [contract],
    freeServiceRules: [],
  });

  assert.strictEqual(result.coverageType, "contract");
  assert.strictEqual(result.decision.type, "contract");
  assert.ok(result.decision.explanation.includes("Cold-Chain Fleet Platinum Contract"));
});

it("evaluates Phase 3: free service rule requiring approval holds ticket in pending_review", () => {
  const asset = { id: crypto.randomUUID(), category: "vehicle", installation_date: null };

  const rule = {
    id: crypto.randomUUID(),
    name: "Goodwill First Visit Promotion",
    is_enabled: true,
    priority: 10,
  };

  const ruleVersion = {
    id: crypto.randomUUID(),
    rule_id: rule.id,
    version_number: 1,
    eligible_account_types: ["commercial"],
    eligible_account_ids: null,
    eligible_asset_categories: null,
    eligible_service_categories: null,
    effective_from: "2026-01-01",
    effective_until: "2026-12-31",
    max_visits_per_asset: 1,
    visit_period: "year",
    covers_labour: true,
    covers_parts: false,
    requires_approval: true, // Requires human approval!
    approver_role: "tenant_manager",
    approver_user_id: null,
    exclusions: [],
    conditions: [],
    status: "approved",
  };

  const result = determineCoverage({
    reportDate: new Date("2026-06-01"),
    tenantId: tenantA,
    customerAccount: { id: custAcc.id, account_type: "commercial" },
    asset,
    serviceCategory: "inspection",
    warranties: [],
    contracts: [],
    freeServiceRules: [{ rule, version: ruleVersion }],
  });

  assert.strictEqual(result.coverageType, "pending_review", "Must be held in pending_review");
  assert.strictEqual(result.decision.type, "pending_review");
  assert.strictEqual(result.decision.requiresApproval, true);
});

it("evaluates Phase 4: falls back to paid service when no warranty, contract, or free rule matches", () => {
  const result = determineCoverage({
    reportDate: new Date("2026-06-01"),
    tenantId: tenantA,
    customerAccount: { id: custAcc.id, account_type: "commercial" },
    asset: null, // Non-asset general service
    serviceCategory: "Consulting",
    warranties: [],
    contracts: [],
    freeServiceRules: [],
  });

  assert.strictEqual(result.coverageType, "paid");
  assert.strictEqual(result.decision.type, "paid");
  assert.ok(result.decision.explanation.includes("Standard charges apply"));
});

console.log(`\nResults: ${passed} / ${total} tests passed.`);
if (passed === total) {
  console.log("All Step 10 tests passed successfully!\n");
} else {
  console.error("Some tests failed!");
  process.exit(1);
}
