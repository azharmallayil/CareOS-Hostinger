import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../lib/auth-context.js";
import { Card } from "../../../components/ui/Card.js";
import { Badge } from "../../../components/ui/Badge.js";
import { Input } from "../../../components/ui/Input.js";
import { Select } from "../../../components/ui/Select.js";
import { Modal } from "../../../components/ui/Modal.js";
import {
  Truck,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Building2,
  MapPin,
  ChevronRight,
  ChevronLeft,
  FileSpreadsheet,
  Gauge,
  Clock,
  Car,
  AlertTriangle,
  Upload,
} from "lucide-react";

export interface AssetRecord {
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
  operational_status: "active" | "inactive" | "maintenance" | "decommissioned" | "impounded";
  service_status: "operational" | "needs_service" | "service_in_progress" | "critical_fault";
  odometer_reading: number | null;
  engine_hours: number | null;
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
  asset_categories?: {
    id: string;
    name: string;
    code: string;
    asset_type: string;
  } | null;
}

export function AssetListView() {
  const { session, authContext } = useAuth();
  const navigate = useNavigate();

  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [customerSites, setCustomerSites] = useState<Array<{ id: string; name: string }>>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // New Asset Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [assetName, setAssetName] = useState("");
  const [customerAccountId, setCustomerAccountId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [assetTag, setAssetTag] = useState("");
  const [fleetNumber, setFleetNumber] = useState("");
  const [vin, setVin] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [make, setMake] = useState("Mercedes-Benz");
  const [model, setModel] = useState("Actros 1845");
  const [modelYear, setModelYear] = useState("2023");
  const [color, setColor] = useState("White");
  const [fuelType, setFuelType] = useState<any>("diesel");
  const [odometer, setOdometer] = useState("");
  const [hours, setHours] = useState("");

  // Bulk Import Modal
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importResult, setImportResult] = useState<any>(null);

  const fetchDependencies = () => {
    if (!session?.access_token) return;

    // Fetch categories
    fetch("/api/v1/assets/categories", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "X-Tenant-ID": authContext?.activeTenantId || "",
      },
    })
      .then((res) => res.json())
      .then((payload) => {
        if (payload.data) {
          setCategories(payload.data);
          if (payload.data.length > 0 && !categoryId) {
            setCategoryId(payload.data[0].id);
          }
        }
      })
      .catch(() => {});

    // Fetch customers
    fetch("/api/v1/customers?limit=100", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "X-Tenant-ID": authContext?.activeTenantId || "",
      },
    })
      .then((res) => res.json())
      .then((payload) => {
        if (payload.data) {
          setCustomers(payload.data);
          if (payload.data.length > 0 && !customerAccountId) {
            setCustomerAccountId(payload.data[0].id);
          }
        }
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
        if (payload.data) setCustomerSites(payload.data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (customerAccountId) {
      fetchCustomerSites(customerAccountId);
    }
  }, [customerAccountId]);

  const fetchAssets = () => {
    if (!session?.access_token) return;
    setIsLoading(true);
    setErrorMsg(null);

    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (customerFilter) params.set("customerAccountId", customerFilter);
    if (categoryFilter) params.set("categoryId", categoryFilter);
    if (statusFilter) params.set("operationalStatus", statusFilter);
    params.set("page", page.toString());
    params.set("limit", "15");

    fetch(`/api/v1/assets?${params.toString()}`, {
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
          setAssets(payload.data);
          if (payload.meta) {
            setTotalPages(payload.meta.totalPages || 1);
            setTotalCount(payload.meta.total || 0);
          }
        }
      })
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchDependencies();
  }, [session?.access_token, authContext?.activeTenantId]);

  useEffect(() => {
    fetchAssets();
  }, [session?.access_token, authContext?.activeTenantId, page, customerFilter, categoryFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchAssets();
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token || !assetName || !make || !model || !customerAccountId || !categoryId) return;

    setIsSubmitting(true);
    setModalError(null);

    try {
      const res = await fetch("/api/v1/assets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          "X-Tenant-ID": authContext?.activeTenantId || "",
        },
        body: JSON.stringify({
          name: assetName,
          customerAccountId,
          siteId: siteId || undefined,
          categoryId,
          assetTag: assetTag || undefined,
          fleetNumber: fleetNumber || undefined,
          vin: vin || undefined,
          plateNumber: plateNumber || undefined,
          make,
          model,
          modelYear: modelYear ? parseInt(modelYear, 10) : undefined,
          color: color || undefined,
          fuelType: fuelType || undefined,
          odometerReading: odometer ? parseFloat(odometer) : undefined,
          engineHours: hours ? parseFloat(hours) : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error?.message || "Failed to create asset");
      }

      setIsCreateOpen(false);
      setAssetName("");
      setVin("");
      setPlateNumber("");
      setFleetNumber("");
      setOdometer("");
      setHours("");
      fetchAssets();
      navigate(`/operations/assets/${data.data.id}`);
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkImport = async () => {
    if (!session?.access_token || !importJson) return;
    setIsSubmitting(true);
    setModalError(null);
    setImportResult(null);

    try {
      let parsed = JSON.parse(importJson);
      if (!Array.isArray(parsed)) {
        if (parsed.assets && Array.isArray(parsed.assets)) {
          parsed = parsed.assets;
        } else {
          throw new Error("Payload must be a JSON array of asset objects or contain an 'assets' array.");
        }
      }

      const res = await fetch("/api/v1/assets/bulk-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          "X-Tenant-ID": authContext?.activeTenantId || "",
        },
        body: JSON.stringify({ assets: parsed }),
      });

      const data = await res.json();
      if (!res.ok && !data.data) {
        throw new Error(data.error?.message || "Import failed");
      }

      setImportResult(data.data);
      fetchAssets();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case "active":
        return <Badge variant="success">Active</Badge>;
      case "maintenance":
        return <Badge variant="warning">Maintenance</Badge>;
      case "inactive":
        return <Badge variant="neutral">Inactive</Badge>;
      case "decommissioned":
        return <Badge variant="error">Decommissioned</Badge>;
      default:
        return <Badge variant="neutral">{st}</Badge>;
    }
  };

  const getServiceBadge = (srv: string) => {
    switch (srv) {
      case "operational":
        return <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">● Normal</span>;
      case "needs_service":
        return <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium">● Needs Service</span>;
      case "critical_fault":
        return <span className="inline-flex items-center gap-1 text-[11px] text-red-600 font-medium">● Critical Fault</span>;
      default:
        return <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500 font-medium">● {srv}</span>;
    }
  };

  return (
    <div className="space-y-6 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
              Fleet & Asset Registry
            </h1>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
              {totalCount} Total Assets
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Vehicles, reefer trailers, heavy machinery, client equipment, identifiers, and location history
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchAssets}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setIsImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Bulk Import
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            Register Asset
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Search and Filters Bar */}
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by asset tag, fleet #, VIN, plate, make/model..."
              className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-xs placeholder-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={customerFilter}
              onChange={(e) => {
                setCustomerFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="">All Customer Accounts</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Asset Table */}
      <Card>
        {isLoading ? (
          <div className="p-12 text-center text-sm text-neutral-500">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-neutral-400" />
            <p className="mt-2 text-xs">Loading fleet registry...</p>
          </div>
        ) : assets.length === 0 ? (
          <div className="py-16 text-center">
            <Truck className="mx-auto h-10 w-10 text-neutral-300" />
            <h3 className="mt-3 text-sm font-semibold text-neutral-900">No assets found</h3>
            <p className="mt-1 text-xs text-neutral-500 max-w-sm mx-auto">
              Register commercial fleet vehicles, reefer trailers, and customer equipment.
            </p>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
            >
              <Plus className="h-3.5 w-3.5" />
              Register Asset
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-200 bg-neutral-50/75 text-neutral-500 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-4 py-3">Asset & Identifiers</th>
                  <th className="px-4 py-3">Make & Model</th>
                  <th className="px-4 py-3">Customer Account</th>
                  <th className="px-4 py-3">Assigned Site</th>
                  <th className="px-4 py-3">Operational</th>
                  <th className="px-4 py-3">Health Status</th>
                  <th className="px-4 py-3 text-right">Odometer</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {assets.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => navigate(`/operations/assets/${a.id}`)}
                    className="cursor-pointer hover:bg-neutral-50/60 transition"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700 font-bold">
                          <Truck className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-neutral-900 hover:text-blue-600 transition">
                            {a.name}
                          </div>
                          <div className="flex items-center gap-1.5 font-mono text-[10px] text-neutral-400">
                            <span>{a.asset_tag}</span>
                            {a.fleet_number && <span>• Fleet #{a.fleet_number}</span>}
                            {a.plate_number && <span>• {a.plate_number}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-neutral-700">
                      <div>
                        {a.make} {a.model} {a.model_year ? `(${a.model_year})` : ""}
                      </div>
                      <div className="text-[10px] text-neutral-400">
                        {a.asset_categories?.name || "Equipment"}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-neutral-800 font-medium">
                      {a.customer_accounts?.name || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-neutral-600">
                      {a.customer_sites ? (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-neutral-400" />
                          <span>{a.customer_sites.name}</span>
                        </div>
                      ) : (
                        <span className="text-neutral-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">{getStatusBadge(a.operational_status)}</td>
                    <td className="px-4 py-3.5">{getServiceBadge(a.service_status)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-neutral-600">
                      {a.odometer_reading ? `${a.odometer_reading.toLocaleString()} km` : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <ChevronRight className="h-4 w-4 text-neutral-400 ml-auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-xs text-neutral-600">
            <div>
              Page <strong>{page}</strong> of <strong>{totalPages}</strong>
            </div>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="rounded border border-neutral-300 p-1 hover:bg-neutral-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="rounded border border-neutral-300 p-1 hover:bg-neutral-50 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Register Asset Modal */}
      {isCreateOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsCreateOpen(false)}
          title="Register New Fleet Vehicle / Equipment"
        >
          <form onSubmit={handleCreateAsset} className="space-y-4 text-xs">
            {modalError && (
              <div className="rounded-lg bg-red-50 p-2.5 text-red-700">{modalError}</div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Customer Account"
                required
                value={customerAccountId}
                onChange={(e) => setCustomerAccountId(e.target.value)}
                options={customers.map((c) => ({ value: c.id, label: c.name }))}
              />

              <Select
                label="Assigned Branch / Site"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                options={[
                  { value: "", label: "No site (Central / Depot)" },
                  ...customerSites.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Asset Category"
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                options={categories.map((cat) => ({ value: cat.id, label: cat.name }))}
              />

              <Input
                label="Asset Name"
                required
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                placeholder="e.g. Actros Heavy Truck 01"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Make"
                required
                value={make}
                onChange={(e) => setMake(e.target.value)}
              />
              <Input
                label="Model"
                required
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
              <Input
                label="Year"
                type="number"
                value={modelYear}
                onChange={(e) => setModelYear(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Input
                label="VIN / Chassis No"
                value={vin}
                onChange={(e) => setVin(e.target.value)}
                placeholder="17-character VIN"
              />
              <Input
                label="Plate Number"
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value)}
                placeholder="1234 ABC"
              />
              <Input
                label="Customer Fleet #"
                value={fleetNumber}
                onChange={(e) => setFleetNumber(e.target.value)}
                placeholder="TRK-10"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Odometer (KM)"
                type="number"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
              />
              <Input
                label="Engine Hours"
                type="number"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
              <Select
                label="Fuel Type"
                value={fuelType}
                onChange={(e) => setFuelType(e.target.value)}
                options={[
                  { value: "diesel", label: "Diesel" },
                  { value: "gasoline", label: "Gasoline" },
                  { value: "electric", label: "Electric" },
                  { value: "hybrid", label: "Hybrid" },
                ]}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !assetName || !make || !model}
                className="rounded-lg bg-blue-600 px-3.5 py-1.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {isSubmitting ? "Registering..." : "Register Asset"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Bulk Import Modal */}
      {isImportOpen && (
        <Modal
          isOpen={true}
          onClose={() => {
            setIsImportOpen(false);
            setImportResult(null);
          }}
          title="Bulk Import Assets (JSON/CSV Payload)"
        >
          <div className="space-y-4 text-xs">
            <p className="text-neutral-500">
              Paste a JSON array of asset records with required fields: <code>name</code>, <code>make</code>, <code>model</code>, <code>customerAccountId</code>, and <code>categoryId</code>.
            </p>

            <textarea
              rows={8}
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder={`[
  {
    "name": "Isuzu FVR Truck 01",
    "make": "Isuzu",
    "model": "FVR 34",
    "modelYear": 2022,
    "vin": "JALC540003000001",
    "plateNumber": "7890 DEF",
    "customerAccountId": "${customers[0]?.id || 'uuid'}",
    "categoryId": "${categories[0]?.id || 'uuid'}"
  }
]`}
              className="w-full rounded-lg border border-neutral-300 p-2.5 font-mono text-[11px] focus:border-blue-500 focus:outline-none"
            />

            {modalError && (
              <div className="rounded-lg bg-red-50 p-2.5 text-red-700">{modalError}</div>
            )}

            {importResult && (
              <div className="rounded-lg bg-neutral-50 p-3 space-y-1">
                <div className="font-semibold text-neutral-900">
                  Import Summary: {importResult.successCount} succeeded, {importResult.failureCount} failed
                </div>
                {importResult.errors?.map((err: any, idx: number) => (
                  <div key={idx} className="text-red-600">
                    Row {err.row} ({err.name}): {err.error}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-neutral-700 hover:bg-neutral-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleBulkImport}
                disabled={!importJson}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                Validate & Import
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default AssetListView;
