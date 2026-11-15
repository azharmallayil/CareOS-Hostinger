// Core domain entity interfaces.
// These mirror the database schema — no computed fields, no methods.

import type {
  AnyRole,
  BulkRequestItemStatus,
  BulkRequestSource,
  BulkRequestStatus,
  ComplaintSource,
  ComplaintStatus,
  ComplaintType,
  ContractStatus,
  CoverageType,
  CustomerAccountType,
  DeviceStatus,
  EvidenceType,
  FreeServiceRuleVersionStatus,
  FreeServiceVisitPeriod,
  IntegrationType,
  InvoiceStatus,
  JobQueueName,
  JobStatus,
  NotificationChannel,
  NotificationStatus,
  PaymentMethod,
  PaymentStatus,
  Portal,
  QuotationStatus,
  SimStatus,
  TenantRole,
  TenantStatus,
  TicketPriority,
  TicketSource,
  TicketStatus,
  WarrantyStatus,
  WarrantyType,
  WorkOrderStatus,
} from "./enums.js";

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  plan: string;
  settings: TenantSettings;
  created_at: string;
  updated_at: string;
}

export interface TenantSettings {
  branding?: { logoUrl?: string; primaryColor?: string; accentColor?: string };
  numbering?: { prefix: string; ticketStartSeq?: number; workOrderStartSeq?: number };
  timezone: string;
  defaultLanguage: string;
  currency: string;
  slaDefaults?: { responseHours: number; resolutionHours: number };
  reopenWindowDays?: number;
  quotationTtlHours?: number;
}

export interface TenantUser {
  id: string;
  tenant_id: string;
  auth_user_id: string;
  full_name: string;
  role: TenantRole;
  is_active: boolean;
  mfa_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerAccount {
  id: string;
  tenant_id: string;
  account_type: CustomerAccountType;
  name: string;
  email: string;
  phone?: string | null;
  auth_user_id?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerSite {
  id: string;
  tenant_id: string;
  customer_account_id: string;
  name: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  region?: string | null;
  country: string;
  postal_code?: string | null;
  coordinates?: { lat: number; lng: number } | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  tenant_id: string;
  customer_account_id: string;
  customer_site_id?: string | null;
  category: string;
  make: string;
  model: string;
  serial_number?: string | null;
  purchase_date?: string | null;
  installation_date?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Device {
  id: string;
  tenant_id: string;
  asset_id: string;
  device_type: string;
  manufacturer?: string | null;
  model?: string | null;
  firmware_version?: string | null;
  mac_address?: string | null;
  imei?: string | null;
  status: DeviceStatus;
  installed_at: string;
  created_at: string;
  updated_at: string;
}

export interface SimCard {
  id: string;
  tenant_id: string;
  device_id?: string | null;
  iccid: string;
  msisdn?: string | null;
  carrier?: string | null;
  data_plan?: string | null;
  status: SimStatus;
  activated_at?: string | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Warranty {
  id: string;
  tenant_id: string;
  asset_id: string;
  warranty_type: WarrantyType;
  provider: string;
  reference_number?: string | null;
  starts_at: string;
  expires_at: string;
  covers_parts: boolean;
  covers_labour: boolean;
  terms_document_url?: string | null;
  status: WarrantyStatus;
  created_at: string;
  updated_at: string;
}

export interface Contract {
  id: string;
  tenant_id: string;
  customer_account_id: string;
  contract_number: string;
  name: string;
  covers_categories: string[];
  includes_parts: boolean;
  includes_labour: boolean;
  free_visits_per_year?: number | null;
  starts_at: string;
  expires_at: string;
  status: ContractStatus;
  document_url?: string | null;
  terms: Record<string, unknown>;
  monthly_fee?: number | null;
  currency?: string | null;
  signed_at?: string | null;
  signed_by_customer_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ticket {
  id: string;
  tenant_id: string;
  ticket_number: string;
  customer_account_id: string;
  customer_site_id?: string | null;
  /** Nullable: platform/non-asset tickets may have no asset */
  asset_id?: string | null;
  status: TicketStatus;
  category: string;
  description: string;
  priority: TicketPriority;
  coverage_type: CoverageType;
  warranty_id?: string | null;
  contract_id?: string | null;
  source: TicketSource;
  created_by: string;
  assigned_dispatcher_id?: string | null;
  sla_response_deadline?: string | null;
  sla_resolution_deadline?: string | null;
  sla_paused_at?: string | null;
  sla_paused_duration_seconds: number;
  ambiguous_coverage: boolean;
  resolved_at?: string | null;
  closed_at?: string | null;
  reopen_window_expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketHistory {
  id: string;
  tenant_id: string;
  ticket_id: string;
  from_status?: string | null;
  to_status: string;
  actor_id: string;
  actor_role: string;
  comment?: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
}

export interface WorkOrder {
  id: string;
  tenant_id: string;
  work_order_number: string;
  ticket_id: string;
  technician_id: string;
  status: WorkOrderStatus;
  scheduled_date: string;
  scheduled_window_start: string;
  scheduled_window_end: string;
  checkin_time?: string | null;
  checkout_time?: string | null;
  work_description?: string | null;
  parts_used: PartUsed[];
  labour_minutes?: number | null;
  customer_signature_url?: string | null;
  is_billable: boolean;
  created_at: string;
  updated_at: string;
}

export interface PartUsed {
  part_code?: string;
  description: string;
  qty: number;
  unit_cost: number;
}

export interface Technician {
  id: string;
  tenant_id: string;
  auth_user_id: string;
  employee_id?: string | null;
  full_name: string;
  email: string;
  phone?: string | null;
  skill_codes: string[];
  home_zone_postcode?: string | null;
  is_active: boolean;
  hire_date?: string | null;
  avg_rating?: number | null;
  created_at: string;
  updated_at: string;
}

export interface AssignmentHistory {
  id: string;
  tenant_id: string;
  work_order_id: string;
  technician_id: string;
  assigned_by: string;
  assigned_at: string;
  unassigned_at?: string | null;
  reason?: string | null;
}

export interface Evidence {
  id: string;
  tenant_id: string;
  work_order_id: string;
  uploaded_by: string;
  evidence_type: EvidenceType;
  storage_path: string;
  file_name: string;
  file_size_bytes?: number | null;
  mime_type?: string | null;
  caption?: string | null;
  is_customer_visible: boolean;
  taken_at?: string | null;
  uploaded_at: string;
}

export interface QuotationLineItem {
  description: string;
  qty: number;
  unit_price: number;
  total: number;
}

export interface Quotation {
  id: string;
  tenant_id: string;
  quotation_number: string;
  ticket_id: string;
  status: QuotationStatus;
  line_items: QuotationLineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  valid_until: string;
  sent_at?: string | null;
  customer_approved_at?: string | null;
  customer_rejected_at?: string | null;
  approved_by_customer_id?: string | null;
  notes?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  quotation_id?: string | null;
  ticket_id: string;
  customer_account_id: string;
  status: InvoiceStatus;
  total_amount: number;
  amount_paid: number;
  currency: string;
  due_date?: string | null;
  issued_at: string;
  paid_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  tenant_id: string;
  invoice_id: string;
  method: PaymentMethod;
  amount: number;
  currency: string;
  gateway_reference?: string | null;
  collected_by?: string | null;
  status: PaymentStatus;
  recorded_at: string;
  confirmed_at?: string | null;
  created_at: string;
}

export interface Complaint {
  id: string;
  tenant_id: string;
  complaint_number: string;
  customer_account_id: string;
  ticket_id?: string | null;
  work_order_id?: string | null;
  type: ComplaintType;
  description: string;
  status: ComplaintStatus;
  assigned_to?: string | null;
  resolution_notes?: string | null;
  created_by: string;
  source: ComplaintSource;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Integration {
  id: string;
  tenant_id: string;
  type: IntegrationType;
  name: string;
  adapter: string;
  /** config credentials are NEVER returned in API responses */
  config: Record<string, unknown>;
  is_active: boolean;
  last_sync_at?: string | null;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  tenant_id: string;
  recipient_id: string;
  channel: NotificationChannel;
  event_type: string;
  status: NotificationStatus;
  subject?: string | null;
  body?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AuditLog {
  id: string;
  tenant_id?: string | null;
  actor_id: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  occurred_at: string;
}

// ─── Free-Service Rule ────────────────────────────────────────────────────────

export interface FreeServiceRuleExclusion {
  type: "prior_complaint_within_days" | "asset_age_exceeds_years" | string;
  value: number;
}

export interface FreeServiceRuleCondition {
  type: "within_days_of_installation" | "first_service_only" | string;
  value?: number;
}

export interface FreeServiceRuleVersion {
  id: string;
  rule_id: string;
  tenant_id: string;
  version_number: number;
  eligible_account_types: CustomerAccountType[];
  eligible_account_ids?: string[] | null;
  eligible_asset_categories?: string[] | null;
  eligible_device_categories?: string[] | null;
  eligible_service_categories?: string[] | null;
  effective_from: string;
  effective_until?: string | null;
  max_visits_per_asset?: number | null;
  visit_period?: FreeServiceVisitPeriod | null;
  covers_labour: boolean;
  covers_parts: boolean;
  covers_travel_charge: boolean;
  requires_approval: boolean;
  approver_role?: string | null;
  approver_user_id?: string | null;
  exclusions: FreeServiceRuleExclusion[];
  conditions: FreeServiceRuleCondition[];
  status: FreeServiceRuleVersionStatus;
  authored_by: string;
  approved_by?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
  change_summary?: string | null;
  created_at: string;
}

export interface FreeServiceRule {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  is_enabled: boolean;
  priority: number;
  current_version_id?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface FreeServiceEligibilityDecision {
  id: string;
  tenant_id: string;
  ticket_id: string;
  rule_id?: string | null;
  rule_version_id?: string | null;
  is_eligible: boolean;
  explanation: string;
  requires_approval: boolean;
  approved_by?: string | null;
  approved_at?: string | null;
  approval_notes?: string | null;
  evaluated_at: string;
}

// ─── Bulk Service Request ─────────────────────────────────────────────────────

export interface BulkServiceRequest {
  id: string;
  tenant_id: string;
  batch_number: string;
  name: string;
  description?: string | null;
  source: BulkRequestSource;
  status: BulkRequestStatus;
  total_items: number;
  created_items: number;
  failed_items: number;
  default_category?: string | null;
  default_priority: TicketPriority;
  created_by: string;
  created_by_role: string;
  original_filename?: string | null;
  storage_path?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BulkServiceRequestItem {
  id: string;
  tenant_id: string;
  bulk_request_id: string;
  row_number: number;
  asset_id?: string | null;
  asset_serial_number?: string | null;
  customer_account_id?: string | null;
  customer_site_id?: string | null;
  category?: string | null;
  description?: string | null;
  priority?: TicketPriority | null;
  status: BulkRequestItemStatus;
  ticket_id?: string | null;
  error_message?: string | null;
  processed_at?: string | null;
  created_at: string;
}

// ─── JWT Claims ───────────────────────────────────────────────────────────────

export interface JwtAppMetadata {
  tenant_id?: string;
  role: AnyRole;
  portal: Portal;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  app_metadata: JwtAppMetadata;
  user_metadata: { full_name?: string };
}

// ─── Background Job / Outbox ──────────────────────────────────────────────────

export interface OutboxJob {
  id: string;
  tenant_id: string;
  queue_name: JobQueueName;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_at: string;
  locked_at?: string | null;
  locked_by?: string | null;
  lease_expires_at?: string | null;
  error_message?: string | null;
  idempotency_key?: string | null;
  created_at: string;
  updated_at: string;
}
