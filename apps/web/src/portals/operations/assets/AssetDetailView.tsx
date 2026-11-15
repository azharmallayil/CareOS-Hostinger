import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../lib/auth-context.js";
import { Card, CardHeader } from "../../../components/ui/Card.js";
import { Badge } from "../../../components/ui/Badge.js";
import { Input } from "../../../components/ui/Input.js";
import { Select } from "../../../components/ui/Select.js";
import { Modal } from "../../../components/ui/Modal.js";
import {
  Truck,
  ArrowLeft,
  MapPin,
  Building2,
  Calendar,
  Clock,
  Gauge,
  Shield,
  FileText,
  RefreshCw,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  History,
  Compass,
} from "lucide-react";

interface AssignmentHistoryRecord {
  id: string;
  assignment_type: string;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  notes: string | null;
  created_at: string;
  customer_accounts?: {
    id: string;
    name: string;
    account_number: string;
  } | null;
  customer_sites?: {
    id: string;
    name: string;
    city: string;
  } | null;
  profiles?: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
}

interface AssetDetailRecord {
  id: string;
  asset_tag: string;
  fleet_number: string | null;
  name: string;
  vin: string | null;
  plate_number: string | null;
  make: string;
  model: string;
  model_year: number | null;
  color: string | null;
  engine_number: string | null;
  fuel_type: string | null;
  operational_status: "active" | "inactive" | "maintenance" | "decommissioned" | "impounded";
  service_status: "operational" | "needs_service" | "service_in_progress" | "critical_fault";
  odometer_reading: number | null;
  engine_hours: number | null;
  warranty_expiry_date: string | null;
  notes: string | null;
  created_at: string;
  customer_accounts?: {
    id: string;
    name: string;
    account_number: string;
  } | null;
  customer_sites?: {
    id: string;
    name: string;
    code: string | null;
    address_line1: string;
    city: string;
    latitude: number | null;
    longitude: number | null;
  } | null;
  asset_categories?: {
    id: string;
    name: string;
    code: string;
    asset_type: string;
  } | null;
}

type AssetTab = "specs" | "history" | "service";

export function AssetDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session, authContext } = useAuth();

  const [asset, setAsset] = useState<AssetDetailRecord | null>(null);
  const [history, setHistory] = useState<AssignmentHistoryRecord[]>([]);
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AssetTab>("specs");

  // Transfer Modal
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [newSiteId, setNewSiteId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchAsset = () => {
    if (!session?.access_token || !id) return;
    setIsLoading(true);
    setErrorMsg(null);

    fetch(`/api/v1/assets/${id}`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "X-Tenant-ID": authContext?.activeTenantId || "",
      },
    })
      .then((res) => res.json())
      .then((payload) => {
        if (payload.error) {
          setErrorMsg(payload.error.message);
        } else if (payload.data) {
          setAsset(payload.data);
          if (payload.data.customer_accounts?.id) {
            fetchCustomerSites(payload.data.customer_accounts.id);
          }
        }
      })
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setIsLoading(false));
  };

  const fetchHistory = () => {
    if (!session?.access_token || !id) return;

    fetch(`/api/v1/assets/${id}/history`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "X-Tenant-ID": authContext?.activeTenantId || "",
      },
    })
      .then((res) => res.json())
      .then((payload) => {
        if (payload.data) setHistory(payload.data);
      })
      .catch(() => {});
  };

  const fetchCustomerSites = (custAccId: string) => {
    if (!session?.access_token || !custAccId) return;
    fetch(`/api/v1/customers/${custAccId}/sites`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "X-Tenant-ID": authContext?.activeTenantId || "",
      },
    })
      .then((res) => res.json())
      .then((payload) => {
        if (payload.data) setSites(payload.data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchAsset();
    fetchHistory();
  }, [session?.access_token, authContext?.activeTenantId, id]);

  const handleTransferSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token || !id || !newSiteId) return;

    setIsSubmitting(true);
    setModalError(null);

    try {
      const res = await fetch(`/api/v1/assets/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          "X-Tenant-ID": authContext?.activeTenantId || "",
        },
        body: JSON.stringify({
          siteId: newSiteId,
          notes: transferReason ? `Site transfer: ${transferReason}` : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error?.message || "Transfer failed");

      setIsTransferOpen(false);
      setNewSiteId("");
      setTransferReason("");
      fetchAsset();
      fetchHistory();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (operationalStatus: string, serviceStatus: string) => {
    if (!session?.access_token || !id) return;

    try {
      const res = await fetch(`/api/v1/assets/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          "X-Tenant-ID": authContext?.activeTenantId || "",
        },
        body: JSON.stringify({
          operationalStatus,
          serviceStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error?.message || "Status update failed");

      fetchAsset();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center p-8">
        <RefreshCw className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (errorMsg || !asset) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <Link
          to="/operations/assets"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-500"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Asset Registry
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {errorMsg || "Asset record not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Back link */}
      <div>
        <Link
          to="/operations/assets"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-900 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Fleet & Asset Registry
        </Link>
      </div>

      {/* Asset Header Card */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 font-bold text-white shadow-xs">
              <Truck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                  {asset.name}
                </h1>
                <Badge variant={asset.operational_status === "active" ? "success" : "warning"}>
                  {asset.operational_status}
                </Badge>
                <Badge variant="primary">{asset.asset_categories?.name || "Equipment"}</Badge>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                <span className="font-mono text-neutral-800 font-semibold">
                  Tag: {asset.asset_tag}
                </span>
                {asset.fleet_number && <span>• Fleet #{asset.fleet_number}</span>}
                {asset.plate_number && <span>• Plate: {asset.plate_number}</span>}
                {asset.vin && <span className="font-mono">• VIN: {asset.vin}</span>}
              </div>

              <div className="mt-2 flex items-center gap-2 text-xs">
                <Building2 className="h-3.5 w-3.5 text-neutral-400" />
                <span className="font-medium text-neutral-900">
                  {asset.customer_accounts?.name}
                </span>
                <span className="text-neutral-300">•</span>
                <MapPin className="h-3.5 w-3.5 text-neutral-400" />
                <span className="text-neutral-600">
                  {asset.customer_sites ? `${asset.customer_sites.name} (${asset.customer_sites.city})` : "Unassigned Branch"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsTransferOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
            >
              <ArrowRightLeft className="h-3.5 w-3.5 text-blue-600" />
              Transfer Location
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-6 border-t border-neutral-100 pt-3">
          <nav className="flex space-x-6 text-xs font-semibold">
            {[
              { id: "specs", label: "Specifications & Identifiers", icon: FileText },
              { id: "history", label: `Assignment History (${history.length})`, icon: History },
              { id: "service", label: "Operational & Service Status", icon: Shield },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as AssetTab)}
                  className={`flex items-center gap-2 pb-2 border-b-2 transition ${
                    isActive
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Tab 1: Specs */}
      {activeTab === "specs" && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader
              title="Vehicle / Machine Specifications"
              description="Manufacturer metadata and registered identification serials"
            />
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-neutral-400">Make & Model:</span>
                <p className="mt-0.5 font-medium text-neutral-900">
                  {asset.make} {asset.model}
                </p>
              </div>
              <div>
                <span className="text-neutral-400">Model Year:</span>
                <p className="mt-0.5 font-medium text-neutral-900">
                  {asset.model_year || "Not specified"}
                </p>
              </div>
              <div>
                <span className="text-neutral-400">VIN / Chassis Number:</span>
                <p className="mt-0.5 font-mono font-medium text-neutral-900">
                  {asset.vin || "None recorded"}
                </p>
              </div>
              <div>
                <span className="text-neutral-400">Registration Plate:</span>
                <p className="mt-0.5 font-medium text-neutral-900">
                  {asset.plate_number || "None"}
                </p>
              </div>
              <div>
                <span className="text-neutral-400">Engine / Serial Number:</span>
                <p className="mt-0.5 font-mono text-neutral-900">
                  {asset.engine_number || "None"}
                </p>
              </div>
              <div>
                <span className="text-neutral-400">Fuel / Power Type:</span>
                <p className="mt-0.5 capitalize font-medium text-neutral-900">
                  {asset.fuel_type || "Diesel"}
                </p>
              </div>
              <div>
                <span className="text-neutral-400">Color:</span>
                <p className="mt-0.5 font-medium text-neutral-900">
                  {asset.color || "Standard"}
                </p>
              </div>
              <div>
                <span className="text-neutral-400">Warranty Expiration:</span>
                <p className="mt-0.5 font-medium text-neutral-900">
                  {asset.warranty_expiry_date
                    ? new Date(asset.warranty_expiry_date).toLocaleDateString()
                    : "No warranty recorded"}
                </p>
              </div>
            </div>

            {asset.notes && (
              <div className="mt-4 border-t border-neutral-100 pt-3">
                <span className="text-neutral-400 text-xs">Asset Notes:</span>
                <p className="mt-1 text-xs text-neutral-700 whitespace-pre-line">
                  {asset.notes}
                </p>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Telemetry & Usage" description="Recorded readings" />
            <div className="space-y-4 text-xs">
              <div className="rounded-lg bg-neutral-50 p-3">
                <div className="flex items-center justify-between text-neutral-500">
                  <span>Odometer Reading</span>
                  <Gauge className="h-4 w-4 text-neutral-400" />
                </div>
                <div className="mt-2 text-xl font-bold font-mono text-neutral-900">
                  {asset.odometer_reading ? `${asset.odometer_reading.toLocaleString()} km` : "0 km"}
                </div>
              </div>

              <div className="rounded-lg bg-neutral-50 p-3">
                <div className="flex items-center justify-between text-neutral-500">
                  <span>Engine Operating Hours</span>
                  <Clock className="h-4 w-4 text-neutral-400" />
                </div>
                <div className="mt-2 text-xl font-bold font-mono text-neutral-900">
                  {asset.engine_hours ? `${asset.engine_hours.toLocaleString()} hrs` : "0 hrs"}
                </div>
              </div>

              <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-[11px] text-blue-700">
                <div className="font-semibold">Telematics Sensor Link:</div>
                <p className="mt-0.5 text-blue-600">
                  Device, SIM, and telematics sensor pairing will be connected in Step 8.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 2: Assignment History */}
      {activeTab === "history" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">
              Assignment & Location History
            </h3>
            <p className="text-xs text-neutral-500">
              Immutable audit log of all facility transfers and customer ownership changes
            </p>
          </div>

          <Card>
            {history.length === 0 ? (
              <div className="py-12 text-center text-xs text-neutral-500">
                No historical assignments recorded.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-neutral-200 bg-neutral-50/75 text-neutral-500 uppercase font-semibold">
                    <tr>
                      <th className="px-4 py-3">Period</th>
                      <th className="px-4 py-3">Event Type</th>
                      <th className="px-4 py-3">Customer Account</th>
                      <th className="px-4 py-3">Facility / Branch</th>
                      <th className="px-4 py-3">Reason / Details</th>
                      <th className="px-4 py-3 text-right">Logged By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {history.map((h) => {
                      const isActive = !h.end_date;
                      return (
                        <tr key={h.id} className="hover:bg-neutral-50/50">
                          <td className="px-4 py-3.5">
                            <div className="font-medium text-neutral-900">
                              {new Date(h.start_date).toLocaleDateString()}
                            </div>
                            <div className="text-[10px] text-neutral-400">
                              {isActive ? (
                                <span className="font-semibold text-emerald-600">Active Location</span>
                              ) : (
                                `Ended ${new Date(h.end_date!).toLocaleDateString()}`
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 capitalize">
                            <Badge variant={h.assignment_type === "initial" ? "neutral" : "primary"}>
                              {h.assignment_type.replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="px-4 py-3.5 font-medium text-neutral-900">
                            {h.customer_accounts?.name}
                          </td>
                          <td className="px-4 py-3.5 text-neutral-700">
                            {h.customer_sites ? (
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-neutral-400" />
                                <span>{h.customer_sites.name}</span>
                              </div>
                            ) : (
                              <span className="text-neutral-400">Depot / Unassigned</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-neutral-600">
                            {h.reason || "—"}
                          </td>
                          <td className="px-4 py-3.5 text-right text-neutral-500">
                            {h.profiles?.full_name || "System"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Tab 3: Operational & Service Status */}
      {activeTab === "service" && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader
              title="Operational State"
              description="Update the live fleet deployment status"
            />
            <div className="space-y-3 text-xs">
              {(
                [
                  { value: "active", label: "Active", desc: "In regular commercial service" },
                  { value: "maintenance", label: "Under Maintenance", desc: "Service visit or repair in progress" },
                  { value: "inactive", label: "Inactive / Idle", desc: "Parked at depot without assignments" },
                  { value: "decommissioned", label: "Decommissioned", desc: "Retired from serviceable fleet" },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                    asset.operational_status === opt.value
                      ? "border-blue-600 bg-blue-50/50"
                      : "border-neutral-200 hover:bg-neutral-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="opStatus"
                    checked={asset.operational_status === opt.value}
                    onChange={() => handleUpdateStatus(opt.value, asset.service_status)}
                    className="mt-0.5 text-blue-600"
                  />
                  <div>
                    <div className="font-semibold text-neutral-900">{opt.label}</div>
                    <div className="text-[11px] text-neutral-500">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Health & Fault Status"
              description="Current diagnostic and equipment integrity"
            />
            <div className="space-y-3 text-xs">
              {(
                [
                  { value: "operational", label: "Operational / Healthy", desc: "No known defects or outstanding service" },
                  { value: "needs_service", label: "Needs Service / Inspection", desc: "Scheduled preventive maintenance due" },
                  { value: "critical_fault", label: "Critical Fault / Grounded", desc: "Safety or mechanical fault preventing safe operation" },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                    asset.service_status === opt.value
                      ? "border-amber-600 bg-amber-50/50"
                      : "border-neutral-200 hover:bg-neutral-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="srvStatus"
                    checked={asset.service_status === opt.value}
                    onChange={() => handleUpdateStatus(asset.operational_status, opt.value)}
                    className="mt-0.5 text-amber-600"
                  />
                  <div>
                    <div className="font-semibold text-neutral-900">{opt.label}</div>
                    <div className="text-[11px] text-neutral-500">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Transfer Location Modal */}
      {isTransferOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsTransferOpen(false)}
          title="Transfer Asset Location"
        >
          <form onSubmit={handleTransferSite} className="space-y-3 text-xs">
            {modalError && (
              <div className="rounded-lg bg-red-50 p-2.5 text-red-700">{modalError}</div>
            )}

            <p className="text-neutral-500">
              Moving <strong>{asset.name}</strong> ({asset.asset_tag}) will automatically close its current assignment and log a site transfer in the asset history.
            </p>

            <Select
              label="Destination Branch / Site"
              required
              value={newSiteId}
              onChange={(e) => setNewSiteId(e.target.value)}
              options={sites.map((s) => ({ value: s.id, label: s.name }))}
            />

            <Input
              label="Transfer Reason"
              required
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              placeholder="e.g. Scheduled relocation to Dammam depot"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsTransferOpen(false)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !newSiteId}
                className="rounded-lg bg-blue-600 px-3.5 py-1.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {isSubmitting ? "Recording..." : "Confirm Transfer"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default AssetDetailView;
