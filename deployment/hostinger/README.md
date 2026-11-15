# CareOS — Hostinger Dynamic Node.js Production Deployment Guide

> **Target Architecture:** Single-origin, production-grade Dynamic Node.js web application on Hostinger Managed Hosting.
> **Scope:** Web user interface (Operations, Customer, Technician, and Platform Admin portals) and stateless REST API (`/api/v1/*`).
> **Decoupled Architecture:** Persistent background jobs (SLA monitoring, ERP sync, notifications) are handled by the separate OCI Worker. Realtime updates and encrypted storage are handled directly by Supabase Cloud.

---

## 1. Verified Platform Capabilities vs. hPanel Items to Check

| Platform Capability | Verification Status | Operational Reality on Hostinger |
| :--- | :--- | :--- |
| **Dynamic Port Binding** | ✅ **Verified in Code** | Fastify reads `process.env.PORT` automatically (fallback `3000`) and binds to `0.0.0.0`. |
| **Same-Origin SPA & API** | ✅ **Verified in Code** | Fastify serves static React production build (`apps/web/dist`) and handles SPA client-side routing via `index.html` fallback. `/api/v1/*` routes take strict precedence. |
| **Stateless Request Model** | ✅ **Verified in Code** | No in-memory sessions; all authentication relies on stateless Supabase Auth JWTs. |
| **Timeout Bounding** | ✅ **Verified in Code** | Fastify server options enforce `requestTimeout: 30000ms`, `connectionTimeout: 15000ms`, and `keepAliveTimeout: 5000ms`. |
| **Zero WebSockets on Hostinger** | ✅ **Verified in Code** | Clients subscribe directly to Supabase Realtime via WSS. Zero inbound WebSocket connections hit Hostinger. |
| **Zero In-Process Background Workers** | ✅ **Verified in Code** | All async jobs are enqueued to PostgreSQL `job_queue` and executed on OCI. Zero background intervals in Hostinger. |
| **Root Access / Docker / Custom Daemons** | ❌ **NOT AVAILABLE** | Hostinger Managed Node.js does **not** provide root access, Docker engine, or systemd daemon management. |
| **Redis / Memcached** | ❌ **NOT ASSUMED** | CareOS requires **zero Redis**. All state, locking, and queues use Supabase PostgreSQL. |
| **hPanel Plan Physical Memory Limit** | ⚠️ **CHECK IN HPANEL** | Memory limits (typically 3GB to 6GB depending on Cloud Startup / Cloud Professional plan) must be checked in hPanel. |
| **hPanel Max Concurrent Connections** | ⚠️ **CHECK IN HPANEL** | Web server concurrency limits (typically 100–300 simultaneous connections) must be verified in hPanel. |
| **hPanel Node.js Selector Version** | ⚠️ **CHECK IN HPANEL** | Confirm Node.js version 20.x LTS is selected in the hPanel Node.js configuration interface. |

---

## 2. Directory Structure on Hostinger

```
/home/uXXXXXXXX/domains/<OWNER_DOMAIN>/public_html/careos/
├── apps/
│   ├── api/
│   │   ├── dist/
│   │   │   ├── server.js          # Main application entry point
│   │   │   └── ...
│   │   └── package.json
│   └── web/
│       └── dist/                  # Static React production build
│           ├── index.html
│           └── assets/
├── node_modules/                  # Production node_modules
├── package.json                   # Root package.json
└── .env                           # Server environment variables (chmod 600)
```

---

## 3. Build & Packaging Instructions

Run the automated packaging script from your development machine or CI/CD pipeline:

```bash
# Execute the production build script
./deployment/hostinger/build.sh
```

Alternatively, run manually:
```bash
# 1. Build frontend React SPA
cd apps/web && ./node_modules/.bin/vite build && cd ../..

# 2. Build Fastify API
./apps/api/node_modules/.bin/tsc --project apps/api/tsconfig.json
```

Verify that `apps/web/dist/index.html` and `apps/api/dist/server.js` exist before uploading.

---

## 4. Hostinger hPanel Step-by-Step Configuration

1. **Log in to Hostinger hPanel:** Navigate to **Websites** → Select your domain → **Node.js**.
2. **Create / Configure Node.js Application:**
   - **Node.js Version:** Select `20.x` (LTS).
   - **Application Mode:** Select `Production`.
   - **Application Root:** `/domains/<OWNER_DOMAIN>/public_html/careos` (or chosen app folder).
   - **Application Startup File:** `apps/api/dist/server.js`.
3. **Environment Variables Configuration:**
   In hPanel → **Node.js** → **Environment Variables**, add the required variables (values kept private):
   - `NODE_ENV=production`
   - `PORT` (Leave unset or let Hostinger inject automatically)
   - `HOST=0.0.0.0`
   - `SUPABASE_URL=https://vbckrirksziluvwqpamx.supabase.co`
   - `SUPABASE_ANON_KEY=<your-anon-publishable-key>`
   - `SUPABASE_SERVICE_ROLE_KEY=<your-secret-service-role-key>`
   - `SUPABASE_JWT_SECRET=<your-supabase-jwt-secret>`
   - `COOKIE_SECRET=<random-32-character-high-entropy-string>`
   - `JWT_SECRET=<random-32-character-high-entropy-string>`
   - `WEB_DIST_PATH=../web/dist`
   - `CORS_ORIGINS=https://<OWNER_DOMAIN>`
   - `LOG_LEVEL=info`
4. **Deploy Application Artifacts:**
   - Upload `apps/`, `packages/`, `connectors/`, `node_modules/`, and `package.json` using Git Deployment, SSH/rsync, or File Manager.
   - Ensure file permissions: directories `755`, files `644`, `.env` (if used on filesystem) `600`.
5. **Start / Restart Application:**
   - Click **Restart Application** in hPanel.
   - Wait 5–10 seconds for passenger / reverse-proxy to bind.

---

## 5. Health Checks, Logs & Operational Monitoring

### Health Endpoints
- **Liveness & Readiness Probe:**
  ```bash
  curl -i https://<OWNER_DOMAIN>/health
  ```
  Expected Response:
  ```json
  HTTP/2 200
  content-type: application/json; charset=utf-8

  {"status":"ok","timestamp":"2026-11-15T16:00:00.000Z","uptime":120.5}
  ```

- **OpenAPI 3.0 Documentation:**
  ```bash
  curl -i https://<OWNER_DOMAIN>/api/v1/openapi.json
  ```
  Returns the complete OpenAPI 3.0.3 specification JSON.

- **Interactive Swagger UI:**
  Navigate to `https://<OWNER_DOMAIN>/documentation` in your browser.

- **Frontend SPA Fallback:**
  Navigate to `https://<OWNER_DOMAIN>/operations` or `https://<OWNER_DOMAIN>/customer`. The Fastify static handler will serve `index.html`, and React Router will render the appropriate portal.

### Log Inspection
- **hPanel Error Logs:** Viewable in hPanel → **Node.js** → **Logs** / **Error Logs**.
- **Application Logs:** Structured JSON logs are emitted by Pino on stdout and stderr, captured automatically by Hostinger's process supervisor.

---

## 6. Process Restart & Crash Recovery Behavior

- **Automatic Supervisor Restart:** If the Fastify process crashes due to an unhandled exception or memory limit, Hostinger's LiteSpeed / Passenger process supervisor automatically restarts the application.
- **Graceful Shutdown:** CareOS listens for `SIGTERM` and `SIGINT`, executing `server.close()` to allow in-flight HTTP requests to complete within 15 seconds before terminating cleanly with code 0.
- **Stateless Resilience:** Because zero job state, file streams, or WebSocket handles are held in memory on Hostinger, process restarts cause zero data loss. Inbound requests during restart briefly queue at the web server reverse proxy.

---

## 7. Fast Rollback Procedure

If a deployed version experiences issues:

1. **Option A: Atomic Folder Symlink Swap (Recommended):**
   - Maintain releases under `/releases/v1.0.0`, `/releases/v1.0.1`.
   - Symlink `careos` to the previous release folder:
     ```bash
     ln -sfn /home/uXXXXXXXX/releases/v1.0.0 /home/uXXXXXXXX/domains/<OWNER_DOMAIN>/public_html/careos
     ```
   - Click **Restart Application** in hPanel.
2. **Option B: Artifact Re-upload:**
   - Upload the previously backed-up `dist-bundle-backup.tar.gz` and extract into the application root.
   - Click **Restart Application** in hPanel.
3. Verify `https://<OWNER_DOMAIN>/health`.
