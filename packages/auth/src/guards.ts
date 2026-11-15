import type { Portal } from "@careos/shared-types";
import { can, type PermissionAction } from "@careos/permissions";
import type { CareOSAuthContext, CareOSMembership } from "./types.js";

/**
 * Checks if the user is authorized to enter the specified portal.
 * Rules:
 *  - 'admin' portal is strictly accessible to verified Platform Super Admins.
 *  - Tenant portals ('operations', 'technician', 'customer') require an active membership
 *    matching that specific portal in the currently selected tenant.
 */
export function canAccessPortal(
  auth: CareOSAuthContext | null | undefined,
  targetPortal: Portal
): boolean {
  if (!auth) {
    return false;
  }

  if (targetPortal === "admin") {
    return auth.isPlatformAdmin;
  }

  // If there's an active tenant membership selected, check if it matches the portal and is active
  if (auth.activeMembership) {
    return (
      auth.activeMembership.isActive &&
      auth.activeMembership.portal === targetPortal
    );
  }

  // Fallback: check if the user has any active membership for this portal in any tenant
  return auth.memberships.some(
    (m) => m.isActive && m.portal === targetPortal
  );
}

/**
 * Checks whether the user is permitted to switch to targetTenantId.
 * Allowed ONLY if the user has an active membership in that tenant or is platform admin.
 */
export function canSwitchTenant(
  auth: CareOSAuthContext | null | undefined,
  targetTenantId: string
): boolean {
  if (!auth) {
    return false;
  }

  if (auth.isPlatformAdmin) {
    return true;
  }

  return auth.memberships.some(
    (m) => m.tenantId === targetTenantId && m.isActive
  );
}

/**
 * Checks whether the user has a specific permission in their active tenant context.
 */
export function hasPermission(
  auth: CareOSAuthContext | null | undefined,
  action: PermissionAction
): boolean {
  if (!auth) {
    return false;
  }

  if (auth.isPlatformAdmin) {
    return true;
  }

  if (!auth.activeMembership || !auth.activeMembership.isActive) {
    return false;
  }

  // 1. Direct permission check from permissions list
  if (auth.activeMembership.permissions.includes(action)) {
    return true;
  }

  // 2. Role-based check via permission matrix
  return auth.activeMembership.roles.some((role) => can(role, action));
}

/**
 * Checks whether the user holds a specific role in their active tenant context.
 */
export function hasRole(
  auth: CareOSAuthContext | null | undefined,
  roleName: string
): boolean {
  if (!auth) {
    return false;
  }

  if (auth.isPlatformAdmin) {
    return true;
  }

  if (!auth.activeMembership || !auth.activeMembership.isActive) {
    return false;
  }

  return auth.activeMembership.roles.includes(roleName);
}

/**
 * Selects the active membership for a given targetTenantId and targetPortal.
 */
export function resolveActiveMembership(
  memberships: CareOSMembership[],
  targetTenantId?: string | null,
  targetPortal?: Portal | null
): CareOSMembership | null {
  const activeOnly = memberships.filter((m) => m.isActive);
  if (activeOnly.length === 0) {
    return null;
  }

  // 1. Match both tenant and portal if provided
  if (targetTenantId && targetPortal) {
    const match = activeOnly.find(
      (m) => m.tenantId === targetTenantId && m.portal === targetPortal
    );
    if (match) return match;
  }

  // 2. Match tenant
  if (targetTenantId) {
    const match = activeOnly.find((m) => m.tenantId === targetTenantId);
    if (match) return match;
  }

  // 3. Match portal
  if (targetPortal) {
    const match = activeOnly.find((m) => m.portal === targetPortal);
    if (match) return match;
  }

  // 4. Fallback to first active
  return activeOnly[0] ?? null;
}
