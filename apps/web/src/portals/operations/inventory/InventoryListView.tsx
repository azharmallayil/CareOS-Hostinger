import React, { useState, useEffect } from "react";
import { Card } from "../../../components/ui/Card.js";
import { Badge } from "../../../components/ui/Badge.js";
import { useAuth } from "../../../lib/auth-context.js";
import {
  Layers,
  AlertTriangle,
  RotateCcw,
  Calendar,
  CheckCircle2,
  Package,
  Wrench,
  Plus,
  RefreshCw,
  Search,
  Truck,
  ArrowRightLeft,
} from "lucide-react";

interface Part {
  id: string;
  part_number: string;
  name: string;
  category: string;
  unit_of_measure: string;
  unit_price: number;
  reorder_threshold: number;
}

interface StockLevel {
  id: string;
  part_id: string;
  stock_location_id: string;
  quantity_on_hand: number;
  part?: Part;
  location?: { name: string; location_type: string };
}

interface RmaCase {
  id: string;
  case_number: string;
  status: string;
  reason_for_return: string;
  created_at: string;
  customer?: { name: string };
  asset?: { make?: string; model?: string; fleet_number?: string };
  ticket?: { ticket_number: string };
}

interface MaintenanceSchedule {
  id: string;
  status: string;
  next_due_date?: string;
  next_due_odometer_km?: number;
  plan?: { name: string; trigger_type: string };
  asset?: { make?: string; model?: string; fleet_number?: string };
}

export function InventoryListView() {
  const { authContext, session } = useAuth();
  const tenantId = authContext?.activeTenantId;
  const token = session?.access_token;

  const [activeTab, setActiveTab] = useState<"inventory" | "rma" | "maintenance">("inventory");
  const [parts, setParts] = useState<Part[]>([]);
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([]);
  const [lowStock, setLowStock] = useState<StockLevel[]>([]);
  const [rmaCases, setRmaCases] = useState<RmaCase[]>([]);
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    if (!token || !tenantId) return;
    setLoading(true);
    try {
      const [partsRes, levelsRes, lowRes, rmaRes, schedRes] = await Promise.all([
        fetch("/api/v1/inventory/parts", {
          headers: { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId },
        }),
        fetch("/api/v1/inventory/levels", {
          headers: { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId },
        }),
        fetch("/api/v1/inventory/low-stock", {
          headers: { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId },
        }),
        fetch("/api/v1/rma", {
          headers: { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId },
        }),
        fetch("/api/v1/maintenance/schedules", {
          headers: { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId },
        }),
      ]);

      if (partsRes.ok) {
        const d = await partsRes.json();
        setParts(d.parts || []);
      }
      if (levelsRes.ok) {
        const d = await levelsRes.json();
        setStockLevels(d.levels || []);
      }
      if (lowRes.ok) {
        const d = await lowRes.json();
        setLowStock(d.lowStock || []);
      }
      if (rmaRes.ok) {
        const d = await rmaRes.json();
        setRmaCases(d.rmaCases || []);
      }
      if (schedRes.ok) {
        const d = await schedRes.json();
        setSchedules(d.schedules || []);
      }
    } catch (err) {
      console.error("Failed to load inventory data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tenantId, token]);

  return (
    <div className="space-y-6 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800">
              Supply Chain & Reliability
            </span>
            <Badge variant="primary">Step 13 Active</Badge>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">
            Spare-Parts Inventory, Warranty RMA & Maintenance
          </h1>
          <p className="mt-1 text-xs text-neutral-500">
            Centralized spare parts tracking, multi-location stock movements, warranty return authorizations, and preventive maintenance.
          </p>
        </div>

        <button
          onClick={fetchData}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 shadow-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Low-Stock Alert Warning Banner */}
      {lowStock.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-center justify-between gap-3 text-xs text-amber-900 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <span>
              <strong>Low-Stock Alert:</strong> {lowStock.length} spare part(s) are at or below reorder threshold.
            </span>
          </div>
          <Badge variant="warning">Action Needed</Badge>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-neutral-200">
        <button
          onClick={() => setActiveTab("inventory")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeTab === "inventory"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          <Layers className="h-4 w-4" />
          Spare Parts & Stock ({parts.length})
        </button>
        <button
          onClick={() => setActiveTab("rma")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeTab === "rma"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          <RotateCcw className="h-4 w-4" />
          Warranty & RMA Cases ({rmaCases.length})
        </button>
        <button
          onClick={() => setActiveTab("maintenance")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeTab === "maintenance"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          <Calendar className="h-4 w-4" />
          Preventive Maintenance ({schedules.length})
        </button>
      </div>

      {/* TAB 1: INVENTORY & STOCK LEVELS */}
      {activeTab === "inventory" && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-semibold uppercase">
                <tr>
                  <th className="px-4 py-3">Part #</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">UOM</th>
                  <th className="px-4 py-3">Unit Price</th>
                  <th className="px-4 py-3">Reorder Alert</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {parts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                      No spare parts catalog entries found.
                    </td>
                  </tr>
                ) : (
                  parts.map((p) => (
                    <tr key={p.id} className="hover:bg-neutral-50/50">
                      <td className="px-4 py-3 font-mono font-bold text-blue-600">
                        {p.part_number}
                      </td>
                      <td className="px-4 py-3 font-semibold text-neutral-900">{p.name}</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                          {p.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-600 uppercase">{p.unit_of_measure}</td>
                      <td className="px-4 py-3 font-mono font-bold text-neutral-900">
                        {Number(p.unit_price).toFixed(2)} SAR
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-neutral-600">≤ {p.reorder_threshold} units</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: RMA CASES */}
      {activeTab === "rma" && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-semibold uppercase">
                <tr>
                  <th className="px-4 py-3">RMA #</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rmaCases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                      No RMA warranty cases recorded.
                    </td>
                  </tr>
                ) : (
                  rmaCases.map((rma) => (
                    <tr key={rma.id} className="hover:bg-neutral-50/50">
                      <td className="px-4 py-3 font-mono font-bold text-blue-600">
                        {rma.case_number}
                      </td>
                      <td className="px-4 py-3 font-semibold text-neutral-900">
                        {rma.customer?.name}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        {rma.asset?.make} {rma.asset?.model} ({rma.asset?.fleet_number})
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            rma.status === "closed" || rma.status === "replaced"
                              ? "success"
                              : rma.status === "rejected"
                              ? "error"
                              : "neutral"
                          }
                        >
                          {rma.status.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-neutral-600 truncate max-w-xs">
                        {rma.reason_for_return}
                      </td>
                      <td className="px-4 py-3 text-neutral-500">
                        {new Date(rma.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PREVENTIVE MAINTENANCE SCHEDULES */}
      {activeTab === "maintenance" && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-semibold uppercase">
                <tr>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Next Due Date</th>
                  <th className="px-4 py-3">Next Due Mileage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {schedules.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                      No preventive maintenance schedules configured.
                    </td>
                  </tr>
                ) : (
                  schedules.map((s) => (
                    <tr key={s.id} className="hover:bg-neutral-50/50">
                      <td className="px-4 py-3 font-bold text-neutral-900">{s.plan?.name}</td>
                      <td className="px-4 py-3 text-neutral-700">
                        {s.asset?.make} {s.asset?.model} ({s.asset?.fleet_number})
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            s.status === "completed"
                              ? "success"
                              : s.status === "overdue"
                              ? "error"
                              : s.status === "due"
                              ? "warning"
                              : "neutral"
                          }
                        >
                          {s.status.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-neutral-600">{s.next_due_date || "—"}</td>
                      <td className="px-4 py-3 text-neutral-600 font-mono">
                        {s.next_due_odometer_km ? `${s.next_due_odometer_km} km` : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
