# CareOS — Database Design

**Version:** 1.0.0-draft  
**Status:** Approved for Implementation  
**Last Updated:** 2026-11-14

---

## 1. Design Principles

1. **PostgreSQL 15** as the sole database engine (via Supabase managed service)
2. **UUID v4** primary keys on all tables (`gen_random_uuid()`)
3. **Soft deletes** via `is_active` or `deleted_at` — no physical row deletion for operational data
4. **`tenant_id` on every tenant-scoped table** — always a non-nullable UUID FK
5. **RLS enabled on every tenant-scoped table** — no table is accessible without a valid JWT
6. **Timestamps:** `created_at` and `updated_at` on all mutable tables; `updated_at` maintained by trigger
7. **Immutable tables** (audit_log, ticket_history): no UPDATE/DELETE RLS policy; INSERT only
8. **Monetary values** stored as `numeric(15,4)` — never float
9. **Encrypted at rest:** Supabase Postgres encryption for the full database; additionally, sensitive columns (integration credentials, PII exports) use `pgcrypto` column-level encryption
10. **Migrations only** — schema changes via numbered migration files; never `ALTER TABLE` ad hoc

---

## 2. Schema: Core Tables

### `tenants`

```sql
CREATE TABLE tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'trial'
                    CHECK (status IN ('trial','active','suspended','cancelled')),
  plan            TEXT NOT NULL DEFAULT 'starter',
  settings        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`settings` JSONB schema (documented, not enforced at DB level):

```json
{
  "branding": {
    "logoUrl": "...",
    "primaryColor": "#2563EB",
    "accentColor": "#0EA5E9"
  },
  "numbering": {
    "prefix": "ACE",
    "ticketStartSeq": 1,
    "workOrderStartSeq": 1
  },
  "timezone": "Asia/Riyadh",
  "defaultLanguage": "ar",
  "currency": "SAR",
  "slaDefaults": {
    "responseHours": 4,
    "resolutionHours": 24
  },
  "reopenWindowDays": 30,
  "quotationTtlHours": 48,
  "freeServiceRules": []
}
```

---

### `tenant_users`

```sql
CREATE TABLE tenant_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  auth_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  role            TEXT NOT NULL
                    CHECK (role IN ('tenant_admin','tenant_manager','dispatcher','csr','billing_agent','readonly_ops')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  mfa_enabled     BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, auth_user_id)
);
CREATE INDEX ON tenant_users(tenant_id);
CREATE INDEX ON tenant_users(auth_user_id);
```

---

### `customer_accounts`

```sql
CREATE TABLE customer_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  account_type        TEXT NOT NULL CHECK (account_type IN ('individual','company')),
  name                TEXT NOT NULL,
  email               TEXT NOT NULL,
  phone               TEXT,
  auth_user_id        UUID REFERENCES auth.users(id),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON customer_accounts(tenant_id);
CREATE INDEX ON customer_accounts(tenant_id, email);
CREATE UNIQUE INDEX ON customer_accounts(tenant_id, email);
```

---

### `customer_sites`

```sql
CREATE TABLE customer_sites (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  customer_account_id     UUID NOT NULL REFERENCES customer_accounts(id),
  name                    TEXT NOT NULL,
  address_line1           TEXT NOT NULL,
  address_line2           TEXT,
  city                    TEXT NOT NULL,
  region                  TEXT,
  country                 CHAR(2) NOT NULL,
  postal_code             TEXT,
  coordinates             POINT,
  contact_name            TEXT,
  contact_phone           TEXT,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON customer_sites(tenant_id);
CREATE INDEX ON customer_sites(customer_account_id);
```

---

### `assets`

```sql
CREATE TABLE assets (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  customer_account_id     UUID NOT NULL REFERENCES customer_accounts(id),
  customer_site_id        UUID REFERENCES customer_sites(id),
  category                TEXT NOT NULL,
  make                    TEXT NOT NULL,
  model                   TEXT NOT NULL,
  serial_number           TEXT,
  purchase_date           DATE,
  installation_date       DATE,
  notes                   TEXT,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON assets(tenant_id);
CREATE INDEX ON assets(customer_account_id);
CREATE INDEX ON assets(tenant_id, serial_number);
```

---

### `devices`

```sql
CREATE TABLE devices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  asset_id            UUID NOT NULL REFERENCES assets(id),
  device_type         TEXT NOT NULL,
  manufacturer        TEXT,
  model               TEXT,
  firmware_version    TEXT,
  mac_address         TEXT,
  imei                TEXT,
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','inactive','faulty','decommissioned')),
  installed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON devices(tenant_id);
CREATE INDEX ON devices(asset_id);
```

---

### `sim_cards`

```sql
CREATE TABLE sim_cards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  device_id       UUID REFERENCES devices(id),
  iccid           TEXT NOT NULL UNIQUE,
  msisdn          TEXT,
  carrier         TEXT,
  data_plan       TEXT,
  status          TEXT NOT NULL DEFAULT 'unassigned'
                    CHECK (status IN ('active','suspended','deactivated','unassigned')),
  activated_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON sim_cards(tenant_id);
CREATE INDEX ON sim_cards(device_id);
```

---

### `warranties`

```sql
CREATE TABLE warranties (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  asset_id                UUID NOT NULL REFERENCES assets(id),
  warranty_type           TEXT NOT NULL
                            CHECK (warranty_type IN ('manufacturer','extended','service_contract')),
  provider                TEXT NOT NULL,
  reference_number        TEXT,
  starts_at               DATE NOT NULL,
  expires_at              DATE NOT NULL,
  covers_parts            BOOLEAN NOT NULL DEFAULT true,
  covers_labour           BOOLEAN NOT NULL DEFAULT true,
  terms_document_url      TEXT,
  status                  TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','expired','void')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON warranties(tenant_id);
CREATE INDEX ON warranties(asset_id);
CREATE INDEX ON warranties(asset_id, status, expires_at);
```

---

### `contracts`

```sql
CREATE TABLE contracts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  customer_account_id     UUID NOT NULL REFERENCES customer_accounts(id),
  contract_number         TEXT NOT NULL,
  name                    TEXT NOT NULL,
  covers_categories       TEXT[] NOT NULL DEFAULT '{}',
  includes_parts          BOOLEAN NOT NULL DEFAULT false,
  includes_labour         BOOLEAN NOT NULL DEFAULT true,
  free_visits_per_year    INTEGER,
  starts_at               DATE NOT NULL,
  expires_at              DATE NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','active','expired','terminated')),
  document_url            TEXT,
  terms                   JSONB NOT NULL DEFAULT '{}',
  monthly_fee             NUMERIC(15,4),
  currency                CHAR(3),
  signed_at               TIMESTAMPTZ,
  signed_by_customer_id   UUID REFERENCES auth.users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, contract_number)
);
CREATE INDEX ON contracts(tenant_id);
CREATE INDEX ON contracts(customer_account_id);
CREATE INDEX ON contracts(customer_account_id, status, expires_at);
```

---

### `tickets`

```sql
CREATE TABLE tickets (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id),
  ticket_number               TEXT NOT NULL,
  customer_account_id         UUID NOT NULL REFERENCES customer_accounts(id),
  customer_site_id            UUID REFERENCES customer_sites(id),
  asset_id                    UUID REFERENCES assets(id),
  status                      TEXT NOT NULL DEFAULT 'open'
                                CHECK (status IN (
                                  'draft','open','triaged','scheduled','in_progress',
                                  'awaiting_customer','awaiting_parts','awaiting_payment',
                                  'resolved','closed','reopened'
                                )),
  category                    TEXT NOT NULL,
  description                 TEXT NOT NULL,
  priority                    TEXT NOT NULL DEFAULT 'normal'
                                CHECK (priority IN ('low','normal','high','critical')),
  coverage_type               TEXT NOT NULL DEFAULT 'pending_review'
                                CHECK (coverage_type IN ('warranty','contract','free','paid','pending_review')),
  warranty_id                 UUID REFERENCES warranties(id),
  contract_id                 UUID REFERENCES contracts(id),
  source                      TEXT NOT NULL
                                CHECK (source IN ('customer_portal','csr_created','api_integration')),
  created_by                  UUID NOT NULL REFERENCES auth.users(id),
  assigned_dispatcher_id      UUID REFERENCES tenant_users(id),
  sla_response_deadline       TIMESTAMPTZ,
  sla_resolution_deadline     TIMESTAMPTZ,
  sla_paused_at               TIMESTAMPTZ,
  sla_paused_duration_seconds INTEGER NOT NULL DEFAULT 0,
  ambiguous_coverage          BOOLEAN NOT NULL DEFAULT false,
  resolved_at                 TIMESTAMPTZ,
  closed_at                   TIMESTAMPTZ,
  reopen_window_expires_at    TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ticket_number)
);
CREATE INDEX ON tickets(tenant_id);
CREATE INDEX ON tickets(tenant_id, status);
CREATE INDEX ON tickets(customer_account_id);
CREATE INDEX ON tickets(tenant_id, created_at DESC);
```

---

### `ticket_number_sequences`

```sql
CREATE TABLE ticket_number_sequences (
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  entity_type     TEXT NOT NULL,   -- 'ticket','work_order','quotation','invoice','complaint'
  year_month      CHAR(6) NOT NULL, -- 'YYYYMM'
  current_seq     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, entity_type, year_month)
);

-- Function to atomically get next sequence number
CREATE OR REPLACE FUNCTION next_sequence(
  p_tenant_id UUID,
  p_entity_type TEXT,
  p_year_month CHAR(6)
) RETURNS INTEGER AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  INSERT INTO ticket_number_sequences (tenant_id, entity_type, year_month, current_seq)
  VALUES (p_tenant_id, p_entity_type, p_year_month, 1)
  ON CONFLICT (tenant_id, entity_type, year_month)
  DO UPDATE SET current_seq = ticket_number_sequences.current_seq + 1
  RETURNING current_seq INTO v_seq;
  RETURN v_seq;
END;
$$ LANGUAGE plpgsql;
```

---

### `ticket_history`

```sql
CREATE TABLE ticket_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  ticket_id       UUID NOT NULL REFERENCES tickets(id),
  from_status     TEXT,
  to_status       TEXT NOT NULL,
  actor_id        UUID NOT NULL REFERENCES auth.users(id),
  actor_role      TEXT NOT NULL,
  comment         TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON ticket_history(tenant_id, ticket_id);
CREATE INDEX ON ticket_history(ticket_id, occurred_at);

-- Immutable: no UPDATE or DELETE allowed (enforced via RLS)
```

---

### `work_orders`

```sql
CREATE TABLE work_orders (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  work_order_number       TEXT NOT NULL,
  ticket_id               UUID NOT NULL REFERENCES tickets(id),
  technician_id           UUID NOT NULL REFERENCES technicians(id),
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','accepted','en_route','on_site','completed','incomplete','cancelled')),
  scheduled_date          DATE NOT NULL,
  scheduled_window_start  TIME NOT NULL,
  scheduled_window_end    TIME NOT NULL,
  checkin_time            TIMESTAMPTZ,
  checkout_time           TIMESTAMPTZ,
  work_description        TEXT,
  parts_used              JSONB NOT NULL DEFAULT '[]',
  labour_minutes          INTEGER,
  customer_signature_url  TEXT,
  is_billable             BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, work_order_number)
);
CREATE INDEX ON work_orders(tenant_id);
CREATE INDEX ON work_orders(ticket_id);
CREATE INDEX ON work_orders(technician_id);
CREATE INDEX ON work_orders(tenant_id, status, scheduled_date);
```

---

### `technicians`

```sql
CREATE TABLE technicians (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  auth_user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id         TEXT,
  full_name           TEXT NOT NULL,
  email               TEXT NOT NULL,
  phone               TEXT,
  skill_codes         TEXT[] NOT NULL DEFAULT '{}',
  home_zone_postcode  TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  hire_date           DATE,
  avg_rating          NUMERIC(3,2),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, auth_user_id)
);
CREATE INDEX ON technicians(tenant_id);
CREATE INDEX ON technicians(tenant_id, is_active);
```

---

### `assignment_history`

```sql
CREATE TABLE assignment_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  work_order_id   UUID NOT NULL REFERENCES work_orders(id),
  technician_id   UUID NOT NULL REFERENCES technicians(id),
  assigned_by     UUID NOT NULL REFERENCES auth.users(id),
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  unassigned_at   TIMESTAMPTZ,
  reason          TEXT
);
CREATE INDEX ON assignment_history(work_order_id);
CREATE INDEX ON assignment_history(technician_id);
```

---

### `evidence`

```sql
CREATE TABLE evidence (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  work_order_id       UUID NOT NULL REFERENCES work_orders(id),
  uploaded_by         UUID NOT NULL REFERENCES auth.users(id),
  evidence_type       TEXT NOT NULL
                        CHECK (evidence_type IN ('photo','video','document','signature')),
  storage_path        TEXT NOT NULL,
  file_name           TEXT NOT NULL,
  file_size_bytes     INTEGER,
  mime_type           TEXT,
  caption             TEXT,
  is_customer_visible BOOLEAN NOT NULL DEFAULT false,
  taken_at            TIMESTAMPTZ,
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON evidence(tenant_id);
CREATE INDEX ON evidence(work_order_id);
```

---

### `quotations`

```sql
CREATE TABLE quotations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),
  quotation_number          TEXT NOT NULL,
  ticket_id                 UUID NOT NULL REFERENCES tickets(id),
  status                    TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','sent','approved','rejected','expired','invoiced')),
  line_items                JSONB NOT NULL DEFAULT '[]',
  subtotal                  NUMERIC(15,4) NOT NULL DEFAULT 0,
  tax_rate                  NUMERIC(6,4) NOT NULL DEFAULT 0,
  tax_amount                NUMERIC(15,4) NOT NULL DEFAULT 0,
  total_amount              NUMERIC(15,4) NOT NULL DEFAULT 0,
  currency                  CHAR(3) NOT NULL,
  valid_until               TIMESTAMPTZ NOT NULL,
  sent_at                   TIMESTAMPTZ,
  customer_approved_at      TIMESTAMPTZ,
  customer_rejected_at      TIMESTAMPTZ,
  approved_by_customer_id   UUID REFERENCES auth.users(id),
  notes                     TEXT,
  created_by                UUID NOT NULL REFERENCES auth.users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, quotation_number)
);
CREATE INDEX ON quotations(tenant_id);
CREATE INDEX ON quotations(ticket_id);
CREATE INDEX ON quotations(ticket_id, status);
```

---

### `invoices`

```sql
CREATE TABLE invoices (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  invoice_number          TEXT NOT NULL,
  quotation_id            UUID REFERENCES quotations(id),
  ticket_id               UUID NOT NULL REFERENCES tickets(id),
  customer_account_id     UUID NOT NULL REFERENCES customer_accounts(id),
  status                  TEXT NOT NULL DEFAULT 'issued'
                            CHECK (status IN ('issued','partially_paid','paid','void')),
  total_amount            NUMERIC(15,4) NOT NULL,
  amount_paid             NUMERIC(15,4) NOT NULL DEFAULT 0,
  currency                CHAR(3) NOT NULL,
  due_date                DATE,
  issued_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at                 TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, invoice_number)
);
CREATE INDEX ON invoices(tenant_id);
CREATE INDEX ON invoices(customer_account_id);
CREATE INDEX ON invoices(ticket_id);
```

---

### `payments`

```sql
CREATE TABLE payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  invoice_id          UUID NOT NULL REFERENCES invoices(id),
  method              TEXT NOT NULL
                        CHECK (method IN ('cash','card_online','card_terminal','bank_transfer')),
  amount              NUMERIC(15,4) NOT NULL,
  currency            CHAR(3) NOT NULL,
  gateway_reference   TEXT,
  collected_by        UUID REFERENCES auth.users(id),
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','confirmed','failed','refunded')),
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON payments(tenant_id);
CREATE INDEX ON payments(invoice_id);
CREATE UNIQUE INDEX ON payments(gateway_reference) WHERE gateway_reference IS NOT NULL;
```

---

### `complaints`

```sql
CREATE TABLE complaints (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  complaint_number        TEXT NOT NULL,
  customer_account_id     UUID NOT NULL REFERENCES customer_accounts(id),
  ticket_id               UUID REFERENCES tickets(id),
  work_order_id           UUID REFERENCES work_orders(id),
  type                    TEXT NOT NULL
                            CHECK (type IN ('service_quality','billing','technician_behaviour','delay','other')),
  description             TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open','under_review','resolved','escalated')),
  assigned_to             UUID REFERENCES tenant_users(id),
  resolution_notes        TEXT,
  created_by              UUID NOT NULL REFERENCES auth.users(id),
  source                  TEXT NOT NULL
                            CHECK (source IN ('customer_portal','csr_created','phone')),
  resolved_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, complaint_number)
);
CREATE INDEX ON complaints(tenant_id);
CREATE INDEX ON complaints(customer_account_id);
CREATE INDEX ON complaints(ticket_id);
```

---

### `integrations`

```sql
CREATE TABLE integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  type            TEXT NOT NULL
                    CHECK (type IN ('erp','sms_gateway','email_provider','payment_gateway','webhook')),
  name            TEXT NOT NULL,
  adapter         TEXT NOT NULL,
  config          JSONB NOT NULL DEFAULT '{}',  -- encrypted at application layer
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_sync_at    TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON integrations(tenant_id);
```

---

### `notifications`

```sql
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  recipient_id    UUID NOT NULL REFERENCES auth.users(id),
  channel         TEXT NOT NULL CHECK (channel IN ('email','sms','in_app','push')),
  event_type      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','sent','delivered','failed')),
  subject         TEXT,
  body            TEXT,
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON notifications(tenant_id);
CREATE INDEX ON notifications(recipient_id);
CREATE INDEX ON notifications(recipient_id, channel, status);
```

---

### `audit_log`

```sql
CREATE TABLE audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),     -- NULL for platform-level actions
  actor_id        UUID NOT NULL REFERENCES auth.users(id),
  actor_role      TEXT NOT NULL,
  action          TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       UUID,
  before_state    JSONB,
  after_state     JSONB,
  ip_address      INET,
  user_agent      TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_log(tenant_id, occurred_at DESC);
CREATE INDEX ON audit_log(entity_type, entity_id);
CREATE INDEX ON audit_log(actor_id);

-- Immutable: RLS enforces no UPDATE/DELETE
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_no_update" ON audit_log FOR UPDATE USING (false);
CREATE POLICY "audit_no_delete" ON audit_log FOR DELETE USING (false);
```

---

## 3. RLS Policy Template

```sql
-- Pattern applied to every tenant-scoped table
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;

-- Ops/admin: see all within own tenant
CREATE POLICY "{table}_ops_read" ON {table}
  FOR SELECT
  USING (
    tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid
    AND (auth.jwt()->'app_metadata'->>'portal') = 'operations'
  );

-- Customer: see own records only
CREATE POLICY "{table}_customer_read" ON {table}
  FOR SELECT
  USING (
    tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid
    AND customer_account_id = (auth.jwt()-->>'sub')::uuid
    AND (auth.jwt()->'app_metadata'->>'portal') = 'customer'
  );

-- Technician: see WOs assigned to them
-- (applied specifically to work_orders and evidence)
```

---

## 4. Performance Considerations

| Concern | Strategy |
|---|---|
| Ticket list queries (high frequency) | Composite index on `(tenant_id, status, created_at)` |
| Coverage lookup (warranty/contract on ticket create) | Index on `(asset_id, status, expires_at)` |
| SLA breach queries (run every 5 min) | Index on `(tenant_id, status, sla_resolution_deadline)` |
| Audit log growth | Partition `audit_log` by month using `occurred_at` |
| Notification queries | Index on `(recipient_id, channel, status)` |
| Full-text search on ticket descriptions | `tsvector` column + GIN index (added in migration) |

---

## 5. Backup and Recovery

| Item | Specification |
|---|---|
| Backup type | Supabase managed daily snapshots + WAL continuous archiving |
| Backup retention | 30 days |
| Point-in-time recovery | Within Supabase plan limits (down to ~1 minute) |
| Restore testing | Monthly restore drill (manual, documented in runbook) |
| Cross-region backup | Configured via Supabase project settings |

---

## 6. Free Service Rule Tables (Added: OQ-09 resolution, 2026-11-14)

### `free_service_rules`

Master record for a tenant's configurable free-service rule.

```sql
CREATE TABLE free_service_rules (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  name                    TEXT NOT NULL,
  description             TEXT,
  is_enabled              BOOLEAN NOT NULL DEFAULT false,
  priority                INTEGER NOT NULL DEFAULT 100,  -- lower = higher priority; evaluated in order
  current_version_id      UUID,                          -- FK to free_service_rule_versions (set after first approval)
  created_by              UUID NOT NULL REFERENCES auth.users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
CREATE INDEX ON free_service_rules(tenant_id, is_enabled, priority);
```

---

### `free_service_rule_versions`

Each edit to a rule creates a new version row. Only an approved version is active.

```sql
CREATE TABLE free_service_rule_versions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id                     UUID NOT NULL REFERENCES free_service_rules(id) ON DELETE CASCADE,
  tenant_id                   UUID NOT NULL REFERENCES tenants(id),
  version_number              INTEGER NOT NULL,

  -- Eligibility scope
  eligible_account_types      TEXT[] NOT NULL DEFAULT '{"individual","company"}',
                              -- ['individual'] | ['company'] | both
  eligible_account_ids        UUID[],                      -- NULL = all accounts; specific list = only those
  eligible_asset_categories   TEXT[],                      -- NULL = all; e.g. ['hvac','refrigeration']
  eligible_device_categories  TEXT[],                      -- NULL = all device types
  eligible_service_categories TEXT[],                      -- NULL = all service types

  -- Validity window
  effective_from              DATE NOT NULL,
  effective_until             DATE,                         -- NULL = no expiry

  -- Visit limits
  max_visits_per_asset        INTEGER,                     -- NULL = unlimited
  visit_period                TEXT CHECK (visit_period IN ('day','month','quarter','year','lifetime')),

  -- Coverage flags
  covers_labour               BOOLEAN NOT NULL DEFAULT true,
  covers_parts                BOOLEAN NOT NULL DEFAULT false,
  covers_travel_charge        BOOLEAN NOT NULL DEFAULT false,

  -- Approval settings
  requires_approval           BOOLEAN NOT NULL DEFAULT false,
  approver_role               TEXT,                        -- e.g. 'tenant_manager'; NULL if requires_approval=false
  approver_user_id            UUID REFERENCES auth.users(id),  -- specific user override; NULL = any matching role

  -- Exclusions (structured JSON, server-validated against schema)
  exclusions                  JSONB NOT NULL DEFAULT '[]',
  -- Schema: [{ "type": "prior_complaint_within_days", "value": 30 }, ...]

  -- Conditions (AND-evaluated with eligibility)
  conditions                  JSONB NOT NULL DEFAULT '[]',
  -- Schema: [{ "type": "within_days_of_installation", "value": 90 }, ...]

  -- Version metadata
  status                      TEXT NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','pending_approval','approved','superseded','rejected')),
  authored_by                 UUID NOT NULL REFERENCES auth.users(id),
  approved_by                 UUID REFERENCES auth.users(id),
  approved_at                 TIMESTAMPTZ,
  rejection_reason            TEXT,
  change_summary              TEXT,                        -- human-readable description of what changed
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (rule_id, version_number)
);
CREATE INDEX ON free_service_rule_versions(rule_id, status);
CREATE INDEX ON free_service_rule_versions(tenant_id, status);

-- Back-reference from master rule to current approved version
ALTER TABLE free_service_rules
  ADD CONSTRAINT fk_current_version
  FOREIGN KEY (current_version_id) REFERENCES free_service_rule_versions(id)
  DEFERRABLE INITIALLY DEFERRED;
```

**Version lifecycle:**
1. `tenant_admin` or `tenant_manager` drafts a new version (`status = draft`).
2. If `requires_approval = false` for the _rule configuration itself_ (not individual ticket approvals), the version goes straight to `approved`.
3. If tenant requires a review workflow for rule changes (tenant setting), it goes to `pending_approval` → `approved` or `rejected`.
4. On approval, `free_service_rules.current_version_id` is updated and the previous approved version moves to `superseded`.

---

### `free_service_eligibility_decisions`

Stores the coverage engine's decision for each ticket that was evaluated against free-service rules. Provides an auditable record.

```sql
CREATE TABLE free_service_eligibility_decisions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  ticket_id               UUID NOT NULL REFERENCES tickets(id),
  rule_id                 UUID REFERENCES free_service_rules(id),
  rule_version_id         UUID REFERENCES free_service_rule_versions(id),
  is_eligible             BOOLEAN NOT NULL,
  explanation             TEXT NOT NULL,            -- human-readable rationale
  requires_approval       BOOLEAN NOT NULL DEFAULT false,
  approved_by             UUID REFERENCES auth.users(id),
  approved_at             TIMESTAMPTZ,
  approval_notes          TEXT,
  evaluated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON free_service_eligibility_decisions(ticket_id);
CREATE INDEX ON free_service_eligibility_decisions(tenant_id, requires_approval, approved_at);
```

---

## 7. Bulk Service Request Tables (Added: OQ-10 resolution + new V1 feature, 2026-11-14)

A **bulk service request** is a single operator-initiated batch that creates one independent ticket per asset. Each resulting ticket is a fully autonomous record — the batch is a creation convenience only.

### `bulk_service_requests`

```sql
CREATE TABLE bulk_service_requests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  batch_number            TEXT NOT NULL,            -- generated, e.g. ACE-BSR-202601-00001
  name                    TEXT NOT NULL,            -- human label for the batch
  description             TEXT,
  source                  TEXT NOT NULL
                            CHECK (source IN ('csv_upload','api','manual')),
  status                  TEXT NOT NULL DEFAULT 'processing'
                            CHECK (status IN ('processing','completed','partial','failed')),
  total_items             INTEGER NOT NULL DEFAULT 0,
  created_items           INTEGER NOT NULL DEFAULT 0,
  failed_items            INTEGER NOT NULL DEFAULT 0,
  default_category        TEXT,                     -- applied to items with no category override
  default_priority        TEXT DEFAULT 'normal'
                            CHECK (default_priority IN ('low','normal','high','critical')),
  created_by              UUID NOT NULL REFERENCES auth.users(id),
  created_by_role         TEXT NOT NULL,
  original_filename       TEXT,                     -- for CSV uploads
  storage_path            TEXT,                     -- Supabase Storage path to original CSV
  completed_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, batch_number)
);
CREATE INDEX ON bulk_service_requests(tenant_id, status);
CREATE INDEX ON bulk_service_requests(tenant_id, created_at DESC);
```

### `bulk_service_request_items`

```sql
CREATE TABLE bulk_service_request_items (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  bulk_request_id         UUID NOT NULL REFERENCES bulk_service_requests(id) ON DELETE CASCADE,
  row_number              INTEGER NOT NULL,         -- source row index (for error reporting)

  -- Asset identification (one of these must resolve to an asset_id)
  asset_id                UUID REFERENCES assets(id),
  asset_serial_number     TEXT,                     -- used for lookup if asset_id not provided

  -- Customer identification
  customer_account_id     UUID REFERENCES customer_accounts(id),
  customer_site_id        UUID REFERENCES customer_sites(id),

  -- Ticket fields
  category                TEXT,
  description             TEXT,
  priority                TEXT CHECK (priority IN ('low','normal','high','critical')),

  -- Processing result
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','created','failed','skipped')),
  ticket_id               UUID REFERENCES tickets(id),  -- populated on successful creation
  error_message           TEXT,                         -- populated on failure
  processed_at            TIMESTAMPTZ,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON bulk_service_request_items(bulk_request_id);
CREATE INDEX ON bulk_service_request_items(tenant_id, status);
CREATE INDEX ON bulk_service_request_items(ticket_id);
```

**Processing rules:**
- Each item is processed independently; failure of one item does not block others.
- If `asset_id` is null but `asset_serial_number` is provided, the system looks up the asset within the tenant. If not found, the item fails with `error_message = 'Asset not found'`.
- Each successfully created ticket is a fully independent ticket with its own number, status, and coverage determination.
- The batch `status` is set to `completed` when all items are processed, `partial` when some failed, and `failed` when all failed or the batch itself could not be parsed.
- Authorised roles: `tenant_admin`, `tenant_manager`, `csr` (all can initiate); `readonly_ops` cannot.


---

## 8. Background Job Outbox Queue

CareOS uses a **durable PostgreSQL-backed outbox pattern** for all asynchronous processing (no Redis or external queue broker in V1).

### `job_queue`

```sql
CREATE TABLE job_queue (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  queue_name          TEXT NOT NULL
                        CHECK (queue_name IN (
                          'notify:email',
                          'notify:sms',
                          'notify:in_app',
                          'erp:push',
                          'sla:check',
                          'report:generate',
                          'bulk_request:process'
                        )),
  payload             JSONB NOT NULL DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','processing','completed','failed','dead_letter')),
  attempts            INTEGER NOT NULL DEFAULT 0,
  max_attempts        INTEGER NOT NULL DEFAULT 5,
  run_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at           TIMESTAMPTZ,
  locked_by           TEXT,                           -- worker instance ID (e.g., worker-pid-random)
  lease_expires_at    TIMESTAMPTZ,                    -- crash recovery deadline
  error_message       TEXT,
  idempotency_key     TEXT,                           -- deduplication key
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial index for high-throughput eligible job polling
CREATE INDEX idx_job_queue_eligible ON job_queue(run_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX ON job_queue(tenant_id);
CREATE INDEX ON job_queue(queue_name);
CREATE UNIQUE INDEX idx_job_queue_idempotency
  ON job_queue(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

**Worker Polling & Atomic Lease Semantics:**
- Fastify API writes business data and outbox jobs within the **same atomic database transaction**.
- The OCI worker polls for jobs: `WHERE (status = 'pending' AND run_at <= now()) OR (status = 'processing' AND lease_expires_at < now()) ORDER BY run_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`.
- Worker marks `status = 'processing'`, sets `locked_by`, and computes `lease_expires_at = now() + interval '60 seconds'`.
- On success, `status = 'completed'` and lease fields are cleared.
- On failure, `attempts` is incremented. If `attempts >= max_attempts`, `status = 'dead_letter'`; otherwise `status = 'pending'` with exponential backoff and jitter applied to `run_at`.
- Expired leases (`lease_expires_at < now()`) are automatically reclaimed by healthy workers after a worker process crash.
