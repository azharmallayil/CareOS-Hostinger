# CareOS — Production Environment Variable Inventory

> **SECURITY NOTICE:** This inventory documents environment variable names and operational purposes only. **No actual credentials, secrets, or passwords are included in this repository.** All actual secrets must be populated securely in the respective hosting provider consoles (Hostinger hPanel and OCI instance).

---

## 1. Hostinger Dynamic Node.js Web Application (`apps/api`)

| Variable Name | Required | Operational Purpose |
| :--- | :--- | :--- |
| `PORT` | **Auto (Hostinger)** | Dynamic TCP port provided by Hostinger reverse proxy (default fallback: 3000). |
| `HOST` | Optional | Network interface to bind (default: `0.0.0.0`). |
| `NODE_ENV` | **Required** | Runtime environment identifier (`production`). |
| `SUPABASE_URL` | **Required** | HTTPS API endpoint for the Singapore Supabase project (`https://vbckrirksziluvwqpamx.supabase.co`). |
| `SUPABASE_ANON_KEY` | **Required** | Supabase anonymous/publishable key used for client authentication tokens. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required** | Supabase administrative service role key. **Must NEVER be exposed to browser.** |
| `SUPABASE_JWT_SECRET` | **Required** | Secret key used to decode and cryptographically verify incoming Supabase Auth JWTs. |
| `COOKIE_SECRET` | **Required** | 32+ character high-entropy random string for signing Fastify session cookies. |
| `JWT_SECRET` | **Required** | 32+ character high-entropy random string for internal cryptographic operations. |
| `CORS_ORIGINS` | Optional | Comma-separated list of allowed frontend origins (in production, same-origin domain: `https://<OWNER_DOMAIN>`). |
| `WEB_DIST_PATH` | Optional | File path to static Vite production bundle relative to application root (default: `../web/dist`). |
| `LOG_LEVEL` | Optional | Pino logging verbosity level (`info`, `warn`, `error`). |

---

## 2. OCI Always Free ARM64 Background Worker (`apps/worker`)

| Variable Name | Required | Operational Purpose |
| :--- | :--- | :--- |
| `NODE_ENV` | **Required** | Runtime environment identifier (`production`). |
| `SUPABASE_URL` | **Required** | HTTPS API endpoint for the Singapore Supabase project (`https://vbckrirksziluvwqpamx.supabase.co`). |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required** | Administrative service role key for atomic job claiming from `job_queue` and outbox tables. |
| `POLL_INTERVAL_MS` | Optional | Queue polling frequency in milliseconds (default: `3000`). |
| `LEASE_DURATION_SECONDS` | Optional | Duration in seconds for which a claimed job lock remains valid before timing out (default: `60`). |
| `WORKER_CONCURRENCY` | Optional | Maximum number of asynchronous jobs processed concurrently (default: `3`). |
| `LOG_LEVEL` | Optional | Worker console logging verbosity level (`info`, `warn`, `error`). |
| `SMS_PROVIDER` | Optional | Active SMS notification gateway adapter (`console`, `twilio`). |
| `EMAIL_PROVIDER` | Optional | Active Email notification gateway adapter (`console`, `resend`, `smtp`). |
| `PAYMENT_PROVIDER` | Optional | Active payment gateway reconciliation adapter (`none`, `moyasar`, `stripe`). |
| `ERP_PROVIDER` | Optional | Active Enterprise Resource Planning integration connector (`none`, `generic-rest`). |

---

## 3. Client-Side Web Application Build (`apps/web`)

> These variables are injected at **build time** into the client bundle and are publicly visible in browser assets. They are strictly protected by database Row-Level Security (RLS).

| Variable Name | Required | Operational Purpose |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | **Required** | Supabase project URL (`https://vbckrirksziluvwqpamx.supabase.co`). |
| `VITE_SUPABASE_ANON_KEY` | **Required** | Supabase anonymous/publishable key for browser client initialization. |

> ⚠️ **CRITICAL SECURITY RULE:** Never prefix administrative keys (e.g. `SUPABASE_SERVICE_ROLE_KEY` or `COOKIE_SECRET`) with `VITE_`. Any `VITE_` variable is bundled into public JavaScript.

---

## 4. Secret Storage & Rotation Matrix

| Component | Secret Storage Location | Access Control & Protection |
| :--- | :--- | :--- |
| **Hostinger Web App** | Hostinger hPanel → **Node.js** → **Environment Variables** | Encrypted in Hostinger configuration; injected at process startup. |
| **OCI Worker** | `/opt/careos/.env` on OCI VM | File permissions set to `chmod 600` (readable only by root/deploy user). Outbound-only networking. |
| **Supabase Cloud** | Supabase Dashboard → **Settings** → **API** | Managed by Supabase Cloud HSM / Vault. |
| **Source Control (Git)** | **None** | `.env` and all credential files are excluded via `.gitignore`. |
