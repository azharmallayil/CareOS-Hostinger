-- Migration: 20261115000006_system_roles_and_defaults.sql
-- Description: Automatic tenant bootstrap trigger: creates tenant_settings and standard system roles/permissions.
-- Reversible:
--   DROP TRIGGER IF EXISTS on_tenant_created ON tenants;
--   DROP FUNCTION IF EXISTS app_private.handle_new_tenant_bootstrap();

CREATE OR REPLACE FUNCTION app_private.handle_new_tenant_bootstrap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app_private, public
AS $$
DECLARE
  v_admin_role_id UUID;
  v_mgr_role_id UUID;
  v_disp_role_id UUID;
  v_csr_role_id UUID;
  v_billing_role_id UUID;
  v_readonly_role_id UUID;
  v_tech_role_id UUID;
  v_cust_role_id UUID;

  v_perm_manage_all UUID;
  v_perm_manage_tickets UUID;
  v_perm_read_tickets UUID;
  v_perm_manage_orders UUID;
  v_perm_read_orders UUID;
  v_perm_manage_assets UUID;
  v_perm_read_assets UUID;
  v_perm_manage_quotes UUID;
  v_perm_read_all UUID;
BEGIN
  -- 1. Create tenant_settings with default branding and timezone if not already existing
  INSERT INTO public.tenant_settings (
    tenant_id,
    branding,
    feature_flags,
    notification_config
  )
  VALUES (
    NEW.id,
    '{"primaryColor": "#2563EB", "accentColor": "#0EA5E9", "timezone": "Asia/Riyadh", "currency": "SAR"}'::jsonb,
    '{"telematicsEnabled": true, "aiAssistEnabled": true, "smsEnabled": true}'::jsonb,
    '{"emailNotifications": true, "smsNotifications": true}'::jsonb
  )
  ON CONFLICT (tenant_id) DO NOTHING;

  -- 2. Create Default Operations Department
  INSERT INTO public.departments (
    tenant_id,
    name,
    description
  )
  VALUES (
    NEW.id,
    'Operations',
    'Primary fleet operations and field service department'
  )
  ON CONFLICT (tenant_id, name) DO NOTHING;

  -- 3. Seed System Roles
  INSERT INTO public.roles (tenant_id, name, display_name, description, is_system_role)
  VALUES
    (NEW.id, 'tenant_admin', 'Tenant Administrator', 'Full management access across the tenant organization', true)
  RETURNING id INTO v_admin_role_id;

  INSERT INTO public.roles (tenant_id, name, display_name, description, is_system_role)
  VALUES
    (NEW.id, 'tenant_manager', 'Operations Manager', 'Supervises fleet operations, dispatch, and customer service', true)
  RETURNING id INTO v_mgr_role_id;

  INSERT INTO public.roles (tenant_id, name, display_name, description, is_system_role)
  VALUES
    (NEW.id, 'dispatcher', 'Dispatcher', 'Dispatches field technicians and coordinates work orders', true)
  RETURNING id INTO v_disp_role_id;

  INSERT INTO public.roles (tenant_id, name, display_name, description, is_system_role)
  VALUES
    (NEW.id, 'csr', 'Customer Service Representative', 'Handles inbound tickets, triage, and customer communications', true)
  RETURNING id INTO v_csr_role_id;

  INSERT INTO public.roles (tenant_id, name, display_name, description, is_system_role)
  VALUES
    (NEW.id, 'billing_agent', 'Billing Agent', 'Manages quotations, invoices, and payment verifications', true)
  RETURNING id INTO v_billing_role_id;

  INSERT INTO public.roles (tenant_id, name, display_name, description, is_system_role)
  VALUES
    (NEW.id, 'readonly_ops', 'Read-Only Viewer', 'Read-only visibility for auditing and monitoring', true)
  RETURNING id INTO v_readonly_role_id;

  INSERT INTO public.roles (tenant_id, name, display_name, description, is_system_role)
  VALUES
    (NEW.id, 'technician', 'Field Technician', 'Technician portal access to assigned work orders and evidence', true)
  RETURNING id INTO v_tech_role_id;

  INSERT INTO public.roles (tenant_id, name, display_name, description, is_system_role)
  VALUES
    (NEW.id, 'customer_user', 'Customer Portal User', 'Customer portal access to own assets and tickets', true)
  RETURNING id INTO v_cust_role_id;

  -- 4. Seed Standard Permissions
  INSERT INTO public.permissions (tenant_id, action, resource)
  VALUES (NEW.id, 'manage', 'all')
  RETURNING id INTO v_perm_manage_all;

  INSERT INTO public.permissions (tenant_id, action, resource)
  VALUES (NEW.id, 'manage', 'tickets')
  RETURNING id INTO v_perm_manage_tickets;

  INSERT INTO public.permissions (tenant_id, action, resource)
  VALUES (NEW.id, 'read', 'tickets')
  RETURNING id INTO v_perm_read_tickets;

  INSERT INTO public.permissions (tenant_id, action, resource)
  VALUES (NEW.id, 'manage', 'work_orders')
  RETURNING id INTO v_perm_manage_orders;

  INSERT INTO public.permissions (tenant_id, action, resource)
  VALUES (NEW.id, 'read', 'work_orders')
  RETURNING id INTO v_perm_read_orders;

  INSERT INTO public.permissions (tenant_id, action, resource)
  VALUES (NEW.id, 'manage', 'assets')
  RETURNING id INTO v_perm_manage_assets;

  INSERT INTO public.permissions (tenant_id, action, resource)
  VALUES (NEW.id, 'read', 'assets')
  RETURNING id INTO v_perm_read_assets;

  INSERT INTO public.permissions (tenant_id, action, resource)
  VALUES (NEW.id, 'manage', 'quotations')
  RETURNING id INTO v_perm_manage_quotes;

  INSERT INTO public.permissions (tenant_id, action, resource)
  VALUES (NEW.id, 'read', 'all')
  RETURNING id INTO v_perm_read_all;

  -- 5. Associate Permissions to Roles
  -- Admin -> manage all
  INSERT INTO public.role_permissions (tenant_id, role_id, permission_id)
  VALUES (NEW.id, v_admin_role_id, v_perm_manage_all);

  -- Manager -> manage tickets, work_orders, assets, quotes
  INSERT INTO public.role_permissions (tenant_id, role_id, permission_id)
  VALUES
    (NEW.id, v_mgr_role_id, v_perm_manage_tickets),
    (NEW.id, v_mgr_role_id, v_perm_manage_orders),
    (NEW.id, v_mgr_role_id, v_perm_manage_assets),
    (NEW.id, v_mgr_role_id, v_perm_manage_quotes);

  -- Dispatcher -> manage tickets, manage work_orders, read assets
  INSERT INTO public.role_permissions (tenant_id, role_id, permission_id)
  VALUES
    (NEW.id, v_disp_role_id, v_perm_manage_tickets),
    (NEW.id, v_disp_role_id, v_perm_manage_orders),
    (NEW.id, v_disp_role_id, v_perm_read_assets);

  -- CSR -> manage tickets, read assets
  INSERT INTO public.role_permissions (tenant_id, role_id, permission_id)
  VALUES
    (NEW.id, v_csr_role_id, v_perm_manage_tickets),
    (NEW.id, v_csr_role_id, v_perm_read_assets);

  -- Billing -> manage quotations, read tickets
  INSERT INTO public.role_permissions (tenant_id, role_id, permission_id)
  VALUES
    (NEW.id, v_billing_role_id, v_perm_manage_quotes),
    (NEW.id, v_billing_role_id, v_perm_read_tickets);

  -- Readonly -> read all
  INSERT INTO public.role_permissions (tenant_id, role_id, permission_id)
  VALUES (NEW.id, v_readonly_role_id, v_perm_read_all);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_tenant_created ON tenants;
CREATE TRIGGER on_tenant_created
  AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION app_private.handle_new_tenant_bootstrap();
