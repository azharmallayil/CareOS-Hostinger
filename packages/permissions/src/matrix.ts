// ─── Permission action catalogue ──────────────────────────────────────────────

export const PERMISSION_ACTIONS = [
  // Tenant management
  "tenant:read_settings",
  "tenant:update_settings",
  "tenant:manage_users",
  "tenant:manage_integrations",
  "tenant:manage_billing",

  // Customer management
  "customer:create",
  "customer:read",
  "customer:update",

  // Asset management
  "asset:create",
  "asset:read",
  "asset:update",
  "asset:manage_device",
  "asset:manage_sim",
  "asset:manage_warranty",

  // Contract management
  "contract:create",
  "contract:read",
  "contract:update",

  // Free-service rule management
  "free_service_rule:create",
  "free_service_rule:read",
  "free_service_rule:update",
  "free_service_rule:approve",

  // Ticket management
  "ticket:create",
  "ticket:read",
  "ticket:update",
  "ticket:transition_status",
  "ticket:assign_dispatcher",
  "ticket:read_internal_history",

  // Work order
  "work_order:create",
  "work_order:read",
  "work_order:update_status",
  "work_order:assign_technician",
  "work_order:reassign_technician",
  "work_order:upload_evidence",
  "work_order:read_evidence",

  // Quotation / billing
  "quotation:create",
  "quotation:read",
  "quotation:send",
  "quotation:approve",   // customer-side
  "quotation:reject",    // customer-side
  "invoice:read",
  "payment:record",
  "payment:read",

  // Complaint
  "complaint:create",
  "complaint:read",
  "complaint:update",
  "complaint:escalate",

  // Bulk service request
  "bulk_request:create",
  "bulk_request:read",

  // Notifications
  "notification:read_own",

  // Reports
  "report:read_operational",
  "report:read_financial",
  "report:read_dispatch",
  "report:read_customer",

  // Audit
  "audit_log:read",

  // Platform admin
  "platform:manage_tenants",
  "platform:view_tenants",
  "platform:impersonate",
  "platform:view_audit",
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

// ─── Role → Action grants ─────────────────────────────────────────────────────

type PermissionMatrix = Partial<Record<string, Set<PermissionAction>>>;

const ALL_TENANT_READ: PermissionAction[] = [
  "customer:read",
  "asset:read",
  "contract:read",
  "ticket:read",
  "work_order:read",
  "work_order:read_evidence",
  "quotation:read",
  "invoice:read",
  "payment:read",
  "complaint:read",
  "bulk_request:read",
  "notification:read_own",
  "free_service_rule:read",
];

export const PERMISSION_MATRIX: PermissionMatrix = {
  // ── Platform roles ───────────────────────────────────────────────────────
  platform_admin: new Set<PermissionAction>([
    "platform:manage_tenants",
    "platform:view_tenants",
    "platform:impersonate",
    "platform:view_audit",
    "audit_log:read",
  ]),

  platform_support: new Set<PermissionAction>([
    "platform:view_tenants",
    "platform:view_audit",
    "audit_log:read",
  ]),

  // ── Tenant ops roles ─────────────────────────────────────────────────────
  tenant_admin: new Set<PermissionAction>([
    ...ALL_TENANT_READ,
    "tenant:read_settings",
    "tenant:update_settings",
    "tenant:manage_users",
    "tenant:manage_integrations",
    "tenant:manage_billing",
    "customer:create",
    "customer:update",
    "asset:create",
    "asset:update",
    "asset:manage_device",
    "asset:manage_sim",
    "asset:manage_warranty",
    "contract:create",
    "contract:update",
    "free_service_rule:create",
    "free_service_rule:update",
    "free_service_rule:approve",
    "ticket:create",
    "ticket:update",
    "ticket:transition_status",
    "ticket:assign_dispatcher",
    "ticket:read_internal_history",
    "work_order:create",
    "work_order:update_status",
    "work_order:assign_technician",
    "work_order:reassign_technician",
    "work_order:upload_evidence",
    "quotation:create",
    "quotation:send",
    "payment:record",
    "complaint:create",
    "complaint:update",
    "complaint:escalate",
    "bulk_request:create",
    "report:read_operational",
    "report:read_financial",
    "report:read_dispatch",
    "report:read_customer",
    "audit_log:read",
  ]),

  tenant_manager: new Set<PermissionAction>([
    ...ALL_TENANT_READ,
    "tenant:read_settings",
    "customer:create",
    "customer:update",
    "asset:create",
    "asset:update",
    "asset:manage_device",
    "asset:manage_sim",
    "asset:manage_warranty",
    "contract:create",
    "contract:update",
    "free_service_rule:create",
    "free_service_rule:update",
    "free_service_rule:approve",
    "ticket:create",
    "ticket:update",
    "ticket:transition_status",
    "ticket:assign_dispatcher",
    "ticket:read_internal_history",
    "work_order:create",
    "work_order:update_status",
    "work_order:assign_technician",
    "work_order:reassign_technician",
    "work_order:upload_evidence",
    "quotation:create",
    "quotation:send",
    "payment:record",
    "complaint:create",
    "complaint:update",
    "complaint:escalate",
    "bulk_request:create",
    "report:read_operational",
    "report:read_financial",
    "report:read_dispatch",
    "report:read_customer",
    "audit_log:read",
  ]),

  dispatcher: new Set<PermissionAction>([
    ...ALL_TENANT_READ,
    "ticket:create",
    "ticket:update",
    "ticket:transition_status",
    "ticket:read_internal_history",
    "work_order:create",
    "work_order:update_status",
    "work_order:assign_technician",
    "work_order:reassign_technician",
    "work_order:upload_evidence",
    "report:read_dispatch",
    "report:read_operational",
  ]),

  csr: new Set<PermissionAction>([
    ...ALL_TENANT_READ,
    "customer:create",
    "customer:update",
    "ticket:create",
    "ticket:update",
    "ticket:transition_status",
    "ticket:read_internal_history",
    "complaint:create",
    "complaint:update",
    "complaint:escalate",
    "bulk_request:create",
    "report:read_customer",
    "report:read_operational",
  ]),

  billing_agent: new Set<PermissionAction>([
    ...ALL_TENANT_READ,
    "contract:create",
    "contract:update",
    "quotation:create",
    "quotation:send",
    "payment:record",
    "report:read_financial",
  ]),

  readonly_ops: new Set<PermissionAction>([
    ...ALL_TENANT_READ,
    "ticket:read_internal_history",
    "audit_log:read",
    "report:read_operational",
    "report:read_financial",
    "report:read_dispatch",
    "report:read_customer",
  ]),

  // ── Technician roles ─────────────────────────────────────────────────────
  technician: new Set<PermissionAction>([
    "ticket:read",
    "work_order:read",
    "work_order:update_status",
    "work_order:upload_evidence",
    "work_order:read_evidence",
    "payment:record",
    "notification:read_own",
  ]),

  senior_technician: new Set<PermissionAction>([
    "ticket:read",
    "work_order:read",
    "work_order:update_status",
    "work_order:upload_evidence",
    "work_order:read_evidence",
    "work_order:reassign_technician",
    "payment:record",
    "customer:read",
    "notification:read_own",
  ]),

  // ── Customer roles ───────────────────────────────────────────────────────
  customer_individual: new Set<PermissionAction>([
    "ticket:create",
    "ticket:read",
    "quotation:approve",
    "quotation:reject",
    "quotation:read",
    "invoice:read",
    "payment:read",
    "complaint:create",
    "complaint:read",
    "asset:read",
    "notification:read_own",
  ]),

  customer_account_admin: new Set<PermissionAction>([
    "ticket:create",
    "ticket:read",
    "quotation:approve",
    "quotation:reject",
    "quotation:read",
    "invoice:read",
    "payment:read",
    "complaint:create",
    "complaint:read",
    "asset:create",
    "asset:read",
    "contract:read",
    "notification:read_own",
  ]),

  customer_account_member: new Set<PermissionAction>([
    "ticket:create",
    "ticket:read",
    "quotation:approve",
    "quotation:reject",
    "quotation:read",
    "invoice:read",
    "payment:read",
    "complaint:create",
    "complaint:read",
    "asset:read",
    "notification:read_own",
  ]),
};

/**
 * Check whether the given role is granted the specified action.
 * This is the primary permission check used throughout the codebase.
 */
export function can(role: string, action: PermissionAction): boolean {
  return PERMISSION_MATRIX[role]?.has(action) ?? false;
}
