# CareOS — Security Architecture

**Version:** 1.0.0-draft  
**Status:** Approved for Implementation  
**Last Updated:** 2026-11-14

---

## 1. Security Principles

1. **Defense in depth** — no single control is relied upon exclusively
2. **Least privilege** — every user and service role has only the access it needs
3. **Tenant isolation is non-negotiable** — data leakage between tenants is a critical failure
4. **Fail secure** — on ambiguous or failed checks, deny access
5. **Auditability** — every significant action is recorded in an immutable audit log
6. **No secrets in code** — all credentials in environment variables or secrets manager

---

## 2. Authentication

### 2.1 Supabase Auth

CareOS delegates all identity management to Supabase Auth:

| Mechanism | Used For |
|---|---|
| Email + password (bcrypt) | All portal users |
| Magic link (passwordless) | Customer Portal (optional) |
| OTP via SMS | Customer Portal 2FA |
| TOTP (authenticator app) | Ops portal 2FA |
| OAuth / Google | Customer Portal (tenant-configurable) |
| FIDO2/WebAuthn | Platform Admin (mandatory) |

### 2.2 Multi-Factor Authentication Policy

| Portal | 2FA Requirement |
|---|---|
| Customer Portal | Optional (OTP or magic link) |
| Operations Portal — `tenant_admin`, `tenant_manager` | **Mandatory** |
| Operations Portal — all other roles | Recommended; enforceable per tenant policy |
| Technician Portal | Optional |
| Platform Admin | **Mandatory — hardware key (FIDO2)** |

### 2.3 Session Management

```
Access Token:  JWT RS256, 1-hour TTL
Refresh Token: Opaque, 7-day sliding window
Storage:       httpOnly, Secure, SameSite=Strict cookie
Revocation:    Server-side via Supabase Auth session revocation
Idle timeout:  30 minutes (Ops portal); 8 hours (Technician portal)
```

Tokens are **never** stored in `localStorage` or `sessionStorage`.

---

## 3. Authorisation

### 3.1 Three-Layer Model

```
Layer 1: API Middleware (Fastify)
  → JWT signature + expiry check
  → Role-permission matrix check (packages/permissions)
  → Tenant boundary check

Layer 2: Database RLS (Supabase Postgres)
  → tenant_id match enforced by RLS policy
  → Role-scoped read/write policies per table

Layer 3: Application Logic
  → State machine guards (valid transitions only)
  → Business rule enforcement (coverage, SLA)
```

If **any** layer denies access, the request fails. Layers are independent.

### 3.2 Permission Matrix

Canonical permission matrix lives in `packages/permissions`. Key rules:

- Customers can **never** access another customer's data, regardless of JWT claims
- Technicians can **only** see their assigned work orders
- CSRs cannot modify financial records
- Billing agents cannot change ticket statuses or assignments
- `readonly_ops` has zero write access
- Platform admin cannot view tenant operational data without explicit impersonation (audit-logged)

### 3.3 Tenant Isolation Enforcement

```sql
-- Every tenant-scoped query must include this check
-- Applied automatically via RLS policy on each table

USING (
  tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid
)
```

The API also enforces this in the `tenantGuard()` middleware, so isolation is enforced at two independent checkpoints.

---

## 4. Data Security

### 4.1 Encryption at Rest

| Data | Encryption |
|---|---|
| Database (all tables) | Supabase Postgres full-disk encryption (AES-256) |
| Integration credentials | Column-level `pgcrypto` encryption with app-managed key |
| File storage (evidence, docs) | Supabase Storage server-side encryption |
| Redis (job queues) | Redis AUTH + TLS; sensitive job payloads contain only entity IDs (not PII) |

### 4.2 Encryption in Transit

| Channel | Protocol |
|---|---|
| Browser ↔ API | TLS 1.3 (enforced; TLS 1.2 allowed for compatibility) |
| API ↔ Supabase | TLS (Supabase managed) |
| API ↔ Redis | TLS |
| API ↔ External services | TLS 1.2+ (enforced by connector) |
| Supabase Storage signed URLs | HTTPS only |

### 4.3 PII Handling

| Field | Classification | Access |
|---|---|---|
| Customer name, email, phone | PII | Encrypted in DB; accessible to ops roles and owner |
| Technician name, email, phone | PII | Accessible to ops roles; phone optionally to customer (tenant config) |
| Payment card data | PCI-DSS | **Never stored in CareOS** — tokenised by payment gateway |
| Integration credentials | Sensitive | Encrypted; never returned in API responses |
| Audit log IP addresses | PII | Ops and platform admin only; retained 7 years |

**Right to Erasure (GDPR):** A customer account can be anonymised (PII fields replaced with `[DELETED]`) via a formal erasure request. Audit log entries retain the action but replace the actor name. Financial records are retained for legal compliance periods regardless of erasure request.

---

## 5. Network Security

### 5.1 Reverse Proxy (Caddy)

- TLS termination at Caddy
- Automatic certificate management (Let's Encrypt)
- HSTS header enforced (`max-age=63072000; includeSubDomains; preload`)
- CSP header configured to restrict script sources
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

### 5.2 Platform Admin IP Allowlist

The `/api/admin/*` path prefix and the Platform Admin portal are only accessible from allowlisted IP ranges. Configured at the Caddy reverse-proxy level, not in application code.

### 5.3 CORS

```
Allowed origins: Configured per environment
  - Production: tenant subdomains only (*.careos.app)
  - Development: localhost:5173, localhost:5174
Allowed methods: GET, POST, PATCH, PUT, DELETE, OPTIONS
Allowed headers: Content-Type, Authorization, Idempotency-Key, X-Request-ID
Allow credentials: true (for cookie auth)
```

---

## 6. Input Security

### 6.1 Validation

All request bodies are validated with **Zod schemas** at the Fastify route level before reaching any service function. Unknown fields are **stripped** (not passed through). Validation failures return `400` immediately.

### 6.2 SQL Injection Prevention

CareOS uses **Kysely** as the query builder. No raw SQL strings with user input are used. Parameterised queries enforced by Kysely's typed API.

Exception: Postgres functions defined in migrations may accept parameters — these use `$1`-style parameterised arguments only.

### 6.3 XSS Prevention

- React's default JSX escaping handles most cases
- Rich text fields (ticket description, notes) are sanitised server-side using **DOMPurify** (server-side variant) before storage
- CSP headers restrict script execution to known sources

### 6.4 CSRF Protection

- Primary auth uses `httpOnly` cookies with `SameSite=Strict` — provides native CSRF protection
- State-changing API requests also validate the `Origin` header against the allowlist
- For payment webhook endpoints: provider-specific HMAC signature validation replaces CSRF protection

---

## 7. Webhook Security

Inbound webhooks (payment gateway, SMS delivery) are authenticated by verifying the provider's HMAC-SHA256 signature against the raw request body. The signing secret is stored in environment variables.

```typescript
// Pseudo-code for webhook verification
const signature = req.headers['x-provider-signature'];
const expectedSig = hmacSha256(WEBHOOK_SECRET, req.rawBody);
if (!timingSafeEqual(signature, expectedSig)) {
  return reply.status(401).send({ error: 'Invalid signature' });
}
```

**Timing-safe comparison** is mandatory to prevent timing attacks.

---

## 8. Secrets Management

| Secret Type | Storage |
|---|---|
| Supabase service role key | Environment variable (not in code or git) |
| JWT secret (RS256 private key) | Managed by Supabase Auth |
| Payment gateway API keys | Environment variable; also stored encrypted in `integrations.config` |
| SMS/email provider keys | Environment variable; also stored encrypted in `integrations.config` |
| Redis AUTH password | Environment variable |
| Webhook signing secrets | Environment variable per provider |
| Integration credential encryption key | Environment variable (never in DB) |

Secrets are injected via Docker Compose environment files (`.env.production`) which are **gitignored**. In production, use a secrets manager (e.g., Doppler, HashiCorp Vault, or cloud-native equivalent) to inject secrets at runtime.

---

## 9. Audit and Compliance

### 9.1 Audit Log Coverage

Events captured in `audit_log`:

| Category | Events |
|---|---|
| Auth | Login, logout, failed login, password change, 2FA enroll/unenroll |
| Tenant management | Tenant create, suspend, unsuspend, plan change |
| User management | User create, role change, deactivate |
| Ticket lifecycle | Every status transition |
| Financial | Quotation sent, approved, rejected; payment confirmed; invoice void |
| Data access | Impersonation start/end; bulk data export |
| Integration | Config change, credential update |
| Security | IP allowlist change, 2FA policy change |

### 9.2 Audit Log Integrity

- Append-only (RLS denies UPDATE/DELETE)
- Logs include before/after state snapshots for mutations
- `occurred_at` is set by the database (`DEFAULT now()`) — not by the caller
- Logs are immutable even for `tenant_admin` and `platform_admin`

### 9.3 Retention

| Log Type | Retention |
|---|---|
| Audit log | 7 years |
| Notification log | 1 year |
| Integration job log | 90 days |
| Error/application logs | 30 days |

---

## 10. Vulnerability Management

| Practice | Approach |
|---|---|
| Dependency scanning | `npm audit` + Dependabot in CI |
| SAST | ESLint security plugins in CI |
| Container scanning | Trivy on Docker images in CI |
| Secret scanning | GitHub secret scanning (enabled on repo) |
| Penetration testing | Before v1 launch and annually thereafter |
| Security patch SLA | Critical: 24h; High: 7 days; Medium: 30 days |

---

## 11. Incident Response

| Step | Action |
|---|---|
| Detection | Automated alerting on anomalous auth patterns, rate limit breaches |
| Containment | Tenant suspension capability (platform admin); user session revocation |
| Investigation | Audit log review; application log analysis |
| Notification | Customer notification within 72 hours of confirmed breach (GDPR) |
| Recovery | Point-in-time database restore; credential rotation |
| Post-mortem | Documented within 7 days; fed back into security controls |
