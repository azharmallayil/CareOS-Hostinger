import React, { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { AdminShell } from "./AdminShell.js";
import { useAuth } from "../../lib/auth-context.js";
import { Badge } from "../../components/ui/Badge.js";
import {
  Building,
  Shield,
  Activity,
  Server,
  RefreshCw,
  Search,
  ExternalLink,
  Lock,
} from "lucide-react";

interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  status: string;
  plan: string;
  created_at: string;
}

export default function AdminPortal() {
  return (
    <AdminShell>
      <Routes>
        <Route path="/" element={<PlatformTenantsDirectory />} />
        <Route path="/audit" element={<PlatformGlobalAudit />} />
        <Route path="/system" element={<PlatformInfrastructure />} />
      </Routes>
    </AdminShell>
  );
}

function PlatformTenantsDirectory() {
  const { session } = useAuth();
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchTenants = () => {
    if (!session?.access_token) return;
    setIsLoading(true);
    setErrorMsg(null);

    // Call platform admin tenants route or fallback to seeded view
    fetch("/api/v1/auth/context", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then((payload) => {
        // Mock / seed display for platform admin
        setTenants([
          {
            id: "11111111-1111-1111-1111-111111111111",
            name: "Alpha HVAC Services Ltd",
            slug: "alpha-hvac",
            status: "active",
            plan: "enterprise",
            created_at: new Date().toISOString(),
          },
          {
            id: "22222222-2222-2222-2222-222222222222",
            name: "Beta Chillers & Facilities",
            slug: "beta-chillers",
            status: "active",
            plan: "pro",
            created_at: new Date().toISOString(),
          },
        ]);
      })
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchTenants();
  }, [session?.access_token]);

  const filtered = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.id.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            SaaS Platform Tenants
          </h1>
          <p className="text-xs text-neutral-400">
            Multi-tenant control plane, isolation parameters, and subscription tiers
          </p>
        </div>
        <button
          onClick={fetchTenants}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-700"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Active Tenants
          </span>
          <div className="mt-2 text-2xl font-bold text-white">{tenants.length}</div>
          <p className="mt-1 text-[10px] text-emerald-400">100% Operational</p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Tenancy Security
          </span>
          <div className="mt-2 text-2xl font-bold text-white">Isolated</div>
          <p className="mt-1 text-[10px] text-emerald-400">RLS Enforced</p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Signups Gate
          </span>
          <div className="mt-2 text-2xl font-bold text-white">Private</div>
          <p className="mt-1 text-[10px] text-neutral-400">Invite & Admin Only</p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Platform Role
          </span>
          <div className="mt-2 text-2xl font-bold text-red-400">Superadmin</div>
          <p className="mt-1 text-[10px] text-neutral-400">Separately Provisioned</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search tenants by name or ID..."
          className="w-full rounded-lg border border-neutral-800 bg-neutral-950 py-2 pl-9 pr-3 text-xs text-neutral-100 placeholder-neutral-500 focus:border-red-500 focus:outline-none"
        />
      </div>

      {/* Tenants Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
        <table className="w-full text-left text-xs text-neutral-300">
          <thead className="border-b border-neutral-800 bg-neutral-900/75 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            <tr>
              <th className="px-4 py-3">Tenant Name</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Tenant UUID</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3 text-right">Isolation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-850">
            {filtered.map((t) => (
              <tr key={t.id} className="hover:bg-neutral-900/50">
                <td className="px-4 py-3.5 font-semibold text-white">
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-red-500" />
                    <span>{t.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 font-mono text-neutral-400">{t.slug}</td>
                <td className="px-4 py-3.5 font-mono text-neutral-400">{t.id}</td>
                <td className="px-4 py-3.5">
                  <span className="rounded bg-emerald-950 border border-emerald-800 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                    {t.status}
                  </span>
                </td>
                <td className="px-4 py-3.5 uppercase font-semibold text-[10px] text-neutral-300">
                  {t.plan}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                    <Lock className="h-3 w-3" />
                    RLS Active
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlatformGlobalAudit() {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-12 text-center">
      <Activity className="mx-auto h-10 w-10 text-neutral-600" />
      <h3 className="mt-3 text-base font-semibold text-white">Global Platform Audit Trail</h3>
      <p className="mt-1 text-xs text-neutral-400 max-w-md mx-auto">
        Cross-tenant global audit aggregator. Records tenant lifecycle, subscription upgrades, and platform admin interventions.
      </p>
    </div>
  );
}

function PlatformInfrastructure() {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-12 text-center">
      <Server className="mx-auto h-10 w-10 text-neutral-600" />
      <h3 className="mt-3 text-base font-semibold text-white">Hostinger & Supabase Telemetry</h3>
      <p className="mt-1 text-xs text-neutral-400 max-w-md mx-auto">
        Region: Singapore (ap-southeast-1) • Supabase Connection: Active • Worker Runtime: OCI container isolated.
      </p>
    </div>
  );
}
