# CareOS — User Roles and Portals

**Version:** 1.0.0-draft  
**Status:** Approved for Implementation  
**Last Updated:** 2026-11-14

---

## 1. Portal Overview

CareOS exposes four distinct entry points. Each has its own URL path, authentication flow, and role scope.

```
┌─────────────────────────────────────────────────────────────────┐
│                        CareOS Platform                          │
│                                                                 │
│  /{tenant-slug}/customer   →  Customer Portal (B2C + B2B)      │
│  /{tenant-slug}/ops        →  Operations Portal                 │
│  /{tenant-slug}/tech       →  Technician Portal                 │
│  /admin                    →  Platform Admin (CareOS staff only)│
└─────────────────────────────────────────────────────────────────┘
```

Each portal is a distinct React application shell, sharing a common design system but with separate routing trees, navigation structures, and permission guards.

---

## 2. Role Catalogue

### 2.1 Platform-Level Roles

| Role | Portal | Description |
|---|---|---|
| `platform_admin` | Platform Admin | CareOS staff; full system access across all tenants |
| `platform_support` | Platform Admin | Read-only cross-tenant visibility for support tickets |

Platform roles are **never** associated with a `tenant_id`. They are granted at the user level in the `platform_users` table (completely separate from tenant users).

### 2.2 Tenant-Level Roles (Operations Portal)

| Role | Description | Key Permissions |
|---|---|---|
| `tenant_admin` | Full control within the tenant | All settings, all data, user management |
| `tenant_manager` | Operational manager | All ops data; cannot change billing or integrations |
| `dispatcher` | Schedules and assigns work | Read all tickets/WOs; assign technicians; cannot edit customer data |
| `csr` | Customer Service Rep | Create/update tickets; create customers; view but not assign WOs |
| `billing_agent` | Finance / billing staff | Quotations, invoices, payment records; no operational data edits |
| `readonly_ops` | Auditor / observer | Read-only across all operational data |

### 2.3 Customer-Facing Roles (Customer Portal)

| Role | Description | Key Permissions |
|---|---|---|
| `customer_individual` | B2C end user | Own tickets, assets, payments only |
| `customer_account_admin` | B2B company account admin | All tickets/assets across the company account |
| `customer_account_member` | B2B company account member | Only tickets/assets assigned to their site or created by them |

### 2.4 Technician Role (Technician Portal)

| Role | Description | Key Permissions |
|---|---|---|
| `technician` | Field technician | Assigned work orders, evidence, status updates |
| `senior_technician` | Senior / lead tech | Same as `technician` + can re-assign WO to another technician |

---

## 3. Portal Detail: Customer Portal

### 3.1 Audience
- Individual customers (B2C)
- Company account admins and members (B2B)

### 3.2 Authentication
- Email + password registration with email verification
- OTP via SMS as optional second factor
- Magic link (passwordless) supported
- OAuth: Google login (optional, tenant-configurable)
- Supabase Auth handles session management; JWTs carry `customer_account_id` and `tenant_id`

### 3.3 Capabilities by Role

| Capability | `customer_individual` | `customer_account_admin` | `customer_account_member` |
|---|---|---|---|
| Submit service request | ✅ | ✅ | ✅ (own site) |
| View own tickets | ✅ | ✅ All | ✅ Own only |
| Track technician (ETA) | ✅ | ✅ | ✅ |
| View/approve quotation | ✅ | ✅ | ✅ (own) |
| Make payment | ✅ | ✅ | ✅ (own) |
| View assets | ✅ Own | ✅ All | ✅ Own site |
| Register new asset | ✅ | ✅ | ❌ |
| Manage account users | ❌ | ✅ | ❌ |
| View invoices | ✅ | ✅ | ✅ (own) |
| Submit complaint | ✅ | ✅ | ✅ |
| Rate resolved ticket | ✅ | ✅ | ✅ |

### 3.4 Tenant Branding
The Customer Portal renders the tenant's configured logo, primary/accent colors, and support contact details. The URL slug is tenant-specific.

---

## 4. Portal Detail: Operations Portal

### 4.1 Audience
Tenant's internal staff: admins, dispatchers, CSRs, billing, managers.

### 4.2 Authentication
- Email + password
- 2FA mandatory for `tenant_admin` and `tenant_manager`
- 2FA optional-but-recommended for all other ops roles
- Session idle timeout: 30 minutes (configurable per tenant, minimum 15)

### 4.3 Capabilities by Role

| Capability | `tenant_admin` | `tenant_manager` | `dispatcher` | `csr` | `billing_agent` | `readonly_ops` |
|---|---|---|---|---|---|---|
| Tenant settings / branding | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| User management | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Integration config | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create customer | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Create ticket | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Assign technician | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit ticket status | ✅ | ✅ | ✅ | ✅ (limited) | ❌ | ❌ |
| Create/send quotation | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Record payment | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| View all reports | ✅ | ✅ | Dispatch only | Customer only | Finance only | ✅ |
| Manage contracts | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Escalate complaint | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |

### 4.4 CSR Ticket Status Limitations
CSRs can move tickets to: `open`, `awaiting_customer`, `cancelled`. They **cannot** directly set `in_progress`, `resolved`, or `closed` — these transitions are owned by the dispatcher/technician flow.

---

## 5. Portal Detail: Technician Portal

### 5.1 Audience
Field technicians using mobile browsers (iOS Safari, Android Chrome).

### 5.2 Authentication
- Email + password (issued by tenant admin)
- Persistent session with token refresh (8-hour sliding window)
- Biometric authentication delegated to device (if WebAuthn supported)

### 5.3 Capabilities

| Capability | `technician` | `senior_technician` |
|---|---|---|
| View assigned work orders | ✅ | ✅ |
| Update work order status | ✅ | ✅ |
| Upload photo evidence | ✅ | ✅ |
| Capture customer signature | ✅ | ✅ |
| Submit parts/labour used | ✅ | ✅ |
| Collect cash/card payment | ✅ | ✅ |
| Re-assign WO to colleague | ❌ | ✅ |
| View other technicians' WOs | ❌ | ✅ (read-only) |
| Access customer full history | ❌ | ✅ |

### 5.4 Offline Considerations
The Technician Portal must degrade gracefully on poor connectivity. Status updates and evidence uploads are queued locally (IndexedDB) and synced when connectivity is restored. The API accepts idempotent status transitions with a client-generated `idempotency_key`.

---

## 6. Platform Admin Area

### 6.1 Audience
CareOS operations team only. This is **not** a tenant-facing portal.

### 6.2 Authentication
- Email + password
- Hardware security key (FIDO2/WebAuthn) mandatory
- IP allowlist enforced at reverse-proxy level

### 6.3 Capabilities

| Capability | `platform_admin` | `platform_support` |
|---|---|---|
| Create / suspend / delete tenant | ✅ | ❌ |
| View tenant config | ✅ | ✅ |
| Impersonate tenant admin | ✅ (audit-logged) | ❌ |
| View system metrics / health | ✅ | ✅ |
| Manage platform billing plans | ✅ | ❌ |
| View cross-tenant audit logs | ✅ | ✅ (read-only) |
| Trigger system migrations | ✅ | ❌ |

> **Important:** Impersonation events are immutable audit-log entries. The impersonated session always displays a banner indicating it is an impersonated session. The original `platform_admin` user ID is recorded on every action taken during impersonation.

---

## 7. Role Enforcement Architecture

```
Browser Request
    │
    ▼
Supabase Auth (JWT issued)
    │  JWT contains: sub, tenant_id, role, portal
    ▼
Fastify API Middleware
    ├── verifyJWT()          — signature + expiry
    ├── extractClaims()      — tenant_id, role, portal
    ├── tenantGuard()        — req.tenantId must match JWT claim
    └── permissionCheck()    — role-action matrix lookup
         │
         ▼
      Route Handler → Supabase DB (RLS enforces tenant_id again)
```

Role enforcement is applied at **two independent layers**:
1. **API layer** — Fastify middleware checks role-permission matrix before reaching any handler
2. **Database layer** — Supabase RLS policies enforce `tenant_id` match and role-scoped read/write policies on every table

If either layer denies access, the request fails. This provides defense in depth.

---

## 8. Session and Token Model

| Property | Value |
|---|---|
| Token type | Supabase JWT (RS256) |
| Access token TTL | 1 hour |
| Refresh token TTL | 7 days (sliding) |
| Storage | `httpOnly` cookie (not `localStorage`) |
| Cookie flags | `Secure`, `SameSite=Strict` |
| Token refresh | Silent, via `/auth/refresh` endpoint |
| Logout | Server-side token revocation + cookie clear |
