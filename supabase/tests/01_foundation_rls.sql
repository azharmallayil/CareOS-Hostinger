-- pgTAP Automated RLS and Multi-Tenancy Tests for CareOS Foundation Schema
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(24);

-- =========================================================================
-- TEST FIXTURES SETUP
-- =========================================================================

-- Test Tenants
INSERT INTO public.tenants (id, slug, name, status, plan)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'test-alpha', 'Test Tenant Alpha', 'active', 'enterprise'),
  ('22222222-2222-2222-2222-222222222222', 'test-beta', 'Test Tenant Beta', 'active', 'professional')
ON CONFLICT (id) DO NOTHING;

-- Test Users
INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'alice@alpha.test', crypt('pass', gen_salt('bf')), '{"provider":"email"}', '{"full_name": "Alice Admin"}'),
  ('a2222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'alan@alpha.test', crypt('pass', gen_salt('bf')), '{"provider":"email"}', '{"full_name": "Alan Dispatcher"}'),
  ('b1111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'bob@beta.test', crypt('pass', gen_salt('bf')), '{"provider":"email"}', '{"full_name": "Bob Admin"}'),
  ('b2222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'brian@beta.test', crypt('pass', gen_salt('bf')), '{"provider":"email"}', '{"full_name": "Brian Inactive"}'),
  ('f0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'paul@careos.platform', crypt('pass', gen_salt('bf')), '{"provider":"email"}', '{"full_name": "Paul Platform"}')
ON CONFLICT (id) DO NOTHING;

-- Platform Admin
INSERT INTO public.platform_admins (user_id)
VALUES ('f0000000-0000-0000-0000-000000000001')
ON CONFLICT (user_id) DO NOTHING;

-- Memberships
INSERT INTO public.tenant_memberships (id, tenant_id, user_id, portal, is_active)
VALUES
  ('a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'operations', true),
  ('a2222222-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'operations', true),
  ('b1111111-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'b1111111-1111-1111-1111-111111111111', 'operations', true),
  ('b2222222-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', 'operations', false)
ON CONFLICT (id) DO NOTHING;

-- Assign Membership Roles
INSERT INTO public.membership_roles (membership_id, role_id, tenant_id)
SELECT 'a1111111-0000-0000-0000-000000000001', id, '11111111-1111-1111-1111-111111111111'
FROM public.roles WHERE tenant_id = '11111111-1111-1111-1111-111111111111' AND name = 'tenant_admin'
ON CONFLICT DO NOTHING;

INSERT INTO public.membership_roles (membership_id, role_id, tenant_id)
SELECT 'a2222222-0000-0000-0000-000000000001', id, '11111111-1111-1111-1111-111111111111'
FROM public.roles WHERE tenant_id = '11111111-1111-1111-1111-111111111111' AND name = 'dispatcher'
ON CONFLICT DO NOTHING;

INSERT INTO public.membership_roles (membership_id, role_id, tenant_id)
SELECT 'b1111111-0000-0000-0000-000000000001', id, '22222222-2222-2222-2222-222222222222'
FROM public.roles WHERE tenant_id = '22222222-2222-2222-2222-222222222222' AND name = 'tenant_admin'
ON CONFLICT DO NOTHING;

INSERT INTO public.membership_roles (membership_id, role_id, tenant_id)
SELECT 'b2222222-0000-0000-0000-000000000001', id, '22222222-2222-2222-2222-222222222222'
FROM public.roles WHERE tenant_id = '22222222-2222-2222-2222-222222222222' AND name = 'csr'
ON CONFLICT DO NOTHING;

-- Seed Audit logs for both tenants
INSERT INTO public.audit_logs (tenant_id, user_id, action, resource_type)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'tenant.setup', 'tenant'),
  ('22222222-2222-2222-2222-222222222222', 'b1111111-1111-1111-1111-111111111111', 'tenant.setup', 'tenant');

-- =========================================================================
-- TEST SUITE 1: ANONYMOUS ACCESS
-- =========================================================================

SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '{}';

SELECT is(
  (SELECT count(*)::integer FROM public.tenants),
  0,
  'Anon cannot read tenants'
);

SELECT is(
  (SELECT count(*)::integer FROM public.departments),
  0,
  'Anon cannot read departments'
);

SELECT is(
  (SELECT count(*)::integer FROM public.roles),
  0,
  'Anon cannot read roles'
);

SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs),
  0,
  'Anon cannot read audit_logs'
);

SELECT is(
  (SELECT count(*)::integer FROM public.platform_admins),
  0,
  'Anon cannot read platform_admins'
);

-- =========================================================================
-- TEST SUITE 2: TENANT A (ALICE) ISOLATION VS TENANT B
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "a1111111-1111-1111-1111-111111111111", "email": "alice@alpha.test", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::integer FROM public.tenants WHERE id = '11111111-1111-1111-1111-111111111111'),
  1,
  'Alice can see her own tenant (Tenant Alpha)'
);

SELECT is(
  (SELECT count(*)::integer FROM public.tenants WHERE id = '22222222-2222-2222-2222-222222222222'),
  0,
  'Alice CANNOT see Tenant Beta'
);

SELECT is(
  (SELECT count(*)::integer FROM public.departments WHERE tenant_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'Alice CANNOT read Tenant Beta departments'
);

SELECT is(
  (SELECT count(*)::integer FROM public.roles WHERE tenant_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'Alice CANNOT read Tenant Beta roles'
);

SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE tenant_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'Alice CANNOT read Tenant Beta audit logs'
);

-- Cross-tenant insert attempt by Alice into Tenant Beta
SELECT throws_ok(
  $$ INSERT INTO public.departments (tenant_id, name) VALUES ('22222222-2222-2222-2222-222222222222', 'Rogue Department') $$,
  '42501',
  NULL,
  'Alice cannot insert a department into Tenant Beta (violates RLS with check)'
);

-- =========================================================================
-- TEST SUITE 3: INACTIVE MEMBERSHIP BOUNDARIES
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "b2222222-2222-2222-2222-222222222222", "email": "brian@beta.test", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::integer FROM public.tenants WHERE id = '22222222-2222-2222-2222-222222222222'),
  0,
  'Inactive user Brian cannot see Tenant Beta'
);

SELECT is(
  (SELECT count(*)::integer FROM public.departments WHERE tenant_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'Inactive user Brian cannot read Tenant Beta departments'
);

-- =========================================================================
-- TEST SUITE 4: ROLE BOUNDARIES & ESCALATION PREVENTION
-- =========================================================================

-- Alan (Dispatcher in Tenant Alpha) attempts admin operations
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "a2222222-2222-2222-2222-222222222222", "email": "alan@alpha.test", "role": "authenticated"}';

SELECT throws_ok(
  $$ INSERT INTO public.roles (tenant_id, name, display_name) VALUES ('11111111-1111-1111-1111-111111111111', 'escalated_role', 'Escalated Role') $$,
  '42501',
  NULL,
  'Dispatcher Alan cannot create custom roles in Tenant Alpha'
);

SELECT throws_ok(
  $$ INSERT INTO public.membership_roles (membership_id, role_id, tenant_id)
     SELECT 'a2222222-0000-0000-0000-000000000001', id, '11111111-1111-1111-1111-111111111111'
     FROM public.roles WHERE tenant_id = '11111111-1111-1111-1111-111111111111' AND name = 'tenant_admin' $$,
  '42501',
  NULL,
  'Dispatcher Alan cannot assign tenant_admin role to himself'
);

-- Ordinary user cannot inspect platform_admins
SELECT is(
  (SELECT count(*)::integer FROM public.platform_admins),
  0,
  'Ordinary tenant users cannot read platform_admins table'
);

-- =========================================================================
-- TEST SUITE 5: AUDIT LOG IMMUTABILITY
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "a1111111-1111-1111-1111-111111111111", "email": "alice@alpha.test", "role": "authenticated"}';

-- Admin Alice can read Tenant Alpha audit logs
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE tenant_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'Tenant Admin Alice can read Tenant Alpha audit logs'
);

-- UPDATE is blocked by lack of UPDATE policy
UPDATE public.audit_logs SET action = 'tampered' WHERE tenant_id = '11111111-1111-1111-1111-111111111111';

SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE action = 'tampered'),
  0,
  'audit_logs is append-only: UPDATE does not affect any rows under RLS'
);

-- DELETE is blocked by lack of DELETE policy
DELETE FROM public.audit_logs WHERE tenant_id = '11111111-1111-1111-1111-111111111111';

SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE tenant_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'audit_logs is append-only: DELETE does not affect any rows under RLS'
);

-- =========================================================================
-- TEST SUITE 6: TENANT ID IMMUTABILITY TRIGGER
-- =========================================================================

-- Even if done with elevated permissions, tenant_id reassignment trigger rejects
SET LOCAL ROLE postgres;

SELECT throws_ok(
  $$ UPDATE public.departments SET tenant_id = '22222222-2222-2222-2222-222222222222' WHERE tenant_id = '11111111-1111-1111-1111-111111111111' $$,
  '23001',
  NULL,
  'Database trigger blocks reassignment of tenant_id on tenant-scoped tables'
);

-- =========================================================================
-- TEST SUITE 7: CROSS-TENANT COMPOSITE FOREIGN KEY CONSTRAINT
-- =========================================================================

SELECT throws_ok(
  $$ INSERT INTO public.membership_roles (membership_id, role_id, tenant_id)
     VALUES ('a1111111-0000-0000-0000-000000000001',
             (SELECT id FROM public.roles WHERE tenant_id = '22222222-2222-2222-2222-222222222222' LIMIT 1),
             '11111111-1111-1111-1111-111111111111') $$,
  '23503',
  NULL,
  'Composite foreign key blocks cross-tenant role assignment'
);

-- =========================================================================
-- TEST SUITE 8: PROFILE ACCESS BOUNDARIES
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "a1111111-1111-1111-1111-111111111111", "email": "alice@alpha.test", "role": "authenticated"}';

-- Alice attempts to update Bob profile
UPDATE public.profiles SET full_name = 'Hacked Bob' WHERE id = 'b1111111-1111-1111-1111-111111111111';

SELECT is(
  (SELECT full_name FROM public.profiles WHERE id = 'b1111111-1111-1111-1111-111111111111'),
  'Bob Admin',
  'User Alice cannot update Bob profile'
);

-- =========================================================================
-- TEST SUITE 9: PLATFORM SUPER ADMIN BOUNDARIES
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "f0000000-0000-0000-0000-000000000001", "email": "paul@careos.platform", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::integer FROM public.platform_admins WHERE user_id = 'f0000000-0000-0000-0000-000000000001'),
  1,
  'Platform Admin Paul can read platform_admins'
);

SELECT is(
  (SELECT count(*)::integer FROM public.tenants),
  2,
  'Platform Admin Paul can view all tenants'
);

SELECT * FROM finish();
ROLLBACK;
