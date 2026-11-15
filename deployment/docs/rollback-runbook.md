# CareOS — Production Rollback & Disaster Recovery Runbook

> **Scope:** Standard operating procedure for rapidly reverting the CareOS production deployment to a known good state in the event of critical defects, deployment failure, or severe data inconsistencies.

---

## 1. Rollback Decision Matrix & Triggers

Initiate immediate rollback if any of the following conditions occur post-deployment:
1. **Critical Availability Loss:** The health check (`https://<OWNER_DOMAIN>/health`) fails or returns HTTP 5xx continuously for > 3 minutes.
2. **Authentication / Security Breach:** RLS policies fail, or users are able to view cross-tenant data.
3. **Core Transaction Failure:** Support desk ticketing, quotation approvals, or dispatch workflows cannot be created due to unhandled backend exceptions.
4. **Hostinger Out-of-Memory (OOM) Crash Loop:** Fastify process repeatedly crashes upon starting due to memory limits.

---

## 2. Component Rollback Procedures

### COMPONENT A: Hostinger Web Application Rollback (Estimated Time: < 2 Minutes)

#### Option 1: Fast Directory Symlink Swap (Recommended)
If release directories were deployed under `/releases/`:
1. SSH into Hostinger or open hPanel File Manager / Terminal.
2. Switch the active application symlink to the previous known-good release:
   ```bash
   ln -sfn /home/uXXXXXXXX/releases/v1.0.0-previous /home/uXXXXXXXX/domains/<OWNER_DOMAIN>/public_html/careos
   ```
3. Open hPanel → **Node.js** → Click **Restart Application**.
4. Verify `https://<OWNER_DOMAIN>/health`.

#### Option 2: Pre-Deployment Backup Archive Extraction
If symlinks were not used:
1. Open hPanel File Manager.
2. Extract the pre-deployment archive `backup-careos-lastgood.tar.gz` over the application root.
3. In hPanel → **Node.js**, click **Restart Application**.

---

### COMPONENT B: OCI Background Worker Rollback (Estimated Time: < 3 Minutes)

1. SSH into the OCI worker instance:
   ```bash
   ssh -i ~/.ssh/id_ed25519 ubuntu@<OCI_VM_PUBLIC_IP>
   cd /opt/careos
   ```
2. Revert to the previous Docker image tag or Git commit:
   ```bash
   # Option A: If tagged Docker images were pushed
   docker compose down
   docker tag careos-worker:previous careos-worker:latest
   docker compose up -d

   # Option B: If building from Git repository
   git reset --hard <PREVIOUS_STABLE_COMMIT_HASH>
   docker compose up -d --build
   ```
3. Verify worker logs:
   ```bash
   docker logs --tail 50 careos-worker
   ```
   Confirm worker is polling `job_queue` normally without errors.

---

### COMPONENT C: Supabase Database Disaster Recovery

> ⚠️ Database schema changes in CareOS are designed to be **backward-compatible** (additive migrations). Code rollbacks usually do **not** require rolling back the database. Only restore the database if unrecoverable data corruption occurred.

#### Procedure 1: Reverting Individual Incompatible Migration
If a specific migration needs to be reversed and data can be salvaged:
1. Execute the corresponding reversible `DROP` statement documented in that migration file's header (e.g. `DROP TABLE IF EXISTS ... CASCADE;`).
2. Verify table count and RLS status:
   ```sql
   SELECT count(*) FROM pg_tables WHERE schemaname = 'public';
   ```

#### Procedure 2: Full Point-in-Time Database Restore from Snapshot
If data corruption occurred:
1. Navigate to Supabase Dashboard → **Settings** → **Database** → **Backups**.
2. Select the pre-deployment backup snapshot taken prior to deployment (e.g. `backup-pre-deployment-YYYYMMDD.sql`).
3. Click **Restore Backup** or use CLI:
   ```bash
   psql -h aws-0-ap-southeast-1.pooler.supabase.com -U postgres.<project-ref> -d postgres -f backup-pre-deployment-YYYYMMDD.sql
   ```
4. Verify RLS policies and table counts immediately post-restore.

---

## 3. Emergency Maintenance Mode Activation

If investigation requires pausing user traffic temporarily:

1. On Hostinger, place an emergency static `maintenance.html` into `public_html/`.
2. Configure a temporary LiteSpeed / `.htaccess` rewrite rule to redirect all traffic to `maintenance.html` with HTTP status 503:
   ```apache
   RewriteEngine On
   RewriteCond %{REQUEST_URI} !/maintenance.html$
   RewriteRule .* /maintenance.html [R=503,L]
   ```
3. Once the rollback is complete, remove the rewrite rule and delete `maintenance.html`.

---

## 4. Post-Rollback Verification Checklist

Following rollback completion, verify platform stability:

- [ ] Liveness probe: `GET https://<OWNER_DOMAIN>/health` returns HTTP 200.
- [ ] Direct page refresh on `/login` and `/operations` returns HTTP 200.
- [ ] Users can log in and view their respective portals.
- [ ] OCI worker continues consuming pending jobs from `job_queue`.
- [ ] Database RLS verification script confirms zero `anon` table grants.
- [ ] An incident post-mortem is documented recording the root cause of rollback.
