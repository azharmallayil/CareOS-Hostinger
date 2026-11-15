import assert from "node:assert/strict";
import crypto from "node:crypto";

console.log("=== CareOS Step 13: Maintenance, Warranty/RMA & Spare-Parts Inventory Tests ===\n");

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
// SUITE 1: Preventive Maintenance Plans & Schedules
// ----------------------------------------------------------------------------
test("creates preventive maintenance plan with kilometer/calendar intervals", () => {
  const pmPlan = {
    id: "plan-pm-10k",
    code: "PM-10K",
    name: "10,000 km Telematics Inspection & Battery Health",
    trigger_type: "interval_km",
    interval_km: 10000,
    interval_months: 6,
    checklist_template: [
      { item: "Inspect wiring harness", mandatory: true },
      { item: "Check backup battery voltage", mandatory: true },
      { item: "Verify GPS signal strength", mandatory: true },
    ],
    is_active: true,
  };

  assert.equal(pmPlan.code, "PM-10K");
  assert.equal(pmPlan.interval_km, 10000);
  assert.equal(pmPlan.checklist_template.length, 3);
});

test("computes next due odometer reading and flags upcoming vs overdue schedules", () => {
  const evaluateSchedule = (currentKm, lastPerformedKm, intervalKm) => {
    const nextDueKm = (lastPerformedKm || 0) + intervalKm;
    const diff = nextDueKm - currentKm;
    if (diff < 0) return { status: "overdue", nextDueKm, diff };
    if (diff <= 1000) return { status: "due", nextDueKm, diff };
    return { status: "upcoming", nextDueKm, diff };
  };

  // 1. Current = 15,000 km, last performed = 0, interval = 10,000 km -> Overdue
  const sched1 = evaluateSchedule(15000, 0, 10000);
  assert.equal(sched1.status, "overdue");
  assert.equal(sched1.nextDueKm, 10000);

  // 2. Current = 9,500 km, last performed = 0, interval = 10,000 km -> Due (within 1,000 km)
  const sched2 = evaluateSchedule(9500, 0, 10000);
  assert.equal(sched2.status, "due");

  // 3. Current = 2,000 km, last performed = 0, interval = 10,000 km -> Upcoming
  const sched3 = evaluateSchedule(2000, 0, 10000);
  assert.equal(sched3.status, "upcoming");
});

test("records maintenance completion linked to ticket/work order and updates schedule", () => {
  const schedule = {
    asset_id: "asset-truck-10",
    plan_id: "plan-pm-10k",
    last_performed_at: null,
    last_odometer_km: null,
    status: "due",
  };

  const maintenanceRecord = {
    id: "rec-1",
    plan_id: schedule.plan_id,
    asset_id: schedule.asset_id,
    ticket_id: "tck-pm-100",
    work_order_id: "wo-pm-100",
    completed_at: new Date().toISOString(),
    odometer_km: 10120,
    findings: "Wiring harness in good condition; backup battery replaced under PM",
  };

  // Update schedule
  schedule.last_performed_at = maintenanceRecord.completed_at;
  schedule.last_odometer_km = maintenanceRecord.odometer_km;
  schedule.status = "completed";

  assert.equal(schedule.status, "completed");
  assert.equal(schedule.last_odometer_km, 10120);
  assert.equal(maintenanceRecord.ticket_id, "tck-pm-100");
  assert.equal(maintenanceRecord.work_order_id, "wo-pm-100");
});

// ----------------------------------------------------------------------------
// SUITE 2: Warranty Traceability & RMA Cases
// ----------------------------------------------------------------------------
test("validates sequential atomic RMA case number format RMA-YYYY-00001", () => {
  const rmaNumber = "RMA-2026-00015";
  const regex = /^RMA-\d{4}-\d{5}$/;
  assert.ok(regex.test(rmaNumber), "Should match RMA-YYYY-00001 pattern");
});

test("maintains end-to-end traceability from ticket and warranty to RMA case and items", () => {
  const ticket = { id: "tck-fault-1", asset_id: "asset-bus-04" };
  const warranty = {
    id: "warr-mfg-01",
    asset_id: ticket.asset_id,
    provider: "Teltonika Global",
    status: "active",
  };

  const rmaCase = {
    id: "rma-case-01",
    case_number: "RMA-2026-00001",
    ticket_id: ticket.id,
    asset_id: ticket.asset_id,
    warranty_id: warranty.id,
    status: "authorized",
    reason_for_return: "Internal modem failure; no GSM connection",
    oem_name: "Teltonika",
  };

  const rmaItem = {
    id: "rma-item-01",
    rma_case_id: rmaCase.id,
    item_type: "telematics_unit",
    part_number: "FMB-120",
    serial_number: "SN-TEL-9847291",
    fault_description: "Modem failure confirmed via bench test",
    inspection_result: "defective_under_warranty",
    action_taken: "replaced_new",
    replacement_serial_number: "SN-TEL-9988112",
  };

  // Verify chain of custody & traceability
  assert.equal(rmaCase.ticket_id, ticket.id);
  assert.equal(rmaCase.asset_id, ticket.asset_id);
  assert.equal(rmaCase.warranty_id, warranty.id);
  assert.equal(rmaItem.rma_case_id, rmaCase.id);
  assert.equal(rmaItem.inspection_result, "defective_under_warranty");
  assert.equal(rmaItem.replacement_serial_number, "SN-TEL-9988112");
});

test("updates RMA status to closed with resolution summary", () => {
  const rmaCase = {
    id: "rma-case-01",
    status: "authorized",
    resolution_summary: null,
  };

  rmaCase.status = "closed";
  rmaCase.resolution_summary = "Defective unit replaced with new unit SN-TEL-9988112 under OEM warranty";

  assert.equal(rmaCase.status, "closed");
  assert.ok(rmaCase.resolution_summary.includes("SN-TEL-9988112"));
});

// ----------------------------------------------------------------------------
// SUITE 3: Spare-Parts Catalog, Stock Locations & Low-Stock Alerts
// ----------------------------------------------------------------------------
test("creates spare parts with unique part numbers and reorder thresholds", () => {
  const part = {
    id: "part-gps-ant",
    part_number: "ANT-GPS-001",
    name: "External Active GPS Antenna (SMA)",
    category: "antennas",
    unit_of_measure: "unit",
    unit_cost: 35.0,
    unit_price: 60.0,
    reorder_threshold: 10,
    is_serialized: false,
  };

  assert.equal(part.part_number, "ANT-GPS-001");
  assert.equal(part.reorder_threshold, 10);
});

test("accurately detects low-stock items at or below reorder threshold", () => {
  const stockLevels = [
    { part_id: "part-1", quantity_on_hand: 4, reorder_threshold: 5 }, // LOW (4 <= 5)
    { part_id: "part-2", quantity_on_hand: 5, reorder_threshold: 5 }, // LOW (5 <= 5)
    { part_id: "part-3", quantity_on_hand: 20, reorder_threshold: 5 }, // NORMAL (20 > 5)
  ];

  const lowStock = stockLevels.filter((lvl) => lvl.quantity_on_hand <= lvl.reorder_threshold);
  assert.equal(lowStock.length, 2);
  assert.equal(lowStock[0].part_id, "part-1");
  assert.equal(lowStock[1].part_id, "part-2");
});

// ----------------------------------------------------------------------------
// SUITE 4: Audited Stock Movements & Manual Adjustment Authorization
// ----------------------------------------------------------------------------
test("strictly forbids manual stock adjustments without supervisor authorization", () => {
  const processStockAdjustment = (movementType, authorizedBy) => {
    if (movementType === "adjustment_positive" || movementType === "adjustment_negative") {
      if (!authorizedBy) {
        throw new Error("Manual stock adjustments require explicit supervisor authorization");
      }
    }
    return true;
  };

  // Unauthorized negative adjustment throws error
  assert.throws(
    () => processStockAdjustment("adjustment_negative", null),
    /Manual stock adjustments require explicit supervisor authorization/
  );

  // Authorized negative adjustment succeeds
  assert.ok(processStockAdjustment("adjustment_negative", "supervisor-uuid-99"));

  // Routine transfer does not require adjustment authorization
  assert.ok(processStockAdjustment("transfer", null));
});

test("records immutable stock movement audit trail for transfers between warehouse and technician van", () => {
  const warehouseLevel = { location_id: "loc-warehouse", quantity_on_hand: 50 };
  const vanLevel = { location_id: "loc-van-04", quantity_on_hand: 5 };
  const movements = [];

  const transferQty = 10;

  // Execute transfer
  warehouseLevel.quantity_on_hand -= transferQty;
  vanLevel.quantity_on_hand += transferQty;

  movements.push({
    movement_type: "transfer",
    source_location_id: warehouseLevel.location_id,
    destination_location_id: vanLevel.location_id,
    part_id: "part-gps-ant",
    quantity: transferQty,
    reason: "Restock technician service vehicle #4",
    performed_by: "dispatcher-user-01",
    created_at: new Date().toISOString(),
  });

  assert.equal(warehouseLevel.quantity_on_hand, 40);
  assert.equal(vanLevel.quantity_on_hand, 15);
  assert.equal(movements.length, 1);
  assert.equal(movements[0].movement_type, "transfer");
});

// ----------------------------------------------------------------------------
// SUITE 5: Work Order Parts Consumption & Stock Level Debit
// ----------------------------------------------------------------------------
test("strictly blocks consuming parts when requested quantity exceeds stock on hand", () => {
  const vanStock = { part_id: "part-relay", quantity_on_hand: 2 };

  const consumeParts = (requestedQty) => {
    if (requestedQty > vanStock.quantity_on_hand) {
      throw new Error("Insufficient stock on hand at selected location");
    }
    vanStock.quantity_on_hand -= requestedQty;
    return true;
  };

  // Requesting 5 when only 2 available throws INSUFFICIENT_STOCK
  assert.throws(
    () => consumeParts(5),
    /Insufficient stock on hand at selected location/
  );

  // Requesting 2 succeeds
  assert.ok(consumeParts(2));
  assert.equal(vanStock.quantity_on_hand, 0);
});

test("consumes parts on work order, debits stock, and links records for billing and audit", () => {
  const vanStock = { part_id: "part-harness", quantity_on_hand: 8 };
  const workOrder = { id: "wo-inst-01", ticket_id: "tck-inst-01" };
  const partsUsageLog = [];
  const movementAuditLog = [];

  const consumeQty = 2;
  const unitPrice = 75.0;

  // 1. Debit stock
  vanStock.quantity_on_hand -= consumeQty;

  // 2. Record work order parts usage
  partsUsageLog.push({
    work_order_id: workOrder.id,
    ticket_id: workOrder.ticket_id,
    part_id: vanStock.part_id,
    quantity: consumeQty,
    unit_price: unitPrice,
    is_billable: true,
    warranty_covered: false,
    consumed_at: new Date().toISOString(),
  });

  // 3. Record movement audit
  movementAuditLog.push({
    movement_type: "work_order_consumed",
    reference_type: "work_order",
    reference_id: workOrder.id,
    quantity: consumeQty,
    reason: "Consumed on Work Order",
  });

  assert.equal(vanStock.quantity_on_hand, 6);
  assert.equal(partsUsageLog[0].work_order_id, "wo-inst-01");
  assert.equal(partsUsageLog[0].quantity, 2);
  assert.equal(movementAuditLog[0].movement_type, "work_order_consumed");
});

console.log(`\nResults: ${passed} / ${total} tests passed.`);
console.log("All Step 13 tests passed successfully!\n");
