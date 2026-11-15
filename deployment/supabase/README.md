# CareOS — Supabase Cloud Singapore Project Configuration Guide

> **Target Project:** Supabase Cloud Singapore (`ap-southeast-1`)
> **Project URL:** `https://vbckrirksziluvwqpamx.supabase.co`
> **Project Reference:** `vbckrirksziluvwqpamx`
> **Environment Gate:** **DO NOT apply hosted migrations or reset this project until the owner explicitly approves the target environment and migration schedule.**

---

## 1. Project Identification & Region Verification

- **Confirmed Region:** Singapore (`ap-southeast-1`), confirmed by the owner.
- **Project Ref:** `vbckrirksziluvwqpamx`.
- **Primary Database Engine:** PostgreSQL 15 with `pgcrypto` and `uuid-ossp` extensions.
- **Dedicated Private Schema:** `app_private` (stores security functions, sequences, and internal audit triggers).

---

## 2. Sequential Database Migration Catalog

The CareOS schema consists of **18 ordered, atomic migrations** located in `supabase/migrations/`:

| Migration File | Primary Responsibility | RLS Status |
| :--- | :--- | :--- |
| `20261115000001_extensions_and_private_schema.sql` | `app_private` schema, extensions, and service_role grant | ✅ Enforced |
| `20261115000002_foundation_tables.sql` | `tenants`, `profiles`, `departments`, `roles`, `permissions` | ✅ Enforced |
| `20261115000003_auth_and_profile_sync.sql` | Automatic auth user trigger syncing to `profiles` | ✅ Enforced |
| `20261115000004_security_helper_functions.sql` | RLS security helpers (`has_role`, `has_permission`, etc.) | ✅ Enforced |
| `20261115000005_grants_and_rls_policies.sql` | Core RLS policies; revocation of all privileges from `anon` | ✅ Enforced |
| `20261115000006_system_roles_and_defaults.sql` | Default system roles seed data | ✅ Enforced |
| `20261115000007_customer_accounts_and_sites.sql` | `customer_accounts`, `customer_sites`, `customer_contacts` | ✅ Enforced |
| `20261115000008_asset_registry.sql` | Fleet vehicles, MDVR/GPS equipment, warranty tracking | ✅ Enforced |
| `20261115000009_tickets_and_complaints.sql` | Support desk lifecycle, transactional ticket numbering | ✅ Enforced |
| `20261115000010_coverage_quotations_and_payments.sql` | Commercial coverage engine, quotations with 15% VAT, payments | ✅ Enforced |
| `20261115000011_technician_dispatch_and_work_orders.sql` | Technicians, skills, dispatch queue, work orders, location pings | ✅ Enforced |
| `20261115000012_evidence_notifications_and_bulk_service.sql` | Evidence requirements, notifications, bulk service campaigns | ✅ Enforced |
| `20261115000013_maintenance_warranty_rma_and_inventory.sql` | Maintenance schedules, RMA cases, parts catalogue & stock | ✅ Enforced |
| `20261115000014_contracts_sla_and_escalation.sql` | Service contracts, SLA policies, breach instances, escalation | ✅ Enforced |
| `20261115000015_erp_and_telematics_integrations.sql` | ERP sync outbox, telematics webhook inbox, sync audit logs | ✅ Enforced |
| `20261115000016_reporting_and_search_indexes.sql` | Compound B-tree/GIN indexes, `export_audit_logs` | ✅ Enforced |
| `20261115000017_knowledge_base_and_ai.sql` | Knowledge articles, document ingestion, CareOS Assist AI | ✅ Enforced |
| `20261115000018_security_and_reliability_hardening.sql` | RLS on webhooks, ledger immutability triggers, search_paths | ✅ Enforced |

---

## 3. Migration Application Plan (Upon Owner Approval)

Migrations are applied using the official Supabase CLI linked to the Singapore project:

```bash
# 1. Login to Supabase CLI
supabase login

# 2. Link repository to the hosted Singapore project
supabase link --project-ref vbckrirksziluvwqpamx

# 3. Inspect migration differences against remote database
supabase db diff

# 4. Push all 18 migrations sequentially
supabase db push
```

### Post-Migration Database Verification Script
Run the following SQL check in the Supabase Dashboard SQL Editor to verify complete RLS coverage:

```sql
-- Verify 100% of public domain tables have RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Verify anon role has ZERO privileges on public tables
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon' AND table_schema = 'public';
-- Expected: 0 rows returned
```

---

## 4. Supabase Auth Configuration

In the Supabase Dashboard → **Authentication** → **URL Configuration**:

1. **Site URL:**
   - Set to the primary production domain: `https://<OWNER_DOMAIN>`
2. **Redirect URLs (Allow-List):**
   - `https://<OWNER_DOMAIN>/**`
   - `https://<OWNER_DOMAIN>/operations/*`
   - `https://<OWNER_DOMAIN>/customer/*`
   - `https://<OWNER_DOMAIN>/technician/*`
   - `https://<OWNER_DOMAIN>/admin/*`
   - `https://<OWNER_DOMAIN>/login`
   - `https://<OWNER_DOMAIN>/reset-password`
   - `https://<OWNER_DOMAIN>/accept-invitation`
3. **Email Auth Settings:**
   - Enable Email Provider: **ON**
   - Confirm Email: Optional (default ON for production security)
   - Secure Password Policy: Minimum 8 characters
4. **Registration Gate:**
   - Self-service registration is **DISABLED** in CareOS. Users are created via tenant administrator invitations only.

---

## 5. Supabase Private Storage Buckets

In the Supabase Dashboard → **Storage**, ensure the following private buckets are created:

| Bucket Name | Visibility | Allowed MIME Types | Max Size | RLS Policy |
| :--- | :--- | :--- | :--- | :--- |
| `service-evidence` | **Private** | `image/jpeg`, `image/png`, `application/pdf` | 25 MB | Tenant & work order authenticated access only via signed URLs. |
| `quotation-documents` | **Private** | `application/pdf` | 10 MB | Quotation recipient customer & tenant admin only. |
| `knowledge-documents` | **Private** | `application/pdf`, `text/plain`, `text/markdown` | 50 MB | Tenant members only. |

---

## 6. Supabase Realtime Publication Settings

In the Supabase Dashboard → **Database** → **Replication**:

Enable Realtime on the following tables to stream live updates to browser and mobile portals:
- `public.tickets` (Live ticket status updates)
- `public.work_orders` (Technician dispatch updates)
- `public.notifications` (In-app notifications)

> Realtime operates with RLS checks enabled so tenants and customers only receive events for rows their JWT is authorized to read.

---

## 7. Backup, Disaster Recovery & Retention

1. **Automated Cloud Backups:**
   - Supabase automatically takes daily backups with 7-day retention (or 30-day point-in-time recovery on Pro plans).
2. **Manual Pre-Deployment Snapshot (CLI):**
   ```bash
   # Export complete schema and data snapshot
   supabase db dump -f pre-deployment-backup-$(date +%Y%m%d%H%M%S).sql --project-ref vbckrirksziluvwqpamx
   ```
3. **Database Restore Procedure:**
   - In the event of catastrophic data corruption, restore from the snapshot via Supabase Dashboard → **Settings** → **Database** → **Backups** or via CLI:
   ```bash
   psql -h aws-0-ap-southeast-1.pooler.supabase.com -U postgres.<project-ref> -d postgres -f pre-deployment-backup.sql
   ```
