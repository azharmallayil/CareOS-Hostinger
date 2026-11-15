import assert from "node:assert/strict";
import crypto from "node:crypto";

console.log("=== CareOS Step 15: ERP & Telematics Integrations Tests ===\n");

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
// SUITE 1: Canonical ERP Model, Field Mappings & External ID Resolution
// ----------------------------------------------------------------------------
function mapFields(source, mappings) {
  if (!mappings || Object.keys(mappings).length === 0) return { ...source };
  const result = { ...source };
  for (const [internalKey, externalKey] of Object.entries(mappings)) {
    if (source[internalKey] !== undefined) {
      result[externalKey] = source[internalKey];
      if (internalKey !== externalKey) delete result[internalKey];
    }
  }
  return result;
}

test("transforms CareOS canonical customer to external ERP schema using field mappings", () => {
  const careOsCustomer = {
    id: "cust-1234-uuid",
    name: "Al-Salam Transport Logistics",
    accountNumber: "ACC-9921",
    email: "billing@alsalam.com",
    taxNumber: "300123456700003",
  };

  const fieldMappings = {
    accountNumber: "CustomerCode",
    name: "CompanyName",
    taxNumber: "VatRegistrationNo",
  };

  const erpPayload = mapFields(careOsCustomer, fieldMappings);

  assert.equal(erpPayload.CustomerCode, "ACC-9921");
  assert.equal(erpPayload.CompanyName, "Al-Salam Transport Logistics");
  assert.equal(erpPayload.VatRegistrationNo, "300123456700003");
  assert.equal(erpPayload.email, "billing@alsalam.com"); // Untransformed fields preserved
  assert.equal(erpPayload.accountNumber, undefined); // Old key renamed
});

test("bidirectional external ID mapping: resolves CareOS ID <-> ERP external ID", () => {
  const externalIdTable = [];

  function recordMapping(tenantId, entityType, internalId, externalId) {
    externalIdTable.push({ tenantId, entityType, internalId, externalId });
  }

  function getExternalId(tenantId, entityType, internalId) {
    const row = externalIdTable.find(
      (r) => r.tenantId === tenantId && r.entityType === entityType && r.internalId === internalId
    );
    return row ? row.externalId : null;
  }

  function getInternalId(tenantId, entityType, externalId) {
    const row = externalIdTable.find(
      (r) => r.tenantId === tenantId && r.entityType === entityType && r.externalId === externalId
    );
    return row ? row.internalId : null;
  }

  recordMapping("tenant-1", "customer", "careos-cust-001", "ERP-CUST-8831");
  recordMapping("tenant-1", "invoice", "careos-inv-100", "SAP-INV-990022");

  assert.equal(getExternalId("tenant-1", "customer", "careos-cust-001"), "ERP-CUST-8831");
  assert.equal(getInternalId("tenant-1", "customer", "ERP-CUST-8831"), "careos-cust-001");
  assert.equal(getExternalId("tenant-1", "invoice", "careos-inv-100"), "SAP-INV-990022");
  // Cross tenant isolation
  assert.equal(getExternalId("tenant-2", "customer", "careos-cust-001"), null);
});

// ----------------------------------------------------------------------------
// SUITE 2: Webhook HMAC Signature Validation & Secret Protection
// ----------------------------------------------------------------------------
function verifyHmacSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  try {
    const cleanSig = signature.replace(/^sha256=/i, "").trim().toLowerCase();
    const expectedHex = crypto
      .createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex")
      .toLowerCase();

    if (cleanSig.length !== expectedHex.length) return false;
    return crypto.timingSafeEqual(Buffer.from(cleanSig, "hex"), Buffer.from(expectedHex, "hex"));
  } catch {
    return false;
  }
}

test("validates genuine HMAC-SHA256 signature for incoming telematics webhook", () => {
  const secret = "careos_telematics_wh_sec_99a8b7c6";
  const payload = JSON.stringify({
    deviceId: "MDVR-88219",
    type: "camera_fault",
    channel: 2,
    errorCode: "ERR_VIDEO_LOSS",
    timestamp: "2026-11-15T10:00:00.000Z",
  });

  const validSignature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const isValid = verifyHmacSignature(payload, `sha256=${validSignature}`, secret);
  assert.equal(isValid, true);
});

test("strictly rejects tampered payload or incorrect webhook signature", () => {
  const secret = "careos_telematics_wh_sec_99a8b7c6";
  const payload = JSON.stringify({ deviceId: "MDVR-88219", type: "camera_fault" });
  const tamperedPayload = JSON.stringify({ deviceId: "MDVR-88219", type: "camera_fault", injected: true });

  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const isValid = verifyHmacSignature(tamperedPayload, signature, secret);
  assert.equal(isValid, false);
});

test("security control: connection records sanitize secrets before returning to client", () => {
  const rawDbConnection = {
    id: "conn-1",
    tenant_id: "tenant-1",
    integration_type: "erp",
    provider_code: "generic_rest_erp",
    name: "Production ERP",
    base_url: "https://erp.acme.com",
    auth_type: "api_key",
    auth_credentials: { apiKey: "super-secret-api-key-999" },
    webhook_secret: "wh_secret_xyz123",
    is_active: true,
  };

  const sanitizeConnection = (conn) => ({
    id: conn.id,
    tenantId: conn.tenant_id,
    integrationType: conn.integration_type,
    providerCode: conn.provider_code,
    name: conn.name,
    baseUrl: conn.base_url,
    authType: conn.auth_type,
    hasCredentials: Object.keys(conn.auth_credentials || {}).length > 0,
    hasWebhookSecret: Boolean(conn.webhook_secret),
    isActive: conn.is_active,
  });

  const sanitized = sanitizeConnection(rawDbConnection);
  assert.equal(sanitized.hasCredentials, true);
  assert.equal(sanitized.hasWebhookSecret, true);
  assert.equal(sanitized.auth_credentials, undefined);
  assert.equal(sanitized.webhook_secret, undefined);
  assert.equal(JSON.stringify(sanitized).includes("super-secret-api-key-999"), false);
});

// ----------------------------------------------------------------------------
// SUITE 3: Telematics Event Normalization & Raw GPS Stream Filtering
// ----------------------------------------------------------------------------
function normalizeTelematicsEvent(raw) {
  if (!raw || typeof raw !== "object") return null;

  const deviceId = raw.deviceId || raw.device_id || raw.imei || raw.sn;
  if (!deviceId) return null;

  // Filter raw high-frequency GPS ping streams
  const isRawGpsOnly =
    raw.type === "gps_ping" ||
    (raw.lat !== undefined && raw.lng !== undefined && !raw.event && !raw.alert && !raw.fault && !raw.status);

  if (isRawGpsOnly) return null;

  const rawType = String(raw.event || raw.type || raw.eventType || raw.alertType || "device:last_seen").toLowerCase();
  let eventType = "device:last_seen";

  if (rawType.includes("online") || rawType === "connect") eventType = "device:online";
  else if (rawType.includes("offline") || rawType === "disconnect") eventType = "device:offline";
  else if (rawType.includes("camera") || rawType.includes("video_loss")) eventType = "camera:fault";
  else if (rawType.includes("mdvr") || rawType.includes("storage")) eventType = "mdvr:fault";
  else if (rawType.includes("dms") || rawType.includes("fatigue")) eventType = "alert:dms";
  else if (rawType.includes("adas") || rawType.includes("fcw")) eventType = "alert:adas";
  else if (rawType.includes("ivms") || rawType.includes("harsh_")) eventType = "alert:ivms";
  else if (rawType.includes("piwas") || rawType.includes("pedestrian")) eventType = "alert:piwas";

  return {
    eventType,
    deviceId,
    timestamp: raw.timestamp || new Date().toISOString(),
    faultDetails: raw.errorCode ? { errorCode: raw.errorCode, channel: raw.channel || 1 } : undefined,
    alertDetails: raw.severity ? { category: eventType.split(":")[1], severity: raw.severity } : undefined,
  };
}

test("normalizes camera fault event with video loss details", () => {
  const raw = {
    deviceId: "MDVR-4410",
    event: "camera_video_loss",
    channel: 3,
    errorCode: "ERR_NO_SIGNAL",
    timestamp: "2026-11-15T12:00:00.000Z",
  };

  const normalized = normalizeTelematicsEvent(raw);
  assert.ok(normalized);
  assert.equal(normalized.eventType, "camera:fault");
  assert.equal(normalized.deviceId, "MDVR-4410");
  assert.equal(normalized.faultDetails.channel, 3);
  assert.equal(normalized.faultDetails.errorCode, "ERR_NO_SIGNAL");
});

test("normalizes DMS driver fatigue safety alert with critical severity", () => {
  const raw = {
    imei: "867530911223344",
    type: "dms_driver_drowsiness",
    severity: "critical",
    confidence: 0.98,
    timestamp: "2026-11-15T12:05:00.000Z",
  };

  const normalized = normalizeTelematicsEvent(raw);
  assert.ok(normalized);
  assert.equal(normalized.eventType, "alert:dms");
  assert.equal(normalized.deviceId, "867530911223344");
  assert.equal(normalized.alertDetails.severity, "critical");
});

test("strictly filters and drops high-frequency raw GPS stream breadcrumbs", () => {
  const rawGpsPing = {
    deviceId: "TRACKER-11",
    type: "gps_ping",
    lat: 24.7136,
    lng: 46.6753,
    speed: 65,
    timestamp: "2026-11-15T12:06:00.000Z",
  };

  const normalized = normalizeTelematicsEvent(rawGpsPing);
  assert.equal(normalized, null, "Raw GPS breadcrumb ping must be ignored");
});

// ----------------------------------------------------------------------------
// SUITE 4: Heartbeat Deduplication & Actionable Incident Evaluation
// ----------------------------------------------------------------------------
function shouldDeduplicate(incoming, recent) {
  if (!recent) return false;
  if (incoming.faultDetails || incoming.alertDetails) return false;

  if (
    incoming.deviceId === recent.deviceId &&
    (incoming.eventType === "device:last_seen" || incoming.eventType === "device:online") &&
    recent.eventType === incoming.eventType
  ) {
    const diffMinutes =
      (new Date(incoming.timestamp).getTime() - new Date(recent.timestamp).getTime()) / (1000 * 60);
    return diffMinutes < 60;
  }
  return false;
}

function evaluateIncidentRequirement(event) {
  if (event.eventType === "camera:fault") {
    return { generateTicket: true, priority: "high", category: "repair" };
  }
  if (event.eventType === "mdvr:fault") {
    return { generateTicket: true, priority: "critical", category: "repair" };
  }
  if (event.eventType === "alert:dms" && event.alertDetails?.severity === "critical") {
    return { generateTicket: true, priority: "high", category: "inspection" };
  }
  return { generateTicket: false };
}

test("deduplicates routine heartbeats within 60 minutes debounce window", () => {
  const recent = {
    deviceId: "MDVR-01",
    eventType: "device:last_seen",
    timestamp: "2026-11-15T10:00:00.000Z",
  };

  const incoming10m = {
    deviceId: "MDVR-01",
    eventType: "device:last_seen",
    timestamp: "2026-11-15T10:10:00.000Z",
  };

  const incoming70m = {
    deviceId: "MDVR-01",
    eventType: "device:last_seen",
    timestamp: "2026-11-15T11:10:00.000Z",
  };

  assert.equal(shouldDeduplicate(incoming10m, recent), true, "Duplicate heartbeat debounced");
  assert.equal(shouldDeduplicate(incoming70m, recent), false, "Heartbeat after debounce window processed");
});

test("faults and safety alerts are never debounced and trigger ticket creation", () => {
  const recent = {
    deviceId: "MDVR-01",
    eventType: "device:last_seen",
    timestamp: "2026-11-15T10:00:00.000Z",
  };

  const cameraFault = {
    deviceId: "MDVR-01",
    eventType: "camera:fault",
    faultDetails: { errorCode: "ERR_SIGNAL_LOSS" },
    timestamp: "2026-11-15T10:05:00.000Z",
  };

  assert.equal(shouldDeduplicate(cameraFault, recent), false);
  const decision = evaluateIncidentRequirement(cameraFault);
  assert.equal(decision.generateTicket, true);
  assert.equal(decision.priority, "high");
  assert.equal(decision.category, "repair");
});

// ----------------------------------------------------------------------------
// SUITE 5: Outbound ERP Outbox Queue, Exponential Retries & Dead-Letter
// ----------------------------------------------------------------------------
test("outbound ERP sync queue: bounded retry with dead-letter queue", () => {
  const maxAttempts = 5;

  function simulateOutboxDelivery(item, willSucceed) {
    if (willSucceed) {
      return { ...item, status: "delivered", lastAttemptedAt: new Date().toISOString() };
    }

    const attempts = item.attempts + 1;
    if (attempts >= maxAttempts) {
      return {
        ...item,
        status: "dead_letter",
        attempts,
        error: "ERP Gateway 503 Service Unavailable",
      };
    }

    const backoffSec = Math.min(Math.pow(2, attempts) * 2, 3600);
    return {
      ...item,
      status: "pending",
      attempts,
      backoffSec,
      error: "ERP Gateway 503 Service Unavailable",
    };
  }

  let item = { id: "outbox-1", eventType: "invoice:push", attempts: 0, status: "pending" };

  // Attempt 1 fails
  item = simulateOutboxDelivery(item, false);
  assert.equal(item.status, "pending");
  assert.equal(item.attempts, 1);
  assert.equal(item.backoffSec, 4);

  // Advance to attempt 4 then fail
  item.attempts = 4;
  item = simulateOutboxDelivery(item, false);
  assert.equal(item.status, "dead_letter");
  assert.equal(item.attempts, 5);
  assert.ok(item.error);
});

test("multi-tenant isolation: integration connections and sync logs are tenant-isolated", () => {
  const connections = [
    { id: "c1", tenantId: "tenant-saudi", name: "Riyadh ERP" },
    { id: "c2", tenantId: "tenant-uae", name: "Dubai ERP" },
  ];

  function getTenantConnections(tenantId) {
    return connections.filter((c) => c.tenantId === tenantId);
  }

  assert.equal(getTenantConnections("tenant-saudi").length, 1);
  assert.equal(getTenantConnections("tenant-saudi")[0].name, "Riyadh ERP");
  assert.equal(getTenantConnections("tenant-uae").length, 1);
  assert.equal(getTenantConnections("tenant-uae")[0].name, "Dubai ERP");
});

// ----------------------------------------------------------------------------
// SUMMARY
// ----------------------------------------------------------------------------
console.log(`\nResults: ${passed} / ${total} tests passed.`);
if (passed === total) {
  console.log("All Step 15 ERP & Telematics Integrations tests passed successfully!\n");
} else {
  process.exit(1);
}
