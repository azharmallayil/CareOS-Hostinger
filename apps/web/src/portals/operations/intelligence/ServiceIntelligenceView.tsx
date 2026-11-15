import React, { useState, useEffect } from "react";
import { useAuth } from "../../../lib/auth-context.js";
import { Card, CardHeader } from "../../../components/ui/Card.js";
import { Badge } from "../../../components/ui/Badge.js";
import {
  BarChart3,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Users,
  Layers,
  ShieldAlert,
  RefreshCw,
  Building2,
  TrendingUp,
} from "lucide-react";

interface IntelligenceOverview {
  totalTickets: number;
  activeTickets: number;
  resolvedTickets: number;
  overdueTickets: number;
  slaComplianceRate: number;
  avgResolutionHours: number;
  escalatedTicketsCount: number;
}

interface SlaPriorityMetric {
  total: number;
  breached: number;
  compliant: number;
  rate: number;
}

interface TechnicianStat {
  id: string;
  name: string;
  isActive: boolean;
  skills: string[];
  activeJobs: number;
  completedJobs: number;
  utilizationPercentage: number;
}

interface CustomerSummary {
  id: string;
  name: string;
  accountNumber: string;
  status: string;
  totalTickets: number;
  openTickets: number;
}

export function ServiceIntelligenceView() {
  const { authContext, session } = useAuth();
  const token = session?.access_token;
  const activeTenantId = authContext?.activeTenantId;

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<IntelligenceOverview>({
    totalTickets: 0,
    activeTickets: 0,
    resolvedTickets: 0,
    overdueTickets: 0,
    slaComplianceRate: 100,
    avgResolutionHours: 0,
    escalatedTicketsCount: 0,
  });
  const [slaByPriority, setSlaByPriority] = useState<Record<string, SlaPriorityMetric>>({});
  const [serviceVolume, setServiceVolume] = useState<{
    byCategory: Record<string, number>;
    byStatus: Record<string, number>;
  }>({ byCategory: {}, byStatus: {} });
  const [technicians, setTechnicians] = useState<TechnicianStat[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchIntelligenceData = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      const [overviewRes, slaRes, volumeRes, techRes, custRes] = await Promise.all([
        fetch("/api/v1/intelligence/overview", { credentials: "include", headers }),
        fetch("/api/v1/intelligence/sla-compliance", { credentials: "include", headers }),
        fetch("/api/v1/intelligence/service-volume", { credentials: "include", headers }),
        fetch("/api/v1/intelligence/technician-workload", { credentials: "include", headers }),
        fetch("/api/v1/intelligence/customer-history", { credentials: "include", headers }),
      ]);

      if (overviewRes.ok) {
        const data = await overviewRes.json();
        setOverview(data);
      }
      if (slaRes.ok) {
        const data = await slaRes.json();
        setSlaByPriority(data.byPriority || {});
      }
      if (volumeRes.ok) {
        const data = await volumeRes.json();
        setServiceVolume(data);
      }
      if (techRes.ok) {
        const data = await techRes.json();
        setTechnicians(data.technicians || []);
      }
      if (custRes.ok) {
        const data = await custRes.json();
        setCustomers(data.customers || []);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to load intelligence metrics: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchIntelligenceData();
  }, [token, activeTenantId]);

  return (
    <div className="space-y-6 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-blue-700">
              Operations & Analytics
            </span>
            <Badge variant="primary">Step 14 Active</Badge>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            Service Intelligence & SLA Governance
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Tenant-isolated analytics, SLA compliance, technician workload, and OCI worker durable job telemetry.
          </p>
        </div>
        <div>
          <button
            onClick={() => void fetchIntelligenceData()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh Telemetry
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              SLA Compliance
            </span>
            <CheckCircle2 className={`h-4 w-4 ${overview.slaComplianceRate >= 90 ? "text-emerald-500" : "text-amber-500"}`} />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-neutral-900">{overview.slaComplianceRate}%</span>
            <Badge variant={overview.slaComplianceRate >= 90 ? "success" : "warning"}>
              {overview.slaComplianceRate >= 90 ? "On Target" : "Attention"}
            </Badge>
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">Total requests under active SLA</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Overdue Tickets
            </span>
            <AlertTriangle className={`h-4 w-4 ${overview.overdueTickets > 0 ? "text-red-500" : "text-neutral-400"}`} />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-neutral-900">{overview.overdueTickets}</span>
            <Badge variant={overview.overdueTickets > 0 ? "error" : "success"}>
              {overview.overdueTickets > 0 ? "Action Required" : "Clean"}
            </Badge>
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">Past target resolution threshold</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Active Requests
            </span>
            <Clock className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-neutral-900">{overview.activeTickets}</span>
            <span className="text-xs text-neutral-400">of {overview.totalTickets} total</span>
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">In dispatch, progress, or review</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Avg Resolution Time
            </span>
            <TrendingUp className="h-4 w-4 text-neutral-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-neutral-900">{overview.avgResolutionHours}</span>
            <span className="text-xs text-neutral-500">hours</span>
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">Clock pauses excluded</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Escalations Logged
            </span>
            <ShieldAlert className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-neutral-900">{overview.escalatedTicketsCount}</span>
            <Badge variant="neutral">Recorded</Badge>
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">Tier 1 & 2 audit trail triggers</p>
        </Card>
      </div>

      {/* SLA by Priority & Service Volume */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* SLA Compliance by Priority */}
        <Card>
          <CardHeader
            title="SLA Performance by Priority"
            description="Resolution and response compliance broken down by severity tier."
          />
          <div className="mt-4 space-y-4">
            {["critical", "high", "medium", "low"].map((priority) => {
              const stat = slaByPriority[priority] || { total: 0, breached: 0, compliant: 0, rate: 100 };
              const badgeVariant =
                priority === "critical" ? "error" : priority === "high" ? "warning" : priority === "medium" ? "primary" : "neutral";

              return (
                <div key={priority} className="rounded-xl border border-neutral-100 bg-neutral-50/50 p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={badgeVariant}>{priority.toUpperCase()}</Badge>
                      <span className="text-xs text-neutral-500">
                        {stat.compliant} compliant / {stat.total} requests
                      </span>
                    </div>
                    <span className="text-xs font-bold text-neutral-900">{stat.rate}%</span>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2 h-2 w-full rounded-full bg-neutral-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        stat.rate >= 90 ? "bg-emerald-500" : stat.rate >= 75 ? "bg-amber-500" : "bg-red-500"
                      }`}
                      style={{ width: `${stat.total === 0 ? 100 : stat.rate}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Service Volume Breakdown */}
        <Card>
          <CardHeader
            title="Service Volume & Category Mix"
            description="Operational volume categorized by maintenance, repair, and inspection."
          />
          <div className="mt-4 grid grid-cols-2 gap-3">
            {Object.entries(serviceVolume.byCategory).length === 0 ? (
              <div className="col-span-2 py-8 text-center text-xs text-neutral-400">
                No tickets recorded in current tenant yet.
              </div>
            ) : (
              Object.entries(serviceVolume.byCategory).map(([cat, count]) => (
                <div key={cat} className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium capitalize text-neutral-600">{cat}</span>
                    <Layers className="h-3.5 w-3.5 text-neutral-400" />
                  </div>
                  <div className="mt-1 text-lg font-bold text-neutral-900">{count}</div>
                  <p className="text-[10px] text-neutral-400">Active & Historical</p>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 border-t border-neutral-100 pt-3">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Status Distribution
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(serviceVolume.byStatus).map(([st, count]) => (
                <span
                  key={st}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-700"
                >
                  <span className="font-medium capitalize">{st.replace(/_/g, " ")}:</span>
                  <span className="font-bold text-neutral-900">{count}</span>
                </span>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Technician Workload & Capacity */}
      <Card>
        <CardHeader
          title="Technician Workload & Capacity Utilization"
          description="Real-time dispatch load, active job allocations, and utilization metrics."
        />
        <div className="mt-4 overflow-x-auto">
          {technicians.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-400">
              No technicians registered in this tenant organization.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Technician</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-3 font-semibold">Active Jobs</th>
                  <th className="py-2.5 px-3 font-semibold">Completed</th>
                  <th className="py-2.5 px-3 font-semibold">Capacity Utilization</th>
                  <th className="py-2.5 px-3 font-semibold">Skills</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-neutral-700">
                {technicians.map((t) => (
                  <tr key={t.id} className="hover:bg-neutral-50/50">
                    <td className="py-3 px-3 font-medium text-neutral-900">{t.name}</td>
                    <td className="py-3 px-3">
                      <Badge variant={t.isActive ? "success" : "neutral"}>
                        {t.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 font-bold text-neutral-900">{t.activeJobs}</td>
                    <td className="py-3 px-3 text-neutral-600">{t.completedJobs}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-neutral-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              t.utilizationPercentage >= 75
                                ? "bg-amber-500"
                                : t.utilizationPercentage >= 100
                                ? "bg-red-500"
                                : "bg-blue-500"
                            }`}
                            style={{ width: `${t.utilizationPercentage}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold text-neutral-600">
                          {t.utilizationPercentage}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {t.skills.slice(0, 3).map((sk) => (
                          <span
                            key={sk}
                            className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600"
                          >
                            {sk}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Customer Service History Summary */}
      <Card>
        <CardHeader
          title="Customer Account Service History"
          description="High-level customer request volumes, open items, and account activity."
        />
        <div className="mt-4 overflow-x-auto">
          {customers.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-400">
              No customer accounts linked to this tenant yet.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Customer Account</th>
                  <th className="py-2.5 px-3 font-semibold">Account Number</th>
                  <th className="py-2.5 px-3 font-semibold">Account Status</th>
                  <th className="py-2.5 px-3 font-semibold">Open Tickets</th>
                  <th className="py-2.5 px-3 font-semibold">Total Requests</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-neutral-700">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50/50">
                    <td className="py-3 px-3 font-medium text-neutral-900">{c.name}</td>
                    <td className="py-3 px-3 font-mono text-neutral-500">{c.accountNumber}</td>
                    <td className="py-3 px-3">
                      <Badge variant={c.status === "active" ? "success" : "neutral"}>
                        {c.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`font-semibold ${
                          c.openTickets > 0 ? "text-amber-600" : "text-neutral-500"
                        }`}
                      >
                        {c.openTickets}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-neutral-900">{c.totalTickets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
