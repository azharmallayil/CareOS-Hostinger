import { createAdminClient } from "@careos/supabase-client";
import type { OutboxJob, JobQueueName } from "@careos/shared-types";
import crypto from "node:crypto";

// ── Environment & Config ──────────────────────────────────────────────────────
const supabaseUrl = process.env["SUPABASE_URL"] ?? "https://vbckrirksziluvwqpamx.supabase.co";
const supabaseKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "dev-service-role-key";
const pollIntervalMs = parseInt(process.env["POLL_INTERVAL_MS"] ?? "3000", 10);
const leaseDurationSeconds = parseInt(process.env["LEASE_DURATION_SECONDS"] ?? "60", 10);
const concurrency = parseInt(process.env["WORKER_CONCURRENCY"] ?? "3", 10);

const workerId = `worker-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
const supabase = createAdminClient(supabaseUrl, supabaseKey);

let isRunning = true;
let activeJobCount = 0;

// ── Job Handler Type ──────────────────────────────────────────────────────────
type JobHandler = (job: OutboxJob) => Promise<void>;

// ── Handlers Registry ─────────────────────────────────────────────────────────
const handlers: Record<JobQueueName, JobHandler> = {
  "notify:email": async (job) => {
    // Step 9: Integrate via connectors/email
    console.log(`[worker:${workerId}] [notify:email] processing job ${job.id}`, job.payload);
  },
  "notify:sms": async (job) => {
    // Step 9: Integrate via connectors/sms
    console.log(`[worker:${workerId}] [notify:sms] processing job ${job.id}`, job.payload);
  },
  "notify:in_app": async (job) => {
    // Step 9: In-app notification creation
    console.log(`[worker:${workerId}] [notify:in_app] processing job ${job.id}`, job.payload);
  },
  "erp:push": async (job) => {
    // Step 15: Generic REST ERP push
    console.log(`[worker:${workerId}] [erp:push] processing outbound ERP job ${job.id}`, job.payload);
    const nowIso = new Date().toISOString();

    // Find pending outbound outbox items
    const { data: outboxItems } = await supabase
      .from("outbound_event_outbox")
      .select("*, connection:integration_connections(*)")
      .eq("status", "pending")
      .lte("next_run_at", nowIso)
      .limit(5);

    if (!outboxItems || outboxItems.length === 0) {
      return;
    }

    for (const item of outboxItems) {
      try {
        const conn = item.connection;
        const isMock = !conn?.base_url || conn.base_url.includes("mock") || conn.base_url.includes("sandbox.local");

        if (isMock) {
          // Mock successful delivery
          const generatedExtId = `ERP-${item.entity_id.slice(0, 8)}`;
          await supabase
            .from("outbound_event_outbox")
            .update({
              status: "delivered",
              last_attempted_at: nowIso,
              response_status: 200,
              response_payload: { success: true, externalId: generatedExtId },
              updated_at: nowIso,
            })
            .eq("id", item.id);

          await supabase.from("external_id_mappings").insert({
            tenant_id: item.tenant_id,
            connection_id: item.connection_id,
            entity_type: item.event_type.split(":")[0],
            internal_id: item.entity_id,
            external_id: generatedExtId,
          });

          await supabase.from("integration_sync_logs").insert({
            tenant_id: item.tenant_id,
            connection_id: item.connection_id,
            direction: "outbound",
            entity_type: item.event_type,
            status: "success",
            records_processed: 1,
            records_failed: 0,
            details: { deliveredTo: "Mock/Sandbox ERP", externalId: generatedExtId },
          });

          console.log(`[worker:${workerId}] Delivered ERP outbox event ${item.id} -> ${generatedExtId}`);
        } else {
          // Real REST push to configured base URL
          const targetUrl = `${conn.base_url.replace(/\/+$/, "")}/api/${item.event_type.split(":")[0]}s`;
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (conn.auth_type === "bearer_token" && conn.auth_credentials?.token) {
            headers["Authorization"] = `Bearer ${conn.auth_credentials.token}`;
          } else if (conn.auth_type === "api_key" && conn.auth_credentials?.apiKey) {
            headers["X-API-Key"] = conn.auth_credentials.apiKey;
          }

          const res = await fetch(targetUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(item.payload),
            signal: AbortSignal.timeout(8000),
          });

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }

          const resJson = await res.json();
          await supabase
            .from("outbound_event_outbox")
            .update({
              status: "delivered",
              last_attempted_at: nowIso,
              response_status: res.status,
              response_payload: resJson,
              updated_at: nowIso,
            })
            .eq("id", item.id);
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const attempts = item.attempts + 1;
        const isExhausted = attempts >= item.max_attempts;

        if (isExhausted) {
          await supabase
            .from("outbound_event_outbox")
            .update({
              status: "dead_letter",
              attempts,
              last_attempted_at: nowIso,
              response_payload: { error: errorMsg },
              updated_at: nowIso,
            })
            .eq("id", item.id);

          await supabase.from("integration_sync_logs").insert({
            tenant_id: item.tenant_id,
            connection_id: item.connection_id,
            direction: "outbound",
            entity_type: item.event_type,
            status: "error",
            records_processed: 0,
            records_failed: 1,
            details: { error: errorMsg, deadLetter: true },
          });
        } else {
          const backoffSec = Math.min(Math.pow(2, attempts) * 2, 3600);
          const nextRun = new Date(Date.now() + backoffSec * 1000).toISOString();
          await supabase
            .from("outbound_event_outbox")
            .update({
              status: "pending",
              attempts,
              next_run_at: nextRun,
              last_attempted_at: nowIso,
              response_payload: { error: errorMsg },
              updated_at: nowIso,
            })
            .eq("id", item.id);
        }
      }
    }
  },
  "sla:check": async (job) => {
    // Step 14: Periodic SLA breach evaluation
    console.log(`[worker:${workerId}] [sla:check] evaluating ticket SLAs`, job.payload);
    const nowIso = new Date().toISOString();

    // 1. Unpaused instances past response target where response actual is null
    const { data: responseBreaches } = await supabase
      .from("sla_instances")
      .select("id, ticket_id, tenant_id")
      .eq("is_paused", false)
      .eq("response_breached", false)
      .is("response_actual_at", null)
      .lt("response_target_at", nowIso);

    if (responseBreaches && responseBreaches.length > 0) {
      for (const inst of responseBreaches) {
        await supabase
          .from("sla_instances")
          .update({ response_breached: true, updated_at: nowIso })
          .eq("id", inst.id);

        await supabase.from("escalation_history").insert({
          tenant_id: inst.tenant_id,
          ticket_id: inst.ticket_id,
          rule_id: null,
          escalation_level: 1,
          action_taken: "SLA response time breached. Alerted operations supervisor.",
        });
      }
      console.log(`[worker:${workerId}] Flagged ${responseBreaches.length} SLA response breach(es).`);
    }

    // 2. Unpaused instances past resolution target where resolution actual is null
    const { data: resolutionBreaches } = await supabase
      .from("sla_instances")
      .select("id, ticket_id, tenant_id")
      .eq("is_paused", false)
      .eq("resolution_breached", false)
      .is("resolution_actual_at", null)
      .lt("resolution_target_at", nowIso);

    if (resolutionBreaches && resolutionBreaches.length > 0) {
      for (const inst of resolutionBreaches) {
        await supabase
          .from("sla_instances")
          .update({ resolution_breached: true, updated_at: nowIso })
          .eq("id", inst.id);

        await supabase.from("escalation_history").insert({
          tenant_id: inst.tenant_id,
          ticket_id: inst.ticket_id,
          rule_id: null,
          escalation_level: 2,
          action_taken: "SLA resolution time breached. Escalated to Service Delivery Manager.",
        });
      }
      console.log(`[worker:${workerId}] Flagged ${resolutionBreaches.length} SLA resolution breach(es).`);
    }
  },
  "report:generate": async (job) => {
    // Step 14: Aggregate service intelligence report
    console.log(`[worker:${workerId}] [report:generate] generating report`, job.payload);
  },
  "bulk_request:process": async (job) => {
    // Step 12: Process bulk campaign item creating 1 ticket per asset
    console.log(`[worker:${workerId}] [bulk_request:process] processing item`, job.payload);
  },
};

// ── Atomically Claim Next Available Job ───────────────────────────────────────
async function claimNextJob(): Promise<OutboxJob | null> {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationSeconds * 1000).toISOString();
  const nowIso = now.toISOString();

  // Find one eligible job:
  // 1. Status is 'pending' AND run_at <= now()
  // OR
  // 2. Status is 'processing' AND lease_expires_at < now() (crash recovery)
  const { data: eligibleJobs, error: selectError } = await supabase
    .from("job_queue")
    .select("*")
    .or(`status.eq.pending,and(status.eq.processing,lease_expires_at.lt.${nowIso})`)
    .lte("run_at", nowIso)
    .order("run_at", { ascending: true })
    .limit(1);

  if (selectError || !eligibleJobs || eligibleJobs.length === 0) {
    return null;
  }

  const candidate = eligibleJobs[0] as OutboxJob;

  // Optimistic lease lock
  const { data: claimedJob, error: updateError } = await supabase
    .from("job_queue")
    .update({
      status: "processing",
      locked_by: workerId,
      locked_at: nowIso,
      lease_expires_at: leaseExpiresAt,
      attempts: candidate.attempts + 1,
      updated_at: nowIso,
    })
    .eq("id", candidate.id)
    .eq("status", candidate.status)
    .select()
    .single();

  if (updateError || !claimedJob) {
    // Lost race to another worker
    return null;
  }

  return claimedJob as OutboxJob;
}

// ── Execute Job ───────────────────────────────────────────────────────────────
async function processJob(job: OutboxJob): Promise<void> {
  activeJobCount++;
  const handler = handlers[job.queue_name];

  try {
    if (!handler) {
      throw new Error(`No handler registered for queue '${job.queue_name}'`);
    }

    await handler(job);

    // Mark completed
    await supabase
      .from("job_queue")
      .update({
        status: "completed",
        locked_by: null,
        lease_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.log(`[worker:${workerId}] Job ${job.id} (${job.queue_name}) completed.`);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[worker:${workerId}] Job ${job.id} failed: ${errorMsg}`);

    const maxAttempts = job.max_attempts ?? 5;
    const isExhausted = job.attempts >= maxAttempts;

    if (isExhausted) {
      // Move to dead-letter for human review
      await supabase
        .from("job_queue")
        .update({
          status: "dead_letter",
          error_message: errorMsg,
          locked_by: null,
          lease_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      console.warn(`[worker:${workerId}] Job ${job.id} moved to dead-letter queue.`);
    } else {
      // Exponential backoff with jitter: 2^attempts * 1000ms + jitter
      const backoffSec = Math.min(Math.pow(2, job.attempts) * 2, 3600);
      const jitterMs = Math.floor(Math.random() * 1000);
      const nextRun = new Date(Date.now() + backoffSec * 1000 + jitterMs).toISOString();

      await supabase
        .from("job_queue")
        .update({
          status: "pending",
          run_at: nextRun,
          error_message: errorMsg,
          locked_by: null,
          lease_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      console.log(`[worker:${workerId}] Job ${job.id} scheduled for retry at ${nextRun}.`);
    }
  } finally {
    activeJobCount--;
  }
}

// ── Polling Loop ──────────────────────────────────────────────────────────────
async function runLoop(): Promise<void> {
  console.log(`[worker:${workerId}] CareOS OCI background worker started.`);
  console.log(`[worker:${workerId}] Target: Supabase Cloud (${supabaseUrl})`);
  console.log(`[worker:${workerId}] Polling interval: ${pollIntervalMs}ms | Concurrency: ${concurrency}`);

  while (isRunning) {
    try {
      if (activeJobCount < concurrency) {
        const job = await claimNextJob();
        if (job) {
          void processJob(job);
        }
      }
    } catch (err) {
      console.error(`[worker:${workerId}] Poller loop error:`, err);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
const shutdown = async (signal: string): Promise<void> => {
  console.log(`[worker:${workerId}] ${signal} received. Stopping poller and draining jobs...`);
  isRunning = false;

  const timeoutMs = 15000;
  const start = Date.now();
  while (activeJobCount > 0 && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`[worker:${workerId}] Drained active jobs. Exiting.`);
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

void runLoop();
