// ─── Ticket ───────────────────────────────────────────────────────────────────

export type TicketStatus =
  | "draft"
  | "open"
  | "triaged"
  | "scheduled"
  | "in_progress"
  | "awaiting_customer"
  | "awaiting_parts"
  | "awaiting_payment"
  | "resolved"
  | "closed"
  | "reopened";

export type TicketPriority = "low" | "normal" | "high" | "critical";

export type TicketSource = "customer_portal" | "csr_created" | "api_integration";

export type CoverageType = "warranty" | "contract" | "free" | "paid" | "pending_review";

// ─── Work Order ───────────────────────────────────────────────────────────────

export type WorkOrderStatus =
  | "pending"
  | "accepted"
  | "en_route"
  | "on_site"
  | "completed"
  | "incomplete"
  | "cancelled";

// ─── Quotation ────────────────────────────────────────────────────────────────

export type QuotationStatus =
  | "draft"
  | "sent"
  | "approved"
  | "rejected"
  | "expired"
  | "invoiced";

// ─── Invoice ──────────────────────────────────────────────────────────────────

export type InvoiceStatus = "issued" | "partially_paid" | "paid" | "void";

// ─── Payment ──────────────────────────────────────────────────────────────────

export type PaymentMethod = "cash" | "card_online" | "card_terminal" | "bank_transfer";

export type PaymentStatus = "pending" | "confirmed" | "failed" | "refunded";

// ─── Complaint ────────────────────────────────────────────────────────────────

export type ComplaintStatus = "open" | "under_review" | "resolved" | "escalated";

export type ComplaintType =
  | "service_quality"
  | "billing"
  | "technician_behaviour"
  | "delay"
  | "other";

export type ComplaintSource = "customer_portal" | "csr_created" | "phone";

// ─── User Roles ───────────────────────────────────────────────────────────────

/** Ops portal roles — scoped to a tenant */
export type TenantRole =
  | "tenant_admin"
  | "tenant_manager"
  | "dispatcher"
  | "csr"
  | "billing_agent"
  | "readonly_ops";

/** Technician portal roles — scoped to a tenant */
export type TechnicianRole = "technician" | "senior_technician";

/** Customer portal roles */
export type CustomerRole =
  | "customer_individual"
  | "customer_account_admin"
  | "customer_account_member";

/** Platform admin roles — no tenant_id */
export type PlatformRole = "platform_admin" | "platform_support";

export type AnyRole = TenantRole | TechnicianRole | CustomerRole | PlatformRole;

/** Which portal the JWT originates from */
export type Portal = "operations" | "technician" | "customer" | "admin";

// ─── Account ──────────────────────────────────────────────────────────────────

export type CustomerAccountType = "individual" | "company";

// ─── Asset / Device / SIM ─────────────────────────────────────────────────────

export type DeviceStatus = "active" | "inactive" | "faulty" | "decommissioned";

export type SimStatus = "active" | "suspended" | "deactivated" | "unassigned";

// ─── Warranty ─────────────────────────────────────────────────────────────────

export type WarrantyType = "manufacturer" | "extended" | "service_contract";

export type WarrantyStatus = "active" | "expired" | "void";

// ─── Contract ─────────────────────────────────────────────────────────────────

export type ContractStatus = "draft" | "active" | "expired" | "terminated";

// ─── Notification ─────────────────────────────────────────────────────────────

export type NotificationChannel = "email" | "sms" | "in_app" | "push";

export type NotificationStatus = "queued" | "sent" | "delivered" | "failed";

// ─── Integration ──────────────────────────────────────────────────────────────

export type IntegrationType =
  | "erp"
  | "sms_gateway"
  | "email_provider"
  | "payment_gateway"
  | "webhook";

// ─── Tenant ───────────────────────────────────────────────────────────────────

export type TenantStatus = "trial" | "active" | "suspended" | "cancelled";

// ─── Free-service rule version ────────────────────────────────────────────────

export type FreeServiceRuleVersionStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "superseded"
  | "rejected";

export type FreeServiceVisitPeriod = "day" | "month" | "quarter" | "year" | "lifetime";

// ─── Bulk service request ─────────────────────────────────────────────────────

export type BulkRequestSource = "csv_upload" | "api" | "manual";

export type BulkRequestStatus = "processing" | "completed" | "partial" | "failed";

export type BulkRequestItemStatus = "pending" | "created" | "failed" | "skipped";

// ─── Evidence ─────────────────────────────────────────────────────────────────

export type EvidenceType = "photo" | "video" | "document" | "signature";

// ─── Background Job Queue / Outbox ──────────────────────────────────────────

export type JobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "dead_letter";

export type JobQueueName =
  | "notify:email"
  | "notify:sms"
  | "notify:in_app"
  | "erp:push"
  | "sla:check"
  | "report:generate"
  | "bulk_request:process";
