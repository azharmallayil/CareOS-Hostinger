# CareOS — Master Production Deployment Runbook

> **Target Architecture:**
> - **Web & API:** Hostinger Managed Dynamic Node.js (Same-origin Fastify + React SPA)
> - **Background Worker:** Oracle Cloud Infrastructure (OCI) Always Free Ampere A1 (ARM64)
> - **Database & Storage:** Supabase Cloud Singapore (`vbckrirksziluvwqpamx.supabase.co`)
>
> ⚠️ **SAFETY GATE:** Do **not** apply hosted database migrations, provision cloud resources, or alter live DNS records until the system owner explicitly reviews and approves this runbook.

---

## 1. Preflight Deployment Checklist

Complete all preflight verification items before initiating deployment:

- [ ] **Repository Status:** All code changes committed and verified via full regression test suite (14 suites, 192 tests passing).
- [ ] **Build Artifacts Verified:**
  - `apps/web/dist/index.html` built successfully (`./deployment/hostinger/build.sh`).
  - `apps/api/dist/server.js` transpiled successfully.
  - `deployment/oci/Dockerfile` verified for ARM64 compatibility.
- [ ] **Owner Approval Obtained:** Explicit owner confirmation of target environment purpose (Staging vs. Production) for Supabase project `vbckrirksziluvwqpamx`.
- [ ] **Credentials Inventory Ready:** All required environment variables from [deployment/ENVIRONMENT_VARIABLES.md](file:///Users/azhar/My%20Projects/CareOS/deployment/ENVIRONMENT_VARIABLES.md) collected securely offline.
- [ ] **Hostinger hPanel Prerequisites Confirmed:**
  - Active Node.js hosting plan confirmed in hPanel.
  - Node.js version 20.x available in hPanel Node.js selector.
  - Application domain registered and mapped in Hostinger account.
- [ ] **OCI Always Free Account Confirmed:**
  - OCI tenancy active with Ampere A1 Compute quota available in chosen home region.
  - SSH key pair (`id_ed25519`) generated and accessible.

---

## 2. Stage-by-Stage Deployment Procedure

### STAGE 1: Supabase Database, Auth & Storage Configuration

> ⚠️ Execute only after explicit owner approval of the target project environment.

1. **Verify Project Identity:**
   - Confirm project reference is `vbckrirksziluvwqpamx` in Singapore (`ap-southeast-1`).
   - Do **not** create a replacement project or reset existing configurations.
2. **Execute Pre-Deployment Backup:**
   ```bash
   supabase db dump -f backup-pre-deployment-$(date +%Y%m%d).sql --project-ref vbckrirksziluvwqpamx
   ```
3. **Apply Sequential Migrations:**
   Deploy migrations 1 through 18 in sequence:
   ```bash
   supabase link --project-ref vbckrirksziluvwqpamx
   supabase db push
   ```
4. **Execute Database Security Audit:**
   Run the following verification in Supabase SQL Editor:
   ```sql
   -- Confirm 70/70 tables have RLS enabled
   SELECT count(*) as total_tables,
          count(*) FILTER (WHERE rowsecurity = true) as rls_enabled_tables
   FROM pg_tables WHERE schemaname = 'public';
   -- Expected: total_tables = 70, rls_enabled_tables = 70

   -- Confirm anon role has ZERO table privileges
   SELECT count(*) FROM information_schema.role_table_grants
   WHERE grantee = 'anon' AND table_schema = 'public';
   -- Expected: 0
   ```
5. **Configure Supabase Auth:**
   - In Supabase Dashboard → **Authentication** → **URL Configuration**:
     - **Site URL:** `https://<OWNER_DOMAIN>`
     - **Redirect URLs:** Add `https://<OWNER_DOMAIN>/**`, `https://<OWNER_DOMAIN>/operations/*`, `https://<OWNER_DOMAIN>/customer/*`, `https://<OWNER_DOMAIN>/technician/*`, `https://<OWNER_DOMAIN>/admin/*`, `https://<OWNER_DOMAIN>/login`.
6. **Create Private Storage Buckets:**
   - In Supabase Dashboard → **Storage**:
     - Create private bucket: `service-evidence` (Max 25MB, MIME `image/jpeg,image/png,application/pdf`).
     - Create private bucket: `quotation-documents` (Max 10MB, MIME `application/pdf`).
     - Create private bucket: `knowledge-documents` (Max 50MB, MIME `application/pdf,text/plain,text/markdown`).
7. **Enable Realtime Publication:**
   - In Supabase Dashboard → **Database** → **Replication**:
     - Toggle ON replication for `tickets`, `work_orders`, and `notifications`.

---

### STAGE 2: OCI Always Free Worker Deployment

1. **Provision Always Free Compute Instance:**
   - In OCI Console → **Compute** → **Instances** → **Create Instance**:
     - **Name:** `careos-worker-prod`
     - **Shape:** `VM.Standard.A1.Flex` (Ampere ARM64)
     - **Configuration:** 2 OCPUs, 8 GB RAM (Always Free eligible)
     - **Image:** Canonical Ubuntu 22.04 LTS (AArch64)
     - **SSH Keys:** Paste public key (`id_ed25519.pub`)
2. **Configure Minimal Firewall (OCI VCN Security List):**
   - **Ingress:** Allow TCP port 22 ONLY from administrator IP. Block all other ports.
   - **Egress:** Allow all outbound HTTPS (port 443) and PostgreSQL (port 5432).
3. **Configure Host & Docker:**
   ```bash
   ssh -i ~/.ssh/id_ed25519 ubuntu@<OCI_VM_PUBLIC_IP>
   sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
   sudo usermod -aG docker $USER
   sudo mkdir -p /opt/careos && sudo chown -R $USER:$USER /opt/careos
   ```
4. **Deploy Worker Application:**
   - Transfer repository source and create `/opt/careos/.env` with strict permissions (`chmod 600`):
     ```env
     NODE_ENV=production
     LOG_LEVEL=info
     SUPABASE_URL=https://vbckrirksziluvwqpamx.supabase.co
     SUPABASE_SERVICE_ROLE_KEY=<SECRET_SERVICE_ROLE_KEY>
     POLL_INTERVAL_MS=3000
     LEASE_DURATION_SECONDS=60
     WORKER_CONCURRENCY=3
     ```
   - Start worker via Docker Compose:
     ```bash
     cd /opt/careos
     docker compose up -d --build
     ```
   - Enable systemd autostart:
     ```bash
     sudo systemctl enable /opt/careos/careos-worker.service
     ```
5. **Verify Worker Operation:**
   ```bash
   docker logs -f careos-worker
   ```
   Confirm output: `[worker:...] Worker started with concurrency 3. Polling every 3000ms.`

---

### STAGE 3: Hostinger Dynamic Node.js Deployment

1. **Execute Production Build:**
   ```bash
   ./deployment/hostinger/build.sh
   ```
2. **Transfer Application Files:**
   - Upload build artifacts to Hostinger application root (`/domains/<OWNER_DOMAIN>/public_html/careos`).
   - Ensure `apps/web/dist/` and `apps/api/dist/` are in place.
3. **Configure hPanel Node.js Application:**
   - In Hostinger hPanel → **Websites** → Select Domain → **Node.js**:
     - **Node.js Version:** `20.x`
     - **Application Root:** `/domains/<OWNER_DOMAIN>/public_html/careos`
     - **Application Startup File:** `apps/api/dist/server.js`
     - **Application Mode:** `Production`
4. **Populate Environment Variables in hPanel:**
   Add required variables via the hPanel UI:
   - `NODE_ENV=production`
   - `HOST=0.0.0.0`
   - `SUPABASE_URL=https://vbckrirksziluvwqpamx.supabase.co`
   - `SUPABASE_ANON_KEY=<ANON_KEY>`
   - `SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>`
   - `SUPABASE_JWT_SECRET=<JWT_SECRET>`
   - `COOKIE_SECRET=<COOKIE_SECRET>`
   - `JWT_SECRET=<JWT_SECRET>`
   - `WEB_DIST_PATH=../web/dist`
   - `CORS_ORIGINS=https://<OWNER_DOMAIN>`
5. **Start Application:**
   - Click **Restart Application** in hPanel.

---

### STAGE 4: Domain DNS & SSL Configuration

> ⚠️ Do NOT alter DNS or MX/email records during staging or testing. Execute only at scheduled go-live window.

1. **Domain Routing to Hostinger:**
   - In Domain Registrar / DNS Manager:
     - Point root domain (`@`) A record to Hostinger server IP.
     - Point `www` CNAME record to `@`.
     - **CRITICAL:** Preserve all existing MX, SPF, DKIM, and DMARC email records without modification.
2. **Issue SSL Certificate:**
   - In Hostinger hPanel → **Security** → **SSL**:
     - Activate Let's Encrypt SSL certificate for `<OWNER_DOMAIN>` and `www.<OWNER_DOMAIN>`.
     - Enable **Force HTTPS (HTTP to HTTPS 301 Redirect)**.
3. **Single-Origin Routing Verification:**
   - `https://<OWNER_DOMAIN>` serves the frontend React application.
   - `https://<OWNER_DOMAIN>/api/v1/*` routes dynamically to Fastify backend on the same origin.
   - No separate `api.` subdomain is created or required.

---

## 3. Post-Deployment Smoke-Test Checklist

Execute immediately following deployment:

- [ ] **Liveness Probe:** `curl -i https://<OWNER_DOMAIN>/health` returns HTTP 200 with `status: "ok"`.
- [ ] **OpenAPI Spec:** `curl -i https://<OWNER_DOMAIN>/api/v1/openapi.json` returns valid OpenAPI 3.0.3 specification.
- [ ] **Swagger UI:** Navigating to `https://<OWNER_DOMAIN>/documentation` renders interactive API explorer.
- [ ] **SPA Direct Routing:** Refreshing `https://<OWNER_DOMAIN>/login` or `https://<OWNER_DOMAIN>/operations` directly in the browser returns HTTP 200 via `index.html` fallback.
- [ ] **Authentication Gate:** Attempting to access `https://<OWNER_DOMAIN>/operations` without a session redirects cleanly to `/login`.
- [ ] **Login Flow:** Authenticating with verified credentials navigates into the appropriate portal (Operations / Customer / Technician).
- [ ] **Support Desk Lifecycle:** Creating a test ticket generates transactional immutable numbering (`TCK-YYYY-XXXXX`).
- [ ] **Presigned Storage Upload:** Uploading a test document or photo verifies signed URL generation and private bucket storage.
- [ ] **Worker Queue Processing:** Submitting a test async job verifies worker claims job, executes handler, and updates status to `completed` in Supabase PostgreSQL `job_queue`.
- [ ] **Hostinger Resource Audit:** Inspect hPanel Node.js CPU and memory usage to confirm stable operation within plan limits.
