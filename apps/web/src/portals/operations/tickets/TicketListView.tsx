import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../lib/auth-context.js";
import { Card } from "../../../components/ui/Card.js";
import { Badge } from "../../../components/ui/Badge.js";
import { Input } from "../../../components/ui/Input.js";
import { Select } from "../../../components/ui/Select.js";
import { Modal } from "../../../components/ui/Modal.js";
import {
  LifeBuoy,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Building2,
  MapPin,
  ChevronRight,
  ChevronLeft,
  Truck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  ArrowRight,
  FileText,
} from "lucide-react";

export interface TicketRecord {
  id: string;
  ticket_number: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: string;
  coverage_type: "paid" | "warranty" | "free_service" | "contract";
  reported_via: string;
  sla_due_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
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
  assets?: {
    id: string;
    name: string;
    asset_tag: string;
    fleet_number: string | null;
    vin: string | null;
  } | null;
  ticket_categories?: {
    id: string;
    name: string;
    code: string;
    default_priority: string;
  } | null;
}

export function TicketListView() {
  const { session, authContext } = useAuth();
  const navigate = useNavigate();

  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; sla_response_hours: number; sla_resolution_hours: number }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [customerSites, setCustomerSites] = useState<Array<{ id: string; name: string }>>([]);
  const [customerContacts, setCustomerContacts] = useState<Array<{ id: string; full_name: string }>>([]);
  const [customerAssets, setCustomerAssets] = useState<Array<{ id: string; name: string; asset_tag: string; fleet_number: string | null }>>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // New Ticket Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalForm, setModalForm] = useState({
    customerAccountId: "",
    siteId: "",
    contactId: "",
    assetId: "",
    categoryId: "",
    title: "",
    description: "",
    priority: "medium",
    coverageType: "paid",
    reportedVia: "portal",
  });

  const tenantId = authContext?.activeTenantId;
  const token = session?.access_token;

  const fetchTickets = () => {
    if (!token || !tenantId) return;
    setIsLoading(true);
    setErrorMsg(null);

    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", "15");
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (customerFilter) params.set("customerAccountId", customerFilter);

    fetch(`/api/v1/tickets?${params.toString()}`, {
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
          setTickets(resData.data || []);
          if (resData.meta) {
            setTotalPages(resData.meta.totalPages || 1);
            setTotalCount(resData.meta.total || 0);
          }
        }
      })
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setIsLoading(false));
  };

  // Fetch lookups: categories and customers
  useEffect(() => {
    if (!token || !tenantId) return;

    fetch("/api/v1/tickets/categories", {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Tenant-ID": tenantId,
      },
    })
      .then((res) => res.json())
      .then((payload) => {
        if (payload.data) setCategories(payload.data);
      })
      .catch((err) => console.error("Error fetching ticket categories:", err));

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

  // When customer changes in modal, load their sites, contacts, and assets
  useEffect(() => {
    if (!modalForm.customerAccountId || !token || !tenantId) {
      setCustomerSites([]);
      setCustomerContacts([]);
      setCustomerAssets([]);
      return;
    }

    fetch(`/api/v1/customers/${modalForm.customerAccountId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Tenant-ID": tenantId,
      },
    })
      .then((res) => res.json())
      .then((payload) => {
        if (payload.data) {
          setCustomerSites(payload.data.sites || []);
          setCustomerContacts(payload.data.contacts || []);
        }
      })
      .catch((err) => console.error("Error fetching customer sites/contacts:", err));

    fetch(`/api/v1/assets?customerAccountId=${modalForm.customerAccountId}&limit=100`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Tenant-ID": tenantId,
      },
    })
      .then((res) => res.json())
      .then((payload) => {
        if (payload.data) {
          setCustomerAssets(payload.data);
        }
      })
      .catch((err) => console.error("Error fetching customer assets:", err));
  }, [modalForm.customerAccountId, token, tenantId]);

  useEffect(() => {
    fetchTickets();
  }, [token, tenantId, page, statusFilter, priorityFilter, customerFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchTickets();
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !tenantId) return;

    if (!modalForm.customerAccountId) {
      setModalError("Please select a customer account");
      return;
    }
    if (!modalForm.categoryId) {
      setModalError("Please select a ticket category");
      return;
    }
    if (!modalForm.title.trim()) {
      setModalError("Please enter a ticket title");
      return;
    }
    if (!modalForm.description.trim()) {
      setModalError("Please provide ticket details / description");
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      const payload: any = {
        customerAccountId: modalForm.customerAccountId,
        categoryId: modalForm.categoryId,
        title: modalForm.title.trim(),
        description: modalForm.description.trim(),
        priority: modalForm.priority,
        coverageType: modalForm.coverageType,
        reportedVia: modalForm.reportedVia,
      };

      if (modalForm.siteId) payload.siteId = modalForm.siteId;
      if (modalForm.contactId) payload.contactId = modalForm.contactId;
      if (modalForm.assetId) payload.assetId = modalForm.assetId;

      const res = await fetch("/api/v1/tickets", {
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
        throw new Error(resData.error?.message || "Failed to create ticket");
      }

      setIsModalOpen(false);
      setModalForm({
        customerAccountId: "",
        siteId: "",
        contactId: "",
        assetId: "",
        categoryId: "",
        title: "",
        description: "",
        priority: "medium",
        coverageType: "paid",
        reportedVia: "portal",
      });
      fetchTickets();
      navigate(`/operations/tickets/${resData.data.id}`);
    } catch (err: any) {
      setModalError(err.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "critical":
        return <Badge variant="error" dot>Critical</Badge>;
      case "high":
        return <Badge variant="warning" dot>High</Badge>;
      case "medium":
        return <Badge variant="info">Medium</Badge>;
      case "low":
        return <Badge variant="neutral">Low</Badge>;
      default:
        return <Badge variant="neutral">{priority}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "submitted":
        return <Badge variant="info">Submitted</Badge>;
      case "under_review":
        return <Badge variant="warning">Under Review</Badge>;
      case "ready_for_assignment":
        return <Badge variant="primary">Ready For Assign</Badge>;
      case "assigned":
      case "accepted":
        return <Badge variant="info">Assigned</Badge>;
      case "in_progress":
      case "technician_en_route":
      case "arrived":
        return <Badge variant="warning" dot>In Progress</Badge>;
      case "on_hold":
        return <Badge variant="neutral">On Hold</Badge>;
      case "service_completed":
      case "resolved":
        return <Badge variant="success">Resolved</Badge>;
      case "closed":
        return <Badge variant="neutral">Closed</Badge>;
      case "cancelled":
        return <Badge variant="error">Cancelled</Badge>;
      default:
        return <Badge variant="neutral">{status.replace(/_/g, " ")}</Badge>;
    }
  };

  return (
    <div className="space-y-6 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Support Desk & Tickets</h1>
            <Badge variant="primary">Step 9</Badge>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            Lifecycle ticketing, immutable transactional numbering, service SLAs, and complaint governance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/operations/complaints"
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
          >
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            Complaints Desk
          </Link>

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
          >
            <Plus className="h-4 w-4" />
            New Ticket
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 border-l-4 border-l-blue-600">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-neutral-500">Total Active Tickets</p>
              <p className="mt-1 text-2xl font-bold text-neutral-900">{totalCount}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <LifeBuoy className="h-5 w-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-neutral-500">In Progress / Dispatch</p>
              <p className="mt-1 text-2xl font-bold text-neutral-900">
                {tickets.filter((t) => ["in_progress", "technician_en_route", "assigned"].includes(t.status)).length}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-rose-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-neutral-500">Critical Priority</p>
              <p className="mt-1 text-2xl font-bold text-neutral-900">
                {tickets.filter((t) => t.priority === "critical").length}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-600">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-neutral-500">Service Categories</p>
              <p className="mt-1 text-2xl font-bold text-neutral-900">{categories.length}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by ticket #, title, or description..."
                className="w-full rounded-lg border border-neutral-300 pl-9 pr-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
            >
              Search
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:border-blue-600 focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="submitted">Submitted</option>
              <option value="under_review">Under Review</option>
              <option value="ready_for_assignment">Ready for Assignment</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="on_hold">On Hold</option>
              <option value="service_completed">Service Completed</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:border-blue-600 focus:outline-none"
            >
              <option value="">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select
              value={customerFilter}
              onChange={(e) => {
                setCustomerFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:border-blue-600 focus:outline-none max-w-xs truncate"
            >
              <option value="">All Customers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("");
                setPriorityFilter("");
                setCustomerFilter("");
                setPage(1);
                fetchTickets();
              }}
              className="rounded-lg border border-neutral-300 p-2 text-neutral-600 hover:bg-neutral-50"
              title="Reset Filters"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Card>

      {/* Main Tickets Table */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
              <p className="text-sm text-neutral-500 font-medium">Loading tickets registry...</p>
            </div>
          </div>
        ) : errorMsg ? (
          <div className="p-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
            <h3 className="mt-2 text-base font-semibold text-neutral-900">Failed to load tickets</h3>
            <p className="mt-1 text-sm text-neutral-500">{errorMsg}</p>
            <button
              onClick={fetchTickets}
              className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
            >
              Retry
            </button>
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center">
            <LifeBuoy className="mx-auto h-12 w-12 text-neutral-300" />
            <h3 className="mt-3 text-base font-semibold text-neutral-900">No tickets found</h3>
            <p className="mt-1 text-sm text-neutral-500 max-w-sm mx-auto">
              There are no service tickets matching your search and filter criteria.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Create First Ticket
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-neutral-600">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-4 py-3.5">Ticket # & Subject</th>
                  <th className="px-4 py-3.5">Customer & Site</th>
                  <th className="px-4 py-3.5">Asset / Fleet</th>
                  <th className="px-4 py-3.5">Category</th>
                  <th className="px-4 py-3.5">Priority</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">SLA Due</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {tickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-blue-600">
                        <Link to={`/operations/tickets/${ticket.id}`} className="hover:underline">
                          {ticket.ticket_number}
                        </Link>
                      </div>
                      <div className="font-medium text-neutral-900 line-clamp-1 max-w-xs">{ticket.title}</div>
                      <div className="text-[11px] text-neutral-400">
                        {new Date(ticket.created_at).toLocaleDateString()} via {ticket.reported_via}
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-medium text-neutral-900 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                        <span className="truncate max-w-[150px]">{ticket.customer_accounts?.name || "—"}</span>
                      </div>
                      {ticket.customer_sites && (
                        <div className="text-[11px] text-neutral-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3 text-neutral-400" />
                          <span>{ticket.customer_sites.name} ({ticket.customer_sites.city})</span>
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      {ticket.assets ? (
                        <div>
                          <div className="font-medium text-neutral-900 flex items-center gap-1.5">
                            <Truck className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                            <span>{ticket.assets.name}</span>
                          </div>
                          <div className="text-[11px] text-neutral-500">
                            Tag: <span className="font-mono">{ticket.assets.asset_tag}</span>
                            {ticket.assets.fleet_number && ` • Fleet #${ticket.assets.fleet_number}`}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-400 italic">General Request</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="text-xs font-medium text-neutral-900">
                        {ticket.ticket_categories?.name || "General"}
                      </div>
                      <div className="text-[11px] capitalize text-neutral-400">{ticket.coverage_type}</div>
                    </td>

                    <td className="px-4 py-3.5">{getPriorityBadge(ticket.priority)}</td>

                    <td className="px-4 py-3.5">{getStatusBadge(ticket.status)}</td>

                    <td className="px-4 py-3.5">
                      {ticket.sla_due_at ? (
                        <div className="text-xs text-neutral-600 flex items-center gap-1">
                          <Clock className="h-3 w-3 text-neutral-400" />
                          <span>{new Date(ticket.sla_due_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      ) : (
                        <span className="text-neutral-400 text-xs">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <Link
                        to={`/operations/tickets/${ticket.id}`}
                        className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200 transition-colors"
                      >
                        Manage
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-3 bg-neutral-50">
            <div className="text-xs text-neutral-500">
              Showing page <span className="font-semibold text-neutral-900">{page}</span> of{" "}
              <span className="font-semibold text-neutral-900">{totalPages}</span> ({totalCount} tickets)
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* New Ticket Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Service Ticket"
        description="Submit a new service ticket with SLA tracking. In V1, one asset per ticket is supported."
        maxWidth="lg"
      >
        <form onSubmit={handleCreateTicket} className="space-y-4">
          {modalError && (
            <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{modalError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Customer Account <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={modalForm.customerAccountId}
                onChange={(e) =>
                  setModalForm({
                    ...modalForm,
                    customerAccountId: e.target.value,
                    siteId: "",
                    contactId: "",
                    assetId: "",
                  })
                }
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
                Ticket Category <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={modalForm.categoryId}
                onChange={(e) => {
                  const cat = categories.find((c) => c.id === e.target.value);
                  setModalForm({
                    ...modalForm,
                    categoryId: e.target.value,
                    priority: (cat as any)?.default_priority || modalForm.priority,
                  });
                }}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="">Select service category...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (SLA: {c.sla_resolution_hours}h)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Service Site / Branch</label>
              <select
                disabled={!modalForm.customerAccountId}
                value={modalForm.siteId}
                onChange={(e) => setModalForm({ ...modalForm, siteId: e.target.value })}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-600 focus:outline-none disabled:bg-neutral-100"
              >
                <option value="">(Optional) General Location</option>
                {customerSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Customer Contact</label>
              <select
                disabled={!modalForm.customerAccountId}
                value={modalForm.contactId}
                onChange={(e) => setModalForm({ ...modalForm, contactId: e.target.value })}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-600 focus:outline-none disabled:bg-neutral-100"
              >
                <option value="">(Optional) Default Contact</option>
                {customerContacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Asset (1 asset per ticket in V1)
              </label>
              <select
                disabled={!modalForm.customerAccountId}
                value={modalForm.assetId}
                onChange={(e) => setModalForm({ ...modalForm, assetId: e.target.value })}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-600 focus:outline-none disabled:bg-neutral-100 font-mono text-xs"
              >
                <option value="">None / General Service</option>
                {customerAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.asset_tag} - {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Ticket Title / Summary <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={modalForm.title}
              onChange={(e) => setModalForm({ ...modalForm, title: e.target.value })}
              placeholder="e.g. Engine diagnostic warning light flashing on Truck #42"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Detailed Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={modalForm.description}
              onChange={(e) => setModalForm({ ...modalForm, description: e.target.value })}
              placeholder="Provide complete breakdown of the customer's issue, symptoms observed, error codes, and operational impact..."
              className="w-full rounded-lg border border-neutral-300 p-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Priority</label>
              <select
                value={modalForm.priority}
                onChange={(e) => setModalForm({ ...modalForm, priority: e.target.value })}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="low">Low (Standard)</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical (Immediate SLA)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Coverage Type</label>
              <select
                value={modalForm.coverageType}
                onChange={(e) => setModalForm({ ...modalForm, coverageType: e.target.value })}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="paid">Paid Service</option>
                <option value="warranty">Warranty</option>
                <option value="contract">Maintenance Contract</option>
                <option value="free_service">Complimentary</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Reported Via</label>
              <select
                value={modalForm.reportedVia}
                onChange={(e) => setModalForm({ ...modalForm, reportedVia: e.target.value })}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="portal">Web Portal</option>
                <option value="phone">Phone Call</option>
                <option value="email">Email</option>
                <option value="chat">Chat</option>
                <option value="automated_telematics">Automated Telematics</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Creating Ticket...
                </>
              ) : (
                "Create Ticket"
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
