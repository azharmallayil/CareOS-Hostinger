import assert from "node:assert/strict";
import crypto from "node:crypto";

console.log("=== CareOS Step 14: Contracts, SLA, Escalation & Service Intelligence Tests ===\n");

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
// SUITE 1: SLA Business Calendar Clock Calculations
// ----------------------------------------------------------------------------
function calculateSlaTargetDate(startDate, targetHours, config) {
  if (!config.businessHoursOnly) {
    return new Date(startDate.getTime() + targetHours * 60 * 60 * 1000);
  }

  const [startHour, startMin] = config.businessStartTime.split(":").map(Number);
  const [endHour, endMin] = config.businessEndTime.split(":").map(Number);
  const dailyWorkMinutes = (endHour - startHour) * 60 + (endMin - startMin);

  let remainingMinutes = targetHours * 60;
  let current = new Date(startDate.getTime());

  while (remainingMinutes > 0) {
    const dayOfWeek = current.getDay();

    if (!config.workingDays.includes(dayOfWeek)) {
      current.setDate(current.getDate() + 1);
      current.setHours(startHour, startMin, 0, 0);
      continue;
    }

    const currentHour = current.getHours();
    const currentMin = current.getMinutes();
    const currentDayMinutes = currentHour * 60 + currentMin;
    const workStartMinutes = startHour * 60 + startMin;
    const workEndMinutes = endHour * 60 + endMin;

    if (currentDayMinutes < workStartMinutes) {
      current.setHours(startHour, startMin, 0, 0);
      continue;
    }

    if (currentDayMinutes >= workEndMinutes) {
      current.setDate(current.getDate() + 1);
      current.setHours(startHour, startMin, 0, 0);
      continue;
    }

    const availableTodayMinutes = workEndMinutes - currentDayMinutes;

    if (remainingMinutes <= availableTodayMinutes) {
      current = new Date(current.getTime() + remainingMinutes * 60 * 1000);
      remainingMinutes = 0;
    } else {
      remainingMinutes -= availableTodayMinutes;
      current.setDate(current.getDate() + 1);
      current.setHours(startHour, startMin, 0, 0);
    }
  }

  return current;
}

test("24/7 calendar: directly adds target hours without interruption", () => {
  const start = new Date("2026-11-15T10:00:00Z");
  const config = {
    businessHoursOnly: false,
    businessStartTime: "08:00:00",
    businessEndTime: "18:00:00",
    workingDays: [0, 1, 2, 3, 4],
  };

  const target = calculateSlaTargetDate(start, 24, config);
  const diffHours = (target.getTime() - start.getTime()) / (1000 * 60 * 60);
  assert.equal(diffHours, 24);
  assert.equal(target.toISOString(), "2026-11-16T10:00:00.000Z");
});

test("business calendar: spans across work days and skips nights (08:00-18:00 Sun-Thu)", () => {
  // Sunday 2026-11-15 at 14:00 (4 hours remaining in Sunday work day: 14:00 - 18:00)
  // Request needs 10 business hours
  // Sunday provides 4 hours -> 6 hours remain
  // Monday 08:00 + 6 hours = Monday 14:00
  const start = new Date(2026, 10, 15, 14, 0, 0); // Local time Sunday 14:00
  const config = {
    businessHoursOnly: true,
    businessStartTime: "08:00:00",
    businessEndTime: "18:00:00",
    workingDays: [0, 1, 2, 3, 4], // Sun-Thu
  };

  const target = calculateSlaTargetDate(start, 10, config);
  assert.equal(target.getDay(), 1); // Monday
  assert.equal(target.getHours(), 14);
  assert.equal(target.getMinutes(), 0);
});

test("business calendar: skips weekend days (Friday & Saturday in Middle East workweek)", () => {
  // Thursday 2026-11-19 at 16:00 (2 hours remaining in Thursday work day)
  // Request needs 6 business hours
  // Thursday provides 2 hours -> 4 hours remain
  // Friday & Saturday skipped
  // Sunday 08:00 + 4 hours = Sunday 12:00
  const start = new Date(2026, 10, 19, 16, 0, 0); // Thursday 16:00
  const config = {
    businessHoursOnly: true,
    businessStartTime: "08:00:00",
    businessEndTime: "18:00:00",
    workingDays: [0, 1, 2, 3, 4], // Sun, Mon, Tue, Wed, Thu
  };

  const target = calculateSlaTargetDate(start, 6, config);
  assert.equal(target.getDay(), 0); // Sunday
  assert.equal(target.getHours(), 12);
  assert.equal(target.getMinutes(), 0);
});

// ----------------------------------------------------------------------------
// SUITE 2: SLA Clock Pauses and Resumption
// ----------------------------------------------------------------------------
function pauseSlaClock(instance, reason) {
  if (instance.isPaused) return instance;
  return {
    ...instance,
    isPaused: true,
    lastPausedAt: new Date().toISOString(),
    pauseReason: reason,
  };
}

function resumeSlaClock(instance, resumeTime) {
  if (!instance.isPaused || !instance.lastPausedAt) return instance;
  const pausedMinutes = Math.floor(
    (resumeTime.getTime() - new Date(instance.lastPausedAt).getTime()) / 60000
  );
  const totalPausedMinutes = instance.totalPausedMinutes + Math.max(0, pausedMinutes);

  let newResolutionTarget = instance.resolutionTargetAt;
  if (instance.resolutionTargetAt) {
    newResolutionTarget = new Date(
      new Date(instance.resolutionTargetAt).getTime() + pausedMinutes * 60000
    ).toISOString();
  }

  return {
    ...instance,
    isPaused: false,
    lastPausedAt: null,
    pauseReason: null,
    totalPausedMinutes,
    resolutionTargetAt: newResolutionTarget,
  };
}

test("pausing clock on awaiting_customer_approval records pause timestamp and reason", () => {
  const instance = {
    id: "sla-1",
    ticketId: "t-100",
    resolutionTargetAt: "2026-11-16T12:00:00.000Z",
    isPaused: false,
    lastPausedAt: null,
    totalPausedMinutes: 0,
    pauseReason: null,
  };

  const paused = pauseSlaClock(instance, "Awaiting customer quotation sign-off");
  assert.equal(paused.isPaused, true);
  assert.ok(paused.lastPausedAt);
  assert.equal(paused.pauseReason, "Awaiting customer quotation sign-off");
});

test("resuming clock pushes resolution target by exact paused minutes", () => {
  const pauseTime = new Date("2026-11-15T10:00:00.000Z");
  const resumeTime = new Date("2026-11-15T14:30:00.000Z"); // 270 minutes later

  const pausedInstance = {
    id: "sla-1",
    ticketId: "t-100",
    resolutionTargetAt: "2026-11-16T12:00:00.000Z",
    isPaused: true,
    lastPausedAt: pauseTime.toISOString(),
    totalPausedMinutes: 0,
    pauseReason: "Awaiting customer part approval",
  };

  const resumed = resumeSlaClock(pausedInstance, resumeTime);
  assert.equal(resumed.isPaused, false);
  assert.equal(resumed.lastPausedAt, null);
  assert.equal(resumed.pauseReason, null);
  assert.equal(resumed.totalPausedMinutes, 270);

  // Initial target: 2026-11-16T12:00:00.000Z + 270 minutes (4.5h) = 2026-11-16T16:30:00.000Z
  assert.equal(resumed.resolutionTargetAt, "2026-11-16T16:30:00.000Z");
});

// ----------------------------------------------------------------------------
// SUITE 3: SLA Breach & Warning Evaluation
// ----------------------------------------------------------------------------
function evaluateSlaStatus(instance, createdAt, now) {
  const targetDate = new Date(instance.resolutionTargetAt);
  const totalWindowMs = targetDate.getTime() - createdAt.getTime();
  const elapsedMs = now.getTime() - createdAt.getTime();
  const percentElapsed = Math.min(100, Math.max(0, Math.round((elapsedMs / totalWindowMs) * 100)));

  const isBreached = instance.resolutionBreached || now.getTime() > targetDate.getTime();
  const isWarning = !isBreached && percentElapsed >= 80;

  return {
    percentElapsed,
    isWarning,
    isBreached,
    targetDate,
  };
}

test("evaluates SLA status: healthy (<80%), warning (>=80%), breached (>100%)", () => {
  const createdAt = new Date("2026-11-15T08:00:00.000Z");
  const targetDate = "2026-11-15T18:00:00.000Z"; // 10 hour window

  const baseInstance = {
    resolutionTargetAt: targetDate,
    resolutionBreached: false,
  };

  // 1. At 2 hours (20% elapsed) -> Healthy
  const check1 = evaluateSlaStatus(baseInstance, createdAt, new Date("2026-11-15T10:00:00.000Z"));
  assert.equal(check1.percentElapsed, 20);
  assert.equal(check1.isWarning, false);
  assert.equal(check1.isBreached, false);

  // 2. At 8.5 hours (85% elapsed) -> Warning
  const check2 = evaluateSlaStatus(baseInstance, createdAt, new Date("2026-11-15T16:30:00.000Z"));
  assert.equal(check2.percentElapsed, 85);
  assert.equal(check2.isWarning, true);
  assert.equal(check2.isBreached, false);

  // 3. At 11 hours (110% elapsed) -> Breached
  const check3 = evaluateSlaStatus(baseInstance, createdAt, new Date("2026-11-15T19:00:00.000Z"));
  assert.equal(check3.isBreached, true);
});

// ----------------------------------------------------------------------------
// SUITE 4: OCI Worker Job Queue Leases, Retries & Dead-Letter
// ----------------------------------------------------------------------------
test("worker lease simulation: atomic claim prevents race condition", () => {
  const jobDb = [
    {
      id: "job-1",
      queue_name: "sla:check",
      status: "pending",
      run_at: "2026-11-15T10:00:00.000Z",
      locked_by: null,
      lease_expires_at: null,
      attempts: 0,
    },
  ];

  function tryClaimJob(workerId, nowIso) {
    const candidate = jobDb.find(
      (j) =>
        (j.status === "pending" ||
          (j.status === "processing" && j.lease_expires_at && j.lease_expires_at < nowIso)) &&
        j.run_at <= nowIso
    );
    if (!candidate) return null;

    // Simulate optimistic lock
    if (candidate.locked_by !== null) return null;

    candidate.status = "processing";
    candidate.locked_by = workerId;
    candidate.lease_expires_at = new Date(Date.parse(nowIso) + 60000).toISOString();
    candidate.attempts++;
    return { ...candidate };
  }

  const now = "2026-11-15T11:00:00.000Z";
  const claim1 = tryClaimJob("worker-node-1", now);
  assert.ok(claim1);
  assert.equal(claim1.locked_by, "worker-node-1");
  assert.equal(claim1.attempts, 1);

  // Worker 2 attempts concurrent claim on same job
  const claim2 = tryClaimJob("worker-node-2", now);
  assert.equal(claim2, null, "Worker 2 cannot claim already locked job");
});

test("worker retry logic: bounded exponential backoff with dead-letter queue", () => {
  const maxAttempts = 5;

  function handleJobFailure(job, errorMsg) {
    const attempts = job.attempts + 1;
    if (attempts >= maxAttempts) {
      return {
        ...job,
        status: "dead_letter",
        attempts,
        error_message: errorMsg,
        locked_by: null,
        lease_expires_at: null,
      };
    }

    const backoffSec = Math.min(Math.pow(2, attempts) * 2, 3600);
    return {
      ...job,
      status: "pending",
      attempts,
      error_message: errorMsg,
      backoffSec,
      locked_by: null,
      lease_expires_at: null,
    };
  }

  let job = { id: "job-2", status: "processing", attempts: 0 };

  // Fail 1: backoff = 2^1 * 2 = 4 sec
  job = handleJobFailure(job, "Database timeout");
  assert.equal(job.status, "pending");
  assert.equal(job.attempts, 1);
  assert.equal(job.backoffSec, 4);

  // Fail 2: backoff = 2^2 * 2 = 8 sec
  job = handleJobFailure(job, "Database timeout");
  assert.equal(job.attempts, 2);
  assert.equal(job.backoffSec, 8);

  // Advance to attempt 4 then fail
  job.attempts = 4;
  job = handleJobFailure(job, "Fatal connector failure");
  assert.equal(job.status, "dead_letter");
  assert.equal(job.attempts, 5);
  assert.equal(job.error_message, "Fatal connector failure");
});

// ----------------------------------------------------------------------------
// SUITE 5: Strict Multi-Tenant Isolation on Reporting Metrics
// ----------------------------------------------------------------------------
test("tenant isolation: service intelligence aggregates never leak cross-tenant data", () => {
  const ticketsDatabase = [
    { id: "t1", tenant_id: "tenant-alpha", status: "open", priority: "critical" },
    { id: "t2", tenant_id: "tenant-alpha", status: "resolved", priority: "high" },
    { id: "t3", tenant_id: "tenant-beta", status: "open", priority: "critical" },
    { id: "t4", tenant_id: "tenant-beta", status: "resolved", priority: "low" },
    { id: "t5", tenant_id: "tenant-beta", status: "open", priority: "medium" },
  ];

  function aggregateTenantIntelligence(tenantId) {
    const tenantTickets = ticketsDatabase.filter((t) => t.tenant_id === tenantId);
    const total = tenantTickets.length;
    const open = tenantTickets.filter((t) => t.status === "open").length;
    const resolved = tenantTickets.filter((t) => t.status === "resolved").length;

    return { total, open, resolved };
  }

  const alphaStats = aggregateTenantIntelligence("tenant-alpha");
  assert.equal(alphaStats.total, 2);
  assert.equal(alphaStats.open, 1);
  assert.equal(alphaStats.resolved, 1);

  const betaStats = aggregateTenantIntelligence("tenant-beta");
  assert.equal(betaStats.total, 3);
  assert.equal(betaStats.open, 2);
  assert.equal(betaStats.resolved, 1);
});

// ----------------------------------------------------------------------------
// SUMMARY
// ----------------------------------------------------------------------------
console.log(`\nResults: ${passed} / ${total} tests passed.`);
if (passed === total) {
  console.log("All Step 14 SLA, Worker & Service Intelligence tests passed successfully!\n");
} else {
  process.exit(1);
}
