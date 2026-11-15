# CareOS — API Conventions

**Version:** 1.0.0-draft  
**Status:** Approved for Implementation  
**Last Updated:** 2026-11-14

---

## 1. API Design Principles

- **REST-ful** with JSON bodies; no GraphQL in v1
- **Versioned** from day one — all routes are under `/api/v1/`
- **Tenant-scoped** — every request must carry a valid JWT identifying the tenant
- **Idempotent writes** — mutation endpoints accept an optional `Idempotency-Key` header
- **Consistent error format** across all endpoints
- **No business logic in route handlers** — handlers orchestrate services; services contain logic

---

## 2. URL Structure

```
/api/v1/{resource}
/api/v1/{resource}/{id}
/api/v1/{resource}/{id}/{sub-resource}
/api/v1/{resource}/{id}/{sub-resource}/{sub-id}
```

**Examples:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/tickets` | List tickets (tenant-scoped, paginated) |
| `POST` | `/api/v1/tickets` | Create ticket |
| `GET` | `/api/v1/tickets/:id` | Get single ticket |
| `PATCH` | `/api/v1/tickets/:id` | Update ticket (partial update) |
| `GET` | `/api/v1/tickets/:id/work-orders` | List WOs for a ticket |
| `POST` | `/api/v1/tickets/:id/work-orders` | Create WO for a ticket |
| `POST` | `/api/v1/tickets/:id/status` | Explicit state transition |
| `GET` | `/api/v1/customers` | List customer accounts |
| `GET` | `/api/v1/assets/:id/warranties` | List warranties for asset |
| `POST` | `/api/v1/auth/refresh` | Refresh access token |

**Admin routes** (platform-admin portal only):

```
/api/admin/v1/tenants
/api/admin/v1/tenants/:id
/api/admin/v1/tenants/:id/suspend
```

---

## 3. HTTP Methods

| Method | Use | Idempotent? | Body? |
|---|---|---|---|
| `GET` | Retrieve resource(s) | ✅ | No |
| `POST` | Create resource | ❌ | Yes |
| `PATCH` | Partial update | ✅ (with key) | Yes (partial) |
| `PUT` | Full replacement | ✅ | Yes (full) |
| `DELETE` | Soft-delete resource | ✅ | No |

> CareOS uses **soft deletes** for all operational entities. Physical deletion is only performed by the data-retention worker under GDPR erasure requests.

---

## 4. Request Format

### Headers

```
Authorization: Bearer <access_token>   (alternative to cookie)
Content-Type: application/json
Accept: application/json
Idempotency-Key: <client-uuid>         (optional; required for payments)
X-Request-ID: <client-uuid>            (optional; logged for tracing)
```

### JSON Body Conventions

- Use **camelCase** property names
- Dates/times as **ISO 8601** strings (`2026-01-14T10:00:00Z`)
- Monetary values as **numeric** (not string); include `currency` field
- Enum values as **lowercase_snake_case** strings
- Nullable fields explicitly include `null` (not omitted)

---

## 5. Response Format

### Success

```json
{
  "data": { ... } | [ ... ],
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-01-14T10:00:00Z"
  }
}
```

### Paginated List

```json
{
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "totalItems": 142,
    "totalPages": 6,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-01-14T10:00:00Z"
  }
}
```

### Error

```json
{
  "error": {
    "code": "TICKET_NOT_FOUND",
    "message": "Ticket with id '...' was not found",
    "details": [ ],
    "requestId": "uuid"
  }
}
```

---

## 6. HTTP Status Code Usage

| Status | When Used |
|---|---|
| `200 OK` | Successful GET, PATCH, PUT |
| `201 Created` | Successful POST that creates a resource |
| `204 No Content` | Successful DELETE |
| `400 Bad Request` | Validation error (see details array) |
| `401 Unauthorized` | Missing or invalid JWT |
| `403 Forbidden` | Valid JWT but insufficient permissions |
| `404 Not Found` | Resource does not exist (or not visible to caller) |
| `409 Conflict` | State transition not allowed; duplicate idempotency key |
| `422 Unprocessable Entity` | Business rule violation (e.g., quotation already approved) |
| `429 Too Many Requests` | Rate limit exceeded |
| `500 Internal Server Error` | Unexpected server error |
| `503 Service Unavailable` | Planned maintenance or circuit breaker open |

---

## 7. Validation

All request bodies are validated using **Zod** schemas (defined in `packages/shared-types`).

Validation errors return `400` with structured details:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "scheduledDate",
        "message": "Must be a future date"
      },
      {
        "field": "technicianId",
        "message": "Required"
      }
    ],
    "requestId": "uuid"
  }
}
```

---

## 8. Pagination

All list endpoints support cursor-based or page-based pagination.

**Query parameters:**

```
GET /api/v1/tickets?page=2&pageSize=25&sortBy=createdAt&sortOrder=desc
GET /api/v1/tickets?cursor=<opaque-cursor>&pageSize=25
```

Default `pageSize`: 25. Maximum: 100.

**Sorting:** `sortBy` accepts any indexed field. Default: `createdAt desc`.

**Filtering:** Domain-specific filter parameters documented per endpoint.

---

## 9. Filtering

Filters are expressed as query parameters with dot-notation for nested fields:

```
GET /api/v1/tickets?status=open,triaged&priority=high
GET /api/v1/tickets?createdAt.gte=2026-01-01&createdAt.lte=2026-01-31
GET /api/v1/tickets?technicianId=uuid&status=in_progress
```

Filter parameters are always additive (AND logic). OR logic within a single field uses comma separation.

---

## 10. State Transition Endpoint

State transitions are explicit, not implicit from PATCH. This prevents accidental status overwrites.

```
POST /api/v1/tickets/:id/status
{
  "status": "scheduled",
  "workOrderId": "uuid",   // required for this transition
  "comment": "Assigned Ahmed for Tuesday 2pm"
}
```

The API validates:
1. The target status is a valid state
2. The transition from current state to target is allowed
3. The caller's role permits this transition
4. Any required accompanying data is present

Returns `409` if the transition is not allowed.

---

## 11. Idempotency

Write operations that could cause duplicate side effects (payment collection, job enqueueing) must be submitted with an `Idempotency-Key` header containing a client-generated UUID.

- The server stores the key + response hash for 24 hours
- Duplicate requests with the same key return the original response without re-executing
- Stale keys after 24 hours result in a fresh execution

---

## 12. Rate Limiting

| Scope | Limit | Window |
|---|---|---|
| Per tenant | 1,000 req | 1 minute |
| Per user (auth'd) | 200 req | 1 minute |
| Unauthenticated | 20 req | 1 minute |
| File upload | 50 req | 1 hour |
| Payment endpoints | 10 req | 1 minute |

Rate limit headers returned on every response:
```
X-RateLimit-Limit: 200
X-RateLimit-Remaining: 187
X-RateLimit-Reset: 1234567890
```

Exceeded limit returns `429` with `Retry-After` header.

---

## 13. Authentication Middleware Chain

Every API request passes through this middleware chain (in order):

```
1. parseIdempotencyKey()     — extract and validate idempotency key
2. verifyJWT()               — validate Supabase JWT signature and expiry
3. extractClaims()           — parse tenant_id, role, portal from JWT
4. tenantGuard()             — if route is tenant-scoped, verify tenant_id from path/body matches JWT
5. permissionCheck(action)   — check role against packages/permissions matrix
6. rateLimiter()             — apply rate limit rules
```

If any step fails, the chain short-circuits with the appropriate HTTP error response.

---

## 14. Webhook Endpoints

Inbound webhooks (payment gateway, SMS delivery receipts) have dedicated routes under `/api/v1/webhooks/`:

```
POST /api/v1/webhooks/payment/:provider
POST /api/v1/webhooks/sms/:provider
```

These routes:
- Are **not** protected by JWT (they use provider-specific signature verification instead)
- Validate the provider's HMAC signature on the raw request body
- Insert an asynchronous job in the PostgreSQL `job_queue` outbox table (respond `200` immediately)
- Never process business logic synchronously (to avoid webhook timeout penalties)

---

## 15. File Upload

Evidence files are uploaded directly to Supabase Storage from the browser using a signed upload URL:

```
1. POST /api/v1/work-orders/:id/evidence/upload-url
   → Returns { uploadUrl, path, expiresAt }
2. Browser PUTs file directly to Supabase Storage at uploadUrl
3. POST /api/v1/work-orders/:id/evidence/confirm
   → Records evidence metadata in DB
```

This avoids routing large file payloads through the API server.

---

## 16. API Versioning Policy

- Current version: **v1**
- Additive changes (new fields, new endpoints) are **non-breaking** and require no version bump
- Breaking changes (removed fields, changed types, removed endpoints) require a new version (`v2`)
- Deprecated endpoints return a `Deprecation` header with the sunset date
- Old versions are supported for at least 6 months after a new version is released

---

## 17. OpenAPI Specification

An OpenAPI 3.1 specification is auto-generated from Fastify route schemas and served at:
```
GET /api/docs          — Swagger UI (development only)
GET /api/openapi.json  — Raw OpenAPI spec
```

The spec is generated at build time and committed to the repo for client SDK generation.
