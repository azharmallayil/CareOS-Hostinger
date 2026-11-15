-- Migration: 20261115000002_foundation_tables.sql
-- Description: Core SaaS foundation schema with tenant scoping, composite foreign keys, immutability, and timestamp triggers.
-- Reversible:
--   DROP TABLE IF EXISTS audit_logs CASCADE;
--   DROP TABLE IF EXISTS platform_admins CASCADE;
--   DROP TABLE IF EXISTS tenant_invitations CASCADE;
--   DROP TABLE IF EXISTS membership_roles CASCADE;
--   DROP TABLE IF EXISTS tenant_memberships CASCADE;
--   DROP TABLE IF EXISTS role_permissions CASCADE;
--   DROP TABLE IF EXISTS permissions CASCADE;
--   DROP TABLE IF EXISTS roles CASCADE;
--   DROP TABLE IF EXISTS departments CASCADE;
--   DROP TABLE IF EXISTS profiles CASCADE;
--   DROP TABLE IF EXISTS tenant_settings CASCADE;
--   DROP TABLE IF EXISTS tenants CASCADE;

-- 1. tenants
CREATE TABLE tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'trial'
                    CHECK (status IN ('trial', 'active', 'suspended', 'cancelled')),
  plan            TEXT NOT NULL DEFAULT 'starter',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

-- 2. tenant_settings
CREATE TABLE tenant_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branding            JSONB NOT NULL DEFAULT '{}'::jsonb,
  feature_flags       JSONB NOT NULL DEFAULT '{}'::jsonb,
  notification_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_settings_tenant UNIQUE (tenant_id)
);

CREATE INDEX idx_tenant_settings_tenant_id ON tenant_settings(tenant_id);

CREATE TRIGGER trg_tenant_settings_updated_at
  BEFORE UPDATE ON tenant_settings
  FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER trg_tenant_settings_no_reassign
  BEFORE UPDATE ON tenant_settings
  FOR EACH ROW EXECUTE FUNCTION app_private.prevent_tenant_reassignment();

-- 3. profiles (user profiles linked 1:1 with auth.users)
CREATE TABLE profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name           TEXT NOT NULL,
  email               TEXT NOT NULL,
  phone               TEXT,
  avatar_url          TEXT,
  preferred_language  TEXT NOT NULL DEFAULT 'en',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_email ON profiles(email);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

-- 4. departments
CREATE TABLE departments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  description           TEXT,
  parent_department_id  UUID,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_departments_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_departments_tenant_name UNIQUE (tenant_id, name),
  CONSTRAINT fk_departments_parent FOREIGN KEY (tenant_id, parent_department_id)
    REFERENCES departments(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX idx_departments_tenant_id ON departments(tenant_id);
CREATE INDEX idx_departments_parent ON departments(tenant_id, parent_department_id);

CREATE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER trg_departments_no_reassign
  BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION app_private.prevent_tenant_reassignment();

-- 5. roles
CREATE TABLE roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  description     TEXT,
  is_system_role  BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_roles_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_roles_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX idx_roles_tenant_id ON roles(tenant_id);

CREATE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER trg_roles_no_reassign
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION app_private.prevent_tenant_reassignment();

-- 6. permissions
CREATE TABLE permissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action          TEXT NOT NULL,
  resource        TEXT NOT NULL,
  conditions      JSONB DEFAULT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_permissions_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_permissions_tenant_action_resource UNIQUE (tenant_id, action, resource)
);

CREATE INDEX idx_permissions_tenant_id ON permissions(tenant_id);

CREATE TRIGGER trg_permissions_no_reassign
  BEFORE UPDATE ON permissions
  FOR EACH ROW EXECUTE FUNCTION app_private.prevent_tenant_reassignment();

-- 7. role_permissions
CREATE TABLE role_permissions (
  role_id         UUID NOT NULL,
  permission_id   UUID NOT NULL,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (tenant_id, role_id)
    REFERENCES roles(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (tenant_id, permission_id)
    REFERENCES permissions(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_role_permissions_tenant_id ON role_permissions(tenant_id);
CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id);

CREATE TRIGGER trg_role_permissions_no_reassign
  BEFORE UPDATE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION app_private.prevent_tenant_reassignment();

-- 8. tenant_memberships
CREATE TABLE tenant_memberships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portal          TEXT NOT NULL CHECK (portal IN ('operations', 'technician', 'customer', 'admin')),
  department_id   UUID,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  invited_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at       TIMESTAMPTZ,
  deactivated_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_memberships_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_memberships_tenant_user_portal UNIQUE (tenant_id, user_id, portal),
  CONSTRAINT fk_memberships_department FOREIGN KEY (tenant_id, department_id)
    REFERENCES departments(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX idx_memberships_tenant_id ON tenant_memberships(tenant_id);
CREATE INDEX idx_memberships_user_id ON tenant_memberships(user_id);
CREATE INDEX idx_memberships_user_active ON tenant_memberships(user_id, is_active);
CREATE INDEX idx_memberships_dept ON tenant_memberships(tenant_id, department_id);

CREATE TRIGGER trg_tenant_memberships_updated_at
  BEFORE UPDATE ON tenant_memberships
  FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER trg_tenant_memberships_no_reassign
  BEFORE UPDATE ON tenant_memberships
  FOR EACH ROW EXECUTE FUNCTION app_private.prevent_tenant_reassignment();

-- 9. membership_roles
CREATE TABLE membership_roles (
  membership_id   UUID NOT NULL,
  role_id         UUID NOT NULL,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (membership_id, role_id),
  CONSTRAINT fk_membership_roles_membership FOREIGN KEY (tenant_id, membership_id)
    REFERENCES tenant_memberships(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_membership_roles_role FOREIGN KEY (tenant_id, role_id)
    REFERENCES roles(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_membership_roles_tenant_id ON membership_roles(tenant_id);
CREATE INDEX idx_membership_roles_membership_id ON membership_roles(membership_id);
CREATE INDEX idx_membership_roles_role_id ON membership_roles(role_id);

CREATE TRIGGER trg_membership_roles_no_reassign
  BEFORE UPDATE ON membership_roles
  FOR EACH ROW EXECUTE FUNCTION app_private.prevent_tenant_reassignment();

-- 10. tenant_invitations
CREATE TABLE tenant_invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  portal          TEXT NOT NULL CHECK (portal IN ('operations', 'technician', 'customer', 'admin')),
  role_id         UUID,
  department_id   UUID,
  token           TEXT NOT NULL UNIQUE,
  invited_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at      TIMESTAMPTZ NOT NULL,
  accepted_at     TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_invitations_role FOREIGN KEY (tenant_id, role_id)
    REFERENCES roles(tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT fk_invitations_dept FOREIGN KEY (tenant_id, department_id)
    REFERENCES departments(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX idx_invitations_tenant_id ON tenant_invitations(tenant_id);
CREATE INDEX idx_invitations_token ON tenant_invitations(token);
CREATE INDEX idx_invitations_email ON tenant_invitations(email);

CREATE TRIGGER trg_tenant_invitations_no_reassign
  BEFORE UPDATE ON tenant_invitations
  FOR EACH ROW EXECUTE FUNCTION app_private.prevent_tenant_reassignment();

-- 11. platform_admins (SaaS Platform Super Admins - zero tenant affiliation)
CREATE TABLE platform_admins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_admins_user_id ON platform_admins(user_id);

-- 12. audit_logs (append-only ledger)
CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     UUID,
  old_data        JSONB,
  new_data        JSONB,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

CREATE TRIGGER trg_audit_logs_no_reassign
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION app_private.prevent_tenant_reassignment();
