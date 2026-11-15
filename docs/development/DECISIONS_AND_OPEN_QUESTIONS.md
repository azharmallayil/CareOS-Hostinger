# CareOS — Decisions and Open Questions

**Version:** 1.0.0-draft  
**Status:** Active — Updated after each step  
**Last Updated:** 2026-11-14

---

## Part 1: Settled Decisions

These decisions are final. Do not reopen them without an ADR and team sign-off.

| # | Decision | Rationale | Recorded In |
|---|---|---|---|
| D-01 | Multi-tenant SaaS; RLS-enforced isolation | Core product model | SYSTEM_ARCHITECTURE.md |
| D-02 | Monorepo with pnpm workspaces | Consistent types, single CI pipeline | MODULE_BOUNDARIES.md |
| D-03 | React 18 / Vite for all portals | Fast builds, broad ecosystem | SYSTEM_ARCHITECTURE.md |
| D-04 | Fastify for the API server | High throughput, TypeScript-first | SYSTEM_ARCHITECTURE.md |
| D-05 | Supabase for Auth, Postgres, Storage, Realtime | Managed services, confirmed Singapore region | SYSTEM_ARCHITECTURE.md |
| D-06 | PostgreSQL Outbox Queue for background jobs | ACID transactions with business writes; no Redis in V1 | ADR-002, DATABASE_DESIGN.md |
| D-07 | Kysely as query builder | RLS-compatible, type-safe SQL | ADR-001 |
| D-08 | One React app, portal shells via route subtrees | Shared code, single build | ADR-003 |
| D-09 | Soft deletes for all operational data | Audit integrity, FK safety | ADR-004 |
| D-10 | httpOnly cookies for token storage | XSS protection | SECURITY_ARCHITECTURE.md |
| D-11 | Resend as default email provider | Modern API, clean SDK | ADR-005 |
| D-12 | Provider-neutral payment abstraction in V1 | Pluggable gateway; no real provider activated without approval | INTEGRATION_ARCHITECTURE.md |
| D-13 | Lucide Icons | Consistent stroke, tree-shakeable | DESIGN_SYSTEM.md |
| D-14 | Inter (LTR) + IBM Plex Sans Arabic (RTL) fonts | Legibility, self-hosted | DESIGN_SYSTEM.md |
| D-15 | Coverage determination runs in API layer, not DB trigger | Testability | SERVICE_LIFECYCLE_AND_STATUS_MODEL.md |
| D-16 | Ticket numbering via Postgres atomic sequence function | No gaps/duplicates under concurrency | DATABASE_DESIGN.md |
| D-17 | Explicit state transition endpoint (`POST /tickets/:id/status`) | Prevents accidental overwrites | API_CONVENTIONS.md |
| D-18 | Technician location is browser Geolocation, not stored persistently | Privacy; stated scope limitation | CAREOS_PRODUCT_SPECIFICATION.md |
| D-19 | No partial payments in v1 | Scope boundary | CAREOS_PRODUCT_SPECIFICATION.md |
| D-20 | No on-premise deployment in v1 | Scope boundary | CAREOS_PRODUCT_SPECIFICATION.md |
| D-21 | Dark mode deferred to v2 | Scope boundary; CSS tokens ready | DESIGN_SYSTEM.md |
| D-22 | Native mobile apps out of scope; responsive PWA only | Scope boundary; API is mobile-ready | CAREOS_PRODUCT_SPECIFICATION.md |
| D-23 | Audit log is append-only; enforced via RLS | Compliance + integrity | SECURITY_ARCHITECTURE.md |
| D-24 | Tailwind CSS with custom theme as design token source | Single source, CSS variables | DESIGN_SYSTEM.md |
| D-25 | WCAG 2.1 AA required on all portals | Accessibility + legal | DESIGN_SYSTEM.md |
| D-26 | OpenAPI spec auto-generated from Fastify schemas | Documentation accuracy | API_CONVENTIONS.md |
| D-27 | Hostinger Managed Node.js for Dynamic App | Fastify same-origin server on process.env.PORT | ADR-006, SYSTEM_ARCHITECTURE.md |
| D-28 | No platform-specific tenant names hard-coded | Multi-tenant purity | CAREOS_PRODUCT_SPECIFICATION.md |
| D-29 | One asset per ticket in V1; `asset_id` is a nullable FK on `tickets` | OQ-10 resolved 2026-11-14 | DATABASE_DESIGN.md |
| D-30 | No `ticket_assets` join table in V1; grouped/bulk campaigns deferred to V2 | OQ-10 resolved 2026-11-14 | DATABASE_DESIGN.md |
| D-31 | Platform-related tickets and complaints not tied to a physical asset may have `asset_id = NULL` | OQ-10 resolved 2026-11-14 | DATABASE_DESIGN.md |
| D-32 | Bulk service request upload is a V1 feature: one bulk batch → many individual tickets | Added 2026-11-14 | CAREOS_PRODUCT_SPECIFICATION.md, DATABASE_DESIGN.md |
| D-33 | Supabase Singapore (`ap-southeast-1`) confirmed project: `vbckrirksziluvwqpamx` | OQ-02 resolved 2026-11-15 | SYSTEM_ARCHITECTURE.md |
| D-34 | Free-service rules use a versioned, server-validated JSON schema stored in `free_service_rules` + `free_service_rule_versions` tables | OQ-09 resolved 2026-11-14 | DATABASE_DESIGN.md |
| D-35 | Coverage engine evaluates free-service eligibility as a distinct phase, returning an eligibility decision + explanation + approval requirement | OQ-09 resolved 2026-11-14 | SERVICE_LIFECYCLE_AND_STATUS_MODEL.md |
| D-36 | Free-service decisions that require human approval are held in `pending_review` coverage state until an authorised approver acts | OQ-09 resolved 2026-11-14 | SERVICE_LIFECYCLE_AND_STATUS_MODEL.md |
| D-37 | Fastify serves built React/Vite SPA and `/api/v1` routes same-origin on Hostinger | Zero CORS, no separate API subdomain | ADR-006 |
| D-38 | OCI Always Free ARM64 compute hosts the background worker only | Outbound-only connectivity to Supabase | ADR-007 |
| D-39 | No Redis, Kafka, or Kubernetes in V1 | Kept lean, reliable, zero unnecessary infrastructure cost | ADR-008 |

---

## Part 2: Open Questions

Questions that need resolution before or during the implementation step noted.

### OQ-01 — Payment Gateway for GCC Region

**Question:** Is Stripe sufficient for all target markets, or is a GCC-regional gateway (Tap Payments, PayTabs) required as the **primary** gateway from day one?

**Impact:** Affects payment connector default selection, Stripe account setup, and test card environments.

**Needs Answer By:** Step 8 begins

**Options:**
- A. Stripe only (simplest; widely accepted)
- B. Tap Payments only (GCC-first)
- C. Both from day one (higher implementation cost)
- D. Stripe default; regional override per tenant

**Recommendation:** Option D — allows platform launch with Stripe while enabling individual tenants in GCC to configure Tap Payments.

---

### OQ-02 — Supabase Hosting Region

**Status: ✅ RESOLVED 2026-11-15**

**Decision:** The Supabase project is already provisioned in Singapore (`ap-southeast-1`). Region is confirmed by the owner.

**Project URL:** `https://vbckrirksziluvwqpamx.supabase.co`  
**Project Reference:** `vbckrirksziluvwqpamx`  
**Publishable (anon) key:** Placed in `.env` locally. Never committed to repository.  
**Service role key:** Server-side only (Hostinger and OCI env vars). Never committed or exposed to browser.

---

### OQ-03 — Multi-Language Support Scope

**Question:** Beyond Arabic and English, are other languages required at launch?

**Impact:** Affects i18n tooling choice, translation workflow, and QA scope.

**Needs Answer By:** Step 2 (i18n library configuration)

**Current assumption:** Arabic (RTL) + English (LTR) only. All other languages deferred to v2. Clean localization foundation implemented; no claim of complete translations until verified.

---

### OQ-04 — Job Queue Architecture

**Status: ✅ RESOLVED 2026-11-15**

**Decision: No Redis in V1.**

CareOS uses a durable PostgreSQL-backed outbox pattern in Supabase. The API writes business records and outbox jobs in the same atomic database transaction. The OCI background worker claims eligible jobs atomically using row-level leases (`SKIP LOCKED`). This avoids external message broker infrastructure, avoids additional paid services, and guarantees transactional integrity. Redis/Kafka may be evaluated in future phases if throughput warrants it.

**Needs Answer By:** Step 2 (Docker Compose production config)

**Recommendation:** Upstash for simplicity if traffic is predictable; self-managed Docker Redis if cost is a priority at launch scale.

---

### OQ-05 — ERP Integration Target for v1

**Question:** Which specific ERP system(s) must integrate at v1 launch? Or is the generic REST adapter sufficient for initial launch?

**Impact:** Affects Step 13 scope significantly. A specific ERP (e.g., NetSuite) requires a custom adapter and coordination with the ERP vendor's API team.

**Needs Answer By:** Step 13 begins

**Current assumption:** Generic REST adapter built in v1; specific ERP adapters built only when a tenant requires them.

---

### OQ-06 — Tenant Onboarding Flow

**Question:** Is tenant self-registration (a prospect signing up for a trial via a public landing page) in scope for v1, or are all tenants created manually by platform admins?

**Impact:** Affects Step 15 (Platform Admin) scope and potentially adds a public signup flow to Step 4.

**Current assumption:** Tenants are created manually by Platform Admin in v1. Self-service onboarding is v2.

**Needs Answer By:** Step 4

---

### OQ-07 — Technician Rating System Detail

**Question:** Is the technician rating a simple 1–5 star rating submitted by the customer post-resolution, or does it include a structured feedback form (categories: punctuality, communication, quality of work)?

**Impact:** Affects DB schema (the `avg_rating` on `technicians` and rating storage) and Customer Portal UI in Step 11.

**Needs Answer By:** Step 11 begins

**Recommendation:** Simple 1–5 star rating with optional free-text comment for v1. Category breakdown in v2.

---

### OQ-08 — SIM Card Management Scope

**Question:** How deep does SIM card management go in v1? Is it limited to inventory tracking (ICCID, carrier, status), or does it include active carrier API integration (data usage, top-up, suspension via carrier API)?

**Impact:** Could expand Step 7 scope significantly if carrier API integration is required.

**Current assumption:** Inventory tracking only in v1. Carrier API integration is v2.

**Needs Answer By:** Step 7

---

### OQ-09 — Free Service Rule Configuration

**Status: ✅ RESOLVED 2026-11-14**

**Decision:** Free-service rules are a first-class, tenant-configurable entity stored in dedicated database tables (`free_service_rules` + `free_service_rule_versions`), not in the tenant settings JSONB blob. Rules use a versioned, server-validated JSON schema. The coverage engine evaluates free-service eligibility as a distinct phase and may require authorised human approval before the ticket proceeds.

**Rule schema supports:**
- Rule name, description, enabled/disabled status, and priority order
- Eligible customer account IDs or account types
- Eligible asset categories and device categories
- Eligible service categories
- Effective start and expiry dates
- Maximum free-service visits per asset per period (day / month / quarter / year)
- Labour coverage flag
- Spare-parts coverage flag
- Travel-charge coverage flag
- Mandatory approval flag and permitted approver role / specific user ID
- Exclusion conditions (e.g., "not applicable if prior complaint within 30 days")
- Full create/modify/approve audit history via `free_service_rule_versions`

**Coverage engine contract:** Returns `{ eligible: boolean, ruleId, explanation, requiresApproval, approverRole }`. When `requiresApproval = true`, the ticket `coverage_type` is set to `pending_review` until an authorised user approves.

**No frontend-only eligibility checks.** All eligibility is computed server-side.

See `DATABASE_DESIGN.md` for table schemas and `SERVICE_LIFECYCLE_AND_STATUS_MODEL.md` for the updated coverage determination logic.

---

### OQ-10 — Multi-Asset Ticket Handling

**Status: ✅ RESOLVED 2026-11-14**

**Decision: One asset per ticket in V1.**

1. Each asset-related ticket references a single `asset_id` (nullable FK on `tickets`).
2. No `ticket_assets` join table in V1.
3. Platform-related tickets and complaints not tied to a physical asset may have `asset_id = NULL`.
4. Warranty eligibility, free-service eligibility, contract coverage, quotations, and service history are all evaluated against the individual asset.
5. Multiple assets requiring service submit separate tickets.
6. The "multi-asset flag" referenced in the original product spec is removed — it was an ambiguous note, not a requirement.
7. Grouped service requests and bulk service campaigns are preserved as a V2 path via the `bulk_service_requests` feature introduced in V1 (which creates individual tickets per asset, not a single combined ticket).
8. Do not create a multi-asset ticket by combining several assets into one asset record.

**New V1 feature added:** Bulk service request upload — a single API call or CSV upload creates one ticket per asset. See `CAREOS_PRODUCT_SPECIFICATION.md` and `DATABASE_DESIGN.md`.

---

## Part 3: Resolved During Architecture Pass

These started as open questions and were resolved within this document set.

| # | Question | Resolution |
|---|---|---|
| R-01 | Should tenant identity be hard-coded? | No — tenant identity is entirely data-driven. No hard-coded tenant names anywhere. |
| R-02 | Where does coverage determination run? | API service layer (not DB trigger), for testability. See D-15. |
| R-03 | How are reference numbers generated safely under concurrency? | Postgres atomic sequence function. See D-16. |
| R-04 | How is technician location used? | Browser Geolocation API, point-in-time only, not stored. See D-18. |
| R-05 | Are audit logs editable by any role? | No — RLS enforces append-only. See D-23. |
| R-06 | Multi-asset per ticket? | No — one asset per ticket in V1. Resolved as OQ-10 on 2026-11-14. |
| R-07 | Supabase project region? | Existing project used. Resolved as OQ-02 on 2026-11-14. |
| R-08 | Free-service rule schema? | Dedicated versioned DB tables + server-side validation. Resolved as OQ-09 on 2026-11-14. |
