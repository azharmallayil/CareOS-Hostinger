import React, { useState, useEffect } from "react";
import { useAuth } from "../../../lib/auth-context.js";
import { Card, CardHeader } from "../../../components/ui/Card.js";
import { Badge } from "../../../components/ui/Badge.js";
import {
  BarChart3,
  Download,
  Calendar,
  Filter,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Layers,
  FileSpreadsheet,
  FileCode,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

interface ReportSummary {
  ticketsSummary: {
    total: number;
    resolved: number;
    active: number;
    avgResolutionHours: number;
  };
  slaSummary: {
    complianceRate: number;
    breached: number;
    total: number;
  };
  breakdownByStatus: Record<string, number>;
  breakdownByPriority: Record<string, number>;
  breakdownByCategory: Record<string, number>;
  operationalAlerts: {
    lowStockCount: number;
    activeBulkCampaigns: number;
  };
}

export function ReportsDashboardView() {
  const { authContext, session } = useAuth();
  const token = session?.access_token;
  const activeTenantId = authContext?.activeTenantId;

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState("30"); // 7, 30, 90, all
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedPriority, setSelectedPriority] = useState("all");
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<ReportSummary>({
    ticketsSummary: { total: 0, resolved: 0, active: 0, avgResolutionHours: 0 },
    slaSummary: { complianceRate: 100, breached: 0, total: 0 },
    breakdownByStatus: {},
    breakdownByPriority: {},
    breakdownByCategory: {},
    operationalAlerts: { lowStockCount: 0, activeBulkCampaigns: 0 },
  });

  const fetchSummary = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateRange !== "all") {
        const days = parseInt(dateRange, 10);
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        params.set("startDate", startDate);
      }
      if (selectedStatus !== "all") params.set("status", selectedStatus);
      if (selectedPriority !== "all") params.set("priority", selectedPriority);

      const res = await fetch(`/api/v1/reports/summary?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      } else {
        const data = await res.json();
        setError(data.error?.message || "Failed to load report summary");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSummary();
  }, [token, activeTenantId, dateRange, selectedStatus, selectedPriority]);

  const handleExport = async (entityType: "tickets" | "customers" | "assets" | "inventory", format: "csv" | "json") => {
    if (!token) return;
    setExporting(`${entityType}-${format}`);
    try {
      const filters: Record<string, string> = {};
      if (dateRange !== "all") {
        const days = parseInt(dateRange, 10);
        filters.startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      }
      if (selectedStatus !== "all") filters.status = selectedStatus;

      const res = await fetch("/api/v1/reports/export", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ entityType, format, filters }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Export failed");
      }

      // Download file from response blob
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `careos-${entityType}-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Export failed: ${msg}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-blue-700">
              Analytics & Reporting
            </span>
            <Badge variant="primary">Step 16 Active</Badge>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            Operational Dashboards & Reports
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Multi-dimensional reporting, SLA compliance audit, volume trends, role-scoped CSV/JSON exports, and performance indexing.
          </p>
        </div>

        {/* Global Export Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void fetchSummary()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => void handleExport("tickets", "csv")}
            disabled={Boolean(exporting)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            {exporting === "tickets-csv" ? "Exporting..." : "Export Tickets (CSV)"}
          </button>
          <button
            onClick={() => void handleExport("tickets", "json")}
            disabled={Boolean(exporting)}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:opacity-50"
          >
            <FileCode className="h-3.5 w-3.5 text-neutral-500" />
            JSON
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
          <Filter className="h-4 w-4" />
          <span>Filters:</span>
        </div>

        {/* Date Range */}
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-neutral-400" />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-neutral-50 py-1 px-2.5 text-xs text-neutral-700 focus:outline-none"
          >
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="all">All Time</option>
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-neutral-50 py-1 px-2.5 text-xs text-neutral-700 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="new">New</option>
            <option value="in_progress">In Progress</option>
            <option value="awaiting_customer_approval">Awaiting Approval</option>
            <option value="awaiting_payment">Awaiting Payment</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {/* Priority Filter */}
        <div>
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-neutral-50 py-1 px-2.5 text-xs text-neutral-700 focus:outline-none"
          >
            <option value="all">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div className="ml-auto text-xs text-neutral-400">
          Showing metrics for active tenant scope
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Total Volume
            </span>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-neutral-900">{summary.ticketsSummary.total}</span>
            <span className="text-xs text-neutral-400">requests</span>
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">
            {summary.ticketsSummary.resolved} resolved • {summary.ticketsSummary.active} active
          </p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              SLA Compliance
            </span>
            <CheckCircle2
              className={`h-4 w-4 ${summary.slaSummary.complianceRate >= 90 ? "text-emerald-500" : "text-amber-500"}`}
            />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-neutral-900">{summary.slaSummary.complianceRate}%</span>
            <Badge variant={summary.slaSummary.complianceRate >= 90 ? "success" : "warning"}>
              {summary.slaSummary.breached} breached
            </Badge>
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">Across {summary.slaSummary.total} SLA instances</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Avg Resolution Time
            </span>
            <Clock className="h-4 w-4 text-neutral-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-neutral-900">{summary.ticketsSummary.avgResolutionHours}</span>
            <span className="text-xs text-neutral-500">hours</span>
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">Pause duration excluded</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Operational Alerts
            </span>
            <AlertTriangle
              className={`h-4 w-4 ${summary.operationalAlerts.lowStockCount > 0 ? "text-amber-500" : "text-neutral-400"}`}
            />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-neutral-900">
              {summary.operationalAlerts.lowStockCount + summary.operationalAlerts.activeBulkCampaigns}
            </span>
            <span className="text-xs text-neutral-400">items</span>
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">
            {summary.operationalAlerts.lowStockCount} low-stock parts • {summary.operationalAlerts.activeBulkCampaigns} bulk campaigns
          </p>
        </Card>
      </div>

      {/* Breakdown Distributions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Priority Breakdown */}
        <Card>
          <CardHeader title="Priority Distribution" description="Requests grouped by severity tier." />
          <div className="mt-4 space-y-3">
            {["critical", "high", "medium", "low"].map((p) => {
              const count = summary.breakdownByPriority[p] || 0;
              const total = summary.ticketsSummary.total || 1;
              const pct = Math.round((count / total) * 100);
              const variant = p === "critical" ? "error" : p === "high" ? "warning" : p === "medium" ? "primary" : "neutral";

              return (
                <div key={p} className="rounded-xl border border-neutral-100 bg-neutral-50/50 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <Badge variant={variant}>{p.toUpperCase()}</Badge>
                    <span className="font-bold text-neutral-900">{count} ({pct}%)</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-neutral-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        p === "critical" ? "bg-red-500" : p === "high" ? "bg-amber-500" : p === "medium" ? "bg-blue-500" : "bg-neutral-400"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Status Breakdown */}
        <Card>
          <CardHeader title="Status Distribution" description="Current service request state mix." />
          <div className="mt-4 space-y-2">
            {Object.entries(summary.breakdownByStatus).length === 0 ? (
              <div className="py-8 text-center text-xs text-neutral-400">No requests recorded yet.</div>
            ) : (
              Object.entries(summary.breakdownByStatus).map(([st, count]) => (
                <div key={st} className="flex items-center justify-between rounded-lg border border-neutral-100 p-2 text-xs">
                  <span className="font-medium capitalize text-neutral-700">{st.replace(/_/g, " ")}</span>
                  <span className="font-bold text-neutral-900 font-mono">{count}</span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Category Breakdown & Export Options */}
        <Card>
          <CardHeader title="Category Mix & Additional Exports" description="Service categories & module exports." />
          <div className="mt-4 space-y-2">
            {Object.entries(summary.breakdownByCategory).map(([cat, count]) => (
              <div key={cat} className="flex items-center justify-between text-xs py-1 border-b border-neutral-100">
                <span className="capitalize text-neutral-600">{cat}</span>
                <span className="font-bold text-neutral-900">{count}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-neutral-100 pt-4 space-y-2">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
              Additional Entity Exports
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void handleExport("assets", "csv")}
                className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
              >
                Export Fleet (CSV)
              </button>
              <button
                onClick={() => void handleExport("customers", "csv")}
                className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
              >
                Export Customers (CSV)
              </button>
              <button
                onClick={() => void handleExport("inventory", "csv")}
                className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
              >
                Export Inventory (CSV)
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* Security & Audit Footnote */}
      <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-500">
        <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
        <span>
          Every export event is audited in <code>export_audit_logs</code> recording caller identity, portal context, and applied filters. Internal costs, margins, and notes are never leaked to external customer users.
        </span>
      </div>
    </div>
  );
}
