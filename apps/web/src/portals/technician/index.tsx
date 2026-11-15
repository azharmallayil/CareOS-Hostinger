import React, { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { TechnicianShell } from "./TechnicianShell.js";
import { Card } from "../../components/ui/Card.js";
import { Badge } from "../../components/ui/Badge.js";
import { useAuth } from "../../lib/auth-context.js";
import {
  Wrench,
  Clock,
  MapPin,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  Radio,
  FileText,
  Navigation,
  CheckSquare,
  Shield,
  Upload,
  ChevronRight,
  X,
} from "lucide-react";

const APPROVED_REASONS = [
  { value: "out_of_territory", label: "Out of Assigned Territory" },
  { value: "skill_mismatch", label: "Skill / Certification Mismatch" },
  { value: "schedule_conflict", label: "Schedule Conflict / Overlap" },
  { value: "vehicle_breakdown", label: "Service Vehicle Breakdown" },
  { value: "emergency", label: "Personal / Medical Emergency" },
  { value: "other", label: "Other (Requires Explanation)" },
];

export default function TechnicianPortal() {
  return (
    <TechnicianShell>
      <Routes>
        <Route path="/" element={<TechnicianOverview />} />
        <Route path="/schedule" element={<PlannedModuleView title="Technician Schedule & Routing" step="Step 11 Active" />} />
        <Route path="/parts" element={<PlannedModuleView title="Parts & Equipment Inventory" step="Step 13" />} />
      </Routes>
    </TechnicianShell>
  );
}

function TechnicianOverview() {
  const { authContext, profile, session } = useAuth();
  const tenantId = authContext?.activeTenantId;
  const token = session?.access_token;

  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [rejectingWo, setRejectingWo] = useState<any | null>(null);
  const [rejectionReason, setRejectionReason] = useState("out_of_territory");
  const [rejectionExplanation, setRejectionExplanation] = useState("");
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string>("Ready");

  const fetchWorkOrders = async () => {
    if (!token || !tenantId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/v1/work-orders", {
        headers: { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId },
      });
      if (res.ok) {
        const data = await res.json();
        setWorkOrders(data.workOrders || []);
      }
    } catch (err) {
      console.error("Failed to fetch technician work orders", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkOrders();
  }, [tenantId, token]);

  const handleAccept = async (woId: string) => {
    try {
      const res = await fetch(`/api/v1/work-orders/${woId}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId || "" },
      });
      if (res.ok) {
        fetchWorkOrders();
      }
    } catch (err) {
      console.error("Accept error", err);
    }
  };

  const handleReject = async () => {
    if (!rejectingWo) return;
    try {
      const res = await fetch(`/api/v1/work-orders/${rejectingWo.id}/reject`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-ID": tenantId || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rejectionReason,
          rejectionExplanation: rejectionReason === "other" ? rejectionExplanation : undefined,
        }),
      });
      if (res.ok) {
        setRejectingWo(null);
        setRejectionExplanation("");
        fetchWorkOrders();
      }
    } catch (err) {
      console.error("Reject error", err);
    }
  };

  const handleStageTransition = async (woId: string, stage: string, status: string) => {
    try {
      const res = await fetch(`/api/v1/work-orders/${woId}/stages/${stage}/transition`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-ID": tenantId || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        fetchWorkOrders();
      }
    } catch (err) {
      console.error("Stage transition error", err);
    }
  };

  const toggleLocationSharing = () => {
    if (!locationEnabled) {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            setLocationEnabled(true);
            setLocationStatus("Active (Tab Focused)");
            await fetch("/api/v1/technicians/location-ping", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "X-Tenant-ID": tenantId || "",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracyMeters: pos.coords.accuracy,
              }),
            });
          },
          (err) => {
            setLocationStatus(`Permission denied: ${err.message}`);
          }
        );
      } else {
        setLocationStatus("Geolocation unsupported");
      }
    } else {
      setLocationEnabled(false);
      setLocationStatus("Opted Out / Inactive");
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4 sm:p-6">
      {/* Technician Badge & Identification Card */}
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600 p-6 text-white shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-amber-100">
                Field Technician
              </span>
              <Badge variant="primary">Work Orders & Dispatch Active</Badge>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">
              {profile?.fullName || "Field Technician"}
            </h1>
            <p className="mt-1 text-xs text-amber-100">
              Field Execution Engine • Tenant: {tenantId?.slice(0, 8)}...
            </p>
          </div>

          <div className="rounded-xl bg-white/10 backdrop-blur-xs p-3 text-center sm:text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-200">
              Web Location Status
            </span>
            <div className="flex items-center justify-center sm:justify-end gap-1.5 mt-0.5 text-xs font-semibold text-white">
              <Radio className={`h-3.5 w-3.5 ${locationEnabled ? "text-emerald-300 animate-pulse" : "text-neutral-300"}`} />
              {locationStatus}
            </div>
          </div>
        </div>

        {/* Location Privacy & Truthful Disclaimer Banner */}
        <div className="mt-4 pt-4 border-t border-white/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
          <p className="text-amber-100 text-[11px] leading-relaxed max-w-xl">
            <strong>Location Privacy:</strong> Web location sharing is opt-in and active <em>only</em> while this browser tab is open and permission remains granted. Background tracking is never performed. Customers see arrival windows, never your personal location history.
          </p>
          <button
            onClick={toggleLocationSharing}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition shadow-xs shrink-0 ${
              locationEnabled ? "bg-emerald-700 text-white" : "bg-white text-neutral-900 hover:bg-amber-50"
            }`}
          >
            {locationEnabled ? "Opt-Out Location" : "Opt-In Location"}
          </button>
        </div>
      </div>

      {/* Assigned Work Orders List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-2">
            <Wrench className="h-4 w-4 text-amber-500" />
            Your Work Orders ({workOrders.length})
          </h2>
          <span className="text-xs text-neutral-400">Accept/Reject or execute stages</span>
        </div>

        {workOrders.length === 0 ? (
          <Card>
            <div className="py-12 text-center text-neutral-500 text-xs">
              <CheckCircle2 className="mx-auto h-8 w-8 text-neutral-300 mb-2" />
              No active work orders assigned to you right now.
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {workOrders.map((wo) => (
              <div
                key={wo.id}
                className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-neutral-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-blue-600">
                        {wo.work_order_number}
                      </span>
                      <Badge
                        variant={
                          wo.status === "completed"
                            ? "success"
                            : wo.status === "en_route" || wo.status === "on_site"
                            ? "info"
                            : wo.status === "assigned"
                            ? "warning"
                            : "neutral"
                        }
                      >
                        {wo.status.toUpperCase()}
                      </Badge>
                    </div>
                    <h3 className="text-base font-bold text-neutral-900 mt-1">
                      {wo.ticket?.title || "Field Service Job"}
                    </h3>
                  </div>

                  <div className="text-right text-xs text-neutral-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                      {wo.scheduled_date}
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-neutral-600">
                  <div>
                    Customer: <strong>{wo.customer?.name}</strong>
                  </div>
                  {wo.site && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-neutral-400" />
                      {wo.site.name} ({wo.site.city})
                    </div>
                  )}
                  {wo.asset && (
                    <div>
                      Asset: <strong>{wo.asset.make} {wo.asset.model}</strong> ({wo.asset.fleet_number})
                    </div>
                  )}
                </div>

                {/* Action Area based on status */}
                <div className="pt-2 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2">
                  {wo.status === "assigned" && (
                    <div className="flex items-center gap-2 w-full justify-end">
                      <button
                        onClick={() => setRejectingWo(wo)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                      >
                        Decline Job
                      </button>
                      <button
                        onClick={() => handleAccept(wo.id)}
                        className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-700"
                      >
                        Accept Work Order
                      </button>
                    </div>
                  )}

                  {wo.status === "accepted" && (
                    <div className="flex items-center gap-2 w-full justify-end">
                      <button
                        onClick={() => handleStageTransition(wo.id, "travel", "in_progress")}
                        className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-blue-700 flex items-center gap-1.5"
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        Depart (En Route)
                      </button>
                    </div>
                  )}

                  {wo.status === "en_route" && (
                    <div className="flex items-center gap-2 w-full justify-end">
                      <button
                        onClick={() => handleStageTransition(wo.id, "arrival_checkin", "completed")}
                        className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-700 flex items-center gap-1.5"
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        Check In (Arrived On Site)
                      </button>
                    </div>
                  )}

                  {wo.status === "on_site" && (
                    <div className="flex items-center gap-2 w-full justify-end">
                      <button
                        onClick={() => handleStageTransition(wo.id, "execution", "in_progress")}
                        className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-amber-700 flex items-center gap-1.5"
                      >
                        <Wrench className="h-3.5 w-3.5" />
                        Start Service Execution
                      </button>
                    </div>
                  )}

                  {wo.status === "in_progress" && (
                    <div className="flex items-center gap-2 w-full justify-end">
                      <button
                        onClick={() => handleStageTransition(wo.id, "checkout", "completed")}
                        className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-700 flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Complete & Sign Off Work Order
                      </button>
                    </div>
                  )}

                  {wo.status === "completed" && (
                    <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" />
                      Service completed and verified
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* DECLINE / REJECT WORK ORDER MODAL */}
      {rejectingWo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h2 className="text-base font-bold text-neutral-900">
                Decline Work Order {rejectingWo.work_order_number}
              </h2>
              <button
                onClick={() => setRejectingWo(null)}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-neutral-500">
              Declining will immediately notify operations, record a timeline event, and return the ticket to the unassigned dispatch queue.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-neutral-700">Reason</label>
              <select
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs"
              >
                {APPROVED_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {rejectionReason === "other" && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-neutral-700">
                  Mandatory Explanation <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide detailed explanation for operations review..."
                  value={rejectionExplanation}
                  onChange={(e) => setRejectionExplanation(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3">
              <button
                onClick={() => setRejectingWo(null)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={rejectionReason === "other" && !rejectionExplanation.trim()}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-red-700 disabled:opacity-50"
              >
                Confirm Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlannedModuleView({ title, step }: { title: string; step: string }) {
  return (
    <Card>
      <div className="py-16 text-center">
        <Clock className="mx-auto h-10 w-10 text-neutral-300" />
        <h3 className="mt-3 text-base font-semibold text-neutral-900">{title}</h3>
        <p className="mt-1 text-xs text-neutral-500">
          This technician module is scheduled for implementation in <strong>{step}</strong>.
        </p>
      </div>
    </Card>
  );
}
