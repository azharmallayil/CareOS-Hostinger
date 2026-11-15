# CareOS Hostinger Managed Node.js Runtime Compliance & Architecture Guide

## 1. Executive Summary & Runtime Architecture

CareOS is designed to operate within the specific runtime constraints of **Hostinger Managed Node.js Web Hosting** while delivering enterprise-grade responsiveness, multi-tenant isolation, and high concurrency.

To comply with Hostinger's execution model, CareOS strictly decouples **stateless request serving** from **background job execution** and **persistent live streaming**:

```
+─────────────────────────────────────────────────────────────────────────────+
|                          CLIENT LAYER (Browser & Mobile)                    |
+───────────────────────────┬──────────────────────────┬──────────────────────+
                            │ REST / JSON              │ WSS (Direct)
                            ▼                          ▼
+──────────────────────────────────────────────────+ +────────────────────────+
|             HOSTINGER MANAGED NODE.JS            | |    SUPABASE CLOUD      |
|                                                  | |                        |
|  - Fastify HTTP Server (Stateless)               | |  - PostgreSQL (RLS)    |
|  - Dynamic $PORT binding (0.0.0.0)               | |  - Supabase Realtime   |
|  - Static React SPA (/dist via fastifyStatic)    | |    (WebSockets)        |
|  - Bounded Request Timeouts (30s)                | |  - Supabase Storage    |
|  - Zero background timers / cron loops           | |    (Direct Uploads)    |
+───────────────────────────┬──────────────────────+ +───────────┬────────────+
                            │ SQL Queries & Enqueue              │
                            ▼                                    │
+──────────────────────────────────────────────────+             │
|                ORACLE CLOUD INFRASTRUCTURE (OCI) |             │
|                ALWAYS-FREE WORKER VM             |             │
|                                                  |             │
|  - Durable Postgres Job Queue Polling            |◄────────────┘
|  - SLA Engine Clock & Escalation Monitor         |
|  - ERP Connectors (Push/Pull Sync with retries)  |
|  - Telematics Ingestion & Ticket Creation Engine |
+──────────────────────────────────────────────────+
```

---

## 2. Hostinger Managed Node.js Compliance Matrix

| Constraint / Requirement | Hostinger Specification | CareOS Architectural Implementation | Status |
| :--- | :--- | :--- | :--- |
| **Port Binding** | Assigned dynamically by runtime via `PORT` environment variable | `server.listen({ port: parseInt(process.env.PORT || "3000", 10), host: "0.0.0.0" })` | ✅ Verified |
| **Request Model** | Stateless HTTP/1.1 or HTTP/2 request-response | Fastify instance maintains zero in-memory session state; all authentication verified via stateless Supabase JWTs. | ✅ Verified |
| **Execution Timeouts** | Gateway terminates connections exceeding plan thresholds (typically 30–60s) | Fastify configured with `requestTimeout: 30000`, `connectionTimeout: 15000`, and `keepAliveTimeout: 5000`. Long queries bounded. | ✅ Verified |
| **Inbound WebSockets** | Not supported or discouraged on managed shared hosting gateways | All browser/mobile realtime events use direct client-to-Supabase Realtime channels. Zero inbound WebSocket connections on Hostinger. | ✅ Verified |
| **Background / Cron Jobs** | Shared host process managers terminate idle or persistent detached background loops | Zero `setInterval`, `setTimeout` loops, or cron daemons run in the web process. All scheduled tasks run on OCI worker. | ✅ Verified |
| **File / Media Uploads** | Bounded request body sizes and memory usage (avoiding OOM crashes) | Binary uploads bypass Hostinger Node.js memory: API generates presigned upload URLs; clients stream directly to Supabase Storage. | ✅ Verified |
| **Process Lifecycle** | SIGTERM/SIGINT sent during redeployments or server maintenance | Registered `SIGTERM` and `SIGINT` handlers execute `server.close()` for clean connection draining and graceful exit code 0. | ✅ Verified |
| **Single-Origin Deployment** | Hostinger serves both static assets and API from single domain | Fastify serves static web production bundle (`apps/web/dist`) with SPA wildcard fallback, and `/api/v1/*` routes. | ✅ Verified |

---

## 3. Hostinger Plan-Specific Capacity Assumptions

> [!WARNING]
> The values below represent default capacity assumptions for typical Hostinger Managed Node.js / Cloud Hosting plans. **These values must be confirmed in hPanel before production rollout.**

| Resource Parameter | Cloud Startup (Estimated) | Cloud Professional (Estimated) | CareOS Production Behavior & Enforcement | hPanel Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **RAM (Memory Limit)** | ~3 GB | ~6 GB | Memory bounded via streaming, small JSON payloads (max 1MB), no file buffering in RAM. | `[UNVERIFIED - CHECK IN HPANEL]` |
| **vCPU Allocation** | 2 Cores | 4 Cores | Fully asynchronous non-blocking event loop; computationally heavy tasks (e.g. PDF generation, export processing) bounded. | `[UNVERIFIED - CHECK IN HPANEL]` |
| **Max Concurrent Inflight HTTP Requests** | ~100–150 connections | ~300 connections | Enforced via `@fastify/rate-limit` (200 req/min per IP) and Fastify connection pooling. | `[UNVERIFIED - CHECK IN HPANEL]` |
| **Execution Timeout (FastCGI/Reverse Proxy)** | 30–60 seconds | 60–120 seconds | API handlers strictly complete within < 500ms; hard server limit set to 30s. | `[UNVERIFIED - CHECK IN HPANEL]` |
| **Node.js LTS Version** | Node.js 20.x / 22.x | Node.js 20.x / 22.x | Tested against Node.js v20.x and v22.x ESM runtime. | `[UNVERIFIED - CHECK IN HPANEL]` |
| **Persistent Disk Storage** | SSD (Shared) | SSD (Shared) | Local disk used only for code deployment; zero application data stored on host filesystem. | `[UNVERIFIED - CHECK IN HPANEL]` |

---

## 4. Workload Delegation & OCI Worker Integration

To protect Hostinger from process termination and CPU throttling:
1. **SLA Monitoring & Escalation:**
   - OCI worker runs `sla-clock-monitor` evaluating ticket breach horizons, pausing clocks outside operating hours, and triggering tier-1 / tier-2 escalation events.
2. **ERP Synchronization:**
   - Inbound ERP webhook events are enqueued to `integration_event_inbox`.
   - Outbound ERP synchronizations are enqueued to `outbound_event_outbox`.
   - The OCI worker processes these jobs with exponential backoff, jitter, and dead-letter queueing.
3. **Telematics Event Aggregation:**
   - Raw telematics streams and webhook triggers pass through lightweight normalization.
   - Fault alerts (DMS, ADAS, MDVR offline) generate work orders or tickets asynchronously via worker tasks.

---

## 5. Deployment & Runtime Checklist for Hostinger

When deploying to Hostinger via Git or hPanel:
1. Set Environment Variables in hPanel:
   - `PORT`: (Read dynamically from Hostinger environment, fallback 3000)
   - `NODE_ENV`: `production`
   - `SUPABASE_URL`: Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Secret service key for admin client
   - `CORS_ORIGINS`: Production domain (e.g., `https://app.careos.com`)
   - `COOKIE_SECRET`: High-entropy random secret
2. Build Step:
   - Build web frontend: `pnpm --filter @careos/web build`
   - Build API: `pnpm --filter @careos/api build`
3. Process Start Command:
   - `node apps/api/dist/server.js`
4. Post-Deployment Smoke Test:
   - Verify health: `GET /health` -> `{ status: "ok" }`
   - Verify Swagger UI: `GET /documentation` -> Interactive API explorer
   - Verify OpenAPI Spec: `GET /api/v1/openapi.json` -> OpenAPI 3.0.3 specification
   - Verify SPA fallback: `GET /operations/tickets` -> Serves `index.html` with HTTP 200
