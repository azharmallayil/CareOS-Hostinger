-- Migration: 20261115000013_maintenance_warranty_rma_and_inventory.sql
-- Description: Preventive maintenance plans and schedules, maintenance history,
--              RMA cases & serialized items, parts catalog, stock locations (warehouses, vans),
--              stock levels, audited stock movements, and work order parts usage.

-- ============================================================================
-- 1. PREVENTIVE MAINTENANCE PLANS & SCHEDULES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.maintenance_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('interval_months', 'interval_km', 'interval_engine_hours', 'one_time')),
  interval_months INTEGER,
  interval_km INTEGER,
  interval_engine_hours INTEGER,
  service_category_code TEXT,
  checklist_template JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_maintenance_plans_tenant ON public.maintenance_plans (tenant_id);

CREATE TABLE IF NOT EXISTS public.maintenance_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  plan_id UUID NOT NULL REFERENCES public.maintenance_plans(id) ON DELETE RESTRICT,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  last_performed_at TIMESTAMPTZ,
  last_odometer_km INTEGER,
  next_due_date DATE,
  next_due_odometer_km INTEGER,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'due', 'overdue', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (plan_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_asset ON public.maintenance_schedules (asset_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_due ON public.maintenance_schedules (tenant_id, status, next_due_date);

CREATE TABLE IF NOT EXISTS public.maintenance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  plan_id UUID NOT NULL REFERENCES public.maintenance_plans(id) ON DELETE RESTRICT,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE RESTRICT,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  work_order_id UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
  performed_by UUID REFERENCES public.technicians(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  odometer_km INTEGER,
  engine_hours INTEGER,
  findings TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_maintenance_records_asset ON public.maintenance_records (asset_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_ticket ON public.maintenance_records (ticket_id);

-- ============================================================================
-- 2. RMA CASES & RMA ITEMS (WARRANTY & HARDWARE REPLACEMENT)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.rma_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  case_number TEXT NOT NULL,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  work_order_id UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES public.assets(id) ON DELETE RESTRICT,
  customer_account_id UUID REFERENCES public.customer_accounts(id) ON DELETE RESTRICT,
  warranty_id UUID REFERENCES public.warranties(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'authorized', 'item_received', 'inspected', 'shipped_to_oem', 'repaired', 'replaced', 'rejected', 'closed')),
  reason_for_return TEXT NOT NULL,
  oem_name TEXT,
  oem_reference_number TEXT,
  authorized_by UUID REFERENCES auth.users(id),
  authorized_at TIMESTAMPTZ,
  resolution_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (tenant_id, case_number)
);

CREATE INDEX IF NOT EXISTS idx_rma_cases_tenant ON public.rma_cases (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rma_cases_ticket ON public.rma_cases (ticket_id);
CREATE INDEX IF NOT EXISTS idx_rma_cases_asset ON public.rma_cases (asset_id);

CREATE TABLE IF NOT EXISTS public.rma_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  rma_case_id UUID NOT NULL REFERENCES public.rma_cases(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  part_number TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  fault_description TEXT NOT NULL,
  inspection_result TEXT CHECK (inspection_result IN ('defective_under_warranty', 'customer_damage_out_of_warranty', 'no_fault_found', 'repairable')),
  action_taken TEXT CHECK (action_taken IN ('repaired', 'replaced_new', 'replaced_refurbished', 'returned_as_is', 'scrapped')),
  replacement_serial_number TEXT,
  notes TEXT,
  inspected_by UUID REFERENCES auth.users(id),
  inspected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (rma_case_id, serial_number)
);

CREATE INDEX IF NOT EXISTS idx_rma_items_serial ON public.rma_items (tenant_id, serial_number);

-- Atomic sequence generator for RMA cases
CREATE OR REPLACE FUNCTION app_private.generate_rma_case_number(
  p_tenant_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app_private, public
AS $$
DECLARE
  v_year INTEGER := extract(year from now())::integer;
  v_seq BIGINT;
  v_padding INTEGER := 5;
BEGIN
  INSERT INTO public.ticket_number_sequences (tenant_id, prefix, year, current_val, padding_length)
  VALUES (p_tenant_id, 'RMA', v_year, 1, 5)
  ON CONFLICT (tenant_id, prefix, year)
  DO UPDATE SET
    current_val = public.ticket_number_sequences.current_val + 1,
    updated_at = timezone('utc', now())
  RETURNING current_val, padding_length INTO v_seq, v_padding;

  RETURN 'RMA-' || v_year::text || '-' || lpad(v_seq::text, v_padding, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_rma_case_number(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$ SELECT app_private.generate_rma_case_number(p_tenant_id); $$;

-- ============================================================================
-- 3. PARTS CATALOG & STOCK LOCATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.parts_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  part_number TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('wiring', 'devices', 'antennas', 'sensors', 'mounting', 'consumables', 'other')),
  unit_of_measure TEXT NOT NULL DEFAULT 'unit' CHECK (unit_of_measure IN ('unit', 'meter', 'kit', 'set')),
  unit_cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  unit_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  reorder_threshold INTEGER NOT NULL DEFAULT 5,
  is_serialized BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (tenant_id, part_number)
);

CREATE INDEX IF NOT EXISTS idx_parts_catalog_tenant ON public.parts_catalog (tenant_id);

CREATE TABLE IF NOT EXISTS public.stock_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  location_type TEXT NOT NULL CHECK (location_type IN ('warehouse', 'branch_stockroom', 'technician_van', 'quarantine')),
  technician_id UUID REFERENCES public.technicians(id) ON DELETE SET NULL,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_stock_locations_tenant ON public.stock_locations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_locations_tech ON public.stock_locations (technician_id);

CREATE TABLE IF NOT EXISTS public.stock_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  stock_location_id UUID NOT NULL REFERENCES public.stock_locations(id) ON DELETE RESTRICT,
  part_id UUID NOT NULL REFERENCES public.parts_catalog(id) ON DELETE RESTRICT,
  quantity_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  quantity_reserved INTEGER NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
  min_quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (stock_location_id, part_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_levels_lookup ON public.stock_levels (stock_location_id, part_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_low ON public.stock_levels (tenant_id, quantity_on_hand);

-- ============================================================================
-- 4. STOCK MOVEMENTS (AUDIT TRAIL OF ALL INVENTORY TRANSACTIONS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  source_location_id UUID REFERENCES public.stock_locations(id),
  destination_location_id UUID REFERENCES public.stock_locations(id),
  part_id UUID NOT NULL REFERENCES public.parts_catalog(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  movement_type TEXT NOT NULL
    CHECK (movement_type IN ('receive', 'transfer', 'technician_issue', 'work_order_consumed', 'adjustment_positive', 'adjustment_negative', 'scrap', 'rma_quarantine')),
  reference_type TEXT CHECK (reference_type IN ('work_order', 'ticket', 'rma_case', 'adjustment_audit', 'initial_stock')),
  reference_id UUID,
  serial_numbers TEXT[] NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL,
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  authorized_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant ON public.stock_movements (tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_part ON public.stock_movements (part_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ref ON public.stock_movements (reference_type, reference_id);

-- ============================================================================
-- 5. WORK ORDER PARTS USAGE (PARTS CONSUMED DURING SERVICE)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.work_order_parts_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE RESTRICT,
  part_id UUID NOT NULL REFERENCES public.parts_catalog(id) ON DELETE RESTRICT,
  stock_location_id UUID NOT NULL REFERENCES public.stock_locations(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  serial_numbers TEXT[] NOT NULL DEFAULT '{}',
  is_billable BOOLEAN NOT NULL DEFAULT true,
  warranty_covered BOOLEAN NOT NULL DEFAULT false,
  consumed_by UUID NOT NULL REFERENCES auth.users(id),
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_wo_parts_usage_wo ON public.work_order_parts_usage (work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_parts_usage_ticket ON public.work_order_parts_usage (ticket_id);

-- ============================================================================
-- 6. ROW-LEVEL SECURITY & GRANTS
-- ============================================================================
ALTER TABLE public.maintenance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rma_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rma_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parts_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_parts_usage ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rma_cases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rma_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts_catalog TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_levels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_order_parts_usage TO authenticated;

-- Policies for operations members
CREATE POLICY "operations_maintenance_plans_all"
  ON public.maintenance_plans FOR ALL TO authenticated
  USING (tenant_id IN (SELECT m.tenant_id FROM public.memberships m WHERE m.user_id = auth.uid()));

CREATE POLICY "operations_maintenance_schedules_all"
  ON public.maintenance_schedules FOR ALL TO authenticated
  USING (tenant_id IN (SELECT m.tenant_id FROM public.memberships m WHERE m.user_id = auth.uid()));

CREATE POLICY "operations_maintenance_records_all"
  ON public.maintenance_records FOR ALL TO authenticated
  USING (tenant_id IN (SELECT m.tenant_id FROM public.memberships m WHERE m.user_id = auth.uid()));

CREATE POLICY "operations_rma_cases_all"
  ON public.rma_cases FOR ALL TO authenticated
  USING (tenant_id IN (SELECT m.tenant_id FROM public.memberships m WHERE m.user_id = auth.uid()));

CREATE POLICY "operations_rma_items_all"
  ON public.rma_items FOR ALL TO authenticated
  USING (tenant_id IN (SELECT m.tenant_id FROM public.memberships m WHERE m.user_id = auth.uid()));

CREATE POLICY "operations_parts_catalog_all"
  ON public.parts_catalog FOR ALL TO authenticated
  USING (tenant_id IN (SELECT m.tenant_id FROM public.memberships m WHERE m.user_id = auth.uid()));

CREATE POLICY "operations_stock_locations_all"
  ON public.stock_locations FOR ALL TO authenticated
  USING (tenant_id IN (SELECT m.tenant_id FROM public.memberships m WHERE m.user_id = auth.uid()));

CREATE POLICY "operations_stock_levels_all"
  ON public.stock_levels FOR ALL TO authenticated
  USING (tenant_id IN (SELECT m.tenant_id FROM public.memberships m WHERE m.user_id = auth.uid()));

CREATE POLICY "operations_stock_movements_all"
  ON public.stock_movements FOR ALL TO authenticated
  USING (tenant_id IN (SELECT m.tenant_id FROM public.memberships m WHERE m.user_id = auth.uid()));

CREATE POLICY "operations_work_order_parts_usage_all"
  ON public.work_order_parts_usage FOR ALL TO authenticated
  USING (tenant_id IN (SELECT m.tenant_id FROM public.memberships m WHERE m.user_id = auth.uid()));
