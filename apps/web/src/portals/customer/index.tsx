import React, { useEffect, useState } from "react";
import { Routes, Route, Link } from "react-router-dom";
import { CustomerShell } from "./CustomerShell.js";
import { Card, CardHeader } from "../../components/ui/Card.js";
import { Badge } from "../../components/ui/Badge.js";
import { Modal } from "../../components/ui/Modal.js";
import { useAuth } from "../../lib/auth-context.js";
import {
  LifeBuoy,
  Clock,
  Box,
  FileText,
  CheckCircle2,
  Building2,
  MapPin,
  Users,
  Phone,
  Mail,
  RefreshCw,
  AlertCircle,
  Truck,
  Search,
  Plus,
  Send,
  MessageSquare,
  AlertTriangle,
  ChevronRight,
  ShieldAlert,
  CreditCard,
} from "lucide-react";

interface LinkedAccount {
  id: string;
  name: string;
  account_number: string;
  account_type: string;
  status: string;
  billing_address: {
    street?: string;
    city?: string;
    country?: string;
  };
  customer_sites?: [{ count: number }];
  customer_contacts?: [{ count: number }];
}

interface CustomerTicket {
  id: string;
  ticket_number: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  created_at: string;
  sla_due_at: string | null;
  assets?: {
    id: string;
    name: string;
    asset_tag: string;
    fleet_number: string | null;
  } | null;
  customer_accounts?: {
    id: string;
    name: string;
  } | null;
}

export default function CustomerPortal() {
  return (
    <CustomerShell>
      <Routes>
        <Route path="/" element={<CustomerOverview />} />
        <Route path="/assets" element={<CustomerAssetsView />} />
        <Route path="/billing" element={<CustomerBillingView />} />
      </Routes>
    </CustomerShell>
  );
}

function CustomerOverview() {
  const { session, authContext, profile } = useAuth();
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [tickets, setTickets] = useState<CustomerTicket[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [myAssets, setMyAssets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New Request Modal State
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [newTicketForm, setNewTicketForm] = useState({
    customerAccountId: "",
    categoryId: "",
    assetId: "",
    title: "",
    description: "",
    priority: "medium",
  });

  // Selected Ticket Details Modal
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [selectedTicketEvents, setSelectedTicketEvents] = useState<any[]>([]);
  const [isLoadingTicketDetail, setIsLoadingTicketDetail] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);

  const tenantId = authContext?.activeTenantId;
  const token = session?.access_token;

  const fetchData = async () => {
    if (!token || !tenantId) return;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      // 1. Fetch linked accounts
      const accountsRes = await fetch("/api/v1/customers", {
        headers: { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId },
      });
      const accountsData = await accountsRes.json();
      if (accountsData.data) {
        setLinkedAccounts(accountsData.data);
        if (accountsData.data.length > 0 && !newTicketForm.customerAccountId) {
          setNewTicketForm((prev) => ({ ...prev, customerAccountId: accountsData.data[0].id }));
        }
      }

      // 2. Fetch service tickets
      const ticketsRes = await fetch("/api/v1/tickets?limit=20", {
        headers: { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId },
      });
      const ticketsData = await ticketsRes.json();
      if (ticketsData.data) {
        setTickets(ticketsData.data);
      }

      // 3. Fetch ticket categories
      const catRes = await fetch("/api/v1/tickets/categories", {
        headers: { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId },
      });
      const catData = await catRes.json();
      if (catData.data) {
        setCategories(catData.data);
        if (catData.data.length > 0 && !newTicketForm.categoryId) {
          setNewTicketForm((prev) => ({ ...prev, categoryId: catData.data[0].id }));
        }
      }

      // 4. Fetch my assets
      const assetsRes = await fetch("/api/v1/assets?limit=100", {
        headers: { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId },
      });
      const assetsData = await assetsRes.json();
      if (assetsData.data) {
        setMyAssets(assetsData.data);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load customer workspace");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, tenantId]);

  const handleOpenTicketDetail = async (ticketId: string) => {
    if (!token || !tenantId) return;
    setIsLoadingTicketDetail(true);
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}`, {
        headers: { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId },
      });
      const payload = await res.json();
      if (payload.data) {
        setSelectedTicket(payload.data);
        setSelectedTicketEvents(payload.data.events || []);
      }
    } catch (err) {
      console.error("Failed to load ticket details:", err);
    } finally {
      setIsLoadingTicketDetail(false);
    }
  };

  const handlePostCustomerComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !tenantId || !selectedTicket || !newComment.trim()) return;

    setIsPostingComment(true);
    try {
      const res = await fetch(`/api/v1/tickets/${selectedTicket.id}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Tenant-ID": tenantId,
        },
        body: JSON.stringify({
          eventType: "comment",
          body: newComment.trim(),
          isInternal: false,
        }),
      });

      const resData = await res.json();
      if (res.ok && resData.data) {
        setSelectedTicketEvents((prev) => [...prev, resData.data]);
        setNewComment("");
      }
    } catch (err) {
      console.error("Failed to post comment:", err);
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleCreateServiceRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !tenantId) return;

    if (!newTicketForm.customerAccountId) {
      setTicketError("Please select your customer account");
      return;
    }
    if (!newTicketForm.categoryId) {
      setTicketError("Please select a service category");
      return;
    }
    if (!newTicketForm.title.trim()) {
      setTicketError("Please summarize your service request");
      return;
    }
    if (!newTicketForm.description.trim()) {
      setTicketError("Please describe the issue or service needed");
      return;
    }

    setIsSubmitting(true);
    setTicketError(null);

    try {
      const payload: any = {
        customerAccountId: newTicketForm.customerAccountId,
        categoryId: newTicketForm.categoryId,
        title: newTicketForm.title.trim(),
        description: newTicketForm.description.trim(),
        priority: newTicketForm.priority,
        coverageType: "paid",
        reportedVia: "portal",
      };

      if (newTicketForm.assetId) {
        payload.assetId = newTicketForm.assetId;
      }

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
        throw new Error(resData.error?.message || "Failed to submit request");
      }

      setIsNewTicketOpen(false);
      setNewTicketForm({
        customerAccountId: linkedAccounts[0]?.id || "",
        categoryId: categories[0]?.id || "",
        assetId: "",
        title: "",
        description: "",
        priority: "medium",
      });
      fetchData();
    } catch (err: any) {
      setTicketError(err.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="primary">Client Workspace</Badge>
              <span className="text-xs text-neutral-400">Step 9 Service Ticketing Active</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">
              Welcome, {profile?.fullName || "Valued Client"}
            </h1>
            <p className="mt-1 text-xs text-neutral-500 max-w-xl">
              Track maintenance service requests, inspect registered facilities, and communicate with your service provider.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsNewTicketOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Request Service
            </button>
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Linked Customer Accounts */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Your Authorized Customer Account(s)
        </h2>

        {isLoading ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-xs text-neutral-500">
            <RefreshCw className="mx-auto h-5 w-5 animate-spin text-neutral-400" />
            <p className="mt-2">Verifying authorized customer account access...</p>
          </div>
        ) : linkedAccounts.length === 0 ? (
          <Card>
            <div className="py-8 text-center">
              <Building2 className="mx-auto h-8 w-8 text-neutral-300" />
              <h3 className="mt-2 text-sm font-semibold text-neutral-900">No customer account linked yet</h3>
              <p className="mt-1 text-xs text-neutral-500 max-w-md mx-auto">
                Your portal user account is active, but your service provider has not yet linked you to a customer account. Please contact your operations dispatcher to finalize access.
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {linkedAccounts.map((acc) => {
              const sitesCount = acc.customer_sites?.[0]?.count || 0;
              return (
                <Card key={acc.id} className="relative">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 font-bold text-blue-700 text-sm">
                        {acc.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-semibold text-neutral-900 text-sm">{acc.name}</h3>
                        <p className="font-mono text-[10px] text-neutral-400">{acc.account_number}</p>
                      </div>
                    </div>
                    <Badge variant={acc.status === "active" ? "success" : "neutral"}>
                      {acc.status}
                    </Badge>
                  </div>

                  <div className="mt-4 border-t border-neutral-100 pt-3 grid grid-cols-2 gap-3 text-xs text-neutral-600">
                    <div>
                      <span className="text-neutral-400 text-[11px]">Primary Location:</span>
                      <p className="font-medium text-neutral-900 truncate">
                        {acc.billing_address?.city || "Saudi Arabia"}
                      </p>
                    </div>
                    <div>
                      <span className="text-neutral-400 text-[11px]">Registered Sites:</span>
                      <p className="font-medium text-neutral-900">
                        {sitesCount} {sitesCount === 1 ? "branch" : "branches"}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Active Service Requests Section */}
      <Card>
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-blue-600" />
            <h3 className="font-semibold text-neutral-900 text-sm">Your Active Service Requests</h3>
          </div>
          <button
            onClick={() => setIsNewTicketOpen(true)}
            className="text-xs font-semibold text-blue-600 hover:underline"
          >
            + New Request
          </button>
        </div>

        {tickets.length === 0 ? (
          <div className="py-12 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-neutral-300" />
            <h4 className="mt-2 text-sm font-semibold text-neutral-900">No active support requests</h4>
            <p className="mt-1 text-xs text-neutral-500 max-w-sm mx-auto">
              Need assistance with your fleet or equipment? Submit a maintenance or support ticket anytime.
            </p>
            <button
              onClick={() => setIsNewTicketOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" /> Submit Service Request
            </button>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {tickets.map((t) => (
              <div
                key={t.id}
                onClick={() => handleOpenTicketDetail(t.id)}
                className="flex items-center justify-between p-4 hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      {t.ticket_number}
                    </span>
                    <span className="font-semibold text-sm text-neutral-900">{t.title}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-neutral-500">
                    {t.assets ? (
                      <span className="flex items-center gap-1">
                        <Truck className="h-3 w-3 text-neutral-400" />
                        {t.assets.name} ({t.assets.asset_tag})
                      </span>
                    ) : (
                      <span className="italic text-neutral-400">General Service Request</span>
                    )}
                    <span>•</span>
                    <span>Created: {new Date(t.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge variant={t.status === "resolved" ? "success" : t.status === "in_progress" ? "warning" : "info"}>
                    {t.status.replace(/_/g, " ")}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-neutral-400" />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* New Service Request Modal */}
      <Modal
        isOpen={isNewTicketOpen}
        onClose={() => setIsNewTicketOpen(false)}
        title="Request Maintenance or Support"
        description="Submit a service ticket directly to your operations dispatch team."
        maxWidth="md"
      >
        <form onSubmit={handleCreateServiceRequest} className="space-y-4">
          {ticketError && (
            <div className="rounded bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
              {ticketError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">Customer Account</label>
            <select
              value={newTicketForm.customerAccountId}
              onChange={(e) => setNewTicketForm({ ...newTicketForm, customerAccountId: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-blue-600 focus:outline-none"
            >
              {linkedAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.account_number})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Service Category</label>
              <select
                value={newTicketForm.categoryId}
                onChange={(e) => setNewTicketForm({ ...newTicketForm, categoryId: e.target.value })}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-blue-600 focus:outline-none"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Asset (Optional)</label>
              <select
                value={newTicketForm.assetId}
                onChange={(e) => setNewTicketForm({ ...newTicketForm, assetId: e.target.value })}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-blue-600 focus:outline-none font-mono"
              >
                <option value="">General Facility / Non-Asset</option>
                {myAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.asset_tag} - {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Issue Subject <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={newTicketForm.title}
              onChange={(e) => setNewTicketForm({ ...newTicketForm, title: e.target.value })}
              placeholder="e.g. Hydraulic leak during heavy operation"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Issue Breakdown & Details <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={newTicketForm.description}
              onChange={(e) => setNewTicketForm({ ...newTicketForm, description: e.target.value })}
              placeholder="Describe symptoms, vehicle status, location on site, and urgency..."
              className="w-full rounded-lg border border-neutral-300 p-2.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => setIsNewTicketOpen(false)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Ticket Details & Public Communications Modal */}
      <Modal
        isOpen={Boolean(selectedTicket)}
        onClose={() => setSelectedTicket(null)}
        title={`Service Ticket: ${selectedTicket?.ticket_number}`}
        description="View status, review updates from dispatch, and reply directly."
        maxWidth="lg"
      >
        {selectedTicket && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-neutral-50 p-3 rounded-lg border border-neutral-200">
              <div>
                <span className="text-xs text-neutral-500">Status</span>
                <div className="font-semibold text-neutral-900 capitalize">
                  {selectedTicket.status.replace(/_/g, " ")}
                </div>
              </div>
              <div>
                <span className="text-xs text-neutral-500">Priority</span>
                <div className="font-semibold text-neutral-900 capitalize">{selectedTicket.priority}</div>
              </div>
              {selectedTicket.sla_due_at && (
                <div>
                  <span className="text-xs text-neutral-500">SLA Response</span>
                  <div className="text-xs font-medium text-amber-700">
                    {new Date(selectedTicket.sla_due_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              )}
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase text-neutral-400 mb-1">Problem Description</h4>
              <p className="text-xs text-neutral-800 bg-neutral-50 p-3 rounded border border-neutral-100 whitespace-pre-wrap">
                {selectedTicket.description}
              </p>
            </div>

            {selectedTicket.resolution_summary && (
              <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                <strong>Resolution: </strong> {selectedTicket.resolution_summary}
              </div>
            )}

            {/* Public Timeline Events (Verified: Internal notes are filtered out) */}
            <div>
              <h4 className="text-xs font-semibold uppercase text-neutral-400 mb-2">Communications Stream</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {selectedTicketEvents.length === 0 ? (
                  <p className="text-xs text-neutral-400 italic">No public comments yet.</p>
                ) : (
                  selectedTicketEvents.map((ev) => (
                    <div key={ev.id} className="rounded border border-neutral-200 bg-white p-2.5 text-xs">
                      <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1">
                        <span className="font-semibold text-neutral-700 capitalize">{ev.actor_type}</span>
                        <span>{new Date(ev.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <p className="text-neutral-800">{ev.body}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Add Communication */}
            <form onSubmit={handlePostCustomerComment} className="border-t border-neutral-200 pt-3 space-y-2">
              <textarea
                rows={2}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Send a message or update to your service team..."
                className="w-full rounded border border-neutral-300 p-2 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-600 focus:outline-none"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isPostingComment || !newComment.trim()}
                  className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send className="h-3 w-3" />
                  {isPostingComment ? "Sending..." : "Send Message"}
                </button>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </div>
  );
}

function CustomerAssetsView() {
  const { session, authContext } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchAssets = () => {
    if (!session?.access_token) return;
    setIsLoading(true);

    fetch(`/api/v1/assets?search=${encodeURIComponent(search)}`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "X-Tenant-ID": authContext?.activeTenantId || "",
      },
    })
      .then((res) => res.json())
      .then((payload) => {
        if (payload.data) setAssets(payload.data);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchAssets();
  }, [session?.access_token, authContext?.activeTenantId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Registered Fleet & Equipment
          </h1>
          <p className="mt-1 text-xs text-neutral-500">
            Vehicles and serviceable assets owned by your organization with real-time operational status
          </p>
        </div>
        <button
          onClick={fetchAssets}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchAssets()}
          placeholder="Search by vehicle name, plate, fleet #, or VIN..."
          className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-xs placeholder-neutral-400 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <Card>
        {isLoading ? (
          <div className="p-12 text-center text-xs text-neutral-500">
            <RefreshCw className="mx-auto h-5 w-5 animate-spin text-neutral-400" />
            <p className="mt-2">Loading authorized assets...</p>
          </div>
        ) : assets.length === 0 ? (
          <div className="py-12 text-center">
            <Truck className="mx-auto h-8 w-8 text-neutral-300" />
            <h4 className="mt-2 text-sm font-semibold text-neutral-900">No assets registered</h4>
            <p className="mt-1 text-xs text-neutral-500 max-w-sm mx-auto">
              Your organization's vehicles and equipment will appear here once registered by operations.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-200 bg-neutral-50/75 text-neutral-500 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Identifiers</th>
                  <th className="px-4 py-3">Branch Location</th>
                  <th className="px-4 py-3">Operational State</th>
                  <th className="px-4 py-3">Odometer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {assets.map((a) => (
                  <tr key={a.id} className="hover:bg-neutral-50/50">
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-neutral-900">{a.name}</div>
                      <div className="text-[11px] text-neutral-500">
                        {a.make} {a.model} {a.model_year ? `(${a.model_year})` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] text-neutral-600">
                      {a.plate_number && <div>Plate: {a.plate_number}</div>}
                      {a.fleet_number && <div>Fleet #{a.fleet_number}</div>}
                      {a.vin && <div className="text-neutral-400">VIN: {a.vin}</div>}
                    </td>
                    <td className="px-4 py-3.5 text-neutral-700">
                      {a.customer_sites?.name || "Main Depot"}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant={a.operational_status === "active" ? "success" : "warning"}>
                        {a.operational_status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-neutral-600">
                      {a.odometer_reading ? `${a.odometer_reading.toLocaleString()} km` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function CustomerBillingView() {
  const { session, authContext } = useAuth();
  const [quotations, setQuotations] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Review & Approval Modal
  const [selectedQuote, setSelectedQuote] = useState<any | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const tenantId = authContext?.activeTenantId;
  const token = session?.access_token;

  const fetchBilling = async () => {
    if (!token || !tenantId) return;
    setIsLoading(true);

    try {
      const [qRes, invRes] = await Promise.all([
        fetch("/api/v1/quotations", {
          headers: { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId },
        }),
        fetch("/api/v1/payments/invoices", {
          headers: { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId },
        }),
      ]);

      const qData = await qRes.json();
      const invData = await invRes.json();

      if (qData.data) setQuotations(qData.data);
      if (invData.data) setInvoices(invData.data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBilling();
  }, [token, tenantId]);

  const handleApproveQuote = async (quoteId: string) => {
    if (!token || !tenantId) return;
    setIsApproving(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/v1/quotations/${quoteId}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-ID": tenantId,
        },
      });

      const payload = await res.json();
      if (!res.ok || payload.error) {
        throw new Error(payload.error?.message || "Failed to approve quotation");
      }

      setSelectedQuote(null);
      fetchBilling();
    } catch (err: any) {
      setActionError(err.message || "Approval failed");
    } finally {
      setIsApproving(false);
    }
  };

  const handleRejectQuote = async (quoteId: string) => {
    if (!token || !tenantId) return;
    if (!rejectReason.trim()) {
      setActionError("Please provide a reason for rejecting this quotation");
      return;
    }

    setIsRejecting(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/v1/quotations/${quoteId}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Tenant-ID": tenantId,
        },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });

      const payload = await res.json();
      if (!res.ok || payload.error) {
        throw new Error(payload.error?.message || "Failed to reject quotation");
      }

      setSelectedQuote(null);
      setRejectReason("");
      fetchBilling();
    } catch (err: any) {
      setActionError(err.message || "Rejection failed");
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Billing, Quotations & Invoices
          </h1>
          <p className="mt-1 text-xs text-neutral-500">
            Review service cost estimates, approve repair quotations, and track issued invoices.
          </p>
        </div>
        <button
          onClick={fetchBilling}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Quotations Awaiting Approval */}
      <Card>
        <div className="border-b border-neutral-100 pb-3">
          <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            Service Quotations
          </h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-neutral-500">Loading quotations...</div>
        ) : quotations.length === 0 ? (
          <div className="py-10 text-center text-xs text-neutral-400 italic">
            No service quotations issued for your account.
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {quotations.map((q) => (
              <div
                key={q.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-3 hover:bg-neutral-50 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      {q.quotation_number}
                    </span>
                    <Badge variant={q.status === "approved" ? "success" : q.status === "sent" ? "warning" : "neutral"}>
                      {q.status === "sent" ? "Awaiting Your Sign-off" : q.status}
                    </Badge>
                  </div>
                  <p className="mt-1 font-semibold text-xs text-neutral-900">
                    {q.tickets?.title || "Maintenance Service"}
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    Valid until {new Date(q.valid_until).toLocaleDateString()} • Includes 15% VAT
                  </p>
                </div>

                <div className="flex items-center gap-4 self-end sm:self-auto">
                  <div className="text-right">
                    <div className="font-mono font-bold text-sm text-neutral-900">
                      SAR {Number(q.total_amount).toFixed(2)}
                    </div>
                    <div className="text-[10px] text-neutral-400">
                      Subtotal: SAR {Number(q.subtotal).toFixed(2)}
                    </div>
                  </div>

                  {q.status === "sent" && (
                    <button
                      onClick={async () => {
                        const res = await fetch(`/api/v1/quotations/${q.id}`, {
                          headers: { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId || "" },
                        });
                        const data = await res.json();
                        setSelectedQuote(data.data || q);
                      }}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      Review & Sign
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Invoices Registry */}
      <Card>
        <div className="border-b border-neutral-100 pb-3">
          <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-emerald-600" />
            Issued Invoices & Receipts
          </h2>
        </div>

        {invoices.length === 0 ? (
          <div className="py-10 text-center text-xs text-neutral-400 italic">
            No invoices issued yet.
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-4 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-neutral-900">{inv.invoice_number}</span>
                    <Badge variant={inv.status === "paid" ? "success" : "warning"}>{inv.status}</Badge>
                  </div>
                  <p className="mt-0.5 text-neutral-500 text-[11px]">
                    Issued: {new Date(inv.issued_at).toLocaleDateString()}
                    {inv.paid_at && ` • Paid on ${new Date(inv.paid_at).toLocaleDateString()}`}
                  </p>
                </div>

                <div className="font-mono font-bold text-sm text-neutral-900">
                  SAR {Number(inv.total_amount).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Review Quotation Modal */}
      <Modal
        isOpen={Boolean(selectedQuote)}
        onClose={() => setSelectedQuote(null)}
        title={`Review Quotation: ${selectedQuote?.quotation_number}`}
        description="Verify parts & labour breakdown and confirm customer authorization."
        maxWidth="md"
      >
        {selectedQuote && (
          <div className="space-y-4">
            {actionError && (
              <div className="rounded bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                {actionError}
              </div>
            )}

            <div className="bg-neutral-50 p-3 rounded border border-neutral-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-neutral-500">Service:</span>
                <span className="font-semibold text-neutral-900">{selectedQuote.tickets?.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Valid Until:</span>
                <span className="font-medium text-neutral-700">{new Date(selectedQuote.valid_until).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Line items table */}
            <div className="border border-neutral-200 rounded overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-100 border-b border-neutral-200 text-neutral-600 font-semibold">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {(selectedQuote.currentVersionData?.line_items || []).map((item: any, idx: number) => (
                    <tr key={idx}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-neutral-900">{item.description}</div>
                        <div className="text-[10px] uppercase text-neutral-400">{item.type}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{item.quantity}</td>
                      <td className="px-3 py-2 text-right font-mono">SAR {Number(item.unitPrice).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">SAR {Number(item.lineTotal).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Summary */}
            <div className="space-y-1.5 text-xs border-t border-neutral-200 pt-3">
              <div className="flex justify-between text-neutral-500">
                <span>Subtotal:</span>
                <span className="font-mono">SAR {Number(selectedQuote.subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-neutral-500">
                <span>VAT (15%):</span>
                <span className="font-mono">SAR {Number(selectedQuote.tax_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-neutral-900 border-t border-neutral-200 pt-1.5">
                <span>Total Amount:</span>
                <span className="font-mono text-blue-600">SAR {Number(selectedQuote.total_amount).toFixed(2)}</span>
              </div>
            </div>

            {/* Rejection reason input if rejecting */}
            <div className="border-t border-neutral-200 pt-3">
              <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                If declining, please enter reason:
              </label>
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Price exceeds internal fleet repair threshold"
                className="w-full rounded border border-neutral-300 p-2 text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                disabled={isRejecting}
                onClick={() => handleRejectQuote(selectedQuote.id)}
                className="rounded border border-rose-300 text-rose-700 px-3 py-1.5 text-xs font-semibold hover:bg-rose-50 disabled:opacity-50"
              >
                {isRejecting ? "Declining..." : "Decline Quotation"}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedQuote(null)}
                  className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isApproving}
                  onClick={() => handleApproveQuote(selectedQuote.id)}
                  className="rounded bg-emerald-600 text-white px-4 py-1.5 text-xs font-semibold shadow-xs hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {isApproving ? "Authorizing..." : "Approve & Authorize Service"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

