import type { Portal } from "@careos/shared-types";
import type { PermissionAction } from "@careos/permissions";

export type { Portal };

export interface CareOSUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
  preferredLanguage: string;
}

export interface CareOSMembership {
  id: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  portal: Portal;
  departmentId?: string | null;
  isActive: boolean;
  roles: string[];
  permissions: string[];
}

export interface CareOSAuthContext {
  user: CareOSUser;
  memberships: CareOSMembership[];
  activeMembership: CareOSMembership | null;
  activeTenantId: string | null;
  isPlatformAdmin: boolean;
}

export interface InvitationDetails {
  id: string;
  tenantId: string;
  tenantName: string;
  email: string;
  portal: Portal;
  roleId?: string | null;
  roleName?: string | null;
  token: string;
  expiresAt: string;
  isExpired: boolean;
  isAccepted: boolean;
  isRevoked: boolean;
}
