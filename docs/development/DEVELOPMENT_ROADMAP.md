# CareOS — Development Roadmap

**Version:** 1.1.0-draft  
**Status:** Approved for Implementation  
**Last Updated:** 2026-11-15

> This roadmap aligns with the 21-step implementation plan in `docs/CareOS Main Design.md`.
> Steps are submitted one at a time and must fully pass their acceptance criteria before the next step begins.

---

## Overview

```
Step 1  → Documentation & Architecture          ✅ DONE
Step 2  → Repository Scaffold & Tooling         ✅ DONE
Step 3  → Database Foundation, Tenancy & RLS
Step 4  → Authentication, Onboarding & Portal Routing
Step 5  → Portal Shells, Organization Admin & Role Permissions
Step 6  → Customer Accounts, Contacts, Branches & Sites
Step 7  → Fleet & Asset Registry
Step 8  → Device, SIM & Installation Registry
Step 9  → Support Desk, Ticketing, Numbering & Complaints
Step 10 → Coverage Engine, Quotations, Approvals & Payments
Step 11 → Technician Management, Dispatch & Field Service
Step 12 → Service Evidence, Live Progress, Notifications & Bulk Service
Step 13 → Maintenance, Warranty/RMA & Spare-Parts Inventory
Step 14 → Contracts, SLA, Escalation & Service Intelligence (Reporting)
Step 15 → ERP & Telematics Integrations
Step 16 → Dashboard, Search, Exports & Reporting UX
Step 17 → CareOS Assist AI Chatbot & Knowledge Base (optional layer)
Step 18 → API Completeness, Mobile Readiness & Performance
Step 19 → Full Security, Isolation, Reliability & Regression Testing
Step 20 → Deployment Preparation (Hostinger + OCI + Supabase)
Step 21 → Go-Live Readiness & Handover
```

---

## Step 1 — Architecture & Product Specification

**Status:** ✅ COMPLETE

**Deliverables:**
- `docs/product/CAREOS_PRODUCT_SPECIFICATION.md`
- `docs/product/USER_ROLES_AND_PORTALS.md`
- `docs/product/SERVICE_LIFECYCLE_AND_STATUS_MODEL.md`
- `docs/architecture/SYSTEM_ARCHITECTURE.md`
- `docs/architecture/MODULE_BOUNDARIES.md`
- `docs/architecture/DOMAIN_MODEL.md`
- `docs/architecture/API_CONVENTIONS.md`
- `docs/architecture/INTEGRATION_ARCHITECTURE.md`
- `docs/database/DATABASE_DESIGN.md`
- `docs/security/SECURITY_ARCHITECTURE.md`
- `docs/design/DESIGN_SYSTEM.md`
- `docs/development/DEVELOPMENT_ROADMAP.md`
- `docs/development/DECISIONS_AND_OPEN_QUESTIONS.md`

**Acceptance Criteria:**
- All documents exist and are internally consistent
- No implementation-blocking open questions remain unresolved
- Architecture reviewed and approved by the team before Step 2 begins

**Dependencies:** None

---

## Step 2 — Repository Scaffold & Tooling

**Scope:** Create the monorepo skeleton. No business logic. CI pipeline green.

**Deliverables:**
- pnpm workspace root with all `apps/*` and `packages/*` directories
- TypeScript configuration (`tsconfig.json`) per package/app
- Tailwind CSS + Vite configuration for `apps/web`
- Fastify server skeleton for `apps/api` with same-origin static frontend serving and `process.env.PORT` binding for Hostinger managed Node.js
- PostgreSQL outbox background worker skeleton for `apps/worker` with lease-lock claiming and graceful shutdown
- All `packages/*` with minimal `index.ts` exports (`ui`, `core-domain`, `database`, `auth`, `validation`, `integration-contracts`, `configuration`, etc.)
- Connectors skeleton under `connectors/` (`sms`, `email`, `payment`, `erp`, `telematics`)
- ESLint + Prettier configuration with cross-boundary import rule
- Vitest workspace configuration
- Docker Compose file (local dev): api and worker running with Supabase
- GitHub Actions CI workflow: lint → type-check → unit tests
- Storybook scaffold in `apps/web`
- README with local setup instructions

**Acceptance Criteria:**
- `pnpm install` succeeds with no warnings
- `pnpm lint` and `pnpm type-check` pass with zero errors
- `pnpm test` passes (no tests yet, but runner works)
- `docker compose up` starts api and worker services
- Supabase local stack connects to Fastify API
- GitHub Actions CI pipeline green on first commit
- Storybook builds and serves locally

**Dependencies:** Step 1 complete

---

## Step 3 — Database Foundation, Tenancy & RLS

**Scope:** All Postgres tables, indexes, RLS policies, sequences, and seed data.

**Deliverables:**
- Migration files in `supabase/migrations/`:
  - `001_create_tenants.sql`
  - `002_create_users_and_roles.sql`
  - `003_create_customers_and_sites.sql`
  - `004_create_assets_devices_sims.sql`
  - `005_create_warranties_contracts.sql`
  - `006_create_tickets_and_history.sql`
  - `007_create_work_orders_and_evidence.sql`
  - `008_create_quotations_invoices_payments.sql`
  - `009_create_complaints.sql`
  - `010_create_integrations_notifications.sql`
  - `011_create_audit_log.sql`
  - `012_rls_policies.sql`
  - `013_numbering_sequences.sql`
  - `014_updated_at_triggers.sql`
  - `015_create_free_service_rules.sql` (free_service_rules, versions, eligibility decisions)
  - `016_create_bulk_service_requests.sql` (bulk_service_requests, items)
  - `017_create_job_queue.sql` (job_queue outbox table for OCI worker processing)
- Seed data in `supabase/seed/`
- Kysely type definitions generated from schema
- Migration applied and verified on local Supabase only (no hosted migrations without owner approval)

**Acceptance Criteria:**
- `supabase db reset` runs all migrations successfully on fresh DB
- All foreign keys are correct; no orphaned references
- RLS: a query with one tenant's JWT cannot retrieve another tenant's rows (integration test)
- `audit_log` UPDATE and DELETE attempts fail with RLS denial
- Seed data populates a demo tenant with plausible sample data
- Kysely types regenerated and all TypeScript compiles cleanly

**Dependencies:** Step 2 complete

---

## Step 4 — Authentication & Multi-Tenancy

**Scope:** Full auth flow for all portals; custom JWT claims; tenant guard middleware.

**Deliverables:**
- Supabase Auth configuration (email/password, magic link, OTP)
- Custom JWT claims hook (Postgres function that injects `tenant_id`, `role`, `portal` into JWT at login)
- Fastify auth plugin: `verifyJWT`, `extractClaims`, `tenantGuard`, `permissionCheck`
- Auth routes: `/api/v1/auth/refresh`, `/api/v1/auth/logout`
- `packages/permissions` fully implemented with all role-action grants
- Ticket transition guard (`canTransition`) implemented and tested
- Cookie-based session management (httpOnly, Secure, SameSite=Strict)
- Portal detection (route-based portal identification in JWT claim)
- 2FA enforcement middleware (TOTP for ops roles that require it)

**Acceptance Criteria:**
- Login returns JWT with correct custom claims
- A `dispatcher` JWT cannot access `tenant_admin`-only routes (returns 403)
- A valid tenant A JWT cannot read tenant B's data (returns 403 at API; 0 rows at DB)
- Expired token returns 401; valid refresh returns new access token
- CSR cannot perform a transition that requires `dispatcher` role (409)
- 2FA is enforced for `tenant_admin`: login without TOTP returns a prompt, not a session
- Unit tests for `packages/permissions` cover all role-action combinations

**Dependencies:** Step 3 complete

---

## Step 5 — Core Domain APIs: Tickets & Customers

**Scope:** All CRUD and lifecycle endpoints for Tickets and Customer Accounts/Sites.

**Deliverables:**
- Customer Account endpoints: `GET/POST /customers`, `GET/PATCH /customers/:id`
- Customer Site endpoints: `GET/POST /customers/:id/sites`, `GET/PATCH /customers/:id/sites/:siteId`
- Ticket endpoints: `GET/POST /tickets`, `GET/PATCH /tickets/:id` (single `asset_id` per ticket; null for platform tickets)
- Ticket status transition: `POST /tickets/:id/status`
- Ticket history: `GET /tickets/:id/history`
- Coverage determination logic integrated (`packages/coverage-engine`) with distinct free-service evaluation and approval routing
- Free-Service Rules endpoints: `GET/POST /free-service-rules`, `GET/PATCH /free-service-rules/:id`, `POST /free-service-rules/:id/versions`, `POST /free-service-rules/:id/approve`
- Free-Service Approval endpoints: `POST /tickets/:id/approve-free-service`, `POST /tickets/:id/reject-free-service`
- Bulk Service Request Upload endpoints: `POST /bulk-service-requests` (CSV upload / JSON), `GET /bulk-service-requests`, `GET /bulk-service-requests/:id`, `GET /bulk-service-requests/:id/items`
- Bulk Service Request Worker consumer: processes items asynchronously and creates 1 autonomous ticket per asset
- Ticket number generation (via `next_sequence` DB function + `packages/numbering`)
- SLA deadline computation on triage
- Filtering and pagination on ticket list
- Full audit log entries on all mutations

**Acceptance Criteria:**
- All endpoints return correct HTTP status codes per convention
- Ticket creation runs coverage determination and sets `coverage_type`; single `asset_id` enforced per ticket
- Free-service rules evaluate server-side; rules requiring approval place ticket in `pending_review` until approved
- Bulk service request CSV upload creates 1 independent ticket per asset; failure on any row is isolated and logged
- Status transitions enforce state machine rules (invalid transitions return 409)
- Ticket numbers are unique per tenant per month, never reused even after deletion
- SLA deadlines are computed correctly for all priority/category combinations
- Pagination works: `page=2&pageSize=10` returns correct slice
- Customer A cannot see Customer B's tickets (403)
- Integration test suite: >80% coverage of ticket API surface

**Dependencies:** Steps 3 + 4 complete

---

## Step 6 — Work Order & Dispatch APIs

**Scope:** Work order creation, assignment, status management, and evidence.

**Deliverables:**
- Work Order endpoints: `GET/POST /work-orders`, `GET/PATCH /work-orders/:id`
- Work order status: `POST /work-orders/:id/status`
- Technician list (with availability and skill filter): `GET /technicians`
- Technician assignment ranking logic (skill → availability → proximity → workload)
- Assignment history recording
- Evidence upload flow: `POST /work-orders/:id/evidence/upload-url`, `POST /work-orders/:id/evidence/confirm`
- Evidence list: `GET /work-orders/:id/evidence`
- WO → Ticket status linkage (automatic ticket status update on WO transitions)
- Customer signature capture endpoint

**Acceptance Criteria:**
- Creating a WO updates parent ticket to `scheduled`
- Technician ranking returns candidates in correct priority order
- Evidence upload URL is a signed Supabase Storage URL, expiring in 1 hour
- Evidence confirm call records metadata and links to WO
- WO `on_site` transition updates ticket to `in_progress`
- WO `completed` with `is_billable=true` moves ticket to `awaiting_payment`
- WO `completed` with `is_billable=false` moves ticket to `resolved`
- Assignment history records every technician change with actor and reason
- Technician can only see their own WOs; senior technician can see all

**Dependencies:** Step 5 complete

---

## Step 7 — Asset, Device, Warranty & Contract APIs

**Scope:** Full asset registry and coverage data management.

**Deliverables:**
- Asset endpoints: `GET/POST /assets`, `GET/PATCH /assets/:id`
- Device endpoints: `GET/POST /assets/:id/devices`, `GET/PATCH /devices/:id`
- SIM card endpoints: `GET/POST /sim-cards`, `GET/PATCH /sim-cards/:id`
- Warranty endpoints: `GET/POST /assets/:id/warranties`, `GET/PATCH /warranties/:id`
- Contract endpoints: `GET/POST /contracts`, `GET/PATCH /contracts/:id`
- Coverage check endpoint: `POST /coverage/check` (useful for pre-ticket UI lookup)

**Acceptance Criteria:**
- Asset serial number is unique within tenant
- Warranty lookup correctly identifies active coverage for a given asset + date
- Contract lookup correctly identifies coverage for a given customer + asset category + date
- Coverage ambiguity (overlapping records) sets `ambiguous_coverage=true` on ticket
- SIM card `iccid` is globally unique in DB
- Customer account admin can view their own contracts via Customer Portal
- CSR can register and edit assets on behalf of customers

**Dependencies:** Steps 4 + 5 complete

---

## Step 8 — Quotation, Invoice & Payment APIs

**Scope:** Full financial flow from quotation draft to payment confirmation.

**Deliverables:**
- Quotation endpoints: `GET/POST /quotations`, `GET/PATCH /quotations/:id`
- Send quotation: `POST /quotations/:id/send`
- Customer approve/reject: `POST /quotations/:id/approve`, `POST /quotations/:id/reject`
- Invoice auto-generation on approval
- Invoice endpoints: `GET /invoices`, `GET /invoices/:id`
- Payment: `POST /invoices/:id/payments` (manual cash/terminal)
- Payment intent creation: `POST /invoices/:id/payment-intent` (Stripe/gateway)
- Payment webhook handler: `POST /api/v1/webhooks/payment/:provider`
- Idempotency key enforcement on payment endpoints
- Quotation TTL expiry job in worker

**Acceptance Criteria:**
- Only one active quotation per ticket at a time
- Customer receives notification when quotation is sent
- Customer approval records `customer_approved_at` and approver ID
- Invoice is auto-created on quotation approval
- Payment confirmation via webhook updates invoice → `paid` and ticket → `resolved`
- Manual cash payment by technician triggers same downstream status updates
- Duplicate payment gateway webhooks (same `gateway_reference`) are safely ignored (idempotency)
- Quotation TTL expiry job runs and sets expired quotations correctly
- Monetary values stored as `numeric(15,4)` — no floating-point arithmetic

**Dependencies:** Step 6 complete

---

## Step 9 — Complaint & Notification System

**Scope:** Complaint lifecycle + notification worker + all notification channels.

**Deliverables:**
- Complaint endpoints: `GET/POST /complaints`, `GET/PATCH /complaints/:id`
- Complaint status transitions: `POST /complaints/:id/status`
- Complaint numbering
- Notification worker (PostgreSQL outbox consumers): `notify:sms`, `notify:email`, `notify:in_app`
- Notification templates (default set, Handlebars, RTL-aware)
- `notification_templates` table and admin CRUD
- In-app notification API: `GET /notifications/me`, `POST /notifications/:id/read`
- Supabase Realtime channels for in-app delivery
- SLA breach detection job (every 5 minutes)
- SLA breach notification to tenant admin

**Acceptance Criteria:**
- Complaint creation by customer triggers CSR assignment notification
- Escalated complaint sends email to `tenant_admin`
- Ticket created → SMS + email sent to customer within 60 seconds of ticket creation
- Technician assigned → SMS sent to customer with appointment window
- In-app notification appears without page refresh (Realtime)
- SLA breach warning fires before deadline (warning threshold: 20% of SLA window remaining)
- Templates render correctly in both LTR (English) and RTL (Arabic)
- Failed SMS delivery retries 3x and marks notification `failed` with error stored

**Dependencies:** Step 8 complete

---

## Step 10 — Operations Portal UI

**Scope:** Full React UI for the Operations Portal (all ops roles).

**Deliverables:**
- Portal shell: layout, navigation, header, auth guards
- Pages: Dashboard, Ticket List, Ticket Detail, New Ticket
- Pages: Work Order List, Work Order Detail, Dispatch Board
- Pages: Customer List, Customer Detail, New Customer
- Pages: Asset List, Asset Detail
- Pages: Quotation List, Quotation Detail, New Quotation
- Pages: Invoice List, Invoice Detail
- Pages: Complaint List, Complaint Detail
- Pages: Technician List, Technician Detail
- Pages: Reports (operational dashboard)
- Pages: Settings (branding, numbering, SLA, users, integrations)
- Realtime ticket status updates
- LTR + RTL layout support
- Storybook documentation for all new components

**Acceptance Criteria:**
- All ticket state machine transitions usable from UI
- Dispatch board shows technician availability for a selected date
- Quotation builder with line items, tax, total calculation
- Role-based UI: CSR sees no financial controls; billing agent sees no assignment controls
- RTL switch renders all pages correctly (manual test on Chrome + Firefox)
- WCAG 2.1 AA: no critical/serious violations in automated Axe scan
- Responsive: all pages usable at 768px tablet width
- Pagination, search, and filtering working on all list pages

**Dependencies:** Steps 5–9 complete (APIs must exist)

---

## Step 11 — Customer Portal UI

**Scope:** React UI for the Customer Portal (B2C + B2B customers).

**Deliverables:**
- Portal shell with tenant branding applied
- Self-registration + login + magic link
- Pages: My Tickets, New Service Request (multi-step), Ticket Detail + Timeline
- Pages: My Assets, Asset Registration
- Pages: Quotation Review + Approve/Reject
- Pages: Invoice + Payment (online payment integration)
- Pages: My Complaints, New Complaint
- Pages: Account Settings, Company Sites (B2B admin)
- Ticket status push (Realtime — customer sees live status)
- Technician rating (post-resolution)
- LTR + RTL

**Acceptance Criteria:**
- Customer can complete a full self-service flow: register → submit ticket → approve quotation → pay online
- Customer cannot see another customer's data (verified by role-restricted API calls)
- Online payment flow works end-to-end with test card in Stripe sandbox
- Rating form appears after ticket moves to `resolved`; persists rating to DB
- Tenant branding (logo, colours) applied correctly from tenant settings
- WCAG 2.1 AA compliant
- Responsive: fully functional on iPhone-sized viewport (375px)

**Dependencies:** Steps 8–9 complete; Step 10 design components reused

---

## Step 12 — Technician Portal UI

**Scope:** Mobile-first React PWA for field technicians.

**Deliverables:**
- PWA configuration (manifest, service worker, offline support)
- Login + biometric (WebAuthn delegated to device)
- Pages: My Jobs (today / upcoming), Job Detail
- Job workflow: Accept → En Route → On Site → Work Description + Parts → Complete
- Evidence capture: photo upload from camera, file upload
- Customer signature capture (canvas-based)
- On-site payment recording (cash or card terminal confirmation)
- Offline status update queue (IndexedDB → sync on reconnect)
- Push notification receipt (Web Push)
- LTR + RTL

**Acceptance Criteria:**
- Technician can complete entire job workflow without internet (offline queue works)
- Status update syncs correctly when reconnecting (idempotent — no duplicates)
- Photo upload from device camera works on iOS Safari and Android Chrome
- Signature canvas works on touchscreen
- Push notification received when new job is assigned
- Senior technician can reassign WO to colleague from UI
- All touch targets ≥ 44px; no horizontal scroll on 375px viewport
- PWA installable on Android home screen; install prompt works

**Dependencies:** Steps 6–9 complete

---

## Step 13 — Integration Layer

**Scope:** ERP connector framework, outbound webhook delivery, integration configuration UI.

**Deliverables:**
- ERP connector adapter framework (`connectors/erp`)
- Generic REST adapter + NetSuite stub + SAP REST stub
- ERP push job: `erp:push_invoice`, `erp:push_customer`
- Outbound webhook delivery system (PostgreSQL outbox + retry + dead-letter)
- Webhook delivery log API: `GET /integrations/webhooks/logs`
- Integration config UI in Operations Portal settings (manage connectors, test connection)
- Credential encryption/decryption in integration service
- ERP sync status display in tenant admin panel

**Acceptance Criteria:**
- Invoice push job fires after payment confirmation and records ERP reference
- Failed push retries 5x with exponential backoff; then dead-letters
- Outbound webhook delivers `ticket.created` event within 10 seconds
- Webhook delivery signed with HMAC; signature verified in test harness
- Integration config credentials are never returned in API responses (masked)
- `tenant_admin` can test a connection and see success/failure feedback in UI

**Dependencies:** Step 10 complete (settings UI); Steps 8–9 complete (events exist)

---

## Step 14 — Reporting & Analytics

**Scope:** Tenant-level operational reports and dashboards.

**Deliverables:**
- Dashboard KPIs: open tickets, overdue, by status, by technician (last 30 days)
- Report: Ticket Volume by Category + Period
- Report: Technician Performance (jobs, avg rating, avg resolution time)
- Report: Financial Summary (quotations issued/approved, collections, outstanding)
- Report: Customer Satisfaction (avg rating, distribution)
- Report: SLA Compliance (% resolved within SLA, breach list)
- Scheduled report aggregation job (nightly, writes to `report_snapshots` table)
- CSV export for all reports
- Date range and filter controls on all reports

**Acceptance Criteria:**
- Dashboard loads within 2 seconds on a tenant with 10,000 tickets
- Financial summary matches sum of `payments` table (verified by test)
- CSV export produces valid, importable CSV
- All reports scoped to authenticated tenant (no cross-tenant leakage)
- Reports are read-only; `readonly_ops` role can view all reports

**Dependencies:** Step 10 complete (UI); Steps 5–8 complete (data exists)

---

## Step 15 — Platform Admin Area

**Scope:** CareOS-operator-only admin portal.

**Deliverables:**
- Platform Admin portal UI (separate React shell, `/admin` path)
- FIDO2/hardware key auth enforcement
- IP allowlist enforcement (Caddy config + test)
- Pages: Tenant List, Tenant Detail (config, usage, status)
- Tenant actions: Create, Suspend, Unsuspend
- Impersonation: start/end, with audit log entries and banner
- System health dashboard: API latency, error rates, queue depths
- Cross-tenant audit log viewer
- Platform billing plan management (CRUD)

**Acceptance Criteria:**
- `/api/admin/*` returns 403 for non-platform-admin JWTs
- Impersonation creates audit log entry; session shows banner
- Tenant suspension immediately invalidates active sessions for that tenant
- IP allowlist: request from non-allowlisted IP returns 403 (tested in CI with mock header)
- Hardware key auth tested with software FIDO2 emulator in CI

**Dependencies:** Step 10 complete (UI patterns); Step 4 complete (auth base)

---

## Step 16 — Testing, Hardening & Launch Readiness

**Scope:** Test coverage targets, security review, performance, and production readiness.

**Deliverables:**
- Unit test coverage ≥ 80% for all packages
- Integration test coverage for all API endpoints (happy path + key error cases)
- Playwright E2E tests: 10 critical user flows across all portals
- Automated Axe accessibility scan in CI (zero critical/serious violations gate)
- Load test: 500 concurrent users, ticket list API ≤ 300ms P95
- Security review: dependency audit, SAST scan, CSRF/XSS manual test
- Production Docker image builds and size review
- Environment variable checklist and secrets rotation procedure documented
- Runbook: deployment, rollback, database restore procedure
- Monitoring setup: Supabase metrics + application error tracking (Sentry)
- Production environment checklist signed off

**Acceptance Criteria:**
- CI pipeline: lint → type-check → unit → integration → E2E → accessibility → build — all green
- Zero P0/P1 security findings from SAST scan
- Load test passes P95 latency targets
- All 10 E2E scenarios pass in headed Chrome and Firefox
- Runbook reviewed and tested by at least two team members
- Production environment successfully receives a test tenant creation end-to-end

**Dependencies:** Steps 11–15 complete

---

## Step 17 — CareOS Assist AI Chatbot & Knowledge Base

**Scope:** Optional, provider-independent AI assistance layer. Must not be required for the application to function.

**Deliverables:**
- `packages/ai-assist/` — provider-independent AI gateway with rules-based fallback
- Customer-facing assistant: FAQ, ticket status, warranty/quotation explanation, guided troubleshooting, escalation to human
- Internal operations assistant: ticket summaries, technician report summaries, recurring fault analysis, overdue-case summaries
- Tenant-scoped knowledge base: PDFs, manuals, FAQs, datasheets (access-controlled per tenant, role, and customer)
- Prompt injection defences: sanitize retrieved content before passing to AI context
- AI interaction audit logs (retention policy compliant)
- Optional Ollama local deployment hook (only if OCI instance resources are confirmed sufficient)
- No hardcoded paid AI provider; Free-tier usage documented with quota and terms caveats

**Acceptance Criteria:**
- Rules-based fallback responds correctly without any AI API key configured
- AI cannot approve payments, authorize coverage, close tickets, or dispatch technicians without human confirmation
- Customer assistant cannot access internal notes or other customers' data
- Internal assistant cannot access a different tenant's documents
- Prompt injection test: injected instruction in a manual cannot override authorization checks
- AI tier can be disabled per-tenant without breaking core FSM functionality

**Dependencies:** Steps 9, 10, 11 (business data exists for summaries)

---

## Step 18 — API Completeness, Mobile Readiness & Performance

**Scope:** API review pass for consistency, documentation, and mobile-readiness.

**Deliverables:**
- OpenAPI 3.1 specification (`docs/api/openapi.yaml`) covering all endpoints
- Versioned REST API (`/api/v1/…`) consistently enforced
- Shared Zod validation schemas for all request/response DTOs (in `packages/validation`)
- Consistent pagination (`page`, `pageSize`, `totalCount`, `nextCursor`) and error format
- JWT validation and tenant/role authorization verified on every protected route
- Idempotency keys for ticket creation, payment initiation, and webhook ingestion
- Rate limiting and request size limits reviewed and tightened
- CORS restricted to approved production frontend origins (if needed; Hostinger production is same-origin)
- Secure file upload workflow with signed upload URLs reviewed
- Background job contracts documented (payload schemas, retry policy, dead-letter handling)
- Mobile auth extension points documented: push notification hooks, future location ingestion design
- Slow query audit: `EXPLAIN ANALYZE` on ticket list, work order list, and coverage engine queries; indexes added where measured

**Acceptance Criteria:**
- OpenAPI spec validates without errors; all current routes are covered
- Mobile client simulation test: can authenticate, create a ticket, update work-order status using only the API (no browser session)
- No `SELECT *` or missing indexes on tenant-scoped list queries
- Rate limit test: 200 requests/minute returns 429
- Idempotency test: replayed ticket creation returns the same ticket (not a duplicate)

**Dependencies:** Steps 9–16 complete

---

## Step 19 — Full Security, Isolation, Reliability & Regression Testing

**Scope:** Cross-cutting security review and comprehensive test pass.

**Tests to run and pass:**
- Tenant A cannot read/write Tenant B records (API + RLS layer)
- Customer A cannot access Customer B records
- Customer cannot access internal notes, internal margins, or private operational data
- Technician cannot view unassigned or unauthorized work orders
- Technician cannot self-assign or change protected commercial decisions
- Operations user cannot perform platform-admin actions
- Revoked membership loses access immediately
- Tenant switching requires valid membership
- Cross-tenant foreign keys are rejected at DB level
- RLS and PostgreSQL grants both enforce intended access
- Service-role key is absent from frontend bundles and source control
- Storage object access is tenant/customer scoped (signed URLs only)
- Ticket numbers remain unique under concurrency (pgbench concurrent insert test)
- Payment webhooks are signature-verified and idempotent
- Upload MIME/size checks work (reject > allowed size; reject non-image MIME as evidence)
- Audit history cannot be altered by ordinary users
- API rate limits and input validation work
- Prompt injection cannot override authorization or reveal protected tenant data

**Deliverables:**
- Automated negative test suite covering all scenarios above
- SAST scan results with all critical/high findings resolved
- Dependency vulnerability audit (pnpm audit) with no high/critical unfixed
- Release checklist (`deployment/RELEASE_CHECKLIST.md`)
- Known medium/low risks documented

**Acceptance Criteria:**
- All isolation tests pass; zero failures tolerated for tenant/customer separation
- CI pipeline fully green including negative tests
- SAST: zero critical, zero high severity findings
- Release checklist reviewed and signed off

**Dependencies:** Steps 1–18 complete

---

## Step 20 — Deployment Preparation (Hostinger Dynamic Node.js + OCI Worker + Supabase)

> **Owner approval required before any DNS changes, production provisioning, or public deployment.**

**Scope:** Build deployment artifacts, instructions, and verification. No public deployment without approval.

**Deliverables:**

### A. Hostinger (Dynamic Managed Node.js Application)
- Production build of same-origin Fastify server serving both the built React/Vite SPA (`apps/web/dist`) and `/api/v1/*` routes
- `deployment/hostinger/README.md` with exact build, upload, and hPanel setup steps
- Reads Hostinger-injected `process.env.PORT` dynamically
- Single-origin deployment: `https://<OWNER_DOMAIN>` (no separate API subdomain required)

### B. OCI Always Free ARM64 (Background Worker Only)
- `linux/arm64` Docker image build verified for `apps/worker`
- `deployment/oci/README.md` with worker Dockerfile, Compose config, and security list guide
- Outbound-only connectivity to Supabase Cloud Singapore (no inbound ports opened)
- Systemd or Compose restart/recovery procedure
- Backup and restore documentation (`deployment/BACKUP_AND_RESTORE.md`)
- OCI idle-instance reclamation risk documented with rebuild procedure
- Cost guardrails: only Always Free-eligible resources; budget alert instructions

### C. Supabase Cloud (Singapore — Project `vbckrirksziluvwqpamx`)
- `deployment/supabase/README.md` with verified environment purpose (dev vs staging vs prod)
- Migration deployment, Auth redirect allow-list, Storage bucket, Realtime configuration
- Supabase plan limits and upgrade triggers documented

### D. Additional deployment docs
- `deployment/ENVIRONMENT_VARIABLES.md`
- `deployment/RELEASE_CHECKLIST.md`
- `deployment/COST_GUARDRAILS.md`

**Acceptance Criteria:**
- `pnpm --filter @careos/web build` and `pnpm --filter @careos/api build` succeed
- `docker buildx build --platform linux/arm64` succeeds for Worker
- Local production build serves all four portals and API routes correctly
- No secrets or service-role keys in frontend bundles (automated check)
- DNS, TLS, and OCI provisioning steps are placeholder-documented pending owner approval

**Dependencies:** Step 19 complete; owner has confirmed OCI shape availability, Hostinger document root/plan, and target project environment

---

## Step 21 — Go-Live Readiness & Handover

**Scope:** Final product and deployment readiness audit before public launch.

**Deliverables:**
- `docs/GO_LIVE_READINESS_REPORT.md` — V1 acceptance criteria classified as PASS / FAIL / NOT CONFIGURED
- `docs/KNOWN_LIMITATIONS.md` — documented medium/low risks and V2 candidates
- `docs/OPERATIONS_RUNBOOK.md` — deployment, monitoring, restart, rollback, incident response
- `docs/ADMIN_GUIDE.md` — platform admin operations
- `docs/USER_GUIDE_OPERATIONS.md`
- `docs/USER_GUIDE_TECHNICIANS.md`
- `docs/USER_GUIDE_CUSTOMERS.md`

**V1 acceptance criteria checklist:**
1. [ ] Separate Operations, Technician, Customer portal experiences
2. [ ] Shared secure authentication with tenant memberships and roles
3. [ ] Tenant/customer data isolation
4. [ ] Customer can raise and track a service ticket
5. [ ] One asset per asset-related ticket
6. [ ] Operations can review and assign/reassign technicians
7. [ ] Technician can accept/reject with mandatory reason
8. [ ] Work order stages, checklists, and photo evidence
9. [ ] Warranty, free-service, and contract-covered decisions are distinct
10. [ ] Quotation approval and payment workflow (or clearly marked unavailable)
11. [ ] Operations verifies completion
12. [ ] Customer receives service report and can confirm/complain
13. [ ] Service complaints and platform complaints have independent workflows
14. [ ] Realtime updates are tenant/customer scoped
15. [ ] Bulk service groups separate asset tickets without merging them
16. [ ] Device and asset assignment history preserved
17. [ ] Maintenance, RMA, and inventory basics work
18. [ ] Generic REST and normalized telematics connector foundations exist
19. [ ] CareOS Assist is optional with safe non-AI fallback
20. [ ] API is mobile-ready
21. [ ] Hostinger managed Node.js build succeeds
22. [ ] OCI ARM64 worker image builds successfully
23. [ ] Supabase migrations and RLS tests pass
24. [ ] Backup, restore, monitoring, and recovery procedures are documented

**Gate:** Every FAIL and NOT CONFIGURED item is documented with owner sign-off before public launch.

**Dependencies:** Step 20 complete; owner has approved DNS, secrets, TLS, backups, and cost guardrails

---

## Architecture Decision Records (ADRs)

Short records for technical choices and hosting architecture decisions.

### ADR-001: Query Builder — Kysely over Prisma

**Decision:** Use Kysely as the SQL query builder instead of Prisma ORM.  
**Rationale:** Supabase RLS requires raw SQL context (setting the JWT session variable). Kysely allows this while still providing full TypeScript type safety. Prisma's connection pooling and session management interact poorly with Supabase's RLS setup. Kysely is lighter and closer to SQL.  
**Trade-off:** More verbose query writing than Prisma; migrations are managed by Supabase CLI, which is appropriate for Supabase.

---

### ADR-002: PostgreSQL Outbox over Redis/BullMQ in V1

**Decision:** Use a durable PostgreSQL-backed `job_queue` table in Supabase for asynchronous processing, not Redis and BullMQ.  
**Rationale:** The API transaction writes business data (tickets, work orders, invoices) and outbox jobs atomically within the same database transaction. This eliminates dual-write race conditions, avoids managing Redis infrastructure, avoids extra hosting costs, and operates cleanly on OCI Always Free compute. OCI workers claim jobs using atomic row leases (`FOR UPDATE SKIP LOCKED`).  
**Trade-off:** Postgres polling produces slightly higher DB query volume than an in-memory Redis broker. At V1 scale, polling every 3 seconds uses negligible resources.

---

### ADR-003: Monolithic React App with Portal Shells

**Decision:** One React/Vite app hosts all four portals via distinct route subtrees, not four separate deployable apps.  
**Rationale:** Shared component library, shared auth context, and shared routing utilities are simpler to maintain in one app than across four apps with separate build pipelines. Code splitting via React lazy loading ensures each portal only loads its own code. Portal detection is by URL path prefix (`/operations`, `/technician`, `/customer`, `/admin`).  
**Trade-off:** A bug in the shared bundle affects all portals simultaneously. Mitigated by comprehensive test coverage and thorough code review for shared components.

---

### ADR-004: Soft Deletes on All Operational Entities

**Decision:** Use `is_active = false` (or `deleted_at`) for deletions. No physical `DELETE` on operational data.  
**Rationale:** Audit trail integrity, referential integrity (foreign keys remain valid), and accidental-deletion recovery. Data retention worker handles physical deletion per GDPR erasure rules.  
**Trade-off:** Queries must include `WHERE is_active = true` or similar filter everywhere. Mitigated by RLS policies that filter inactive records by default.

---

### ADR-005: Resend as Default Email Provider

**Decision:** Resend is the default email provider.  
**Rationale:** Modern API-first email sending with clean TypeScript SDK; reliable deliverability; competitive pricing. The connector abstraction makes it swappable per tenant.  
**Trade-off:** Relatively newer provider than Sendgrid. Mitigated by SMTP fallback connector for tenants requiring a specific provider.

---

### ADR-006: Hostinger Managed Node.js for Same-Origin Web App & API

**Decision:** Hostinger managed Node.js application serves both the built React/Vite SPA and `/api/v1/*` routes from the same origin on `process.env.PORT`.  
**Rationale:** The owner has a Hostinger shared web-hosting plan with managed Node.js application support. Fastify serves static files from `apps/web/dist` with SPA fallback for normal browser routes, and serves API endpoints under `/api/v1`. This avoids CORS overhead, avoids needing a separate API subdomain, and matches Hostinger's dynamic runtime capabilities without requiring a VPS.  
**Trade-off:** Hostinger process is stateless with request timeouts; long tasks must be queued in PostgreSQL and handled by the OCI worker.

---

### ADR-007: OCI Always Free ARM64 Compute for Background Worker Only

**Decision:** Deploy only the background worker to an OCI Always Free Ampere A1 (ARM64) instance via Docker Compose. Do not host a duplicate public Fastify API on OCI.  
**Rationale:** OCI provides generous Always Free ARM64 compute (up to 2 OCPUs, 12 GB RAM). Using it for the background worker isolates long-running jobs (SLA checks, ERP sync, bulk campaigns, report generation) from the customer-facing Hostinger web process. The worker operates outbound-only, requiring no public inbound ports or reverse proxy.  
**Trade-off:** Oracle may reclaim idle Always Free instances. Mitigated by worker activity, automated health checks, and quick redeploy runbooks.

---

### ADR-008: No Redis, Kafka, or Kubernetes in V1

**Decision:** Do not include Redis, Kafka, RabbitMQ, or Kubernetes in V1.  
**Rationale:** Zero unnecessary operational complexity and zero unnecessary cost. The PostgreSQL outbox table in Supabase provides all needed queuing semantics with ACID guarantees.  
**Trade-off:** High-throughput streaming (>10,000 events/sec) would exceed Postgres outbox capacity. Not needed for V1 telematics service management, which deals with normalized service tickets and alerts, not raw GPS pings.

---

### ADR-009: Supabase Singapore Region Confirmed

**Decision:** The Supabase project is already provisioned in Singapore (`ap-southeast-1`): URL `https://vbckrirksziluvwqpamx.supabase.co` (ref `vbckrirksziluvwqpamx`). Region is confirmed by the owner.  
**Rationale:** Region is confirmed. No new project creation or region migration is required. Local development uses Supabase CLI (`supabase start`), and hosted migrations will be applied only after explicit owner confirmation of environment designation (dev vs staging vs prod).
