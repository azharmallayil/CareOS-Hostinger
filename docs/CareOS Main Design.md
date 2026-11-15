# CareOS — Antigravity Sequential Development Prompt Pack
## Updated architecture: Hostinger Dynamic Node.js + OCI Free Tier Worker + Supabase

**Status:** Updated to use Hostinger managed Node.js hosting for the dynamic CareOS application, not a static-only frontend.

Use this pack sequentially with Google Antigravity. Submit **one step at a time**, review the result, run the requested checks, and only then continue. Do not ask Antigravity to implement the entire platform in one pass.

---

# 0. How to use this pack

1. Create a private Git repository named `careos`.
2. Open the repository in Antigravity.
3. Start with **Step 1 only**. Do not paste the entire pack as one implementation prompt.
4. Review generated documents and decisions. Correct assumptions before proceeding.
5. At the end of each step, require Antigravity to report changed files, migrations, tests, commands, results, and unresolved issues.
6. Commit each approved step to Git before proceeding.
7. Never paste production secrets into prompts or commit them to Git.

## Global instructions to Antigravity

Apply these rules in every step:

- Build **CareOS**, an independent, multi-tenant SaaS service operations platform for telematics and connected-fleet service providers.
- Do not hardcode FITCO, Arabitra, Tamimi, or any customer as a tenant. They are examples only.
- Follow the hosting architecture in this pack. Do not silently move components between providers.
- Prefer a simple, reliable, low-cost implementation. Avoid premature microservices and unnecessary infrastructure.
- Use TypeScript and strict type checking.
- Implement only the current step. Do not skip ahead.
- Do not invent credentials, domains, tenant details, production region approvals, payment-provider credentials, or legal/compliance approvals.
- Never expose Supabase service-role keys, database passwords, private API secrets, or other server secrets in browser code, logs, screenshots, or Git.
- Every tenant-owned record must be tenant-scoped and protected by database-level controls, not merely frontend filtering.
- Include automated tests for tenant isolation, authorization, validation, and critical business rules.
- Use migrations for database changes. Never recommend destructive production SQL without explaining impact, backup, and rollback.
- Do not run production migrations, create paid cloud resources, change DNS, alter email/MX records, or deploy to production without explicit owner approval.
- Where a decision is unapproved, document the options, recommend a default, and mark it **PENDING OWNER APPROVAL**. Do not pretend it is settled.
- Do not claim a feature is complete unless implemented and tested.
- Keep `README.md`, architecture docs, `.env.example`, deployment docs, and diagrams synchronized with the implementation.

---

# 1. Product definition

## Product

**Name:** CareOS  
**Positioning:** Service Intelligence for Connected Fleets  
**Description:** The Complete Service Operations Platform for Telematics Companies.

CareOS is a multi-tenant SaaS platform for companies that install, support, maintain, and service telematics devices and connected-fleet equipment. It manages customers, vehicles/assets, devices, SIMs, installations, service requests, technician dispatch, evidence, quotations, warranty, maintenance, complaints, inventory, contracts, SLAs, integrations, and service intelligence.

CareOS is **not** a high-frequency GPS tracking platform. It consumes normalized device-health and alert events from FLEETNEX or other telematics systems. Do not ingest every raw GPS ping.

## Main user groups and portals

One shared backend and identity system, with separate protected experiences:

1. **Operations Portal** — `/operations`
   - Service command centre, customers, branches/sites, fleet/assets, devices, SIMs, installations, all tickets, technician dispatch, quotations, coverage approvals, complaints, work orders, evidence verification, reports, configuration and tenant administration.
2. **Technician Portal** — `/technician`
   - Assigned jobs, accept/reject with mandatory reason, customer/site/vehicle/device details, navigation, job stages, checklists, photos, notes, serial/replacement details, completion and permitted location sharing.
3. **Customer Portal** — `/customer`
   - Raise requests and complaints, see their own assets/devices/history, track tickets, appointments and technician information, review quotations, approve/reject, pay, access receipts and service reports, view warranty/free-service status and submit feedback.
4. **SaaS Platform Admin** — a separately protected platform administration area for tenant provisioning, platform-level configuration and subscription administration. It must not be exposed as an ordinary tenant role.

A user may belong to multiple tenants only through explicit memberships. Tenant switching is limited to authorized memberships. Customer users see only their customer-account data. Technicians see only authorized assigned work. Operations users are tenant- and role-scoped. Customers must never see internal notes, internal margins, or private operational data.

## Core modules

1. Customer/account management
2. Fleet and asset registry
3. Device and SIM registry
4. Installation and commissioning
5. Support desk, tickets and complaints
6. Field service and technician dispatch
7. Preventive/corrective maintenance
8. Warranty, repairs and RMA
9. Spare parts and inventory
10. Contracts and SLA
11. ERP and telematics integrations
12. Reports and service intelligence
13. CareOS Assist AI and knowledge base

## V1 exclusions

- Native mobile applications (but design APIs and backend for a future Android/iOS technician app).
- Dark mode.
- Partial payments/installments.
- On-premises deployment.
- Self-service tenant signup; platform admin provisions tenants.
- Video-call support.
- Carrier API integration for SIM cards.
- ERP-specific adapters beyond a generic REST integration.
- Build a localization foundation for Arabic and English, but do not claim complete Arabic translations unless actually implemented.

---

# 2. Hosting and runtime architecture — mandatory

## Target deployment

| Component | Hosting / service | Responsibility |
|---|---|---|
| Web frontend | Hostinger managed Node.js application | Serves the React/Vite production build |
| HTTP API | Same Hostinger Node.js application by default | Fastify API under `/api/v1` |
| Background worker | Oracle Cloud Infrastructure (OCI) Always Free eligible compute | Scheduled jobs, integrations, retries and long-running tasks |
| Database | Supabase Cloud PostgreSQL | Primary relational database |
| Authentication | Supabase Auth | Identity, sessions and authentication |
| File storage | Supabase Storage | Private documents, photos and evidence |
| Live updates | Supabase Realtime | Browser updates and subscriptions |
| Source control / CI | Git repository and CI workflow | Versioning, checks and deployment preparation |

## Hostinger is dynamic application hosting, not a static-only target

The owner intends to use Hostinger managed Node.js hosting for the live dynamic CareOS application. Hostinger is **not assumed to be a VPS**.

**Preferred deployment shape:** one same-origin Node.js application in which Fastify serves:
- the built React/Vite frontend for normal browser routes; and
- API routes under `/api/v1`.

This avoids unnecessary CORS configuration and avoids requiring a separate API subdomain. If the actual Hostinger plan or deployment interface requires frontend and backend to be separate Node.js applications, document that as an alternative and confirm the plan's application limit before adopting it.

Hostinger plan capabilities and resource limits vary by plan and may change. Before deployment, verify the exact plan and current hPanel limits. Do not assume the phrase “top plan” identifies a specific plan.

## Hostinger runtime constraints

Treat these as constraints unless the owner verifies a current plan-specific change:

- Hostinger managed Node.js hosting is not a VPS and does not provide assumed root access.
- Do not rely on Docker, Redis, custom system services, custom listening ports, or Nginx configuration on Hostinger.
- Read the port from `process.env.PORT` and bind appropriately; never hardcode a port.
- Do not run a persistent background worker on Hostinger.
- Do not depend on inbound WebSockets on Hostinger. Use Supabase Realtime for browser live updates.
- Design API requests to complete within the host's request timeout. Long-running work must be queued and processed by the OCI worker.
- Do not use the Hostinger web process for recurring cron-style workloads or integration polling.
- Keep the Node.js process stateless. Persist sessions/state in Supabase or another explicitly approved managed service.
- Use structured logs and health/readiness endpoints. Avoid logging secrets or sensitive payloads.
- Confirm supported Node.js versions and application/process/resource limits in hPanel before production deployment.

## OCI worker

Use OCI for background processing and supporting compute that cannot reliably run inside Hostinger managed Node.js hosting.

- Target an OCI Always Free eligible ARM64 VM if available and approved.
- OCI A1 Always Free capacity is subject to account eligibility, regional capacity, quotas and current Oracle terms. Do not assume a VM has already been provisioned.
- Use ARM64-compatible Docker images and a simple Docker Compose deployment for the worker only.
- Worker processes jobs from a PostgreSQL-backed queue/outbox in Supabase using atomic claiming/leases, retry policy, idempotency keys, dead-letter handling and observability.
- Worker should normally make outbound connections only. Do not open public inbound ports unless a specific, approved requirement exists.
- Do not create paid OCI resources, paid networking, or paid storage. Alert the owner before any action that could incur charges.
- Account for OCI Always Free idle-instance reclamation and resource limits. Document restart and recovery procedures.
- Do not run a duplicate public Fastify API on OCI by default.

## Supabase

- Supabase is the managed database/auth/storage/realtime platform.
- Use PostgreSQL migrations, RLS, explicit grants, private storage buckets and server-side secret handling.
- Do not expose service-role credentials to the browser.
- Use the owner's existing Supabase project in **Singapore (Asia-Pacific / Singapore)**. The owner has confirmed this region. Do not propose Mumbai or another region as the default.
- Existing project URL: `https://vbckrirksziluvwqpamx.supabase.co` (project reference: `vbckrirksziluvwqpamx`).
- Treat this as the configured Supabase project endpoint, but do not assume whether the project is development, staging, or production until the owner confirms its environment purpose. Do not reset, replace, or recreate it.
- Do not apply migrations to the existing hosted project until the owner has reviewed the migration plan and explicitly approved the target environment and execution.
- Configure the project URL through environment variables, not hardcoded source: `VITE_SUPABASE_URL=https://vbckrirksziluvwqpamx.supabase.co` for the Vite client and `SUPABASE_URL=https://vbckrirksziluvwqpamx.supabase.co` for server/worker configuration where needed. Keep keys separate from the URL.
- Leave `VITE_SUPABASE_ANON_KEY` (or the current Supabase publishable key variable used by the chosen SDK) as a placeholder in `.env.example`; never invent or commit its value. Keep service-role/secret keys server-side only, never in any `VITE_` variable or browser bundle.

## Domain and routing

Preferred target:
- `https://<OWNER_DOMAIN>` → Hostinger Node.js application.
- Optional `www` hostname redirects to the canonical hostname.
- `/api/v1/*` → Fastify API in the same Node.js application.
- No separate `api.<OWNER_DOMAIN>` is required in the preferred design.
- OCI worker connects outbound to Supabase and required external APIs.
- Do not modify DNS, SSL, existing website configuration, `.htaccess`, or MX/email records without inspecting the current setup, documenting a backup/rollback plan, and receiving explicit approval.

## Background job pattern

Use a durable PostgreSQL-backed job/outbox pattern initially. Do not add Redis, Kafka, RabbitMQ, or Kubernetes for V1.

- The API transaction writes business data and an outbox/job record atomically.
- OCI worker claims eligible jobs atomically with a lease/lock.
- Each job has status, attempts, next-run time, lock/lease expiry, idempotency key, error summary and timestamps.
- Retry transient failures with bounded exponential backoff and jitter.
- Move exhausted jobs to a dead-letter state for operator review.
- Make handlers idempotent.
- Worker must recover expired leases after a crash.
- Do not rely on in-memory queues or timers in the Hostinger web process.

## Live updates

Use Supabase Realtime for relevant client subscriptions. Authorize subscriptions so a user receives only records allowed by their tenant and role. Realtime is a notification/update channel, not a replacement for database authorization or canonical API reads.

---

# 3. Technical stack

- Monorepo: `pnpm` workspaces.
- Frontend: React + TypeScript + Vite.
- UI: Tailwind CSS + shadcn/ui (or compatible accessible component primitives).
- API: Node.js + Fastify + TypeScript.
- Database/auth/storage/realtime: Supabase.
- Validation: shared schemas (Zod or an equivalent maintained TypeScript validation library).
- Testing: Vitest; Playwright for browser E2E; database/RLS integration tests.
- Worker: Node.js + TypeScript, deployed to OCI ARM64 using Docker Compose.
- Logging: structured JSON logs with request/job correlation IDs.
- API documentation: OpenAPI generated from actual routes/schemas.
- No mandatory paid AI provider.
- Do not introduce Redis, Kafka, Kubernetes, or microservices in V1 without a documented technical need and owner approval.

## Existing Supabase project configuration

- Project URL: `https://vbckrirksziluvwqpamx.supabase.co`
- Project reference: `vbckrirksziluvwqpamx`
- Region: Singapore (Asia-Pacific / Singapore), confirmed by the owner
- Environment purpose (development/staging/production): **confirm before hosted migrations**
- Required configuration names: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (or the SDK's publishable-key equivalent), `SUPABASE_URL`, and server-only secret variables as required. Never place service-role/secret values in frontend variables.

## Suggested monorepo

```text
careos/
├── apps/
│   └── web/                 # React/Vite UI and Fastify server entry point
├── services/
│   └── worker/              # OCI background worker
├── packages/
│   ├── ui/
│   ├── core-domain/
│   ├── shared-types/
│   ├── database/
│   ├── auth/
│   ├── permissions/
│   ├── validation/
│   ├── integration-contracts/
│   └── configuration/
├── connectors/
│   ├── erp/generic-rest/
│   └── telematics/generic-webhook/
├── supabase/
│   ├── migrations/
│   ├── functions/
│   ├── tests/
│   ├── config.toml
│   └── seed.sql
├── deployment/
│   ├── hostinger/
│   ├── oci/
│   └── docs/
├── docs/
│   ├── product/
│   ├── architecture/
│   ├── database/
│   ├── security/
│   ├── design-system/
│   ├── integrations/
│   ├── development/
│   └── deployment/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .env.example
├── package.json
└── pnpm-workspace.yaml
```

The precise folder layout may be refined in Step 1, but keep the browser application/API and OCI worker clearly separated. Do not create a second API service on OCI by default.

---

# 4. Product rules that must remain consistent

## Ticket and bulk-service model

- One asset-related ticket represents one asset in V1 (`tickets.asset_id`).
- `asset_id` may be nullable for general/platform support requests that do not concern a specific asset.
- If multiple assets need service, create a separate ticket for each asset.
- Bulk service is a parent/campaign/grouping feature that groups individual asset tickets. It does **not** merge them.
- Every asset retains its own ticket, coverage/warranty evaluation, work order, evidence, status and service history.
- The bulk parent supports shared scheduling, technician planning, progress tracking and aggregate reporting.
- OQ-10 (one asset per ticket vs multiple assets per ticket) should be documented with the above recommended V1 decision. If the owner has not explicitly confirmed it, mark it pending confirmation before finalizing schema.

## Service lifecycle

1. Customer raises request through portal or staff.
2. Operations validates customer, asset/device, warranty, priority and request details.
3. System classifies coverage and determines whether quotation is required.
4. Customer approves quotation and pays where applicable.
5. Operations assigns an appropriate technician.
6. Technician accepts or rejects with a valid reason.
7. Technician performs service with staged progress, checklists, notes and evidence.
8. Operations reviews evidence and verifies completion.
9. Customer confirms resolution and may provide feedback or raise a complaint.

Every ticket must have a reliable event timeline and audit trail.

## Ticket statuses

Use a configurable, permission-controlled status transition model. Initial suggested statuses:

- Draft
- Submitted
- Under Review
- Awaiting Quotation
- Awaiting Customer Approval
- Awaiting Payment
- Ready for Assignment
- Assigned
- Accepted
- Scheduled
- Technician En Route
- Arrived
- In Progress
- On Hold
- Service Completed
- Awaiting Operations Verification
- Awaiting Customer Confirmation
- Resolved
- Closed
- Cancelled

Record actor, old/new status, timestamp, reason/notes, attachments and location when relevant and consented.

## Coverage and commercial workflow

Keep these classifications distinct:

- **Paid Service** — quotation and payment workflow.
- **Warranty** — validate warranty dates, serial/device identity, fault and authorization; zero-charge only after approval.
- **Free Service** — require a reason and authorized approver; zero-charge after approval.
- **Contract-covered service** — validate contract entitlement and service limits.

Quotation supports versions, labour, parts, descriptions, quantities, unit prices, discounts, tax/VAT, totals, validity, terms, documents/PDF and version history.

Customer can approve/reject with reason. Payment uses a provider abstraction; do not hardcode or claim a gateway integration. Server verifies provider webhooks/signatures and payment status. Use idempotency. Never trust a frontend callback or store card data. A paid ticket becomes Ready for Assignment only after confirmed payment unless an authorized exception is recorded.

## Technician dispatch

Recommendations may consider distance (if available), availability, workload, skills, territory, working hours and priority. Operations retains manual assignment/reassignment authority.

Technician rejection requires a reason:
- unavailable
- wrong specialization
- outside service area
- existing job conflict
- missing tools
- incorrect job details
- other (explanation mandatory)

Persist rejection, notify operations, return the ticket to the unassigned queue and record timeline event. Reassignment after acceptance requires a reason and audit event. A ticket may have multiple assignment records and work orders over its lifecycle.

## Location and privacy

- Web geolocation works only while the technician portal is active and permission is granted; do not promise reliable background tracking after tab closure/suspension.
- V1 can show latest permitted location, accuracy, timestamp and distance.
- Future mobile apps may provide background location with explicit permission.
- Location tracking must be transparent, consent-based, work-related and retention-limited.
- Customers see appointment/arrival information, not technician personal location history.
- Geofencing is a later capability requiring server-side validation, radius/accuracy controls, anti-spoofing and privacy safeguards.

## Evidence

Evidence requirements are configurable by service type and stage: before service, arrival, inspection, work-in-progress, after service, testing and completion.

Use private Supabase Storage. Validate MIME type and size; authorize upload ownership; use signed upload/download URLs; store metadata and audit events. Optional GPS metadata requires consent. Ordinary users must not silently replace/delete finalized evidence. A photo upload is not verified proof until reviewed.

## Complaints

Complaints have their own lifecycle and do not mutate ticket audit history.

Types:
- Service complaint (ticket, technician, installation, repair, delay or outcome).
- Platform complaint (CareOS access, functionality, billing, account or platform experience).

Workflow: create, reference number, category/severity, optional ticket link, assign manager, investigate/internal notes, resolution, customer update, close/escalate.

## Ticket numbering

Tenant-configurable prefix, category, calendar/financial year, sequence, optional branch/region and starting sequence. Examples only: `FIT-2026-000001`, `ARA-2026-000001`, `FLEET-RYD-000001`. Use immutable identifiers and transactional, concurrency-safe sequence generation. Do not hardcode example prefixes.

## AI and knowledge base

CareOS Assist has customer-facing and internal operations modes.

Customer use cases:
- FAQs, authenticated ticket status, warranty and quotation/payment explanations, approved troubleshooting, draft request and human escalation.

Internal use cases:
- Ticket/complaint summaries, technician report summaries, recurring fault analysis, knowledge/manual search, troubleshooting suggestions, response drafts and overdue-case summaries.

Knowledge base supports tenant-scoped PDFs, manuals, troubleshooting guides, FAQs, installation guides, datasheets and procedures.

AI is optional. The app must work without an AI provider. Use a provider-independent gateway and deterministic/rules-based fallback. Evaluate free API tiers only after verifying current quotas, terms and data handling. Local Ollama may be evaluated only if OCI resources and performance permit. AI must not authorize payments, warranty, ticket closure or dispatch automatically. Human approval is required for consequential actions. Protect against prompt injection and cross-tenant retrieval. Never disclose internal notes to customers.

## Integrations

- V1 ERP: generic REST only.
- V1 telematics: generic REST/webhooks and normalized event model.
- Later adapters may include SAP, Oracle, Dynamics, Odoo, Zoho and telematics vendors.
- Canonical internal data model, external ID mapping, field mapping, event inbox/outbox, signature verification, idempotency, deduplication, retries and sync logs.
- Normalized events may include online/offline, last seen, camera/MDVR fault, DMS/ADAS/IVMS/PIWAS alerts.
- Do not create a ticket for every repeated heartbeat.
- Do not ingest every raw GPS ping.

---

# 5. Security and data architecture

## Initial SaaS foundation tables

- tenants
- tenant_settings
- profiles
- tenant_memberships
- departments
- roles
- permissions
- role_permissions
- membership_roles
- tenant_invitations
- platform_admins
- audit_logs

Do not create every module table in the initial migration. Add module schemas in their relevant steps.

## Later module table plan

- SaaS: subscriptions, tenant settings.
- Identity: customer_users, technician_profiles, portal_preferences.
- CRM: customer_accounts, customer_contacts, customer_sites.
- Fleet: assets, asset_categories, asset_assignments.
- Device: device_manufacturers, device_models, devices, sim_cards, asset_device_assignments.
- Installation: installation_orders, installation_items, installation_checklists, installation_media.
- Support: tickets, ticket_categories, ticket_comments, ticket_events, ticket_status_history, ticket_number_sequences, ticket_assignments.
- Field service: work_orders, work_order_tasks, work_order_stages, work_order_checklists, service_visits, technician_assignments, technician_availability, technician_skills, technician_location_updates.
- Evidence: service_evidence, evidence_reviews.
- Maintenance: maintenance_plans, maintenance_schedules, maintenance_records.
- Warranty/RMA: warranty_records, warranty_authorizations, rma_cases, rma_items.
- Inventory: parts_catalog, stock_locations, stock_movements, parts_usage.
- Contracts/SLA: service_contracts, sla_policies, sla_instances, escalations.
- Commercial: service_quotations, quotation_items, quotation_approvals, payment_orders, payment_transactions, payment_webhook_events, refunds.
- Complaints: complaints, complaint_events.
- Location: geofence_zones, geofence_events.
- Integrations: integration_connections, external_id_mappings, field_mappings, inbound_event_inbox, outbound_event_outbox, integration_jobs, sync_logs.
- Platform: notifications, audit_logs, customer_feedback, knowledge_articles.
- AI: ai_conversations, ai_messages, ai_feedback.
- Bulk service: bulk_service_requests (or campaigns) and explicit links to individual tickets. Do not replace individual asset tickets with a single multi-asset ticket.

Every tenant-owned record must have `tenant_id`, tenant-aware constraints and RLS. Use composite tenant-aware foreign keys where appropriate. Historical asset/device assignments must be retained. A ticket may have multiple assignments, work orders, quotation versions and complaints. Work orders have multiple stages; stages can have multiple evidence records. A quotation can have multiple payment attempts. Ticket, work order and RMA are separate linked concepts. Location data has retention limits.

## Mandatory security rules

- Enable RLS on every exposed application table.
- Configure explicit PostgreSQL grants separately from RLS.
- Create separate SELECT/INSERT/UPDATE/DELETE policies as appropriate.
- Enforce active tenant membership.
- Prevent tenant ID reassignment and cross-tenant foreign-key relationships.
- Prevent role escalation and unauthorized membership/role changes.
- Platform admins are separately provisioned and protected.
- Ordinary users cannot alter immutable audit records.
- Put security helper functions in a private schema and avoid recursive RLS.
- Prefer `SECURITY INVOKER`. Use `SECURITY DEFINER` only when necessary, with fixed `search_path`, validated `auth.uid()`, narrow privileges and restricted EXECUTE grants.
- Never put Supabase service-role or database secret keys in frontend bundles.
- Test cross-tenant reads/writes and portal role boundaries automatically.
- Validate uploads and signed URL access.
- Rate-limit sensitive endpoints and protect invitation, password reset and webhook flows.

---

# 6. Open decisions to track

Create and maintain `docs/product/open-questions.md`. Do not silently resolve owner decisions.

At minimum:
- **Supabase project region:** resolved — owner-confirmed Singapore (Asia-Pacific / Singapore). Existing project URL: `https://vbckrirksziluvwqpamx.supabase.co`. Confirm whether this existing project is development, staging, or production before applying hosted migrations.
- **OQ-09 — Free Service Rule:** owner must define eligibility, limits, approvers and evidence required before the coverage engine is finalized.
- **OQ-10 — Multi-asset ticket:** recommended V1 decision is one asset per ticket, with bulk service grouping separate individual tickets. Obtain explicit confirmation before final schema if not already approved.
- **Hostinger exact plan name and Node.js app limits:** verify in hPanel before deployment; do not infer from “top plan”.
- **OCI VM provisioning and region:** confirm eligibility, capacity and owner approval before creating resources.
- **Production domain and DNS:** obtain exact domain and explicit DNS/deployment approval before changes.
- **Payment provider:** keep provider-neutral until selected.
- **AI provider:** optional; no mandatory paid service. Verify provider terms and privacy before enabling.
- Track any other question that truly blocks the next implementation step. Distinguish blocking from non-blocking questions.

---

# 7. Sequential Antigravity prompts

## STEP 1 — Finalize CareOS product specification and technical architecture

**Paste this prompt first:**

> You are the product architect and senior SaaS systems architect for CareOS. Read the full CareOS product and architecture specification supplied in this repository/document. Your task in this step is documentation and architecture finalization only. Do not implement application code, create cloud resources, create production projects, or apply database migrations.
>
> Create or update:
> - `docs/product/product-requirements.md`
> - `docs/product/roles-and-portals.md`
> - `docs/product/service-workflows.md`
> - `docs/product/open-questions.md`
> - `docs/architecture/system-architecture.md`
> - `docs/architecture/deployment-architecture.md`
> - `docs/architecture/architecture-decisions.md`
> - `docs/security/security-model.md`
> - `docs/development/implementation-roadmap.md`
>
> The mandatory deployment architecture is: Hostinger managed Node.js hosts the dynamic React/Vite + Fastify same-origin application; OCI Always Free eligible compute hosts the background worker only; Supabase Cloud provides PostgreSQL, Auth, Storage and Realtime. Hostinger is not a VPS. Do not place the primary API on OCI by default. Do not run persistent workers or depend on inbound WebSockets on Hostinger. Long-running tasks go to the PostgreSQL-backed job/outbox and are processed by OCI. The browser uses Supabase Realtime for live updates.
>
> Include diagrams (Mermaid is acceptable), request flows, trust boundaries, deployment assumptions, failure modes, backup/recovery responsibilities, security boundaries and cost risks.
>
> Review every product decision in the specification. Mark unapproved items as pending owner approval. Treat the Supabase region as resolved: use the existing owner-provided Singapore project at `https://vbckrirksziluvwqpamx.supabase.co` (project ref `vbckrirksziluvwqpamx`). Confirm whether it is dev, staging, or production before any hosted migration. Continue tracking the Free Service Rule, one-asset-per-ticket confirmation, exact Hostinger plan limits, OCI provisioning/region, domain/DNS, payment provider and AI provider.
>
> Define the V1 boundaries and the 21-step implementation sequence. Identify only genuine blockers for the next step. Do not invent answers.
>
> At the end, report every file created/changed, the decisions made, open questions, risks, and a concise owner-approval checklist. Stop and wait for review.

**Acceptance gate:** Product scope, portals, deployment architecture and open decisions are documented. No application code or cloud resource was created.

## STEP 2 — Repository scaffold and development tooling

> Implement the CareOS monorepo scaffold based on the approved Step 1 documents.
>
> Use pnpm workspaces, TypeScript strict mode, React/Vite, Tailwind, the agreed UI component system, Fastify and a separate Node.js worker package. Keep the web application/API deployable as one Hostinger managed Node.js application. Keep the worker independently buildable for OCI ARM64 and Docker Compose.
>
> Create workspace scripts for development, linting, type-checking, unit tests, builds and formatting. Add `.editorconfig`, `.gitignore`, `.env.example`, README and package-level configuration. Add a minimal Fastify health endpoint and a minimal frontend shell only; do not implement business modules.
>
> Do not add Redis, Kafka, Kubernetes or paid services. Do not include real secrets. Add CI checks for install, lint, type-check, tests and builds.
>
> Ensure the Hostinger web app reads the assigned `PORT` environment variable. Do not assume root access, Docker or custom services on Hostinger. Add a worker Dockerfile that supports OCI ARM64.
>
> Run all checks and report results, changed files and exact local commands. Stop for review.

**Acceptance gate:** Clean install, lint, type-check, tests and production builds pass. Web app and worker build independently.

## STEP 3 — Supabase database foundation, tenancy and RLS

> Implement only the initial SaaS foundation schema from the approved design: tenants, tenant settings, profiles, tenant memberships, departments, roles, permissions, role permissions, membership roles, tenant invitations, platform admins and audit logs.
>
> Create ordered, reversible Supabase migrations and seed data for local development only. Do not create a production Supabase project or apply production migrations.
>
> Every tenant-owned table must include tenant scoping and appropriate constraints. Add private-schema authorization helpers, explicit grants, RLS policies and protections against tenant reassignment, cross-tenant relationships and role escalation. Keep platform admins separately provisioned.
>
> Prefer SECURITY INVOKER. If a SECURITY DEFINER function is necessary, use a fixed search_path, validate auth.uid(), minimize privileges and restrict EXECUTE grants.
>
> Add automated SQL/RLS tests for anonymous access, tenant A vs tenant B, inactive memberships, role boundaries, unauthorized inserts/updates/deletes and platform admin boundaries.
>
> Do not create module tables early. Run migrations against a local/test Supabase environment only and report test output. Stop for review.

**Acceptance gate:** Foundation schema and RLS tests pass, including cross-tenant isolation.

## STEP 4 — Authentication, onboarding, memberships and portal routing

> Implement Supabase Auth integration and secure application session handling. Build login, logout, password recovery, invitation acceptance and tenant/workspace selection.
>
> Support distinct protected route shells for `/operations`, `/technician`, `/customer` and the separately protected SaaS platform admin area. A user may enter only portals permitted by their active membership and role. Tenant switching is limited to authorized memberships.
>
> Do not rely on hidden frontend navigation as authorization; enforce permissions in API and database. Do not allow public self-service tenant signup in V1. Do not expose service-role credentials.
>
> Add tests for unauthenticated access, expired sessions, cross-tenant switching, customer/technician portal boundaries and unauthorized platform-admin access. Stop for review.

**Acceptance gate:** Authentication and route protection work; backend and RLS enforce the same boundaries.

## STEP 5 — Portal shells, organization administration and permissions

> Build the visual shells for the three tenant portals and platform admin area using the approved CareOS design system. Implement tenant profile/settings, branches/departments, user invitations, membership management, role assignment and permission management.
>
> Use the CareOS palette and enterprise industrial SaaS visual direction. Default to light mode. Ensure responsive layouts, accessible controls, clear empty/loading/error states and compact data tables.
>
> Implement permission checks on the server and database, not only in components. Protect privileged role changes and audit them.
>
> Add tests for role assignment, invitation lifecycle and portal visibility. Do not build future business modules. Stop for review.

**Acceptance gate:** Portal shells and tenant administration are functional and permission-tested.

## STEP 6 — Customer accounts, contacts, branches and sites

> Implement customer account management for tenant operations users. Add customer accounts, contacts, branches/sites, addresses, service contacts and account status. Establish customer-user links for customer portal access.
>
> Enforce tenant ownership and customer-account boundaries. Customer portal users must only access the account(s) explicitly linked to their identity. Add search, filters, pagination, validation, audit history and import/export only if specified in approved scope.
>
> Include API, UI, migrations, RLS and tests. Stop for review.

**Acceptance gate:** Customer hierarchy and portal visibility work without cross-account leakage.

## STEP 7 — Fleet and asset registry

> Implement asset categories and fleet/asset registry. Support vehicle and other serviceable equipment records, identifiers, registration/fleet numbers, make/model/year, customer ownership, branch/site, operational status and historical customer/site assignments.
>
> Add asset search, filters, detail view, history and bulk import with validation if approved. Enforce tenant/customer scope. Do not build raw GPS tracking.
>
> Include migrations, API, UI, RLS and tests. Stop for review.

**Acceptance gate:** Assets are tenant-scoped, customer-linked and history-aware.

## STEP 8 — Device, SIM and installation registry

> Implement device manufacturers/models, devices, SIM records and historical asset-device assignments. Track serial/IMEI, model, firmware, identifiers, SIM ICCID/phone number/operator where applicable, activation state and lifecycle.
>
> Implement installation orders, installation items, checklists and installation media. Support commissioning and replacement history. Protect sensitive identifiers and prevent duplicate serial/IMEI conflicts within the appropriate scope.
>
> Do not integrate carrier APIs. Do not ingest high-frequency GPS data. Include migrations, API, UI, RLS and tests. Stop for review.

**Acceptance gate:** Device/SIM lifecycle and installation history work correctly.

## STEP 9 — Support desk, ticketing, numbering and complaints

> Implement the support desk and ticket lifecycle. One asset-related ticket represents one asset in V1; allow nullable asset_id for general requests. Multiple assets are handled through separate tickets and later grouped by bulk service.
>
> Implement configurable ticket categories, priorities, statuses, tenant/customer-specific numbering, comments, events, status history, assignment placeholders and complaint management. Ticket numbers must be immutable and generated transactionally with concurrency safety.
>
> Implement the agreed service lifecycle and role-based status transitions. Every transition must record actor, timestamp, old/new status, reason and relevant attachments/location metadata.
>
> Complaints have a separate lifecycle and may link to a ticket, but must not alter ticket audit history. Distinguish service complaints from platform complaints.
>
> Add tests for ticket numbering concurrency, status transition authorization, tenant isolation and complaint workflow. Stop for review.

**Acceptance gate:** Ticketing and complaints work with reliable audit/timeline history.

## STEP 10 — Coverage engine, quotations, approvals and payments

> Implement service coverage classification for Paid Service, Warranty, Free Service and Contract-covered service as separate paths.
>
> Before coding Free Service eligibility, inspect `open-questions.md`. If OQ-09 is unresolved, implement only the extensible rule interface and tests for approved rules; do not invent eligibility limits or approval authority.
>
> Implement warranty records and authorization checks, quotation versioning, labour/parts line items, quantities, discounts, VAT/tax, totals, validity, terms, PDF/document storage, customer approval/rejection and reasons.
>
> Implement payment-provider abstraction only. Do not select or claim integration with a real provider until owner approval. Verify payments server-side using signed webhooks, provider references, idempotency and reconciliation. Never trust frontend callbacks or store card data.
>
> Paid tickets must not become Ready for Assignment until payment is verified, except through a separately authorized and audited exception. Warranty/free/contract paths require their own approval logic.
>
> Add full tests for pricing calculations, VAT, quotation versions, approval permissions, webhook signatures, replay/idempotency and coverage rules. Stop for review.

**Acceptance gate:** Commercial and coverage workflows pass tests; no real payment provider is activated without approval.

## STEP 11 — Technician management, dispatch and field service

> Implement technician profiles, skills, service territories, availability, working hours, workload and assignment history. Build dispatch queue and assignment/reassignment workflows.
>
> Provide ranked recommendations using only available, reliable data such as skills, territory, availability, workload, priority and latest permitted location. Operations retains manual assignment authority.
>
> Implement accept/reject. Rejection requires a reason from the approved list; “other” requires an explanation. Rejection must notify operations, return the ticket to the unassigned queue and create a timeline event. Reassignment after acceptance requires a reason and audit.
>
> Implement work orders, tasks, stages, checklists and service visits. A ticket may have multiple assignments/work orders over time.
>
> Web location sharing must be opt-in and accurately described as available only while the technician portal is active and permission remains granted. Do not promise background tracking. Do not expose personal location history to customers.
>
> Add API/UI/RLS/tests. Stop for review.

**Acceptance gate:** Dispatch and work-order workflows are auditable and permission-safe.

## STEP 12 — Service evidence, live progress, notifications and bulk service

> Implement configurable evidence requirements by service type and work stage. Use private Supabase Storage, signed URLs, MIME/size validation, ownership checks, metadata, timestamps, optional consented location and evidence review.
>
> Implement stage-by-stage technician progress, internal/customer-visible notes separation, notification preferences and Supabase Realtime subscriptions with tenant/role authorization. Realtime must not replace API/RLS checks.
>
> Implement bulk service as a parent request/campaign that groups separate individual asset tickets. Support shared scheduling, technician planning, progress and aggregate reports. Each asset must retain its own ticket, coverage decision, work order, evidence, status and service history. Never merge multiple assets into one ticket.
>
> Finalized evidence cannot be silently overwritten/deleted by ordinary users. A photo is not considered verified until reviewed.
>
> Add tests for evidence permissions, signed URL access, realtime isolation and bulk-to-individual ticket integrity. Stop for review.

**Acceptance gate:** Evidence, live progress and bulk service work while preserving independent asset-level records.

## STEP 13 — Maintenance, warranty/RMA and spare-parts inventory

> Implement preventive maintenance plans/schedules, maintenance records, warranty lifecycle, RMA cases/items, parts catalogue, stock locations, stock movements and parts usage.
>
> Maintain traceability from ticket/work order to device/asset, warranty decision, RMA and consumed parts. Preserve historical assignments and movements; do not silently overwrite history.
>
> Add authorization for stock adjustments, audit logs, low-stock views and appropriate validation. Do not introduce procurement or ERP scope beyond approved requirements.
>
> Add migrations, API, UI, RLS and tests. Stop for review.

**Acceptance gate:** Maintenance, warranty/RMA and inventory history are consistent and auditable.

## STEP 14 — Contracts, SLA, escalation and service intelligence

> Implement service contracts, coverage entitlements, SLA policies, SLA instances, business calendars if approved, escalation rules and escalation history.
>
> Ensure contract coverage is distinct from warranty and free-service decisions. Use the OCI worker for scheduled SLA evaluation and reminders; do not run recurring jobs in the Hostinger web process.
>
> Design worker jobs with leases, idempotency, bounded retries, dead-letter handling and observable outcomes. Do not rely on in-memory timers.
>
> Add dashboards/reports for SLA compliance, overdue tickets, service volume, technician workload and customer service history. Ensure all aggregates are tenant-scoped.
>
> Add tests for SLA clock calculations, pauses, escalations, worker retry and tenant isolation. Stop for review.

**Acceptance gate:** SLA processing is reliable through the OCI worker and reporting is tenant-safe.

## STEP 15 — ERP and telematics integrations

> Implement generic REST ERP connector contracts and generic telematics webhook/event ingestion. Do not build vendor-specific adapters unless separately approved.
>
> Use canonical internal models, external ID mappings, field mappings, integration connections, inbound event inbox, outbound event outbox, sync logs, retries and idempotency.
>
> Validate webhook signatures where supported. Protect secrets at rest and never expose them to the browser. Use OCI worker for polling, retries and long-running synchronization.
>
> Normalize only relevant events such as device online/offline, last-seen, camera/MDVR fault and DMS/ADAS/IVMS/PIWAS alerts. Deduplicate repeated events and avoid creating tickets for routine heartbeats. Do not ingest every raw GPS ping.
>
> Add sandbox/mock integration tests and operational monitoring. Stop for review.

**Acceptance gate:** Generic integration framework works with mock endpoints and durable worker processing.

## STEP 16 — Dashboard, search, exports and reporting UX

> Complete operational dashboards and reporting across approved modules. Include useful filters, date ranges, tenant/customer/branch scopes, status and priority breakdowns, technician workload, service trends, SLA, inventory and bulk-service progress.
>
> Add global search with strict authorization. Exports must enforce the same tenant and role restrictions as the UI/API. Avoid exporting internal-only fields to customer portal users.
>
> Optimize database queries with indexes and pagination. Do not cache sensitive tenant data across users. Add tests for report totals and export authorization.
>
> Stop for review.

**Acceptance gate:** Dashboard and reports are accurate, performant and role-scoped.

## STEP 17 — CareOS Assist AI and knowledge base

> Implement tenant-scoped knowledge articles and document ingestion metadata for manuals, FAQs, troubleshooting guides, installation guides, datasheets and procedures.
>
> Build a provider-independent AI gateway with configurable provider adapters, strict tenant-aware retrieval and deterministic fallback. AI must be optional; the platform must work if no AI provider is configured.
>
> Customer mode may explain FAQs, authenticated ticket status, warranty and quotations, offer approved troubleshooting, draft a request and escalate to a human. Internal mode may summarize tickets/complaints/technician reports, search knowledge, suggest troubleshooting and draft responses.
>
> Never expose internal notes, margins, secrets or another tenant's data to customer AI. Treat retrieved documents and user input as untrusted. Defend against prompt injection. Do not let AI approve warranty, payment, dispatch, ticket closure or other consequential actions. Require human approval.
>
> Evaluate free API tiers only after verifying current terms, quotas and data handling. Local Ollama is optional only if OCI resources support it. Do not make a paid API mandatory.
>
> Add tests for tenant isolation, prompt injection, permission boundaries, fallback mode and unavailable AI provider. Stop for review.

**Acceptance gate:** AI is optional, tenant-isolated and cannot perform unauthorized consequential actions.

## STEP 18 — API completeness, mobile readiness and performance

> Review all business modules for consistent API contracts, validation, pagination, filtering, error handling, authorization and OpenAPI documentation.
>
> Ensure the backend is suitable for a future native technician app without building that app in V1. Keep business logic out of React components and make API contracts reusable.
>
> Review performance for Hostinger managed Node.js constraints: stateless request handling, no long-running requests, no in-process worker loops, no inbound WebSocket dependency, environment-provided PORT, graceful shutdown and bounded memory use.
>
> Move long tasks to the OCI worker and use Supabase Realtime for browser updates. Add load/performance tests appropriate to the available test environment. Document Hostinger plan-specific capacity assumptions as unverified until checked in hPanel.
>
> Stop for review.

**Acceptance gate:** API is documented, mobile-ready and compatible with managed Hostinger runtime constraints.

## STEP 19 — Full security, isolation, reliability and regression testing

> Conduct a structured security and reliability review of the whole application.
>
> Test every exposed table's RLS and grants, tenant isolation, role boundaries, customer-account isolation, technician assignment restrictions, platform admin isolation, file storage authorization, signed URLs, webhook verification, invitation flows, rate limits, audit immutability and secret handling.
>
> Review SQL functions, SECURITY DEFINER usage, search_path, grants, API authentication, CORS (if any), CSRF considerations, input validation, output encoding, dependency vulnerabilities and sensitive logging.
>
> Test worker crash recovery, expired leases, idempotency, retry limits, dead-letter handling, duplicate webhooks and external service outages.
>
> Run unit, integration, RLS and Playwright E2E suites. Fix critical/high findings before deployment. Produce a risk register and evidence-based test report. Do not claim a security certification. Stop for review.

**Acceptance gate:** No unresolved critical/high security defects; test evidence and remaining risks documented.

## STEP 20 — Deployment preparation: Hostinger Dynamic Node.js + OCI Worker + Supabase

> Prepare production deployment artifacts and a step-by-step runbook for the approved architecture. Do not deploy, provision resources, apply production migrations or change DNS in this step.
>
> **Hostinger:** prepare the dynamic Node.js web application deployment. Prefer one same-origin Fastify server serving the built React/Vite app and `/api/v1`. Use the Hostinger-provided PORT. Include build/start scripts and document environment variables, health checks, logs, process restart behavior and rollback. Do not assume root access, Docker, Redis, custom ports, inbound WebSockets or persistent background workers. Verify exact plan and app/process limits in hPanel before finalizing.
>
> **OCI:** prepare a separate ARM64-compatible worker Dockerfile and Docker Compose configuration. Document an Always Free eligible VM deployment, secure SSH, minimal firewall, outbound-only worker networking where possible, secrets, service restart, logs, monitoring, updates and recovery. Do not create resources or incur charges. Clearly flag Always Free quota/availability and idle reclamation considerations.
>
> **Supabase:** use the existing Singapore project `https://vbckrirksziluvwqpamx.supabase.co` (project ref `vbckrirksziluvwqpamx`). Document its verified environment purpose, migrations, RLS verification, Auth URL settings, private storage buckets, Realtime policies, backup/restore and secret configuration. Do not create a replacement project or change its region. Do not apply hosted migrations until the owner approves the target environment and migration plan.
>
> **Domain:** document DNS and SSL steps for the owner's chosen domain. Preferred route is domain to Hostinger, with API under `/api/v1`; no separate API subdomain is required. Do not change DNS or MX/email records.
>
> Provide:
> - `deployment/hostinger/README.md`
> - `deployment/oci/README.md`
> - `deployment/docs/production-runbook.md`
> - `deployment/docs/rollback-runbook.md`
> - environment variable inventory (names and purpose only, no values)
> - preflight checklist
> - backup/restore checklist
> - deployment smoke-test checklist
>
> Distinguish verified platform capabilities from items that must be checked in the owner's hPanel/account. Do not represent an unverified plan feature as guaranteed. Stop for owner review and approval.

**Acceptance gate:** Deployment runbooks are complete; no production action has been taken.

## STEP 21 — Go-live readiness and handover

> Perform a final go-live readiness assessment using the approved deployment runbooks. Do not deploy or change DNS without explicit owner approval.
>
> Verify production configuration checklist, tenant provisioning process, platform admin security, first-tenant onboarding, backups, restore test evidence, monitoring, worker health, job queue visibility, error handling, incident process, support process, user documentation and rollback readiness.
>
> Prepare:
> - `docs/development/admin-guide.md`
> - `docs/development/operations-guide.md`
> - `docs/development/technician-guide.md`
> - `docs/development/customer-guide.md`
> - `docs/development/release-notes.md`
> - `deployment/docs/go-live-checklist.md`
> - `deployment/docs/handover.md`
>
> Provide a final matrix of features implemented, tests passed, known limitations, unresolved risks, owner approvals required and items deferred beyond V1. Do not mark the product production-ready if critical security, backup, recovery, payment or tenant-isolation requirements remain unverified.
>
> Stop and request explicit approval before any actual production deployment.

**Acceptance gate:** Owner receives a complete handover and an evidence-based go/no-go recommendation.

---

# 8. Required implementation discipline

For every step, Antigravity must finish with this report:

1. Summary of what was implemented.
2. Files created or changed.
3. Database migrations added and their purpose.
4. Commands executed.
5. Test/build/lint/type-check results.
6. Security and tenant-isolation considerations.
7. Known limitations or unresolved issues.
8. Manual verification instructions.
9. Whether the acceptance gate is met.
10. Exact next step recommended — but do not begin it automatically.

## Final architecture reminder

**Hostinger = dynamic CareOS web application and Fastify API.**  
**OCI = background worker only.**  
**Supabase = database, authentication, file storage and realtime.**

Do not revert to a static-only Hostinger frontend with the primary API hosted on OCI. Do not place persistent workers on Hostinger. Do not create cloud resources, change DNS, or incur charges without explicit owner approval.
