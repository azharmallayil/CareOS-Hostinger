# CareOS

> **Service Intelligence for Connected Fleets**  
> The Complete Multi-Tenant Service Operations SaaS Platform for Telematics and Connected-Fleet Service Providers.

---

## Architecture Overview

CareOS is built as a TypeScript monorepo using **pnpm workspaces**:

```
careos/
├── apps/
│   ├── web/                    # React 18 + Vite (Customer, Ops, Technician, Admin portals)
│   ├── api/                    # Fastify API (Hostinger managed Node.js same-origin server on process.env.PORT)
│   └── worker/                 # PostgreSQL outbox background processor (OCI Always Free ARM64)
│
├── packages/
│   ├── shared-types/           # TypeScript domain entities, DTOs, and enums
│   ├── shared-utils/           # Pure utilities (dates, currency, formatting, pagination)
│   ├── supabase-client/        # Browser and server Supabase client factories
│   ├── coverage-engine/        # Pure function warranty, contract, and free-service decision engine
│   ├── numbering/              # Atomic reference number formatters (ACE-TKT-YYYYMM-XXXXX)
│   ├── permissions/            # Authoritative role-permission matrix and state machine transition guards
│   ├── ui/                     # Design system primitives (Radix UI + Tailwind CVA)
│   ├── core-domain/            # Pure domain aggregates and business rules
│   ├── database/               # Kysely schema types and database query helpers
│   ├── auth/                   # Server-side JWT validation and claim extraction
│   ├── validation/             # Shared Zod schemas for API and frontend forms
│   ├── integration-contracts/  # Typed contracts for external connectors
│   └── configuration/          # Environment variable validation with Zod (parseEnv)
│
├── connectors/
│   ├── sms/                    # SMS provider abstraction (Console, Twilio)
│   ├── email/                  # Email provider abstraction (Console, Resend)
│   ├── payment/                # Payment gateway abstraction (Provider-neutral, Stripe)
│   ├── erp/                    # Generic REST ERP connector
│   └── telematics/             # Generic webhook & REST normalized telematics connector
│
├── supabase/                   # Migrations, seed data, SQL tests, and local configuration
├── deployment/                 # Deployment runbooks (Hostinger, OCI, Supabase)
├── docker/                     # Docker Compose development and OCI deployment infrastructure
├── docs/                       # Complete product and architecture specifications
└── tests/                      # Unit, API integration, and Playwright E2E suites
```

### Hosting Split (Approved Direction)

- **Hostinger Managed Node.js:** Hosts the dynamic same-origin application on `process.env.PORT`. Fastify serves both the built React/Vite frontend and `/api/v1/*` routes.
- **OCI Always Free ARM64 Compute:** Hosts the background worker container only (Docker Compose, outbound-only connectivity).
- **Supabase Cloud (Singapore):** Managed PostgreSQL (with `job_queue` outbox table), Supabase Auth, private Storage buckets, and Realtime WebSocket subscriptions.
- **No Redis in V1:** Asynchronous jobs use an atomic PostgreSQL outbox pattern (`job_queue` table with row-level lease locks).

---

## Prerequisites

- **Node.js**: >= 20.0.0 LTS
- **pnpm**: >= 9.0.0 (`npm install -g pnpm@9`)
- **Supabase CLI**: (`brew install supabase/tap/supabase` or `npm install -g supabase`)
- **Docker**: (Optional) for local container testing and OCI image builds

---

## Local Development Setup

### 1. Clone & Install Dependencies

```bash
cd CareOS
pnpm install
```

### 2. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Configure your environment variables in `.env` (using the owner-provided Supabase project `https://vbckrirksziluvwqpamx.supabase.co`).

### 3. Run Development Servers

Run all workspace applications in parallel:

```bash
pnpm dev
```

Or run individual applications:

- **Web (Portals)**: `pnpm --filter @careos/web dev` (http://localhost:5173, proxies `/api` to Fastify)
- **API Server**: `pnpm --filter @careos/api dev` (http://localhost:3000)
- **Worker**: `pnpm --filter @careos/worker dev`
- **Storybook**: `pnpm --filter @careos/web storybook` (http://localhost:6006)

---

## Portal URL Structure

Each portal is accessible under its respective route:

- **Customer Portal**: `/customer`
- **Operations Portal**: `/operations`
- **Technician Portal**: `/technician`
- **Platform Admin Area**: `/admin` (separately protected)

---

## Quality & Testing Commands

```bash
# Lint code with cross-boundary import enforcement
pnpm lint

# Format code with Prettier
pnpm format
pnpm format:check

# TypeScript type checking across all workspaces
pnpm type-check

# Run unit and integration tests with Vitest
pnpm test

# Run tests with code coverage
pnpm test:coverage

# Run Playwright E2E tests
pnpm test:e2e

# Build all packages and applications
pnpm build
```

---

## Documentation Index

All architectural guidelines and requirements live in `docs/`:

- [Product Specification](file:///Users/azhar/My%20Projects/CareOS/docs/product/CAREOS_PRODUCT_SPECIFICATION.md)
- [User Roles & Portals](file:///Users/azhar/My%20Projects/CareOS/docs/product/USER_ROLES_AND_PORTALS.md)
- [Service Lifecycle & Status Model](file:///Users/azhar/My%20Projects/CareOS/docs/product/SERVICE_LIFECYCLE_AND_STATUS_MODEL.md)
- [System Architecture](file:///Users/azhar/My%20Projects/CareOS/docs/architecture/SYSTEM_ARCHITECTURE.md)
- [Module Boundaries](file:///Users/azhar/My%20Projects/CareOS/docs/architecture/MODULE_BOUNDARIES.md)
- [Domain Model](file:///Users/azhar/My%20Projects/CareOS/docs/architecture/DOMAIN_MODEL.md)
- [API Conventions](file:///Users/azhar/My%20Projects/CareOS/docs/architecture/API_CONVENTIONS.md)
- [Integration Architecture](file:///Users/azhar/My%20Projects/CareOS/docs/architecture/INTEGRATION_ARCHITECTURE.md)
- [Database Design](file:///Users/azhar/My%20Projects/CareOS/docs/database/DATABASE_DESIGN.md)
- [Security Architecture](file:///Users/azhar/My%20Projects/CareOS/docs/security/SECURITY_ARCHITECTURE.md)
- [Design System](file:///Users/azhar/My%20Projects/CareOS/docs/design/DESIGN_SYSTEM.md)
- [Development Roadmap](file:///Users/azhar/My%20Projects/CareOS/docs/development/DEVELOPMENT_ROADMAP.md)
- [Decisions & Open Questions](file:///Users/azhar/My%20Projects/CareOS/docs/development/DECISIONS_AND_OPEN_QUESTIONS.md)
