-- Migration: 20261115000001_extensions_and_private_schema.sql
-- Description: Enable core extensions, create app_private schema, and define base trigger utilities.
-- Reversible:
--   DROP FUNCTION IF EXISTS app_private.prevent_tenant_reassignment() CASCADE;
--   DROP FUNCTION IF EXISTS app_private.set_updated_at() CASCADE;
--   DROP SCHEMA IF EXISTS app_private CASCADE;

-- 1. Core Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. Private Security & Utility Schema
CREATE SCHEMA IF NOT EXISTS app_private;

-- Lockdown app_private from standard roles
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
REVOKE ALL ON SCHEMA app_private FROM anon;
REVOKE ALL ON SCHEMA app_private FROM authenticated;
GRANT USAGE ON SCHEMA app_private TO service_role;

-- 3. Base Trigger Utility: set_updated_at
CREATE OR REPLACE FUNCTION app_private.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = app_private, public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 4. Base Trigger Utility: prevent_tenant_reassignment
CREATE OR REPLACE FUNCTION app_private.prevent_tenant_reassignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = app_private, public
AS $$
BEGIN
  IF OLD.tenant_id IS NOT NULL AND NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id cannot be reassigned (current: %, attempted: %)', OLD.tenant_id, NEW.tenant_id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
