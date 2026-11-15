import type { TicketStatus } from "@careos/shared-types";

// ─── Allowed ticket status transitions ───────────────────────────────────────
// Matrix: fromState → Set of valid toStates

const TRANSITION_MAP: Record<TicketStatus, Set<TicketStatus>> = {
  draft: new Set(["open"]),
  open: new Set(["triaged", "closed"]),
  triaged: new Set(["scheduled", "awaiting_customer", "closed"]),
  scheduled: new Set(["in_progress", "awaiting_customer", "awaiting_parts"]),
  in_progress: new Set(["awaiting_customer", "awaiting_parts", "awaiting_payment", "resolved"]),
  awaiting_customer: new Set(["triaged", "in_progress", "closed"]),
  awaiting_parts: new Set(["scheduled", "closed"]),
  awaiting_payment: new Set(["resolved", "closed"]),
  resolved: new Set(["reopened"]),
  closed: new Set(["open"]), // admin-only re-open
  reopened: new Set(["scheduled", "closed"]),
};

/**
 * Returns true if transitioning from `from` to `to` is a valid state machine move.
 */
export function isValidTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TRANSITION_MAP[from]?.has(to) ?? false;
}

// ─── Role-gated transitions ───────────────────────────────────────────────────
// Which roles may trigger each specific transition.

type TransitionKey = `${TicketStatus}->${TicketStatus}`;

const ROLE_ALLOWED_TRANSITIONS: Partial<Record<TransitionKey, Set<string>>> = {
  "draft->open": new Set(["customer_individual", "customer_account_admin", "customer_account_member"]),
  "open->triaged": new Set(["tenant_admin", "tenant_manager", "dispatcher", "csr"]),
  "open->closed": new Set(["tenant_admin", "tenant_manager", "dispatcher", "csr", "customer_individual", "customer_account_admin", "customer_account_member"]),
  "triaged->scheduled": new Set(["tenant_admin", "tenant_manager", "dispatcher"]),
  "triaged->awaiting_customer": new Set(["tenant_admin", "tenant_manager", "dispatcher", "csr"]),
  "triaged->closed": new Set(["tenant_admin", "tenant_manager", "dispatcher", "csr"]),
  "scheduled->in_progress": new Set(["tenant_admin", "tenant_manager", "dispatcher", "technician", "senior_technician"]),
  "scheduled->awaiting_customer": new Set(["tenant_admin", "tenant_manager", "dispatcher", "technician", "senior_technician"]),
  "scheduled->awaiting_parts": new Set(["tenant_admin", "tenant_manager", "dispatcher", "technician", "senior_technician"]),
  "in_progress->awaiting_customer": new Set(["tenant_admin", "tenant_manager", "dispatcher", "technician", "senior_technician"]),
  "in_progress->awaiting_parts": new Set(["tenant_admin", "tenant_manager", "dispatcher", "technician", "senior_technician"]),
  "in_progress->awaiting_payment": new Set(["tenant_admin", "tenant_manager", "dispatcher", "technician", "senior_technician"]),
  "in_progress->resolved": new Set(["tenant_admin", "tenant_manager", "dispatcher", "technician", "senior_technician"]),
  "awaiting_customer->triaged": new Set(["tenant_admin", "tenant_manager", "dispatcher", "csr"]),
  "awaiting_customer->in_progress": new Set(["tenant_admin", "tenant_manager", "dispatcher", "customer_individual", "customer_account_admin", "customer_account_member"]),
  "awaiting_customer->closed": new Set(["tenant_admin", "tenant_manager", "dispatcher", "csr", "customer_individual", "customer_account_admin", "customer_account_member"]),
  "awaiting_parts->scheduled": new Set(["tenant_admin", "tenant_manager", "dispatcher"]),
  "awaiting_parts->closed": new Set(["tenant_admin", "tenant_manager", "dispatcher"]),
  "awaiting_payment->resolved": new Set(["tenant_admin", "tenant_manager", "dispatcher", "technician", "senior_technician", "customer_individual", "customer_account_admin", "customer_account_member"]),
  "awaiting_payment->closed": new Set(["tenant_admin", "tenant_manager"]),
  "resolved->reopened": new Set(["tenant_admin", "tenant_manager", "dispatcher", "csr", "customer_individual", "customer_account_admin", "customer_account_member"]),
  "closed->open": new Set(["tenant_admin"]), // admin force re-open only
  "reopened->scheduled": new Set(["tenant_admin", "tenant_manager", "dispatcher"]),
  "reopened->closed": new Set(["tenant_admin", "tenant_manager", "dispatcher", "csr"]),
};

/**
 * Returns true if the given role may trigger the specified ticket status transition.
 * Also validates that the transition itself is valid per the state machine.
 */
export function canTransition(
  role: string,
  from: TicketStatus,
  to: TicketStatus
): boolean {
  if (!isValidTransition(from, to)) return false;
  const key: TransitionKey = `${from}->${to}`;
  return ROLE_ALLOWED_TRANSITIONS[key]?.has(role) ?? false;
}
