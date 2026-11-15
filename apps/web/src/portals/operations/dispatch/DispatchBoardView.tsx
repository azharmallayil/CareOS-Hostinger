import React, { useState, useEffect } from "react";
import { Card } from "../../../components/ui/Card.js";
import { Badge } from "../../../components/ui/Badge.js";
import { useAuth } from "../../../lib/auth-context.js";
import {
  Wrench,
  Clock,
  UserCheck,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Sparkles,
  Layers,
  ChevronRight,
  Shield,
  RefreshCw,
  Plus,
} from "lucide-react";

interface QueueItem {
  id: string;
  ticket_number: string;
  title: string;
  priority: string;
  coverage_type: string;
  customer?: { name: string };
  site?: { name: string; city?: string };
  asset?: { make?: string; model?: string; fleet_number?: string; vin?: string };
  category?: { name: string; code: string };
  created_at: string;
}

interface Recommendation {
  technicianId: string;
  fullName: string;
  totalScore: number;
  isEligible: boolean;
  scoreBreakdown: {
    skillScore: number;
    territoryScore: number;
    availabilityScore: number;
    workloadScore: number;
    proximityScore: number;
  };
  reasons: string[];
}

interface WorkOrder {
  id: string;
  work_order_number: string;
  ticket_id: string;
  technician_id?: string;
  status: string;
  priority: string;
  scheduled_date: string;
  scheduled_window_start: string;
  scheduled_window_end: string;
  ticket?: { ticket_number: string; title: string };
  technician?: { full_name: string; phone?: string };
  customer?: { name: string };
  site?: { name: string; city?: string };
  asset?: { make?: string; model?: string; fleet_number?: string };
}

export function DispatchBoardView() {
  const { authContext, session } = useAuth();
  const tenantId = authContext?.activeTenantId;
  const token = session?.access_token;

  const [activeTab, setActiveTab] = useState<"queue" | "orders" | "bulk">("queue");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<QueueItem | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [assigningTechId, setAssigningTechId] = useState<string>("");
  const [scheduledDate, setScheduledDate] = useState<string>(
    new Date().toISOString().split("T")[0] || ""
  );

  // Reassignment state
  const [reassignModalWo, setReassignModalWo] = useState<WorkOrder | null>(null);
  const [newTechId, setNewTechId] = useState("");
  const [reassignmentReason, setReassignmentReason] = useState("");

  const fetchData = async () => {
    if (!token || !tenantId) return;
    setLoading(true);
    try {
      const [queueRes, woRes] = await Promise.all([
        fetch("/api/v1/dispatch/queue", {
          headers: { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId },
        }),
        fetch("/api/v1/work-orders", {
          headers: { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId },
        }),
      ]);

      if (queueRes.ok) {
        const qData = await queueRes.json();
        setQueue(qData.queue || []);
      }
      if (woRes.ok) {
        const wData = await woRes.json();
        setWorkOrders(wData.workOrders || []);
      }
    } catch (err) {
      console.error("Error fetching dispatch board data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tenantId, token]);

  const loadRecommendations = async (ticket: QueueItem) => {
    setSelectedTicket(ticket);
    setRecLoading(true);
    setRecommendations([]);
    setAssigningTechId("");
    try {
      const res = await fetch(
        `/api/v1/dispatch/recommendations?ticketId=${ticket.id}&scheduledDate=${scheduledDate}`,
        {
          headers: { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId || "" },
        }
      );
      if (res.ok) {
        const data = await res.json();
        setRecommendations(data.recommendations || []);
        if (data.recommendations?.length > 0) {
          setAssigningTechId(data.recommendations[0].technicianId);
        }
      }
    } catch (err) {
      console.error("Failed to load recommendations", err);
    } finally {
      setRecLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedTicket || !assigningTechId || !scheduledDate) return;
    try {
      const res = await fetch("/api/v1/dispatch/assign", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-ID": tenantId || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          technicianId: assigningTechId,
          scheduledDate,
          scheduledWindowStart: "09:00:00",
          scheduledWindowEnd: "12:00:00",
          priority: selectedTicket.priority,
        }),
      });
      if (res.ok) {
        setSelectedTicket(null);
        fetchData();
      }
    } catch (err) {
      console.error("Assign error", err);
    }
  };

  const handleReassign = async () => {
    if (!reassignModalWo || !newTechId || !reassignmentReason.trim()) return;
    try {
      const res = await fetch("/api/v1/dispatch/reassign", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-ID": tenantId || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workOrderId: reassignModalWo.id,
          newTechnicianId: newTechId,
          reassignmentReason,
        }),
      });
      if (res.ok) {
        setReassignModalWo(null);
        setReassignmentReason("");
        setNewTechId("");
        fetchData();
      }
    } catch (err) {
      console.error("Reassign error", err);
    }
  };

  return (
    <div className="space-y-6 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
              Field Operations
            </span>
            <Badge variant="primary">Step 11 Active</Badge>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">
            Dispatch Board & Work Orders
          </h1>
          <p className="mt-1 text-xs text-neutral-500">
            Ranked technician recommendation engine, manual assignment authority, and field work order lifecycle.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 shadow-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-neutral-200">
        <button
          onClick={() => setActiveTab("queue")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeTab === "queue"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          <Clock className="h-4 w-4" />
          Dispatch Queue ({queue.length})
        </button>
        <button
          onClick={() => setActiveTab("orders")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeTab === "orders"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          <Wrench className="h-4 w-4" />
          Active Work Orders ({workOrders.length})
        </button>
      </div>

      {/* TAB 1: DISPATCH QUEUE */}
      {activeTab === "queue" && (
        <div className="space-y-4">
          {queue.length === 0 ? (
            <Card>
              <div className="py-12 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                <h3 className="mt-2 text-sm font-semibold text-neutral-900">Dispatch Queue Clear</h3>
                <p className="mt-1 text-xs text-neutral-500">
                  No tickets currently awaiting assignment.
                </p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {queue.map((ticket) => (
                <div
                  key={ticket.id}
                  className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-blue-600">
                        {ticket.ticket_number}
                      </span>
                      <Badge
                        variant={
                          ticket.priority === "critical"
                            ? "error"
                            : ticket.priority === "high"
                            ? "warning"
                            : "neutral"
                        }
                      >
                        {ticket.priority.toUpperCase()}
                      </Badge>
                      <span className="rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 uppercase">
                        {ticket.coverage_type}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-neutral-900">{ticket.title}</h3>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
                      <span>Customer: <strong>{ticket.customer?.name || "Direct Fleet"}</strong></span>
                      {ticket.site && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-neutral-400" />
                          {ticket.site.name} ({ticket.site.city || "Local"})
                        </span>
                      )}
                      {ticket.asset && (
                        <span>
                          Asset: <strong>{ticket.asset.make} {ticket.asset.model}</strong> ({ticket.asset.fleet_number || ticket.asset.vin})
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => loadRecommendations(ticket)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700 shrink-0"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                    Find Recommendations
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ACTIVE WORK ORDERS */}
      {activeTab === "orders" && (
        <div className="space-y-4">
          {workOrders.length === 0 ? (
            <Card>
              <div className="py-12 text-center text-xs text-neutral-500">
                No active work orders.
              </div>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-semibold uppercase">
                  <tr>
                    <th className="px-4 py-3">Work Order #</th>
                    <th className="px-4 py-3">Ticket</th>
                    <th className="px-4 py-3">Technician</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Scheduled Date</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {workOrders.map((wo) => (
                    <tr key={wo.id} className="hover:bg-neutral-50/50">
                      <td className="px-4 py-3 font-mono font-bold text-blue-600">
                        {wo.work_order_number}
                      </td>
                      <td className="px-4 py-3 font-semibold text-neutral-900">
                        {wo.ticket?.ticket_number} - {wo.ticket?.title}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        {wo.technician?.full_name || <span className="text-amber-600 font-semibold">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            wo.status === "completed"
                              ? "success"
                              : wo.status === "en_route" || wo.status === "on_site"
                              ? "info"
                              : wo.status === "cancelled"
                              ? "error"
                              : "neutral"
                          }
                        >
                          {wo.status.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-neutral-600">
                        {wo.scheduled_date} ({wo.scheduled_window_start.slice(0, 5)} - {wo.scheduled_window_end.slice(0, 5)})
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            setReassignModalWo(wo);
                            setNewTechId("");
                            setReassignmentReason("");
                          }}
                          className="rounded px-2 py-1 text-xs font-semibold text-neutral-700 border border-neutral-200 hover:bg-neutral-100"
                        >
                          Reassign
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* RECOMMENDATIONS & ASSIGNMENT MODAL */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <span className="text-xs font-mono font-bold text-blue-600">
                  {selectedTicket.ticket_number}
                </span>
                <h2 className="text-base font-bold text-neutral-900">
                  Technician Recommendations & Dispatch
                </h2>
              </div>
              <button
                onClick={() => setSelectedTicket(null)}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-100"
              >
                ✕
              </button>
            </div>

            <div className="rounded-lg bg-neutral-50 p-3 text-xs space-y-1">
              <div>Service: <strong>{selectedTicket.title}</strong></div>
              <div>Customer Site: {selectedTicket.site?.name} ({selectedTicket.site?.city || "Local"})</div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-700">Scheduled Date</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                  Ranked Candidates
                </span>
                <span className="text-[11px] text-neutral-400">
                  Scored by Skills (30), Territory (25), Schedule (20), Workload (15), Proximity (10)
                </span>
              </div>

              {recLoading ? (
                <div className="py-8 text-center text-xs text-neutral-500">
                  Evaluating technician candidates...
                </div>
              ) : recommendations.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-500">
                  No active technician profiles registered.
                </div>
              ) : (
                <div className="space-y-2">
                  {recommendations.map((rec) => (
                    <label
                      key={rec.technicianId}
                      className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition ${
                        assigningTechId === rec.technicianId
                          ? "border-blue-600 bg-blue-50/50"
                          : "border-neutral-200 hover:border-neutral-300 bg-white"
                      }`}
                    >
                      <input
                        type="radio"
                        name="technician"
                        checked={assigningTechId === rec.technicianId}
                        onChange={() => setAssigningTechId(rec.technicianId)}
                        className="mt-1"
                      />
                      <div className="flex-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-neutral-900 text-sm">
                            {rec.fullName}
                          </span>
                          <span className="font-mono font-bold text-blue-600 text-xs">
                            Score: {rec.totalScore} / 100
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-neutral-500">
                          {rec.reasons.map((r, idx) => (
                            <span key={idx} className="rounded bg-neutral-100 px-1.5 py-0.5">
                              • {r}
                            </span>
                          ))}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3">
              <button
                onClick={() => setSelectedTicket(null)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={!assigningTechId}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50"
              >
                Confirm Assignment & Schedule WO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REASSIGNMENT MODAL */}
      {reassignModalWo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h2 className="text-base font-bold text-neutral-900">
              Reassign Work Order {reassignModalWo.work_order_number}
            </h2>
            <p className="text-xs text-neutral-500">
              Reassignment after acceptance requires an audited supervisor justification.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-neutral-700">New Technician User ID</label>
              <input
                type="text"
                placeholder="Technician UUID"
                value={newTechId}
                onChange={(e) => setNewTechId(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-neutral-700">Mandatory Justification</label>
              <textarea
                rows={3}
                placeholder="Reason for reassignment (e.g., schedule conflict, vehicle breakdown)..."
                value={reassignmentReason}
                onChange={(e) => setReassignmentReason(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3">
              <button
                onClick={() => setReassignModalWo(null)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReassign}
                disabled={!newTechId || !reassignmentReason.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50"
              >
                Execute Reassignment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
