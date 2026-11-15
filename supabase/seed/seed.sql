-- CareOS Seed Data — LOCAL DEVELOPMENT FIXTURES ONLY
-- Never use this data in production.

DO $$
DECLARE
  v_alpha_tenant_id CONSTANT UUID := '11111111-1111-1111-1111-111111111111';
  v_beta_tenant_id  CONSTANT UUID := '22222222-2222-2222-2222-222222222222';

  v_user_alice_id   CONSTANT UUID := 'a1111111-1111-1111-1111-111111111111';
  v_user_alan_id    CONSTANT UUID := 'a2222222-2222-2222-2222-222222222222';
  v_user_alex_id    CONSTANT UUID := 'a3333333-3333-3333-3333-333333333333';
  v_user_bob_id     CONSTANT UUID := 'b1111111-1111-1111-1111-111111111111';
  v_user_brian_id   CONSTANT UUID := 'b2222222-2222-2222-2222-222222222222';
  v_user_paul_id    CONSTANT UUID := 'f0000000-0000-0000-0000-000000000001';

  v_alpha_dept_id   UUID;
  v_beta_dept_id    UUID;

  v_alpha_admin_role UUID;
  v_alpha_disp_role  UUID;
  v_alpha_tech_role  UUID;
  v_beta_admin_role  UUID;
  v_beta_csr_role    UUID;

  v_mem_alice UUID;
  v_mem_alan  UUID;
  v_mem_alex  UUID;
  v_mem_bob   UUID;
  v_mem_brian UUID;
BEGIN
  -- 1. Create Test Tenants (triggers handle_new_tenant_bootstrap)
  INSERT INTO public.tenants (id, slug, name, status, plan)
  VALUES
    (v_alpha_tenant_id, 'alpha-fleet', 'Alpha Fleet Care LLC', 'active', 'enterprise'),
    (v_beta_tenant_id, 'beta-mobility', 'Beta Mobility Systems', 'active', 'professional')
  ON CONFLICT (id) DO NOTHING;

  -- 2. Seed Mock Auth Users
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES
    (
      v_user_alice_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'admin@alphafleet.test',
      crypt('Password123!', gen_salt('bf')),
      now(),
      '{"provider": "email", "providers": ["email"]}',
      '{"full_name": "Alice Al-Rashid", "preferred_language": "en"}',
      now(),
      now()
    ),
    (
      v_user_alan_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'dispatcher@alphafleet.test',
      crypt('Password123!', gen_salt('bf')),
      now(),
      '{"provider": "email", "providers": ["email"]}',
      '{"full_name": "Alan Al-Ghamdi", "preferred_language": "ar"}',
      now(),
      now()
    ),
    (
      v_user_alex_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'tech@alphafleet.test',
      crypt('Password123!', gen_salt('bf')),
      now(),
      '{"provider": "email", "providers": ["email"]}',
      '{"full_name": "Alex Mansour", "preferred_language": "en"}',
      now(),
      now()
    ),
    (
      v_user_bob_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'admin@betamobility.test',
      crypt('Password123!', gen_salt('bf')),
      now(),
      '{"provider": "email", "providers": ["email"]}',
      '{"full_name": "Bob Al-Otaibi", "preferred_language": "en"}',
      now(),
      now()
    ),
    (
      v_user_brian_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'inactive@betamobility.test',
      crypt('Password123!', gen_salt('bf')),
      now(),
      '{"provider": "email", "providers": ["email"]}',
      '{"full_name": "Brian Deactivated", "preferred_language": "en"}',
      now(),
      now()
    ),
    (
      v_user_paul_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'superadmin@careos.platform',
      crypt('Password123!', gen_salt('bf')),
      now(),
      '{"provider": "email", "providers": ["email"]}',
      '{"full_name": "Paul Platform Administrator", "preferred_language": "en"}',
      now(),
      now()
    )
  ON CONFLICT (id) DO NOTHING;

  -- 3. Provision Platform Super Admin
  INSERT INTO public.platform_admins (user_id)
  VALUES (v_user_paul_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- 4. Lookup Auto-Bootstrapped Department IDs
  SELECT id INTO v_alpha_dept_id FROM public.departments WHERE tenant_id = v_alpha_tenant_id LIMIT 1;
  SELECT id INTO v_beta_dept_id  FROM public.departments WHERE tenant_id = v_beta_tenant_id LIMIT 1;

  -- 5. Lookup Auto-Bootstrapped Role IDs
  SELECT id INTO v_alpha_admin_role FROM public.roles WHERE tenant_id = v_alpha_tenant_id AND name = 'tenant_admin';
  SELECT id INTO v_alpha_disp_role  FROM public.roles WHERE tenant_id = v_alpha_tenant_id AND name = 'dispatcher';
  SELECT id INTO v_alpha_tech_role  FROM public.roles WHERE tenant_id = v_alpha_tenant_id AND name = 'technician';

  SELECT id INTO v_beta_admin_role  FROM public.roles WHERE tenant_id = v_beta_tenant_id AND name = 'tenant_admin';
  SELECT id INTO v_beta_csr_role    FROM public.roles WHERE tenant_id = v_beta_tenant_id AND name = 'csr';

  -- 6. Seed Tenant Memberships
  INSERT INTO public.tenant_memberships (
    tenant_id, user_id, portal, department_id, is_active, joined_at
  )
  VALUES
    (v_alpha_tenant_id, v_user_alice_id, 'operations', v_alpha_dept_id, true, now())
  RETURNING id INTO v_mem_alice;

  INSERT INTO public.tenant_memberships (
    tenant_id, user_id, portal, department_id, is_active, joined_at
  )
  VALUES
    (v_alpha_tenant_id, v_user_alan_id, 'operations', v_alpha_dept_id, true, now())
  RETURNING id INTO v_mem_alan;

  INSERT INTO public.tenant_memberships (
    tenant_id, user_id, portal, department_id, is_active, joined_at
  )
  VALUES
    (v_alpha_tenant_id, v_user_alex_id, 'technician', v_alpha_dept_id, true, now())
  RETURNING id INTO v_mem_alex;

  INSERT INTO public.tenant_memberships (
    tenant_id, user_id, portal, department_id, is_active, joined_at
  )
  VALUES
    (v_beta_tenant_id, v_user_bob_id, 'operations', v_beta_dept_id, true, now())
  RETURNING id INTO v_mem_bob;

  INSERT INTO public.tenant_memberships (
    tenant_id, user_id, portal, department_id, is_active, joined_at, deactivated_at
  )
  VALUES
    (v_beta_tenant_id, v_user_brian_id, 'operations', v_beta_dept_id, false, now() - INTERVAL '30 days', now() - INTERVAL '5 days')
  RETURNING id INTO v_mem_brian;

  -- 7. Assign Roles to Memberships
  INSERT INTO public.membership_roles (membership_id, role_id, tenant_id)
  VALUES
    (v_mem_alice, v_alpha_admin_role, v_alpha_tenant_id),
    (v_mem_alan,  v_alpha_disp_role,  v_alpha_tenant_id),
    (v_mem_alex,  v_alpha_tech_role,  v_alpha_tenant_id),
    (v_mem_bob,   v_beta_admin_role,  v_beta_tenant_id),
    (v_mem_brian, v_beta_csr_role,    v_beta_tenant_id)
  ON CONFLICT (membership_id, role_id) DO NOTHING;

  -- 8. Seed Initial Audit Logs
  INSERT INTO public.audit_logs (tenant_id, user_id, action, resource_type, new_data)
  VALUES
    (v_alpha_tenant_id, v_user_alice_id, 'tenant.bootstrapped', 'tenant', '{"status": "active", "tier": "enterprise"}'::jsonb),
    (v_beta_tenant_id,  v_user_bob_id,   'tenant.bootstrapped', 'tenant', '{"status": "active", "tier": "professional"}'::jsonb);
END $$;
