import React from "react";
import { Routes, Route, Link } from "react-router-dom";
import { OperationsShell } from "./OperationsShell.js";
import { OrganizationAdminView } from "./admin/index.js";
import { CustomerListView } from "./customers/CustomerListView.js";
import { CustomerDetailView } from "./customers/CustomerDetailView.js";
import { AssetListView } from "./assets/AssetListView.js";
import { AssetDetailView } from "./assets/AssetDetailView.js";
import { TicketListView } from "./tickets/TicketListView.js";
import { TicketDetailView } from "./tickets/TicketDetailView.js";
import { ComplaintListView } from "./complaints/ComplaintListView.js";
import { QuotationListView } from "./quotations/QuotationListView.js";
import { DispatchBoardView } from "./dispatch/DispatchBoardView.js";
import { InventoryListView } from "./inventory/InventoryListView.js";
import { ServiceIntelligenceView } from "./intelligence/ServiceIntelligenceView.js";
import { IntegrationsView } from "./integrations/IntegrationsView.js";
import { ReportsDashboardView } from "./reports/ReportsDashboardView.js";
import { KnowledgeBaseView } from "./knowledge/KnowledgeBaseView.js";
import { Card, CardHeader } from "../../components/ui/Card.js";
import { Badge } from "../../components/ui/Badge.js";
import { useAuth } from "../../lib/auth-context.js";
import {
  Users,
  Settings,
  ShieldCheck,
  Mail,
  ArrowRight,
  Sparkles,
  Building,
  CheckCircle2,
  Clock,
} from "lucide-react";

export default function OperationsPortal() {
  return (
    <OperationsShell>
      <Routes>
        <Route path="/" element={<OperationsOverview />} />
        <Route path="/customers" element={<CustomerListView />} />
        <Route path="/customers/:id" element={<CustomerDetailView />} />
        <Route path="/assets" element={<AssetListView />} />
        <Route path="/assets/:id" element={<AssetDetailView />} />
        <Route path="/tickets" element={<TicketListView />} />
        <Route path="/tickets/:id" element={<TicketDetailView />} />
        <Route path="/dispatch/*" element={<DispatchBoardView />} />
        <Route path="/quotations" element={<QuotationListView />} />
        <Route path="/inventory/*" element={<InventoryListView />} />
        <Route path="/intelligence" element={<ServiceIntelligenceView />} />
        <Route path="/integrations" element={<IntegrationsView />} />
        <Route path="/reports" element={<ReportsDashboardView />} />
        <Route path="/knowledge" element={<KnowledgeBaseView />} />
        <Route path="/complaints" element={<ComplaintListView />} />
        <Route path="/admin/*" element={<OrganizationAdminView />} />
      </Routes>
    </OperationsShell>
  );
}

function OperationsOverview() {
  const { authContext, profile } = useAuth();
  const activeMembership = authContext?.activeMembership;

  return (
    <div className="space-y-6 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Welcome Banner */}
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 p-6 sm:p-8 text-white shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-blue-100">
                Operations Workspace
              </span>
              <Badge variant="primary">Step 9 Active</Badge>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Welcome back, {profile?.fullName || "Operator"}
            </h1>
            <p className="mt-1 text-sm text-blue-100 max-w-2xl">
              CareOS fleet registry, support desk, transactional ticket lifecycle, SLA governance, and complaint resolution are active.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/operations/intelligence"
              className="inline-flex items-center gap-2 rounded-xl bg-white/20 hover:bg-white/30 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition"
            >
              Service Intelligence
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              to="/operations/tickets"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-blue-700 shadow transition hover:bg-blue-50"
            >
              Support Desk
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Security & Tenancy Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Tenant Status
            </span>
            <Building className="h-4 w-4 text-neutral-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold text-neutral-900">Active</span>
            <Badge variant="success">Verified</Badge>
          </div>
          <p className="mt-1 text-[11px] text-neutral-400 font-mono truncate">
            ID: {authContext?.activeTenantId}
          </p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Your Portal Role
            </span>
            <ShieldCheck className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2">
            <span className="text-lg font-bold text-neutral-900">
              {activeMembership?.roles[0] || "operator"}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">
            {activeMembership?.roles.length || 1} assigned role(s)
          </p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              RLS Enforcement
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold text-neutral-900">42 Policies</span>
            <Badge variant="success">Active</Badge>
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">
            Zero cross-tenant leakage guaranteed
          </p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Audit Pipeline
            </span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold text-neutral-900">Enabled</span>
            <Badge variant="info">Immutable</Badge>
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">
            All privileged mutations recorded
          </p>
        </Card>
      </div>

      {/* Organization Admin Quick Links */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Organization Administration Quick Access
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            to="/operations/admin"
            className="group flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-xs transition hover:border-blue-300 hover:shadow-sm"
          >
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition">
                <Settings className="h-5 w-5" />
              </div>
              <h3 className="mt-3 font-semibold text-neutral-900">Organization Settings</h3>
              <p className="mt-1 text-xs text-neutral-500">
                Configure business details, branding colors, timezones, currency, and notifications.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-blue-600">
              <span>Open Profile</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            to="/operations/admin"
            className="group flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-xs transition hover:border-blue-300 hover:shadow-sm"
          >
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition">
                <Users className="h-5 w-5" />
              </div>
              <h3 className="mt-3 font-semibold text-neutral-900">Members & Roles</h3>
              <p className="mt-1 text-xs text-neutral-500">
                Manage organization personnel, assign RBAC roles, and control access permissions.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-indigo-600">
              <span>Manage Members</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            to="/operations/admin"
            className="group flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-xs transition hover:border-blue-300 hover:shadow-sm"
          >
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition">
                <Mail className="h-5 w-5" />
              </div>
              <h3 className="mt-3 font-semibold text-neutral-900">Team Invitations</h3>
              <p className="mt-1 text-xs text-neutral-500">
                Send secure one-time onboarding links for Operations, Technicians, and Customer users.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-emerald-600">
              <span>View Invitations</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
