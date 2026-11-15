# CareOS — Product Specification

**Version:** 1.0.0-draft  
**Status:** Approved for Implementation  
**Last Updated:** 2026-11-14

---

## 1. Product Overview

CareOS is a multi-tenant, cloud-native **Field Service Management (FSM) SaaS platform** for **telematics and connected-fleet service providers**. It unifies customer-facing service request flows, internal technician dispatch and work-order management, fleet asset and device tracking, service coverage determination (warranty, free-service, contract, paid), billing and quotations, complaint management, and integration with ERP and telematics platforms — all within a single, role-aware product.

> **Positioning:** Service Intelligence for Connected Fleets.  
> CareOS is an independent multi-tenant SaaS. Any specific service provider (e.g. a telematics company) is a tenant — never a hard-coded identity.

### 1.1 Core Value Proposition

| Stakeholder | Problem Solved |
|---|---|
| **Service Company (Tenant)** | Replaces fragmented spreadsheets/calls with a unified operations platform |
| **End Customer** | Self-service request submission, real-time tracking, and transparent payment |
| **Technician** | Mobile-ready job queue, evidence capture, and simple status updates |
| **Platform Operator** | Multi-tenant SaaS management, billing, and system health observability |

### 1.2 Deployment Model

- **SaaS multi-tenant** — each service company is an isolated tenant
- **Web Application & API** — Hostinger managed Node.js application running a dynamic same-origin Fastify server that serves both the built React/Vite SPA and `/api/v1` routes on `https://<OWNER_DOMAIN>`. Reads port dynamically from `process.env.PORT`.
- **Background Worker** — OCI Always Free ARM64 compute running the background worker container only (outbound connections to Supabase, no inbound ports opened).
- **Data platform** — Supabase Cloud in Singapore (`ap-southeast-1`), project reference `vbckrirksziluvwqpamx` (Postgres, Auth, Storage, Realtime); local Supabase CLI for development.
- **Asynchronous Processing** — Durable PostgreSQL-backed job/outbox pattern in Supabase. No Redis, Kafka, or RabbitMQ in V1.
- **No on-premise option** in V1
- **Monorepo** — all components live in one repository; independently deployable
- **Production deployment, hosted migrations, and DNS changes require explicit owner approval**

---

## 2. Bounded Context and Scope

### In Scope (v1)

- Multi-tenant onboarding and configuration
- Three customer-facing portals (B2C, B2B individual accounts, B2B company accounts)
- Ticket (service request) lifecycle management
- Work-order dispatch and technician field operations
- Asset, device, and SIM card inventory
- Contract, warranty, and free-service determination
- Quotation, approval, and payment collection
- Complaint handling workflow
- Notification engine (email, SMS, in-app)
- ERP and communication integrations
- Audit logging and evidence chain

### Out of Scope (v1)

- Inventory procurement / purchase orders
- Native mobile applications (responsive PWA only)
- AI-driven demand forecasting
- Multi-currency pricing beyond tenant's default currency
- Video-call support sessions

---

## 3. Tenant Model

```
Platform (CareOS)
  └── Tenant (Service Company)
        ├── Tenant Configuration (branding, numbering, settings)
        ├── Customer Accounts
        │     ├── Individual Customer
        │     └── Company Customer
        │           └── Company Sites
        ├── Assets / Devices / SIMs
        ├── Technicians
        ├── Contracts & Warranties
        └── Operations (Tickets → Work Orders → Payments)
```

- A **Tenant** maps to exactly one service company.  
- All operational data carries a `tenant_id` foreign key.  
- Tenants are created and managed exclusively via the Platform Admin area.  
- Tenants cannot see or access each other's data at any layer (API + RLS).

---

## 4. Portal Summary

| Portal | Audience | Auth | Key Capabilities |
|---|---|---|---|
| **Customer Portal** | End customers (B2C + B2B) | Email/password + OTP | Submit requests, track tickets, approve quotations, pay, view history |
| **Operations Portal** | Tenant staff (admins, dispatchers, CSRs) | Email/password + 2FA | Full ticket/WO management, dispatching, reporting |
| **Technician Portal** | Field technicians | Email/password (mobile-optimised) | View assigned jobs, update status, capture evidence, collect payment |
| **Platform Admin** | CareOS operators | Email/password + hardware 2FA | Tenant management, system health, billing oversight |

> See `USER_ROLES_AND_PORTALS.md` for detailed role matrix.

---

## 5. Service Request (Ticket) Lifecycle

A ticket represents a single customer complaint or service need. Full state machine is documented in `SERVICE_LIFECYCLE_AND_STATUS_MODEL.md`.

### 5.1 Ticket Entry Points

1. Customer self-service (Customer Portal)
2. CSR creates on behalf of customer (Operations Portal)
3. Bulk service request upload (Operations Portal / API — CSV upload or batch API that generates individual tickets per asset)
4. API integration from partner system

### 5.2 Coverage Determination

Upon ticket creation, the system evaluates service coverage via the coverage engine in priority order:

| Coverage Type | Trigger | Customer Pays? |
|---|---|---|
| **Active Warranty** | Asset under manufacturer/extended warranty | No (or partial) |
| **Active Contract** | Customer has an active service contract covering the asset category | Per contract terms |
| **Free Service** | Matches tenant configurable free-service rules (server-validated schema; may require approval) | No |
| **Paid** | None of the above | Yes — quote required |

Coverage is evaluated against the individual asset:
- Warranty eligibility, free-service eligibility, contract coverage, quotations, and service history are evaluated against the specific individual asset.
- If a free-service rule requires human approval (`requires_approval = true`), coverage is placed in `pending_review` until authorised approval is granted.
- Platform-related tickets and complaints not tied to a physical asset have `asset_id = NULL` and evaluate non-asset free-service rules or default to paid.
- Ambiguous cases (multiple matching active warranties/contracts) flag for CSR review.

### 5.3 Bulk Service Request Upload

For operations handling multiple assets requiring service simultaneously (e.g. commercial facility inspection, bulk appliance maintenance):
- CSRs/Admins can initiate a Bulk Service Request via CSV upload or batch API.
- The bulk upload service validates each row and generates **one independent ticket per asset**.
- Each generated ticket references a single `asset_id`, runs its own coverage determination, and follows the autonomous ticket lifecycle.
- Failures on individual items are isolated and reported with row-level error messages.

### 5.4 Quotation and Payment Flow

```
Diagnosis → Quotation Draft → Customer Approval → 
  ├── Approved → Work Proceeds → Invoice → Payment
  └── Rejected → Ticket Closed (no charge)
```

- Quotations require explicit customer approval before chargeable work begins.  
- Payments can be collected on-site (cash/card via technician) or online (Customer Portal).  
- Partial payments and installment plans are **out of scope** for v1.

---

## 6. Asset and Device Management

- An **Asset** is a logical record of a customer-owned appliance (make, model, serial, purchase date).
- A **Device** is a connected/smart component optionally attached to an asset (IoT/HVAC control board, etc.).
- A **SIM** card may be provisioned in a device for cellular connectivity.
- Assets belong to a customer account and optionally to a specific site.
- **Single Asset per Ticket (V1 Rule):**
  - Each asset-related ticket must reference a single `asset_id`.
  - The `tickets` table maintains a single-asset foreign key relationship. No `ticket_assets` join table is created in V1.
  - Multiple assets requiring service are handled via separate tickets (facilitated by the Bulk Service Request upload service).
  - Platform-related tickets and complaints not tied to a physical asset have `asset_id = NULL`.
  - Do not create a multi-asset ticket by combining several assets into one asset record.
  - The schema preserves the ability to introduce grouped service requests and bulk service campaigns in a future version (V2).

---

## 7. Technician Assignment

### 7.1 Ranking Inputs (in priority order)

1. **Skill match** — technician must have required skill codes for the asset category
2. **Availability** — no overlapping confirmed work orders on the target date/window
3. **Geographic proximity** — straight-line distance from technician's last known location to customer site (browser Geolocation API; location not stored persistently)
4. **Workload balance** — fewer open WOs preferred for equal candidates
5. **Customer preference** — if customer previously rated a technician 4★+, that technician is ranked higher

### 7.2 Browser-Location Limitation

Technician location is captured via the browser's `navigator.geolocation` API at dispatch time. This is a point-in-time reading — it is **not** a persistent GPS track. The system does not store a technician's location history. If the technician declines geolocation, the dispatcher falls back to their registered home-zone postcode.

---

## 8. Numbering and Reference Scheme

Each tenant configures their own numbering prefixes and starting sequences. The platform generates numbers transactionally (using Postgres sequences) to prevent gaps or duplicates under concurrent load.

| Entity | Format | Example |
|---|---|---|
| Ticket | `{PREFIX}-TKT-{YYYYMM}-{SEQ}` | `ACE-TKT-202601-00042` |
| Work Order | `{PREFIX}-WO-{YYYYMM}-{SEQ}` | `ACE-WO-202601-00017` |
| Quotation | `{PREFIX}-QT-{YYYYMM}-{SEQ}` | `ACE-QT-202601-00011` |
| Invoice | `{PREFIX}-INV-{YYYYMM}-{SEQ}` | `ACE-INV-202601-00008` |
| Complaint | `{PREFIX}-CMP-{YYYYMM}-{SEQ}` | `ACE-CMP-202601-00003` |

Sequences are per-tenant, per-month, per-entity-type. Sequences must never reset within a month even if the last record is deleted.

---

## 9. Complaint Handling

Complaints are a first-class entity, separate from tickets. They can be:
- Linked to an existing ticket or work order
- Standalone (e.g., billing dispute, general dissatisfaction)

Complaints have their own lifecycle: `open → under_review → resolved | escalated`. Escalated complaints trigger an alert to the tenant admin.

---

## 10. Notification Requirements

| Event | Channels | Recipient |
|---|---|---|
| Ticket created | Email + SMS | Customer |
| Technician assigned | Email + SMS | Customer |
| Technician en route | SMS | Customer |
| Quotation ready | Email + in-app | Customer |
| Payment received | Email | Customer |
| New job assigned | Push/in-app | Technician |
| SLA breach warning | In-app + email | Tenant admin |
| Complaint escalated | Email | Tenant admin |

Notification templates are per-tenant (branding, language). The platform provides defaults.

---

## 11. SLA Framework

Tenants configure SLA profiles per asset category and customer tier:
- **Response SLA** — time from ticket creation to first technician contact
- **Resolution SLA** — time from ticket creation to `resolved` status

SLA breaches generate automatic alerts. SLA tracking pauses when ticket is in `awaiting_customer` or `awaiting_parts` state.

---

## 12. Reporting and Analytics (v1 scope)

- Tenant-level operational dashboard (open tickets, overdue, by technician, by category)
- Customer satisfaction scores (post-resolution ratings)
- Technician performance (jobs completed, average rating, response time)
- Financial summary (quotations, collections, outstanding)
- All reports scoped to the authenticated tenant

---

## 13. Accessibility and Localisation

- WCAG 2.1 AA compliance required for all portals
- RTL layout support required (Arabic primary)
- LTR support (English)
- Tenant-configurable default language
- Date/time displayed in tenant's configured timezone
- Currency symbol configurable per tenant

---

## 14. Non-Functional Requirements

| NFR | Target |
|---|---|
| **Availability** | 99.5% monthly uptime |
| **API P95 latency** | ≤ 300 ms (read), ≤ 500 ms (write) |
| **Concurrent users** | 500 per tenant, 5,000 platform-wide (v1) |
| **Data retention** | 7 years (audit logs), 3 years (operational) |
| **GDPR/privacy** | PII encrypted at rest; right-to-erasure workflow |
| **Backup** | Daily encrypted backups, 30-day retention |
