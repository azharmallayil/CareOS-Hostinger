import type { SupabaseClient } from "@supabase/supabase-js";
import type { Portal } from "@careos/shared-types";
import type { CareOSAuthContext, CareOSMembership, CareOSUser } from "./types.js";
import { resolveActiveMembership } from "./guards.js";

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string | null;
  preferred_language?: string | null;
}

interface MembershipRow {
  id: string;
  tenant_id: string;
  portal: string;
  department_id?: string | null;
  is_active: boolean;
  tenants: {
    id: string;
    slug: string;
    name: string;
  } | null;
  membership_roles: Array<{
    roles: {
      id: string;
      name: string;
      display_name: string;
      role_permissions: Array<{
        permissions: {
          action: string;
          resource: string;
        } | null;
      }> | null;
    } | null;
  }> | null;
}

/**
 * Resolves the full CareOSAuthContext for an authenticated Supabase user.
 */
export async function resolveAuthContext(
  client: SupabaseClient,
  userId: string,
  preferredTenantId?: string | null,
  preferredPortal?: Portal | null
): Promise<CareOSAuthContext | null> {
  // 1. Fetch user profile
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, full_name, email, avatar_url, preferred_language")
    .eq("id", userId)
    .single<ProfileRow>();

  if (profileError || !profile) {
    return null;
  }

  const user: CareOSUser = {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url ?? null,
    preferredLanguage: profile.preferred_language ?? "en",
  };

  // 2. Check if platform super admin
  const { data: adminRecord } = await client
    .from("platform_admins")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  const isPlatformAdmin = Boolean(adminRecord);

  // 3. Fetch all tenant memberships with roles and permissions
  const { data: membershipData, error: memError } = await client
    .from("tenant_memberships")
    .select(`
      id,
      tenant_id,
      portal,
      department_id,
      is_active,
      tenants (
        id,
        slug,
        name
      ),
      membership_roles (
        roles (
          id,
          name,
          display_name,
          role_permissions (
            permissions (
              action,
              resource
            )
          )
        )
      )
    `)
    .eq("user_id", userId);

  const memberships: CareOSMembership[] = [];

  if (!memError && Array.isArray(membershipData)) {
    for (const raw of membershipData as unknown as MembershipRow[]) {
      if (!raw.tenants) continue;

      const roles: string[] = [];
      const permissionsSet = new Set<string>();

      if (Array.isArray(raw.membership_roles)) {
        for (const mr of raw.membership_roles) {
          if (!mr.roles) continue;
          roles.push(mr.roles.name);

          if (Array.isArray(mr.roles.role_permissions)) {
            for (const rp of mr.roles.role_permissions) {
              if (rp.permissions) {
                permissionsSet.add(
                  `${rp.permissions.resource}:${rp.permissions.action}`
                );
                // Also add direct action for matrix compatibility
                permissionsSet.add(rp.permissions.action);
              }
            }
          }
        }
      }

      memberships.push({
        id: raw.id,
        tenantId: raw.tenant_id,
        tenantSlug: raw.tenants.slug,
        tenantName: raw.tenants.name,
        portal: raw.portal as Portal,
        departmentId: raw.department_id ?? null,
        isActive: raw.is_active,
        roles,
        permissions: Array.from(permissionsSet),
      });
    }
  }

  const activeMembership = resolveActiveMembership(
    memberships,
    preferredTenantId,
    preferredPortal
  );

  return {
    user,
    memberships,
    activeMembership,
    activeTenantId: activeMembership?.tenantId ?? null,
    isPlatformAdmin,
  };
}
