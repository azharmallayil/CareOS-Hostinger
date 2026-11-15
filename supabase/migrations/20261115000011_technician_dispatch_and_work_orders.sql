-- Migration: 20261115000011_technician_dispatch_and_work_orders.sql
-- Description: Technician profiles, skills, territories, working hours, availability,
--              dispatch queue, ranked recommendations, work orders, stages, tasks,
--              checklists, service visits, assignment history, and opt-in location pings.

-- ============================================================================
-- 1. SERVICE TERRITORIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.service_territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  city TEXT,
  postal_codes TEXT[] NOT NULL DEFAULT '{}',
  center_lat NUMERIC(10, 7),
  center_lng NUMERIC(10, 7),
  radius_km NUMERIC(6, 2) NOT NULL DEFAULT 25.0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_service_territories_tenant ON public.service_territories (tenant_id);

-- ============================================================================
-- 2. TECHNICIANS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.technicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id TEXT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave', 'suspended')),
  home_zone_postcode TEXT,
  home_zone_name TEXT,
  home_latitude NUMERIC(10, 7),
  home_longitude NUMERIC(10, 7),
  max_active_work_orders INTEGER NOT NULL DEFAULT 4,
  avg_rating NUMERIC(3, 2) DEFAULT 5.0,
  location_sharing_enabled BOOLEAN NOT NULL DEFAULT false,
  last_location_lat NUMERIC(10, 7),
  last_location_lng NUMERIC(10, 7),
  last_location_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_technicians_tenant ON public.technicians (tenant_id);
CREATE INDEX IF NOT EXISTS idx_technicians_status ON public.technicians (tenant_id, status);

-- ============================================================================
-- 3. TECHNICIAN SKILLS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.technician_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  technician_id UUID NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  skill_code TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  proficiency_level TEXT NOT NULL DEFAULT 'standard' CHECK (proficiency_level IN ('apprentice', 'standard', 'senior', 'master')),
  certified BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (technician_id, skill_code)
);

CREATE INDEX IF NOT EXISTS idx_technician_skills_lookup ON public.technician_skills (technician_id, skill_code);

-- ============================================================================
-- 4. TECHNICIAN TERRITORIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.technician_territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  technician_id UUID NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  territory_id UUID NOT NULL REFERENCES public.service_territories(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (technician_id, territory_id)
);

CREATE INDEX IF NOT EXISTS idx_technician_territories_tech ON public.technician_territories (technician_id);

-- ============================================================================
-- 5. TECHNICIAN WORKING HOURS & AVAILABILITY
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.technician_working_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  technician_id UUID NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL DEFAULT '08:00:00',
  end_time TIME NOT NULL DEFAULT '17:00:00',
  is_working_day BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (technician_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS public.technician_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  technician_id UUID NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'busy', 'time_off', 'sick_leave', 'training', 'on_call')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (technician_id, date)
);

CREATE INDEX IF NOT EXISTS idx_technician_avail_date ON public.technician_availability (technician_id, date);

-- ============================================================================
-- 6. WORK ORDERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  work_order_number TEXT NOT NULL,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE RESTRICT,
  technician_id UUID REFERENCES public.technicians(id) ON DELETE SET NULL,
  customer_account_id UUID REFERENCES public.customer_accounts(id) ON DELETE RESTRICT,
  customer_site_id UUID REFERENCES public.customer_sites(id) ON DELETE RESTRICT,
  asset_id UUID REFERENCES public.assets(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'assigned', 'accepted', 'en_route', 'on_site', 'in_progress', 'completed', 'incomplete', 'reassigned', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  scheduled_date DATE NOT NULL,
  scheduled_window_start TIME NOT NULL,
  scheduled_window_end TIME NOT NULL,
  actual_checkin_at TIMESTAMPTZ,
  actual_checkout_at TIMESTAMPTZ,
  service_summary TEXT,
  resolution_notes TEXT,
  customer_signature_name TEXT,
  customer_signature_timestamp TIMESTAMPTZ,
  is_billable BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (tenant_id, work_order_number)
);

CREATE INDEX IF NOT EXISTS idx_work_orders_tenant ON public.work_orders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_ticket ON public.work_orders (ticket_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_technician ON public.work_orders (technician_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status_date ON public.work_orders (tenant_id, status, scheduled_date);

-- ============================================================================
-- 7. WORK ORDER STAGES, TASKS & CHECKLISTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.work_order_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL CHECK (stage_name IN ('dispatch', 'travel', 'arrival_checkin', 'diagnosis', 'execution', 'checkout')),
  stage_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE (work_order_id, stage_name)
);

CREATE TABLE IF NOT EXISTS public.work_order_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  task_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  required_skill_code TEXT,
  is_mandatory BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  skip_reason TEXT,
  completed_by UUID REFERENCES auth.users(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_work_order_tasks_wo ON public.work_order_tasks (work_order_id);

CREATE TABLE IF NOT EXISTS public.work_order_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  label TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT true,
  is_checked BOOLEAN NOT NULL DEFAULT false,
  value TEXT,
  checked_at TIMESTAMPTZ,
  checked_by UUID REFERENCES auth.users(id),
  UNIQUE (work_order_id, item_key)
);

-- ============================================================================
-- 8. SERVICE VISITS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.service_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE RESTRICT,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL REFERENCES public.technicians(id) ON DELETE RESTRICT,
  visit_number INTEGER NOT NULL DEFAULT 1,
  visit_date DATE NOT NULL,
  arrival_time TIMESTAMPTZ,
  departure_time TIMESTAMPTZ,
  outcome TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (outcome IN ('in_progress', 'successful', 'partial', 'aborted', 'parts_needed', 'access_denied', 'rescheduled')),
  notes TEXT,
  customer_present_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_service_visits_ticket ON public.service_visits (ticket_id);
CREATE INDEX IF NOT EXISTS idx_service_visits_wo ON public.service_visits (work_order_id);

-- ============================================================================
-- 9. TECHNICIAN ASSIGNMENT & REASSIGNMENT HISTORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.technician_assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE RESTRICT,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL REFERENCES public.technicians(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('assigned', 'accepted', 'rejected', 'reassigned', 'unassigned')),
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR rejection_reason IN ('out_of_territory', 'skill_mismatch', 'schedule_conflict', 'vehicle_breakdown', 'emergency', 'other')),
  rejection_explanation TEXT,
  reassignment_reason TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  responded_at TIMESTAMPTZ,
  unassigned_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_assignment_history_wo ON public.technician_assignment_history (work_order_id);
CREATE INDEX IF NOT EXISTS idx_assignment_history_tech ON public.technician_assignment_history (technician_id);

-- ============================================================================
-- 10. OPT-IN TECHNICIAN LOCATION PINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.technician_location_pings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  technician_id UUID NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  accuracy_meters NUMERIC(6, 2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_location_pings_tech ON public.technician_location_pings (technician_id, recorded_at DESC);

-- ============================================================================
-- 11. WORK ORDER NUMBER GENERATION FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION app_private.generate_work_order_number(
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
  v_padding INTEGER := 6;
BEGIN
  INSERT INTO public.ticket_number_sequences (tenant_id, prefix, year, current_val, padding_length)
  VALUES (p_tenant_id, 'WO', v_year, 1, 6)
  ON CONFLICT (tenant_id, prefix, year)
  DO UPDATE SET
    current_val = public.ticket_number_sequences.current_val + 1,
    updated_at = timezone('utc', now())
  RETURNING current_val, padding_length INTO v_seq, v_padding;

  RETURN 'WO-' || v_year::text || '-' || lpad(v_seq::text, v_padding, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_work_order_number(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$ SELECT app_private.generate_work_order_number(p_tenant_id); $$;

-- ============================================================================
-- 12. ROW-LEVEL SECURITY & GRANTS
-- ============================================================================
ALTER TABLE public.service_territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technician_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technician_territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technician_working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technician_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technician_assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technician_location_pings ENABLE ROW LEVEL SECURITY;

-- Grants to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_territories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technicians TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technician_skills TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technician_territories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technician_working_hours TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technician_availability TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_order_stages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_order_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_order_checklists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_visits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technician_assignment_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technician_location_pings TO authenticated;

-- Operations staff access policies
CREATE POLICY "operations_service_territories_all"
  ON public.service_territories
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT m.tenant_id FROM public.memberships m
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "operations_technicians_all"
  ON public.technicians
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT m.tenant_id FROM public.memberships m
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "operations_technician_skills_all"
  ON public.technician_skills
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT m.tenant_id FROM public.memberships m
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "operations_technician_territories_all"
  ON public.technician_territories
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT m.tenant_id FROM public.memberships m
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "operations_technician_working_hours_all"
  ON public.technician_working_hours
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT m.tenant_id FROM public.memberships m
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "operations_technician_availability_all"
  ON public.technician_availability
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT m.tenant_id FROM public.memberships m
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "operations_work_orders_all"
  ON public.work_orders
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT m.tenant_id FROM public.memberships m
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "operations_work_order_stages_all"
  ON public.work_order_stages
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT m.tenant_id FROM public.memberships m
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "operations_work_order_tasks_all"
  ON public.work_order_tasks
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT m.tenant_id FROM public.memberships m
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "operations_work_order_checklists_all"
  ON public.work_order_checklists
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT m.tenant_id FROM public.memberships m
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "operations_service_visits_all"
  ON public.service_visits
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT m.tenant_id FROM public.memberships m
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "operations_technician_assignment_history_all"
  ON public.technician_assignment_history
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT m.tenant_id FROM public.memberships m
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "operations_technician_location_pings_all"
  ON public.technician_location_pings
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT m.tenant_id FROM public.memberships m
      WHERE m.user_id = auth.uid()
    )
  );
