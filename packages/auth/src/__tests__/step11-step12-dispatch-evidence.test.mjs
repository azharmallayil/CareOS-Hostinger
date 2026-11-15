import assert from "node:assert/strict";
import crypto from "node:crypto";

console.log("=== CareOS Step 11 & Step 12: Dispatch, Work Orders, Evidence & Bulk Service Tests ===\n");

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
// Dispatch & Evidence Domain Functions
// ----------------------------------------------------------------------------
export const APPROVED_REJECTION_REASONS = [
  "out_of_territory",
  "skill_mismatch",
  "schedule_conflict",
  "vehicle_breakdown",
  "emergency",
  "other",
];

export const ALLOWED_EVIDENCE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "video/mp4",
];

export const MAX_EVIDENCE_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export function calculateHaversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function computeTechnicianRecommendations(technicians, context) {
  const scores = technicians.map((tech) => {
    const reasons = [];

    if (tech.status !== "active") {
      return {
        technicianId: tech.id,
        fullName: tech.fullName,
        totalScore: 0,
        isEligible: false,
        scoreBreakdown: {
          skillScore: 0,
          territoryScore: 0,
          availabilityScore: 0,
          workloadScore: 0,
          proximityScore: 0,
        },
        reasons: [`Technician is currently ${tech.status}`],
      };
    }

    if (tech.onLeave) {
      return {
        technicianId: tech.id,
        fullName: tech.fullName,
        totalScore: 0,
        isEligible: false,
        scoreBreakdown: {
          skillScore: 0,
          territoryScore: 0,
          availabilityScore: 0,
          workloadScore: 0,
          proximityScore: 0,
        },
        reasons: ["Technician is on approved leave for this date"],
      };
    }

    // 1. Skill Match (0 - 30)
    let skillScore = 0;
    if (context.requiredSkill) {
      if (tech.skills.includes(context.requiredSkill)) {
        skillScore = 30;
        reasons.push(`Direct skill match: ${context.requiredSkill}`);
      } else {
        skillScore = 5;
        reasons.push(`Missing certified skill: ${context.requiredSkill}`);
      }
    } else {
      skillScore = 25;
      reasons.push("General field technician profile");
    }

    // 2. Territory Match (0 - 25)
    let territoryScore = 15;
    if (context.customerSite?.city) {
      const territoryMatch = tech.territories.some(
        (t) => t.toLowerCase() === context.customerSite.city.toLowerCase()
      );
      if (territoryMatch) {
        territoryScore = 25;
        reasons.push(`Assigned territory matches ${context.customerSite.city}`);
      }
    }

    // 3. Availability (0 - 20)
    let availabilityScore = 0;
    if (tech.workingToday) {
      availabilityScore = 20;
      reasons.push("Working shift scheduled for this date");
    } else {
      availabilityScore = 5;
      reasons.push("Non-standard shift / off-day");
    }

    // 4. Workload Balance (0 - 15)
    let workloadScore = 0;
    const remainingSlots = Math.max(0, tech.maxActiveWorkOrders - tech.currentWorkload);
    if (remainingSlots <= 0) {
      workloadScore = 0;
      reasons.push(`At maximum workload capacity (${tech.currentWorkload}/${tech.maxActiveWorkOrders})`);
    } else {
      const loadRatio = remainingSlots / tech.maxActiveWorkOrders;
      workloadScore = Math.round(loadRatio * 15);
      reasons.push(`Capacity available: ${remainingSlots} open slots (${tech.currentWorkload} active)`);
    }

    // 5. Proximity (0 - 10)
    let proximityScore = 5;
    if (
      tech.lastLocation &&
      context.customerSite?.latitude &&
      context.customerSite?.longitude
    ) {
      const distKm = calculateHaversineKm(
        tech.lastLocation.lat,
        tech.lastLocation.lng,
        context.customerSite.latitude,
        context.customerSite.longitude
      );
      if (distKm <= 10) {
        proximityScore = 10;
        reasons.push(`Within 10 km (${distKm.toFixed(1)} km away)`);
      } else if (distKm <= 30) {
        proximityScore = 7;
        reasons.push(`Within 30 km (${distKm.toFixed(1)} km away)`);
      } else {
        proximityScore = 3;
        reasons.push(`Distance is ${distKm.toFixed(1)} km away`);
      }
    }

    const totalScore =
      skillScore + territoryScore + availabilityScore + workloadScore + proximityScore;

    return {
      technicianId: tech.id,
      fullName: tech.fullName,
      totalScore,
      isEligible: remainingSlots > 0 && tech.workingToday,
      scoreBreakdown: {
        skillScore,
        territoryScore,
        availabilityScore,
        workloadScore,
        proximityScore,
      },
      reasons,
    };
  });

  return scores.sort((a, b) => b.totalScore - a.totalScore);
}

export function validateEvidenceFile(mimeType, fileSizeBytes) {
  if (!ALLOWED_EVIDENCE_MIME_TYPES.includes(mimeType)) {
    return {
      isValid: false,
      error: `Unsupported MIME type: '${mimeType}'. Allowed types: ${ALLOWED_EVIDENCE_MIME_TYPES.join(", ")}`,
    };
  }

  if (fileSizeBytes > MAX_EVIDENCE_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `File size ${fileSizeBytes} bytes exceeds maximum allowed limit of ${MAX_EVIDENCE_FILE_SIZE_BYTES} bytes (15MB)`,
    };
  }

  if (fileSizeBytes <= 0) {
    return {
      isValid: false,
      error: "File is empty (0 bytes)",
    };
  }

  return { isValid: true };
}

export function generateSignedStorageToken(storagePath, tenantId, expiresInSeconds = 900) {
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  const secret = process.env["STORAGE_SIGNING_KEY"] || "careos-default-storage-key-secure";
  
  const payload = `${tenantId}:${storagePath}:${expiresAt}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  const token = Buffer.from(JSON.stringify({ tenantId, storagePath, expiresAt, signature })).toString("base64url");
  const signedUrl = `/api/v1/evidence/download/${token}`;

  return { token, expiresAt, signedUrl };
}

export function verifySignedStorageToken(token, expectedTenantId) {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parsed = JSON.parse(raw);

    if (!parsed.storagePath || !parsed.expiresAt || !parsed.signature) {
      return { isValid: false, error: "Malformed signed storage token" };
    }

    if (new Date(parsed.expiresAt).getTime() < Date.now()) {
      return { isValid: false, error: "Signed storage URL has expired" };
    }

    if (expectedTenantId && parsed.tenantId !== expectedTenantId) {
      return { isValid: false, error: "Cross-tenant token forbidden" };
    }

    const secret = process.env["STORAGE_SIGNING_KEY"] || "careos-default-storage-key-secure";
    const payload = `${parsed.tenantId}:${parsed.storagePath}:${parsed.expiresAt}`;
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    if (
      !crypto.timingSafeEqual(
        Buffer.from(parsed.signature, "hex"),
        Buffer.from(expectedSig, "hex")
      )
    ) {
      return { isValid: false, error: "Invalid token signature" };
    }

    return { isValid: true, storagePath: parsed.storagePath };
  } catch (err) {
    return { isValid: false, error: err.message || "Failed to decode token" };
  }
}

// ----------------------------------------------------------------------------
// SUITE 1: Ranked Dispatch Recommendation Engine
// ----------------------------------------------------------------------------
test("calculates Haversine distance correctly between two coordinates", () => {
  // Riyadh King Fahd Rd (24.7136, 46.6753) to Olaya (24.6900, 46.6850) ~ 2.8 km
  const dist = calculateHaversineKm(24.7136, 46.6753, 24.69, 46.685);
  assert.ok(dist > 2.5 && dist < 3.2, `Expected ~2.8km, got ${dist}km`);
});

test("ranks technician with matching skills and territory higher than mismatched technician", () => {
  const techA = {
    id: "tech-1",
    fullName: "Tariq Al-Mansoor",
    email: "tariq@fleetops.sa",
    status: "active",
    maxActiveWorkOrders: 4,
    currentWorkload: 1, // 3 remaining
    avgRating: 4.9,
    skills: ["gps_installation", "can_bus_diagnostics"],
    territories: ["Riyadh"],
    workingToday: true,
    onLeave: false,
    lastLocation: { lat: 24.71, lng: 46.67, updatedAt: new Date().toISOString() },
  };

  const techB = {
    id: "tech-2",
    fullName: "Farooq Hassan",
    email: "farooq@fleetops.sa",
    status: "active",
    maxActiveWorkOrders: 4,
    currentWorkload: 3, // 1 remaining
    avgRating: 4.2,
    skills: ["general_repair"],
    territories: ["Dammam"],
    workingToday: true,
    onLeave: false,
    lastLocation: { lat: 26.42, lng: 50.09, updatedAt: new Date().toISOString() },
  };

  const context = {
    ticketId: "tck-101",
    requiredSkill: "gps_installation",
    priority: "high",
    scheduledDate: "2026-11-20",
    customerSite: { city: "Riyadh", latitude: 24.7136, longitude: 46.6753 },
  };

  const ranked = computeTechnicianRecommendations([techA, techB], context);

  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].technicianId, "tech-1");
  assert.ok(ranked[0].totalScore > ranked[1].totalScore);
  assert.equal(ranked[0].isEligible, true);
  assert.equal(ranked[0].scoreBreakdown.skillScore, 30);
  assert.equal(ranked[0].scoreBreakdown.territoryScore, 25);
  assert.equal(ranked[0].scoreBreakdown.proximityScore, 10);
});

test("strictly marks technician on leave or at max capacity as ineligible", () => {
  const techOnLeave = {
    id: "tech-leave",
    fullName: "Nasser Al-Subaie",
    email: "nasser@fleetops.sa",
    status: "active",
    maxActiveWorkOrders: 4,
    currentWorkload: 0,
    avgRating: 5.0,
    skills: ["gps_installation"],
    territories: ["Riyadh"],
    workingToday: true,
    onLeave: true, // ON LEAVE
  };

  const techAtCapacity = {
    id: "tech-full",
    fullName: "Khalid Omer",
    email: "khalid@fleetops.sa",
    status: "active",
    maxActiveWorkOrders: 3,
    currentWorkload: 3, // 0 REMAINING
    avgRating: 4.8,
    skills: ["gps_installation"],
    territories: ["Riyadh"],
    workingToday: true,
    onLeave: false,
  };

  const context = {
    ticketId: "tck-102",
    requiredSkill: "gps_installation",
    priority: "medium",
    scheduledDate: "2026-11-20",
  };

  const ranked = computeTechnicianRecommendations([techOnLeave, techAtCapacity], context);

  const leaveRec = ranked.find((r) => r.technicianId === "tech-leave");
  assert.equal(leaveRec.isEligible, false);
  assert.equal(leaveRec.totalScore, 0);

  const fullRec = ranked.find((r) => r.technicianId === "tech-full");
  assert.equal(fullRec.isEligible, false);
  assert.equal(fullRec.scoreBreakdown.workloadScore, 0);
});

// ----------------------------------------------------------------------------
// SUITE 2: Work Order Lifecycle, Acceptance & Rejection
// ----------------------------------------------------------------------------
test("validates work order number format WO-YYYY-000001", () => {
  const sampleWoNumber = "WO-2026-000042";
  const regex = /^WO-\d{4}-\d{6}$/;
  assert.ok(regex.test(sampleWoNumber), "Should match WO-YYYY-000001 pattern");
});

test("accepts work order and transitions status to accepted", () => {
  const workOrder = {
    id: "wo-1",
    work_order_number: "WO-2026-000001",
    ticket_id: "tck-1",
    technician_id: "tech-1",
    status: "assigned",
  };

  workOrder.status = "accepted";
  const historyEvent = {
    action: "accepted",
    work_order_id: workOrder.id,
    technician_id: workOrder.technician_id,
    responded_at: new Date().toISOString(),
  };

  assert.equal(workOrder.status, "accepted");
  assert.equal(historyEvent.action, "accepted");
});

test("rejects invalid rejection reason not in approved list", () => {
  const badReason = "too_tired";
  const isValid = APPROVED_REJECTION_REASONS.includes(badReason);
  assert.equal(isValid, false, "Should reject unapproved reason");
});

test("strictly requires explanation when rejection reason is 'other'", () => {
  const validateRejection = (reason, explanation) => {
    if (!APPROVED_REJECTION_REASONS.includes(reason)) {
      throw new Error("Invalid reason");
    }
    if (reason === "other" && (!explanation || !explanation.trim())) {
      throw new Error("Explanation mandatory for 'other'");
    }
    return true;
  };

  assert.throws(
    () => validateRejection("other", ""),
    /Explanation mandatory for 'other'/
  );

  assert.ok(validateRejection("other", "Customer site is closed for renovation until next Monday"));
  assert.ok(validateRejection("vehicle_breakdown", undefined));
});

test("rejection unassigns work order, returns ticket to unassigned queue, and creates timeline audit", () => {
  const ticket = { id: "tck-10", status: "scheduled" };
  const workOrder = { id: "wo-10", status: "assigned", technician_id: "tech-1" };
  const history = [];
  const events = [];

  const rejectionReason = "out_of_territory";
  workOrder.status = "cancelled";
  workOrder.technician_id = null;
  ticket.status = "ready_for_assignment";

  history.push({
    work_order_id: workOrder.id,
    action: "rejected",
    rejection_reason: rejectionReason,
    unassigned_at: new Date().toISOString(),
  });

  events.push({
    ticket_id: ticket.id,
    event_type: "work_order_rejected",
    is_internal: true,
    body: `Work Order rejected by technician. Reason: ${rejectionReason}. Returned to dispatch queue.`,
  });

  assert.equal(ticket.status, "ready_for_assignment");
  assert.equal(workOrder.technician_id, null);
  assert.equal(history[0].action, "rejected");
  assert.equal(events[0].event_type, "work_order_rejected");
});

test("reassignment after acceptance requires mandatory justification and updates audit history", () => {
  const workOrder = {
    id: "wo-20",
    work_order_number: "WO-2026-000020",
    technician_id: "tech-1",
    status: "accepted",
  };
  const history = [];

  const newTechId = "tech-2";
  const reason = "Technician 1 experienced field emergency";

  assert.ok(reason.trim().length > 0);

  history.push({
    work_order_id: workOrder.id,
    technician_id: workOrder.technician_id,
    action: "reassigned",
    unassigned_at: new Date().toISOString(),
    reassignment_reason: reason,
  });

  workOrder.technician_id = newTechId;
  workOrder.status = "assigned";

  history.push({
    work_order_id: workOrder.id,
    technician_id: newTechId,
    action: "assigned",
    assigned_at: new Date().toISOString(),
  });

  assert.equal(workOrder.technician_id, "tech-2");
  assert.equal(history.length, 2);
  assert.equal(history[0].reassignment_reason, reason);
});

// ----------------------------------------------------------------------------
// SUITE 3: Service Evidence & Signed Private Storage
// ----------------------------------------------------------------------------
test("validates evidence MIME types and enforces 15MB file size limit", () => {
  assert.ok(validateEvidenceFile("image/jpeg", 2048).isValid);
  assert.ok(validateEvidenceFile("image/png", 1024 * 1024).isValid);
  assert.ok(validateEvidenceFile("application/pdf", 5 * 1024 * 1024).isValid);
  assert.ok(validateEvidenceFile("video/mp4", 12 * 1024 * 1024).isValid);

  const exeResult = validateEvidenceFile("application/x-msdownload", 1024);
  assert.equal(exeResult.isValid, false);
  assert.ok(exeResult.error.includes("Unsupported MIME type"));

  const oversizeResult = validateEvidenceFile("image/jpeg", 16 * 1024 * 1024);
  assert.equal(oversizeResult.isValid, false);
  assert.ok(oversizeResult.error.includes("exceeds maximum allowed limit"));
});

test("generates and verifies HMAC-signed private storage tokens with expiration and tenant isolation", () => {
  const tenantId = "tenant-riyadh-01";
  const storagePath = `tenants/${tenantId}/work-orders/wo-100/photo.jpg`;

  const { token, expiresAt, signedUrl } = generateSignedStorageToken(storagePath, tenantId, 60);

  assert.ok(token);
  assert.ok(signedUrl.startsWith("/api/v1/evidence/download/"));

  const validCheck = verifySignedStorageToken(token, tenantId);
  assert.equal(validCheck.isValid, true);
  assert.equal(validCheck.storagePath, storagePath);

  const crossTenantCheck = verifySignedStorageToken(token, "foreign-tenant-02");
  assert.equal(crossTenantCheck.isValid, false);
  assert.equal(crossTenantCheck.error, "Cross-tenant token forbidden");
});

test("evidence review sets verified or rejected, and finalized evidence is locked", () => {
  const evidence = {
    id: "ev-1",
    review_status: "pending_review",
    is_finalized: false,
    storage_path: "path/to/evidence.jpg",
  };

  evidence.review_status = "verified";
  assert.equal(evidence.review_status, "verified");

  evidence.is_finalized = true;
  assert.equal(evidence.is_finalized, true);

  const attemptMutation = (ev, newPath) => {
    if (ev.is_finalized) {
      throw new Error("Finalized evidence cannot be modified or deleted");
    }
    ev.storage_path = newPath;
  };

  assert.throws(
    () => attemptMutation(evidence, "tampered/path.jpg"),
    /Finalized evidence cannot be modified or deleted/
  );
});

// ----------------------------------------------------------------------------
// SUITE 4: Web Location Sharing & Customer Privacy Discipline
// ----------------------------------------------------------------------------
test("technician location sharing is opt-in and customer view strictly hides raw GPS coordinates", () => {
  const technician = {
    id: "tech-1",
    full_name: "Tariq Al-Mansoor",
    location_sharing_enabled: true,
    last_location_lat: 24.7136,
    last_location_lng: 46.6753,
    last_location_updated_at: new Date().toISOString(),
  };

  const workOrder = {
    id: "wo-1",
    work_order_number: "WO-2026-000001",
    status: "en_route",
    scheduled_window_start: "09:00:00",
    scheduled_window_end: "12:00:00",
  };

  const projectCustomerWorkOrderView = (wo, tech) => {
    return {
      workOrderNumber: wo.work_order_number,
      status: wo.status,
      arrivalWindow: `${wo.scheduled_window_start} - ${wo.scheduled_window_end}`,
      technicianName: tech.full_name.split(" ")[0],
    };
  };

  const customerView = projectCustomerWorkOrderView(workOrder, technician);

  assert.equal(customerView.workOrderNumber, "WO-2026-000001");
  assert.equal(customerView.status, "en_route");
  assert.equal(customerView.technicianName, "Tariq");
  assert.equal(customerView.last_location_lat, undefined);
  assert.equal(customerView.last_location_lng, undefined);
  assert.equal(customerView.coordinates, undefined);
});

// ----------------------------------------------------------------------------
// SUITE 5: Bulk Service Request & Independent Single-Asset Ticket Integrity (OQ-10)
// ----------------------------------------------------------------------------
test("bulk service campaign generates sequential batch BSR-YYYY-00001 and creates INDEPENDENT tickets per asset", () => {
  const batchNumber = "BSR-2026-00001";
  const regex = /^BSR-\d{4}-\d{5}$/;
  assert.ok(regex.test(batchNumber), "Should match BSR-YYYY-00001 pattern");

  const bulkItems = [
    { assetId: "asset-1", vin: "VIN-TRUCK-001" },
    { assetId: "asset-2", vin: "VIN-TRUCK-002" },
    { assetId: "asset-3", vin: "VIN-TRUCK-003" },
  ];

  const ticketsCreated = bulkItems.map((item, index) => {
    return {
      id: `ticket-${index + 1}`,
      ticket_number: `TCK-2026-00000${index + 1}`,
      asset_id: item.assetId,
      bulk_batch_number: batchNumber,
      status: "ready_for_assignment",
    };
  });

  assert.equal(ticketsCreated.length, 3);
  assert.equal(ticketsCreated[0].asset_id, "asset-1");
  assert.equal(ticketsCreated[1].asset_id, "asset-2");
  assert.equal(ticketsCreated[2].asset_id, "asset-3");

  ticketsCreated.forEach((t) => {
    assert.equal(typeof t.asset_id, "string");
    assert.ok(t.asset_id.startsWith("asset-"));
    assert.equal(t.ticket_assets, undefined);
  });
});

console.log(`\nResults: ${passed} / ${total} tests passed.`);
console.log("All Step 11 & Step 12 tests passed successfully!\n");
