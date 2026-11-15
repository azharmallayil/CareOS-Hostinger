-- Migration: 20261115000005_grants_and_rls_policies.sql
-- Description: Explicit grants and comprehensive Row Level Security (RLS) policies for all foundation tables.
-- Reversible:
--   DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
--   DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
--   DROP POLICY IF EXISTS platform_admins_select ON platform_admins;
--   DROP POLICY IF EXISTS tenant_invitations_delete ON tenant_invitations;
--   DROP POLICY IF EXISTS tenant_invitations_update ON tenant_invitations;
--   DROP POLICY IF EXISTS tenant_invitations_insert ON tenant_invitations;
--   DROP POLICY IF EXISTS tenant_invitations_select ON tenant_invitations;
--   DROP POLICY IF EXISTS membership_roles_delete ON membership_roles;
--   DROP POLICY IF EXISTS membership_roles_update ON membership_roles;
--   DROP POLICY IF EXISTS membership_roles_insert ON membership_roles;
--   DROP POLICY IF EXISTS membership_roles_select ON membership_roles;
--   DROP POLICY IF EXISTS tenant_memberships_delete ON tenant_memberships;
--   DROP POLICY IF EXISTS tenant_memberships_update ON tenant_memberships;
--   DROP POLICY IF EXISTS tenant_memberships_insert ON tenant_memberships;
--   DROP POLICY IF EXISTS tenant_memberships_select ON tenant_memberships;
--   DROP POLICY IF EXISTS role_permissions_delete ON role_permissions;
--   DROP POLICY IF EXISTS role_permissions_insert ON role_permissions;
--   DROP POLICY IF EXISTS role_permissions_select ON role_permissions;
--   DROP POLICY IF EXISTS permissions_delete ON permissions;
--   DROP POLICY IF EXISTS permissions_update ON permissions;
--   DROP POLICY IF EXISTS permissions_insert ON permissions;
--   DROP POLICY IF EXISTS permissions_select ON permissions;
--   DROP POLICY IF EXISTS roles_delete ON roles;
--   DROP POLICY IF EXISTS roles_update ON roles;
--   DROP POLICY IF EXISTS roles_insert ON roles;
--   DROP POLICY IF EXISTS roles_select ON roles;
--   DROP POLICY IF EXISTS departments_delete ON departments;
--   DROP POLICY IF EXISTS departments_update ON departments;
--   DROP POLICY IF EXISTS departments_insert ON departments;
--   DROP POLICY IF EXISTS departments_select ON departments;
--   DROP POLICY IF EXISTS profiles_delete ON profiles;
--   DROP POLICY IF EXISTS profiles_update ON profiles;
--   DROP POLICY IF EXISTS profiles_insert ON profiles;
--   DROP POLICY IF EXISTS profiles_select ON profiles;
--   DROP POLICY IF EXISTS tenant_settings_delete ON tenant_settings;
--   DROP POLICY IF EXISTS tenant_settings_update ON tenant_settings;
--   DROP POLICY IF EXISTS tenant_settings_insert ON tenant_settings;
--   DROP POLICY IF EXISTS tenant_settings_select ON tenant_settings;
--   DROP POLICY IF EXISTS tenants_delete ON tenants;
--   DROP POLICY IF EXISTS tenants_update ON tenants;
--   DROP POLICY IF EXISTS tenants_insert ON tenants;
--   DROP POLICY IF EXISTS tenants_select ON tenants;

-- 1. Enable RLS on every foundation table
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. Explicit Table Permissions
-- Anonymous: revoke all access to foundation tables
REVOKE ALL ON tenants FROM anon;
REVOKE ALL ON tenant_settings FROM anon;
REVOKE ALL ON profiles FROM anon;
REVOKE ALL ON departments FROM anon;
REVOKE ALL ON roles FROM anon;
REVOKE ALL ON permissions FROM anon;
REVOKE ALL ON role_permissions FROM anon;
REVOKE ALL ON tenant_memberships FROM anon;
REVOKE ALL ON membership_roles FROM anon;
REVOKE ALL ON tenant_invitations FROM anon;
REVOKE ALL ON platform_admins FROM anon;
REVOKE ALL ON audit_logs FROM anon;

-- Authenticated: grants governed by RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON departments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON role_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON membership_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_invitations TO authenticated;
GRANT SELECT ON platform_admins TO authenticated;
GRANT SELECT, INSERT ON audit_logs TO authenticated;

-- Service Role: full access
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- =========================================================================
-- 3. RLS Policies
-- =========================================================================

-- --- 3.1 tenants ---
CREATE POLICY tenants_select ON tenants
  FOR SELECT
  USING (
    app_private.is_platform_admin()
    OR app_private.has_active_membership(id)
  );

CREATE POLICY tenants_insert ON tenants
  FOR INSERT
  WITH CHECK (
    app_private.is_platform_admin()
  );

CREATE POLICY tenants_update ON tenants
  FOR UPDATE
  USING (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(id)
  )
  WITH CHECK (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(id)
  );

CREATE POLICY tenants_delete ON tenants
  FOR DELETE
  USING (
    app_private.is_platform_admin()
  );

-- --- 3.2 tenant_settings ---
CREATE POLICY tenant_settings_select ON tenant_settings
  FOR SELECT
  USING (
    app_private.is_platform_admin()
    OR app_private.has_active_membership(tenant_id)
  );

CREATE POLICY tenant_settings_insert ON tenant_settings
  FOR INSERT
  WITH CHECK (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  );

CREATE POLICY tenant_settings_update ON tenant_settings
  FOR UPDATE
  USING (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  )
  WITH CHECK (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  );

CREATE POLICY tenant_settings_delete ON tenant_settings
  FOR DELETE
  USING (
    app_private.is_platform_admin()
  );

-- --- 3.3 profiles ---
CREATE POLICY profiles_select ON profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR app_private.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm_target
      WHERE tm_target.user_id = profiles.id
        AND tm_target.is_active = true
        AND tm_target.tenant_id IN (SELECT app_private.get_user_tenants())
    )
  );

CREATE POLICY profiles_insert ON profiles
  FOR INSERT
  WITH CHECK (
    id = auth.uid()
    OR app_private.is_platform_admin()
  );

CREATE POLICY profiles_update ON profiles
  FOR UPDATE
  USING (
    id = auth.uid()
    OR app_private.is_platform_admin()
  )
  WITH CHECK (
    id = auth.uid()
    OR app_private.is_platform_admin()
  );

CREATE POLICY profiles_delete ON profiles
  FOR DELETE
  USING (
    app_private.is_platform_admin()
  );

-- --- 3.4 departments ---
CREATE POLICY departments_select ON departments
  FOR SELECT
  USING (
    app_private.is_platform_admin()
    OR app_private.has_active_membership(tenant_id)
  );

CREATE POLICY departments_insert ON departments
  FOR INSERT
  WITH CHECK (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  );

CREATE POLICY departments_update ON departments
  FOR UPDATE
  USING (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  )
  WITH CHECK (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  );

CREATE POLICY departments_delete ON departments
  FOR DELETE
  USING (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  );

-- --- 3.5 roles ---
CREATE POLICY roles_select ON roles
  FOR SELECT
  USING (
    app_private.is_platform_admin()
    OR app_private.has_active_membership(tenant_id)
  );

CREATE POLICY roles_insert ON roles
  FOR INSERT
  WITH CHECK (
    app_private.is_platform_admin()
    OR (app_private.is_tenant_admin(tenant_id) AND is_system_role = false)
  );

CREATE POLICY roles_update ON roles
  FOR UPDATE
  USING (
    app_private.is_platform_admin()
    OR (app_private.is_tenant_admin(tenant_id) AND is_system_role = false)
  )
  WITH CHECK (
    app_private.is_platform_admin()
    OR (app_private.is_tenant_admin(tenant_id) AND is_system_role = false)
  );

CREATE POLICY roles_delete ON roles
  FOR DELETE
  USING (
    app_private.is_platform_admin()
    OR (app_private.is_tenant_admin(tenant_id) AND is_system_role = false)
  );

-- --- 3.6 permissions ---
CREATE POLICY permissions_select ON permissions
  FOR SELECT
  USING (
    app_private.is_platform_admin()
    OR app_private.has_active_membership(tenant_id)
  );

CREATE POLICY permissions_insert ON permissions
  FOR INSERT
  WITH CHECK (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  );

CREATE POLICY permissions_update ON permissions
  FOR UPDATE
  USING (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  )
  WITH CHECK (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  );

CREATE POLICY permissions_delete ON permissions
  FOR DELETE
  USING (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  );

-- --- 3.7 role_permissions ---
CREATE POLICY role_permissions_select ON role_permissions
  FOR SELECT
  USING (
    app_private.is_platform_admin()
    OR app_private.has_active_membership(tenant_id)
  );

CREATE POLICY role_permissions_insert ON role_permissions
  FOR INSERT
  WITH CHECK (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  );

CREATE POLICY role_permissions_delete ON role_permissions
  FOR DELETE
  USING (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  );

-- --- 3.8 tenant_memberships ---
CREATE POLICY tenant_memberships_select ON tenant_memberships
  FOR SELECT
  USING (
    app_private.is_platform_admin()
    OR user_id = auth.uid()
    OR app_private.is_tenant_admin(tenant_id)
  );

CREATE POLICY tenant_memberships_insert ON tenant_memberships
  FOR INSERT
  WITH CHECK (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  );

CREATE POLICY tenant_memberships_update ON tenant_memberships
  FOR UPDATE
  USING (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  )
  WITH CHECK (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  );

CREATE POLICY tenant_memberships_delete ON tenant_memberships
  FOR DELETE
  USING (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  );

-- --- 3.9 membership_roles ---
CREATE POLICY membership_roles_select ON membership_roles
  FOR SELECT
  USING (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.id = membership_roles.membership_id
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY membership_roles_insert ON membership_roles
  FOR INSERT
  WITH CHECK (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  );

CREATE POLICY membership_roles_update ON membership_roles
  FOR UPDATE
  USING (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  )
  WITH CHECK (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  );

CREATE POLICY membership_roles_delete ON membership_roles
  FOR DELETE
  USING (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  );

-- --- 3.10 tenant_invitations ---
CREATE POLICY tenant_invitations_select ON tenant_invitations
  FOR SELECT
  USING (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
    OR (email = (auth.jwt() ->> 'email'))
  );

CREATE POLICY tenant_invitations_insert ON tenant_invitations
  FOR INSERT
  WITH CHECK (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  );

CREATE POLICY tenant_invitations_update ON tenant_invitations
  FOR UPDATE
  USING (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  )
  WITH CHECK (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  );

CREATE POLICY tenant_invitations_delete ON tenant_invitations
  FOR DELETE
  USING (
    app_private.is_platform_admin()
    OR app_private.is_tenant_admin(tenant_id)
  );

-- --- 3.11 platform_admins ---
-- Strictly platform admins can inspect this table. No write policies for authenticated.
CREATE POLICY platform_admins_select ON platform_admins
  FOR SELECT
  USING (
    app_private.is_platform_admin()
  );

-- --- 3.12 audit_logs ---
-- Append-only log: SELECT for admins, INSERT for active members, NO UPDATE/DELETE.
CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT
  USING (
    app_private.is_platform_admin()
    OR (tenant_id IS NOT NULL AND app_private.is_tenant_admin(tenant_id))
  );

CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT
  WITH CHECK (
    app_private.is_platform_admin()
    OR (
      tenant_id IS NOT NULL
      AND app_private.has_active_membership(tenant_id)
      AND user_id = auth.uid()
    )
  );
