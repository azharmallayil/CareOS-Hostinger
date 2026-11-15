# CareOS — Module Boundaries

**Version:** 1.0.0-draft  
**Status:** Approved for Implementation  
**Last Updated:** 2026-11-14

---

## 1. Dependency Rule

> **Dependencies always point inward.** No package may import from an application. Applications may import from packages. Packages may not import from other packages unless explicitly listed below.

```
apps/* → packages/*      ✅ Allowed
packages/* → apps/*      ❌ Forbidden
apps/web → apps/api      ❌ Forbidden (web calls API over HTTP only)
apps/api → apps/worker   ❌ Forbidden (api enqueues; worker consumes)
```

---

## 2. Package Responsibilities

### `packages/shared-types`

**Owns:** All TypeScript interfaces, enums, and DTO types that are shared across applications.

**Exports:**
- Domain entity interfaces (`Ticket`, `WorkOrder`, `Customer`, `Asset`, etc.)
- Enum definitions (`TicketStatus`, `WorkOrderStatus`, `CoverageType`, `UserRole`, etc.)
- API request/response DTOs
- Zod schemas for runtime validation (re-exported from here for consistent use)

**Must NOT contain:**
- Any runtime logic
- Database query code
- HTTP client code

**Allowed imports:** None (zero dependencies on other CareOS packages)

---

### `packages/shared-utils`

**Owns:** Pure utility functions with no I/O or external dependencies.

**Exports:**
- Date/time formatting and timezone helpers
- Currency formatting
- Phone number normalisation
- Slug generation
- Pagination helpers
- String sanitisation utilities

**Allowed imports:** `shared-types` (for type annotations only)

---

### `packages/supabase-client`

**Owns:** Configured Supabase client factory.

**Exports:**
- `createServerClient(options)` — for use in Fastify API (service role key)
- `createBrowserClient(options)` — for use in React (anon key + JWT)
- Type-safe table definitions for Kysely

**Allowed imports:** `shared-types`

---

### `packages/coverage-engine`

**Owns:** The coverage determination logic (warranty / contract / free / paid decision tree).

**Exports:**
- `determineCoverage(params: CoverageCheckParams): CoverageResult`
- Supporting types

**Design:** Pure function — takes in coverage data as plain objects, returns a result. No I/O. The API service layer is responsible for fetching data and calling this function.

**Allowed imports:** `shared-types`, `shared-utils`

---

### `packages/numbering`

**Owns:** Reference number generation logic and formatting.

**Exports:**
- `formatTicketNumber(prefix, year, month, seq): string`
- `formatWorkOrderNumber(...)`, `formatQuotationNumber(...)` etc.
- Validation functions for reference number format

**Design:** Pure formatting functions. Number sequence allocation is done via a Postgres function; this package only formats the components into the final string.

**Allowed imports:** `shared-types`

---

### `packages/permissions`

**Owns:** The authoritative role-permission matrix for CareOS.

**Exports:**
- `can(role: UserRole, action: PermissionAction, context?: PermissionContext): boolean`
- `PERMISSION_MATRIX` — static record of all role→action grants
- `PermissionAction` enum
- Ticket transition guards: `canTransition(role, fromState, toState): boolean`

**Design:** Pure functions and static data. This is the **single source of truth** for permissions — both the API middleware and the UI use this package to gate access.

**Allowed imports:** `shared-types`

---

### `packages/ui`

**Owns:** Reusable design system components (Radix UI primitives + Tailwind CVA styling).

**Exports:**
- `cn(...)` — Tailwind merge utility
- Design system primitives (Button, Badge, StatusBadge, Card, Table, Form, etc.) — added in Step 5

**Must NOT:**
- Contain business logic, permission checks, or data-fetching code
- Import from `apps/*`

**Allowed imports:** `shared-types` (for enum → display label utilities)

---

### `packages/core-domain`

**Owns:** Pure domain logic and business rules (no DB, no HTTP).

**Exports:**
- Domain aggregates and factory functions
- Coverage evaluation orchestration (wraps `coverage-engine`)
- SLA computation utilities
- Bulk service request orchestration rules

**Allowed imports:** `shared-types`, `shared-utils`, `coverage-engine`, `numbering`

---

### `packages/database`

**Owns:** Kysely type definitions (auto-generated from migrations) and shared query helpers.

**Exports:**
- `Database` interface (Kysely-compatible schema types — generated in Step 3)
- `createKyselyClient(config)` factory
- Shared query helpers

**Must NOT:** Be imported by `apps/web`

**Allowed imports:** `shared-types`

---

### `packages/auth`

**Owns:** Server-side auth utilities (JWT verification, claim extraction, portal guards).

**Must NOT:** Be imported by `apps/web` (browser uses `supabase-client` for auth)

**Exports:**
- `CareOSJWTClaims` interface
- `verifySupabaseJWT(token, secret)` → `CareOSJWTClaims`
- Portal enum and portal guard utilities

**Allowed imports:** `shared-types`, `permissions`

---

### `packages/validation`

**Owns:** Zod schemas for all request/response DTOs — the single source of truth for DTO shapes.

**Exports:**
- Zod schemas for every API endpoint's request body and query params
- Shared schemas: pagination, UUID, phone, email

**Used by:** `apps/api` (server-side validation) and `apps/web` (client-side form validation)

**Allowed imports:** `shared-types`

---

### `packages/integration-contracts`

**Owns:** Typed interfaces for all external connectors — ERP, telematics, payment, SMS, email.

**Design:** The API never imports connectors directly. It depends on these interfaces, which connectors implement.

**Allowed imports:** `shared-types`

---

### `packages/configuration`

**Owns:** Environment variable Zod schemas and `parseEnv()` startup validation.

**Exports:**
- `parseApiEnv(process.env): ApiEnv` — exits process with clear error on missing vars
- `parseWorkerEnv(process.env): WorkerEnv`
- `ApiEnv`, `WorkerEnv`, `SharedEnv` types

**Must NOT:** Be imported by `apps/web` (frontend env handled by Vite's `import.meta.env`)

**Allowed imports:** None

---

## 3. Application Responsibilities

### `apps/web`

**Owns:** All browser-rendered UI for all four portals.

**Portal routes (URL-prefix based):**
- `/customer/*` → Customer Portal
- `/operations/*` → Operations Portal
- `/technician/*` → Technician Portal
- `/admin/*` → Platform Admin (separately protected)

**Responsibilities:**
- Portal routing and shell layouts
- React components and pages
- Client-side form validation (using Zod schemas from `packages/validation`)
- API communication (via React Query + typed fetch client)
- Supabase Realtime subscriptions (read-only event reception)
- Auth session management (Supabase browser client, httpOnly cookie)
- Offline queue (IndexedDB) for Technician Portal

**Must NOT:**
- Contain business logic (coverage determination, numbering, permission enforcement at data level)
- Call Supabase directly for mutations (all mutations go through Fastify API)
- Read database directly (Supabase browser client used only for auth + realtime subscriptions)

**Allowed imports:** `shared-types`, `shared-utils`, `permissions` (UI gating only), `supabase-client` (browser variant), `ui`, `validation`

---

### `apps/api`

**Owns:** All server-side request handling, business logic orchestration, same-origin static frontend serving, and data access.

**Responsibilities:**
- Fastify server configuration and plugin registration
- In production on Hostinger: serves the built React/Vite SPA (`apps/web/dist`) and provides SPA routing fallback
- Reads assigned `process.env.PORT` from Hostinger managed Node.js environment
- Route definitions and handler functions under `/api/v1/*` and `/api/health`
- Auth middleware (JWT verification, claim extraction)
- Tenant guard (enforces `tenant_id` from JWT)
- Permission enforcement (uses `packages/permissions`)
- Business logic orchestration (calls service functions)
- Supabase Postgres queries (via Kysely + Supabase admin client)
- PostgreSQL outbox job insertion (atomic with business transaction in `job_queue` table)
- Coverage determination (calls `packages/coverage-engine`)
- Ticket number generation (calls DB function + `packages/numbering`)

**Must NOT:**
- Directly manage long-running background tasks or recurring schedules (worker's responsibility)
- Run persistent background loops or depend on inbound WebSockets on Hostinger

**Allowed imports:** `shared-types`, `shared-utils`, `permissions`, `coverage-engine`, `numbering`, `supabase-client` (server variant), `auth`, `validation`, `database`, `configuration`, `integration-contracts`

---

### `apps/worker`

**Owns:** All background and scheduled job execution. Deployed to OCI Always Free ARM64 compute.

**Responsibilities:**
- PostgreSQL outbox queue poller (atomic lease lock via `status='processing'` and `lease_expires_at`)
- SLA breach detection (periodic check)
- Notification dispatch (via `connectors/sms`, `connectors/email`)
- ERP sync jobs (via `connectors/erp`)
- Telematics event processing (via `connectors/telematics`)
- Report generation (periodic aggregations written back to DB)
- Bulk service request item processing (creates 1 ticket per asset, isolated)
- Crash recovery (reclaims expired leases)
- Outbound-only connectivity to Supabase Cloud Singapore and external APIs (no inbound ports)

**Must NOT:**
- Accept inbound HTTP requests (no HTTP server)
- Perform business logic that belongs in the API layer
- Depend on Redis, Kafka, or external queue brokers in V1

**Allowed imports:** `shared-types`, `shared-utils`, `coverage-engine`, `numbering`, `supabase-client` (server variant), `validation`, `database`, `configuration`, `integration-contracts`

---

## 4. Connector Responsibilities

Connectors are pnpm workspace packages under `connectors/`. They implement the interfaces defined in `packages/integration-contracts`.

### `connectors/sms`

- Implements `SMSConnector` interface from `integration-contracts`
- Implementations: console (dev), Twilio (production)
- Provider selected by `SMS_PROVIDER` env var

### `connectors/email`

- Implements `EmailConnector` interface from `integration-contracts`
- Implementations: console (dev), Resend (production)
- Template rendering delegated to caller

### `connectors/payment`

- Implements `PaymentConnector` interface from `integration-contracts`
- Implementations: none/stub (dev), Stripe (production when configured)
- **Disabled by default** until provider is configured and owner approves
- Webhook handler exports mounted in Fastify route

### `connectors/erp`

- Implements `ERPConnector` interface from `integration-contracts`
- V1 scope: generic REST only (no ERP-specific adapters in V1)
- Tenant-specific configuration loaded at runtime

### `connectors/telematics`

- Implements `TelematicsConnector` interface from `integration-contracts`
- Generic signed-webhook and generic REST connectors only in V1
- Normalized events only: device online/offline, last seen, camera/MDVR fault, DMS/ADAS/IVMS/PIWAS alerts
- **Does NOT** ingest raw high-frequency GPS pings (CareOS is not the raw tracking platform)

---

## 5. Supabase Directory Responsibilities

### `supabase/migrations/`

- Ordered SQL migration files (`001_initial_schema.sql`, `002_rls_policies.sql`, etc.)
- Applied by Supabase CLI (`supabase db push`)
- Never edited after being applied; always add new migration files

### `supabase/seed/`

- Development-only seed data
- Creates demo tenants, users, and sample operational data
- Never runs in production

### `supabase/functions/`

- Supabase Edge Functions (Deno runtime) for any Supabase-native triggers that cannot be DB-only
- Use sparingly; prefer API server for logic

---

## 6. Test Boundaries

### `tests/unit/`

- Tests for packages: `coverage-engine`, `numbering`, `permissions`, `shared-utils`
- Pure function tests, no I/O, no Supabase connections
- Run with `vitest`

### `tests/integration/`

- Tests for `apps/api` route handlers
- Uses Supertest + a local Supabase test instance
- Covers auth flows, permission enforcement, and state transition rules

### `tests/e2e/`

- Playwright tests for complete user flows across all portals
- Runs against a fully assembled local stack (via Docker Compose)
- Covers the most critical happy paths + key error scenarios

---

## 7. Import Validation

A custom ESLint rule (`no-cross-boundary-import`) will be configured to enforce the allowed import graph at lint time. Violations in `apps/web` importing from `apps/api` are build errors, not warnings.
