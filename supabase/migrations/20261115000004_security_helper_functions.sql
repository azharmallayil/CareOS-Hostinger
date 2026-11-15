-- Migration: 20261115000004_security_helper_functions.sql
-- Description: Private schema authorization helpers for RLS and business logic, preventing recursion.
-- Reversible:
--   DROP FUNCTION IF EXISTS app_private.log_audit_event(UUID, TEXT, TEXT, UUID, JSONB, JSONB);
--   DROP FUNCTION IF EXISTS app_private.can_access_portal(UUID, TEXT);
--   DROP FUNCTION IF EXISTS app_private.has_permission(UUID, TEXT, TEXT);
--   DROP FUNCTION IF EXISTS app_private.is_tenant_admin(UUID);
--   DROP FUNCTION IF EXISTS app_private.has_role(UUID, TEXT);
--   DROP FUNCTION IF EXISTS app_private.get_user_tenants();
--   DROP FUNCTION IF EXISTS app_private.has_active_membership(UUID);
--   DROP FUNCTION IF EXISTS app_private.is_platform_admin();
--   DROP FUNCTION IF EXISTS app_private.current_user_id();

-- 1. Get current authenticated user ID
CREATE OR REPLACE FUNCTION app_private.current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT auth.uid();
$$;

-- 2. Check if current user is SaaS Platform Admin
CREATE OR REPLACE FUNCTION app_private.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app_private, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE user_id = auth.uid()
  );
END;
$$;

-- 3. Check if user has an active membership in the target tenant
CREATE OR REPLACE FUNCTION app_private.has_active_membership(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app_private, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_tenant_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.tenant_memberships
    WHERE tenant_id = p_tenant_id
      AND user_id = auth.uid()
      AND is_active = true
  );
END;
$$;

-- 4. Get all active tenant IDs for the current user
CREATE OR REPLACE FUNCTION app_private.get_user_tenants()
RETURNS TABLE (tenant_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app_private, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT tm.tenant_id
    FROM public.tenant_memberships tm
    WHERE tm.user_id = auth.uid()
      AND tm.is_active = true;
END;
$$;

-- 5. Check if user holds a specific role in tenant
CREATE OR REPLACE FUNCTION app_private.has_role(p_tenant_id UUID, p_role_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app_private, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_tenant_id IS NULL OR p_role_name IS NULL THEN
    RETURN false;
  END IF;

  IF app_private.is_platform_admin() THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN public.membership_roles mr
      ON mr.membership_id = tm.id AND mr.tenant_id = tm.tenant_id
    JOIN public.roles r
      ON r.id = mr.role_id AND r.tenant_id = tm.tenant_id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.is_active = true
      AND r.is_active = true
      AND r.name = p_role_name
  );
END;
$$;

-- 6. Check if user is tenant admin or tenant manager
CREATE OR REPLACE FUNCTION app_private.is_tenant_admin(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app_private, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_tenant_id IS NULL THEN
    RETURN false;
  END IF;

  IF app_private.is_platform_admin() THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN public.membership_roles mr
      ON mr.membership_id = tm.id AND mr.tenant_id = tm.tenant_id
    JOIN public.roles r
      ON r.id = mr.role_id AND r.tenant_id = tm.tenant_id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.is_active = true
      AND r.is_active = true
      AND r.name IN ('tenant_admin', 'tenant_manager')
  );
END;
$$;

-- 7. Check if user has specific action/resource permission in tenant
CREATE OR REPLACE FUNCTION app_private.has_permission(
  p_tenant_id UUID,
  p_action TEXT,
  p_resource TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app_private, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_tenant_id IS NULL OR p_action IS NULL OR p_resource IS NULL THEN
    RETURN false;
  END IF;

  IF app_private.is_platform_admin() OR app_private.is_tenant_admin(p_tenant_id) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN public.membership_roles mr
      ON mr.membership_id = tm.id AND mr.tenant_id = tm.tenant_id
    JOIN public.roles r
      ON r.id = mr.role_id AND r.tenant_id = tm.tenant_id
    JOIN public.role_permissions rp
      ON rp.role_id = r.id AND rp.tenant_id = tm.tenant_id
    JOIN public.permissions p
      ON p.id = rp.permission_id AND p.tenant_id = tm.tenant_id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.is_active = true
      AND r.is_active = true
      AND (p.action = p_action OR p.action = 'manage')
      AND (p.resource = p_resource OR p.resource = 'all')
  );
END;
$$;

-- 8. Check if user has active membership for specific portal
CREATE OR REPLACE FUNCTION app_private.can_access_portal(p_tenant_id UUID, p_portal TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app_private, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_tenant_id IS NULL OR p_portal IS NULL THEN
    RETURN false;
  END IF;

  IF app_private.is_platform_admin() THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.tenant_memberships
    WHERE tenant_id = p_tenant_id
      AND user_id = auth.uid()
      AND portal = p_portal
      AND is_active = true
  );
END;
$$;

-- 9. Secure audit logging helper
CREATE OR REPLACE FUNCTION app_private.log_audit_event(
  p_tenant_id UUID,
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id UUID DEFAULT NULL,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app_private, public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    action,
    resource_type,
    resource_id,
    old_data,
    new_data
  )
  VALUES (
    p_tenant_id,
    auth.uid(),
    p_action,
    p_resource_type,
    p_resource_id,
    p_old_data,
    p_new_data
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- Restrict permissions
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM anon;
GRANT EXECUTE ON FUNCTION app_private.current_user_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_platform_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.has_active_membership(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.get_user_tenants() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.has_role(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_tenant_admin(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.has_permission(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_access_portal(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.log_audit_event(UUID, TEXT, TEXT, UUID, JSONB, JSONB) TO authenticated, service_role;
