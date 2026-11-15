import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../lib/auth-context.js";
import { Card } from "../../../components/ui/Card.js";
import { Badge } from "../../../components/ui/Badge.js";
import { Modal } from "../../../components/ui/Modal.js";
import {
  ShieldAlert,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Building2,
  LifeBuoy,
  ChevronRight,
  AlertTriangle,
  Clock,
  CheckCircle2,
  AlertCircle,
  Lock,
  Layers,
} from "lucide-react";

export interface ComplaintRecord {
  id: string;
  complaint_number: string;
  complaint_type: "service" | "platform";
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  status: string;
  customer_account_id: string;
  ticket_id: string | null;
  created_at: string;
  customer_accounts?: {
    id: string;
    name: string;
    account_number: string;
  } | null;
  tickets?: {
    id: string;
    ticket_number: string;
    title: string;
  } | null;
}

export function ComplaintListView() {
  const { session, authContext } = useAuth();

  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // New Complaint Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalForm, setModalForm] = useState({
    complaintType: "service" as "service" | "platform",
    customerAccountId: "",
    ticketId: "",
    title: "",
    description: "",
    severity: "medium" as "low" | "medium" | "high" | "critical",
  });

  // Manage Complaint Modal
  const [activeComplaint, setActiveComplaint] = useState<ComplaintRecord | null>(null);
  const [statusUpdateForm, setStatusUpdateForm] = useState({
    status: "",
    resolutionSummary: "",
    customerUpdate: "",
    internalNotes: "",
  });
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const tenantId = authContext?.activeTenantId;
  const token = session?.access_token;

  const fetchComplaints = () => {
    if (!token || !tenantId) return;
    setIsLoading(true);
    setErrorMsg(null);

    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (typeFilter) params.set("complaintType", typeFilter);
    if (severityFilter) params.set("severity", severityFilter);
    if (statusFilter) params.set("status", statusFilter);

    fetch(`/api/v1/complaints?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Tenant-ID": tenantId,
      },
    })
      .then((res) => res.json())
      .then((resData) => {
        if (resData.error) {
          setErrorMsg(resData.error.message);
        } else {
          setComplaints(resData.data || []);
        }
      })
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (!token || !tenantId) return;

    fetch("/api/v1/customers?limit=100", {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Tenant-ID": tenantId,
      },
    })
      .then((res) => res.json())
      .then((payload) => {
        if (payload.data) setCustomers(payload.data);
      })
      .catch((err) => console.error("Error fetching customers:", err));
  }, [token, tenantId]);

  useEffect(() => {
    fetchComplaints();
  }, [token, tenantId, typeFilter, severityFilter, statusFilter]);

  const handleCreateComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !tenantId) return;

    if (!modalForm.customerAccountId) {
      setModalError("Please select a customer account");
      return;
    }
    if (!modalForm.title.trim()) {
      setModalError("Please enter a title");
      return;
    }
    if (!modalForm.description.trim()) {
      setModalError("Please provide details for the complaint");
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      const payload: any = {
        complaintType: modalForm.complaintType,
        customerAccountId: modalForm.customerAccountId,
        title: modalForm.title.trim(),
        description: modalForm.description.trim(),
        severity: modalForm.severity,
      };

      if (modalForm.ticketId.trim()) {
        payload.ticketId = modalForm.ticketId.trim();
      }

      const res = await fetch("/api/v1/complaints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Tenant-ID": tenantId,
        },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok || resData.error) {
        throw new Error(resData.error?.message || "Failed to file complaint");
      }

      setIsModalOpen(false);
      setModalForm({
        complaintType: "service",
        customerAccountId: "",
        ticketId: "",
        title: "",
        description: "",
        severity: "medium",
      });
      fetchComplaints();
    } catch (err: any) {
      setModalError(err.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateComplaintStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !tenantId || !activeComplaint) return;

    setIsUpdatingStatus(true);
    setUpdateError(null);

    try {
      const res = await fetch(`/api/v1/complaints/${activeComplaint.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Tenant-ID": tenantId,
        },
        body: JSON.stringify(statusUpdateForm),
      });

      const resData = await res.json();
      if (!res.ok || resData.error) {
        throw new Error(resData.error?.message || "Failed to update complaint");
      }

      setActiveComplaint(null);
      fetchComplaints();
    } catch (err: any) {
      setUpdateError(err.message || "Failed to update complaint");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return <Badge variant="error" dot>Critical Severity</Badge>;
      case "high":
        return <Badge variant="warning" dot>High Severity</Badge>;
      case "medium":
        return <Badge variant="info">Medium</Badge>;
      case "low":
        return <Badge variant="neutral">Low</Badge>;
      default:
        return <Badge variant="neutral">{severity}</Badge>;
    }
  };

  return (
    <div className="space-y-6 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Complaints Governance</h1>
            <Badge variant="primary">Step 9</Badge>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            Independent complaint lifecycle distinguishing Service and Platform issues without altering ticket history.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/operations/tickets"
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
          >
            <LifeBuoy className="h-4 w-4 text-blue-600" />
            Support Tickets
          </Link>

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Log Complaint
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4 border-l-4 border-l-blue-600">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-neutral-500">Total Complaints</p>
              <p className="mt-1 text-2xl font-bold text-neutral-900">{complaints.length}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <ShieldAlert className="h-5 w-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-neutral-500">Under Investigation</p>
              <p className="mt-1 text-2xl font-bold text-neutral-900">
                {complaints.filter((c) => ["submitted", "under_investigation", "action_required"].includes(c.status)).length}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-600">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-neutral-500">Resolved Complaints</p>
              <p className="mt-1 text-2xl font-bold text-neutral-900">
                {complaints.filter((c) => ["resolved", "closed"].includes(c.status)).length}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search complaint # or title..."
                className="w-full rounded-lg border border-neutral-300 pl-9 pr-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <button
              onClick={fetchComplaints}
              className="rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
            >
              Filter
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:border-blue-600 focus:outline-none"
            >
              <option value="">All Types</option>
              <option value="service">Service Complaints</option>
              <option value="platform">Platform Complaints</option>
            </select>

            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:border-blue-600 focus:outline-none"
            >
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:border-blue-600 focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="submitted">Submitted</option>
              <option value="under_investigation">Under Investigation</option>
              <option value="action_required">Action Required</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Main Complaints Table */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
              <p className="text-sm font-medium text-neutral-500">Loading complaints registry...</p>
            </div>
          </div>
        ) : complaints.length === 0 ? (
          <div className="p-12 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-neutral-300" />
            <h3 className="mt-3 text-base font-semibold text-neutral-900">No complaints registered</h3>
            <p className="mt-1 text-sm text-neutral-500 max-w-sm mx-auto">
              All services and platform operations are compliant. No active complaints found.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-neutral-600">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-4 py-3.5">Complaint # & Subject</th>
                  <th className="px-4 py-3.5">Type</th>
                  <th className="px-4 py-3.5">Customer</th>
                  <th className="px-4 py-3.5">Linked Ticket</th>
                  <th className="px-4 py-3.5">Severity</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {complaints.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-neutral-900 font-mono">{c.complaint_number}</div>
                      <div className="font-medium text-neutral-800 line-clamp-1 max-w-xs">{c.title}</div>
                      <div className="text-[11px] text-neutral-400">
                        Logged on {new Date(c.created_at).toLocaleDateString()}
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <Badge variant={c.complaint_type === "service" ? "info" : "warning"}>
                        {c.complaint_type.toUpperCase()}
                      </Badge>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-medium text-neutral-900">{c.customer_accounts?.name || "—"}</div>
                    </td>

                    <td className="px-4 py-3.5">
                      {c.tickets ? (
                        <Link
                          to={`/operations/tickets/${c.tickets.id}`}
                          className="font-mono text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <LifeBuoy className="h-3 w-3" />
                          {c.tickets.ticket_number}
                        </Link>
                      ) : (
                        <span className="text-xs text-neutral-400 italic">None</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">{getSeverityBadge(c.severity)}</td>

                    <td className="px-4 py-3.5">
                      <Badge variant={c.status === "resolved" ? "success" : c.status === "rejected" ? "error" : "neutral"}>
                        {c.status.replace(/_/g, " ")}
                      </Badge>
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => {
                          setActiveComplaint(c);
                          setStatusUpdateForm({
                            status: c.status,
                            resolutionSummary: "",
                            customerUpdate: "",
                            internalNotes: "",
                          });
                          setUpdateError(null);
                        }}
                        className="rounded-md bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
                      >
                        Investigate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Log New Complaint Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Log Complaint"
        description="Record a customer service complaint or internal platform issue."
        maxWidth="md"
      >
        <form onSubmit={handleCreateComplaint} className="space-y-4">
          {modalError && (
            <div className="rounded bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
              {modalError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Complaint Type</label>
              <select
                value={modalForm.complaintType}
                onChange={(e) => setModalForm({ ...modalForm, complaintType: e.target.value as any })}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="service">Service Complaint</option>
                <option value="platform">Platform Complaint</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Severity</label>
              <select
                value={modalForm.severity}
                onChange={(e) => setModalForm({ ...modalForm, severity: e.target.value as any })}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Customer Account <span className="text-rose-500">*</span>
            </label>
            <select
              required
              value={modalForm.customerAccountId}
              onChange={(e) => setModalForm({ ...modalForm, customerAccountId: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-600 focus:outline-none"
            >
              <option value="">Select customer...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Linked Ticket ID (Optional)
            </label>
            <input
              type="text"
              value={modalForm.ticketId}
              onChange={(e) => setModalForm({ ...modalForm, ticketId: e.target.value })}
              placeholder="e.g. UUID of ticket (links without altering ticket audit)"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs font-mono text-neutral-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Complaint Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={modalForm.title}
              onChange={(e) => setModalForm({ ...modalForm, title: e.target.value })}
              placeholder="Summary of complaint issue"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Description / Factual Breakdown <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={modalForm.description}
              onChange={(e) => setModalForm({ ...modalForm, description: e.target.value })}
              placeholder="Describe what occurred, customer dissatisfaction cause, expectations..."
              className="w-full rounded-lg border border-neutral-300 p-2.5 text-sm text-neutral-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="rounded-lg border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? "Filing..." : "File Complaint"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Investigate / Resolve Modal */}
      <Modal
        isOpen={Boolean(activeComplaint)}
        onClose={() => setActiveComplaint(null)}
        title={`Complaint Investigation: ${activeComplaint?.complaint_number}`}
        description="Update complaint investigation status, resolution summary, and private notes."
        maxWidth="md"
      >
        <form onSubmit={handleUpdateComplaintStatus} className="space-y-4">
          {updateError && (
            <div className="rounded bg-rose-50 p-2 text-xs text-rose-700 border border-rose-200">
              {updateError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">Update Status</label>
            <select
              value={statusUpdateForm.status}
              onChange={(e) => setStatusUpdateForm({ ...statusUpdateForm, status: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-600 focus:outline-none"
            >
              <option value="submitted">Submitted</option>
              <option value="under_investigation">Under Investigation</option>
              <option value="action_required">Action Required</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Internal Investigation Notes (Private to Operations Staff)
            </label>
            <textarea
              rows={3}
              value={statusUpdateForm.internalNotes}
              onChange={(e) => setStatusUpdateForm({ ...statusUpdateForm, internalNotes: e.target.value })}
              placeholder="Internal RCA, technician misconduct or delay findings (hidden from customer)..."
              className="w-full rounded-lg border border-neutral-300 p-2.5 text-xs text-neutral-900 focus:border-blue-600 focus:outline-none bg-amber-50/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Resolution Summary (Visible to Customer upon Resolution)
            </label>
            <textarea
              rows={3}
              value={statusUpdateForm.resolutionSummary}
              onChange={(e) => setStatusUpdateForm({ ...statusUpdateForm, resolutionSummary: e.target.value })}
              placeholder="Official corrective action or compensation provided..."
              className="w-full rounded-lg border border-neutral-300 p-2.5 text-xs text-neutral-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => setActiveComplaint(null)}
              className="rounded-lg border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUpdatingStatus}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {isUpdatingStatus ? "Saving..." : "Save Investigation"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
