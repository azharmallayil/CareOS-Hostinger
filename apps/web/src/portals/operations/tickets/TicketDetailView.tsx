import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../lib/auth-context.js";
import { Card } from "../../../components/ui/Card.js";
import { Badge } from "../../../components/ui/Badge.js";
import { Modal } from "../../../components/ui/Modal.js";
import {
  LifeBuoy,
  ArrowLeft,
  Building2,
  MapPin,
  Truck,
  User,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Send,
  Lock,
  MessageSquare,
  ShieldAlert,
  ChevronRight,
  RefreshCw,
  Plus,
  AlertCircle,
  FileText,
  UserCheck,
} from "lucide-react";

export interface TicketDetailData {
  id: string;
  tenant_id: string;
  ticket_number: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: string;
  coverage_type: string;
  reported_via: string;
  sla_due_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  resolution_summary: string | null;
  cancellation_reason: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  customer_accounts?: {
    id: string;
    name: string;
    account_number: string;
    email: string | null;
    phone: string | null;
  } | null;
  customer_sites?: {
    id: string;
    name: string;
    city: string;
    address_line_1: string;
    latitude: number | null;
    longitude: number | null;
  } | null;
  customer_contacts?: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    role_title: string | null;
  } | null;
  assets?: {
    id: string;
    name: string;
    asset_tag: string;
    fleet_number: string | null;
    vin: string | null;
    make: string;
    model: string;
    operational_status: string;
  } | null;
  ticket_categories?: {
    id: string;
    name: string;
    code: string;
    default_priority: string;
    sla_response_hours: number;
    sla_resolution_hours: number;
  } | null;
  statusHistory: Array<{
    id: string;
    from_status: string | null;
    to_status: string;
    changed_by: string | null;
    reason: string | null;
    created_at: string;
  }>;
  events: Array<{
    id: string;
    event_type: string;
    actor_id: string | null;
    actor_type: string;
    is_internal: boolean;
    body: string;
    created_at: string;
  }>;
  complaints: Array<{
    id: string;
    complaint_number: string;
    complaint_type: string;
    title: string;
    status: string;
    severity: string;
    created_at: string;
  }>;
}

export function TicketDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session, authContext } = useAuth();

  const [ticket, setTicket] = useState<TicketDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Transition Modal State
  const [transitionTarget, setTransitionTarget] = useState<string | null>(null);
  const [transitionReason, setTransitionReason] = useState("");
  const [isTransitionSubmitting, setIsTransitionSubmitting] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  // Assignment Modal State
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");
  const [isAssignSubmitting, setIsAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // New Comment State
  const [commentBody, setCommentBody] = useState("");
  const [isInternalComment, setIsInternalComment] = useState(false);
  const [isCommentSubmitting, setIsCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  // Timeline Filter
  const [timelineTab, setTimelineTab] = useState<"all" | "public" | "internal">("all");

  const tenantId = authContext?.activeTenantId;
  const token = session?.access_token;

  const fetchTicket = () => {
    if (!token || !tenantId || !id) return;
    setIsLoading(true);
    setErrorMsg(null);

    fetch(`/api/v1/tickets/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Tenant-ID": tenantId,
      },
    })
      .then((res) => res.json())
      .then((payload) => {
        if (payload.error) {
          setErrorMsg(payload.error.message);
        } else if (payload.data) {
          setTicket(payload.data);
        }
      })
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchTicket();
  }, [token, tenantId, id]);

  const handleStatusTransition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !tenantId || !id || !transitionTarget) return;

    if (!transitionReason.trim()) {
      setTransitionError("A transition reason is mandatory");
      return;
    }

    setIsTransitionSubmitting(true);
    setTransitionError(null);

    try {
      const res = await fetch(`/api/v1/tickets/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Tenant-ID": tenantId,
        },
        body: JSON.stringify({
          toStatus: transitionTarget,
          reason: transitionReason.trim(),
        }),
      });

      const resData = await res.json();
      if (!res.ok || resData.error) {
        throw new Error(resData.error?.message || "Status transition failed");
      }

      setTransitionTarget(null);
      setTransitionReason("");
      fetchTicket();
    } catch (err: any) {
      setTransitionError(err.message || "Failed to update ticket status");
    } finally {
      setIsTransitionSubmitting(false);
    }
  };

  const handleAssignTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !tenantId || !id) return;

    setIsAssignSubmitting(true);
    setAssignError(null);

    try {
      const res = await fetch(`/api/v1/tickets/${id}/assign`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Tenant-ID": tenantId,
        },
        body: JSON.stringify({
          assignedTo: assignUserId ? assignUserId : null,
          reason: assignUserId ? "Assigned technician via Operations Desk" : "Unassigned ticket",
        }),
      });

      const resData = await res.json();
      if (!res.ok || resData.error) {
        throw new Error(resData.error?.message || "Assignment failed");
      }

      setIsAssignModalOpen(false);
      fetchTicket();
    } catch (err: any) {
      setAssignError(err.message || "Failed to assign ticket");
    } finally {
      setIsAssignSubmitting(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !tenantId || !id || !commentBody.trim()) return;

    setIsCommentSubmitting(true);
    setCommentError(null);

    try {
      const res = await fetch(`/api/v1/tickets/${id}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Tenant-ID": tenantId,
        },
        body: JSON.stringify({
          eventType: "comment",
          body: commentBody.trim(),
          isInternal: isInternalComment,
        }),
      });

      const resData = await res.json();
      if (!res.ok || resData.error) {
        throw new Error(resData.error?.message || "Failed to post comment");
      }

      setCommentBody("");
      fetchTicket();
    } catch (err: any) {
      setCommentError(err.message || "Failed to post comment");
    } finally {
      setIsCommentSubmitting(false);
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "critical":
        return <Badge variant="error" dot>Critical Priority</Badge>;
      case "high":
        return <Badge variant="warning" dot>High Priority</Badge>;
      case "medium":
        return <Badge variant="info">Medium Priority</Badge>;
      case "low":
        return <Badge variant="neutral">Low Priority</Badge>;
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

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
          <p className="text-sm font-medium text-neutral-500">Loading ticket details...</p>
        </div>
      </div>
    );
  }

  if (errorMsg || !ticket) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
        <h2 className="mt-3 text-lg font-bold text-neutral-900">Ticket Not Available</h2>
        <p className="mt-1 text-sm text-neutral-500">{errorMsg || "The requested ticket was not found."}</p>
        <Link
          to="/operations/tickets"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Tickets
        </Link>
      </div>
    );
  }

  // Determine allowed transitions for operations
  const transitionOptions: Array<{ target: string; label: string; variant: "primary" | "warning" | "error" | "neutral" | "success" }> = [];
  switch (ticket.status) {
    case "submitted":
      transitionOptions.push({ target: "under_review", label: "Start Review", variant: "primary" });
      transitionOptions.push({ target: "ready_for_assignment", label: "Skip to Ready for Assign", variant: "neutral" });
      transitionOptions.push({ target: "cancelled", label: "Cancel Ticket", variant: "error" });
      break;
    case "under_review":
      transitionOptions.push({ target: "ready_for_assignment", label: "Approve for Assignment", variant: "primary" });
      transitionOptions.push({ target: "awaiting_quotation", label: "Awaiting Quotation", variant: "warning" });
      transitionOptions.push({ target: "on_hold", label: "Place on Hold", variant: "neutral" });
      transitionOptions.push({ target: "cancelled", label: "Cancel Ticket", variant: "error" });
      break;
    case "ready_for_assignment":
      transitionOptions.push({ target: "assigned", label: "Mark Assigned", variant: "primary" });
      transitionOptions.push({ target: "under_review", label: "Return to Review", variant: "neutral" });
      transitionOptions.push({ target: "cancelled", label: "Cancel Ticket", variant: "error" });
      break;
    case "assigned":
    case "accepted":
      transitionOptions.push({ target: "in_progress", label: "Move to In Progress", variant: "primary" });
      transitionOptions.push({ target: "ready_for_assignment", label: "Reassign Ticket", variant: "warning" });
      transitionOptions.push({ target: "on_hold", label: "Place on Hold", variant: "neutral" });
      break;
    case "in_progress":
      transitionOptions.push({ target: "service_completed", label: "Complete Service", variant: "success" });
      transitionOptions.push({ target: "on_hold", label: "Place on Hold", variant: "warning" });
      break;
    case "on_hold":
      transitionOptions.push({ target: "in_progress", label: "Resume Service", variant: "primary" });
      transitionOptions.push({ target: "under_review", label: "Return to Review", variant: "neutral" });
      transitionOptions.push({ target: "cancelled", label: "Cancel Ticket", variant: "error" });
      break;
    case "service_completed":
      transitionOptions.push({ target: "resolved", label: "Resolve Ticket", variant: "success" });
      transitionOptions.push({ target: "in_progress", label: "Reopen for Work", variant: "warning" });
      break;
    case "resolved":
      transitionOptions.push({ target: "closed", label: "Close Ticket", variant: "neutral" });
      transitionOptions.push({ target: "under_review", label: "Reopen Ticket", variant: "warning" });
      break;
  }

  const filteredEvents = ticket.events.filter((ev) => {
    if (timelineTab === "public") return !ev.is_internal;
    if (timelineTab === "internal") return ev.is_internal;
    return true;
  });

  return (
    <div className="space-y-6 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Back Link and Header */}
      <div>
        <Link
          to="/operations/tickets"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-900 transition-colors mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Support Desk
        </Link>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="font-mono text-base font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                {ticket.ticket_number}
              </span>
              {getStatusBadge(ticket.status)}
              {getPriorityBadge(ticket.priority)}
              <span className="text-xs text-neutral-500">
                Category: <strong className="text-neutral-700">{ticket.ticket_categories?.name || "General"}</strong>
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">{ticket.title}</h1>

            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-neutral-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Created {new Date(ticket.created_at).toLocaleString()}
              </span>
              <span>•</span>
              <span>Reported via: <strong className="text-neutral-700 capitalize">{ticket.reported_via}</strong></span>
              <span>•</span>
              <span>Coverage: <strong className="text-neutral-700 capitalize">{ticket.coverage_type}</strong></span>
              {ticket.sla_due_at && (
                <>
                  <span>•</span>
                  <span className="text-amber-700 font-medium">
                    SLA Target: {new Date(ticket.sla_due_at).toLocaleString()}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Status Transitions Control Bar */}
          {transitionOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 bg-neutral-50 p-2.5 rounded-xl border border-neutral-200">
              <span className="text-xs font-semibold text-neutral-500 pl-1">Actions:</span>
              {transitionOptions.map((opt) => (
                <button
                  key={opt.target}
                  onClick={() => {
                    setTransitionTarget(opt.target);
                    setTransitionReason("");
                    setTransitionError(null);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors ${
                    opt.variant === "primary"
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : opt.variant === "success"
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : opt.variant === "warning"
                      ? "bg-amber-600 text-white hover:bg-amber-700"
                      : opt.variant === "error"
                      ? "bg-rose-600 text-white hover:bg-rose-700"
                      : "bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column (2 Cols): Details & Activity */}
        <div className="lg:col-span-2 space-y-6">
          {/* Ticket Description Card */}
          <Card className="p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              Problem Description & Diagnostics
            </h2>
            <div className="text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed bg-neutral-50 p-4 rounded-lg border border-neutral-100">
              {ticket.description}
            </div>

            {ticket.resolution_summary && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 text-emerald-800 font-semibold text-xs uppercase tracking-wide">
                  <CheckCircle2 className="h-4 w-4" /> Resolution Summary
                </div>
                <p className="mt-1 text-sm text-emerald-900">{ticket.resolution_summary}</p>
                {ticket.resolved_at && (
                  <p className="mt-1 text-[11px] text-emerald-700">
                    Resolved at {new Date(ticket.resolved_at).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {ticket.cancellation_reason && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4">
                <div className="flex items-center gap-2 text-rose-800 font-semibold text-xs uppercase tracking-wide">
                  <AlertTriangle className="h-4 w-4" /> Cancellation Reason
                </div>
                <p className="mt-1 text-sm text-rose-900">{ticket.cancellation_reason}</p>
              </div>
            )}
          </Card>

          {/* Activity Stream & Notes Card */}
          <Card className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-3 gap-2">
              <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-600" />
                Activity Timeline & Communications
              </h2>

              <div className="flex items-center gap-1 bg-neutral-100 p-0.5 rounded-lg text-xs font-medium">
                <button
                  onClick={() => setTimelineTab("all")}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    timelineTab === "all" ? "bg-white text-neutral-900 shadow-xs font-semibold" : "text-neutral-500 hover:text-neutral-900"
                  }`}
                >
                  All ({ticket.events.length})
                </button>
                <button
                  onClick={() => setTimelineTab("public")}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    timelineTab === "public" ? "bg-white text-neutral-900 shadow-xs font-semibold" : "text-neutral-500 hover:text-neutral-900"
                  }`}
                >
                  Public ({ticket.events.filter((e) => !e.is_internal).length})
                </button>
                <button
                  onClick={() => setTimelineTab("internal")}
                  className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                    timelineTab === "internal" ? "bg-white text-amber-900 shadow-xs font-semibold" : "text-neutral-500 hover:text-neutral-900"
                  }`}
                >
                  <Lock className="h-3 w-3" /> Internal ({ticket.events.filter((e) => e.is_internal).length})
                </button>
              </div>
            </div>

            {/* Events Timeline List */}
            <div className="mt-4 space-y-3 max-h-96 overflow-y-auto pr-1">
              {filteredEvents.length === 0 ? (
                <p className="text-xs text-neutral-400 italic py-6 text-center">No events in this view</p>
              ) : (
                filteredEvents.map((event) => (
                  <div
                    key={event.id}
                    className={`rounded-lg p-3 text-sm border ${
                      event.is_internal
                        ? "bg-amber-50/70 border-amber-200 text-amber-950"
                        : event.event_type === "status_change"
                        ? "bg-neutral-50 border-neutral-200 text-neutral-800"
                        : "bg-white border-neutral-200 text-neutral-900 shadow-xs"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-1.5 font-semibold">
                        {event.is_internal ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-bold text-[10px] uppercase bg-amber-100/80 px-1.5 py-0.5 rounded">
                            <Lock className="h-2.5 w-2.5" /> Staff Internal Note
                          </span>
                        ) : (
                          <span className="capitalize text-neutral-600 font-medium text-[11px]">
                            {event.actor_type}
                          </span>
                        )}
                        <span className="text-neutral-400">•</span>
                        <span className="text-neutral-500 text-[11px] font-normal">
                          {new Date(event.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap text-xs sm:text-sm">{event.body}</p>
                  </div>
                ))
              )}
            </div>

            {/* Add Comment / Note Form */}
            <form onSubmit={handlePostComment} className="mt-4 border-t border-neutral-200 pt-4 space-y-3">
              {commentError && (
                <div className="rounded bg-rose-50 p-2 text-xs text-rose-700 border border-rose-200">
                  {commentError}
                </div>
              )}

              <textarea
                required
                rows={3}
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Write an update, note, or customer communication..."
                className="w-full rounded-lg border border-neutral-300 p-2.5 text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-600 focus:outline-none"
              />

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-amber-800">
                  <input
                    type="checkbox"
                    checked={isInternalComment}
                    onChange={(e) => setIsInternalComment(e.target.checked)}
                    className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Internal staff note only (invisible to customer portal)
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={isCommentSubmitting || !commentBody.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {isCommentSubmitting ? "Posting..." : "Post Comment"}
                </button>
              </div>
            </form>
          </Card>
        </div>

        {/* Right Column: Context Information */}
        <div className="space-y-6">
          {/* Customer Account Info */}
          <Card className="p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-neutral-500" /> Customer Account
            </h3>

            {ticket.customer_accounts ? (
              <div className="space-y-2 text-sm">
                <div className="font-bold text-neutral-900">{ticket.customer_accounts.name}</div>
                <div className="text-xs font-mono text-neutral-500">
                  Account: {ticket.customer_accounts.account_number}
                </div>
                {ticket.customer_accounts.phone && (
                  <div className="text-xs text-neutral-600">Phone: {ticket.customer_accounts.phone}</div>
                )}
                {ticket.customer_accounts.email && (
                  <div className="text-xs text-neutral-600">Email: {ticket.customer_accounts.email}</div>
                )}
                <div className="pt-2">
                  <Link
                    to={`/operations/customers/${ticket.customer_accounts.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                  >
                    View Account Hierarchy <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-xs text-neutral-400 italic">No customer linked</p>
            )}
          </Card>

          {/* Service Location / Site Info */}
          <Card className="p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-neutral-500" /> Service Location
            </h3>

            {ticket.customer_sites ? (
              <div className="space-y-1.5 text-sm">
                <div className="font-semibold text-neutral-900">{ticket.customer_sites.name}</div>
                <div className="text-xs text-neutral-600">{ticket.customer_sites.address_line_1}</div>
                <div className="text-xs text-neutral-500">{ticket.customer_sites.city}</div>
                {ticket.customer_sites.latitude && ticket.customer_sites.longitude && (
                  <div className="text-[11px] font-mono text-neutral-400 pt-1">
                    GPS: {ticket.customer_sites.latitude.toFixed(5)}, {ticket.customer_sites.longitude.toFixed(5)}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-neutral-400 italic">No specific site assigned</p>
            )}
          </Card>

          {/* Fleet / Asset Info */}
          <Card className="p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3 flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-neutral-500" /> Serviced Asset
            </h3>

            {ticket.assets ? (
              <div className="space-y-2 text-sm">
                <div className="font-bold text-neutral-900">{ticket.assets.name}</div>
                <div className="text-xs text-neutral-600">
                  {ticket.assets.make} {ticket.assets.model}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs bg-neutral-50 p-2.5 rounded border border-neutral-100">
                  <div>
                    <span className="text-neutral-400 block text-[10px] uppercase">Asset Tag</span>
                    <span className="font-mono font-semibold text-neutral-800">{ticket.assets.asset_tag}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[10px] uppercase">Fleet #</span>
                    <span className="font-medium text-neutral-800">{ticket.assets.fleet_number || "—"}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-neutral-400 block text-[10px] uppercase">VIN</span>
                    <span className="font-mono text-neutral-700 truncate block">{ticket.assets.vin || "—"}</span>
                  </div>
                </div>
                <div className="pt-1">
                  <Link
                    to={`/operations/assets/${ticket.assets.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                  >
                    View Asset & History <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-xs text-neutral-400 italic">General Request (No specific asset)</p>
            )}
          </Card>

          {/* Assignment Placeholder Card */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5 text-neutral-500" /> Assigned Technician
              </h3>
              <button
                onClick={() => {
                  setAssignUserId(ticket.assigned_to || "");
                  setIsAssignModalOpen(true);
                }}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                {ticket.assigned_to ? "Reassign" : "Assign"}
              </button>
            </div>

            <div className="text-sm">
              {ticket.assigned_to ? (
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                    T
                  </div>
                  <div>
                    <span className="font-mono text-xs text-neutral-800">{ticket.assigned_to}</span>
                    <p className="text-[11px] text-neutral-400">Field Technician</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-amber-700 italic bg-amber-50 p-2 rounded border border-amber-100">
                  Unassigned • Ready for dispatch
                </p>
              )}
            </div>
          </Card>

          {/* Linked Complaints Card */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5 text-neutral-500" /> Linked Complaints
              </h3>
              <Link
                to={`/operations/complaints?ticketId=${ticket.id}`}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                Manage
              </Link>
            </div>

            {ticket.complaints && ticket.complaints.length > 0 ? (
              <div className="space-y-2">
                {ticket.complaints.map((c) => (
                  <div key={c.id} className="rounded-lg border border-neutral-200 p-2.5 text-xs bg-neutral-50">
                    <div className="flex items-center justify-between font-semibold">
                      <span className="font-mono text-blue-600">{c.complaint_number}</span>
                      <span className="capitalize text-neutral-500">{c.status}</span>
                    </div>
                    <div className="font-medium text-neutral-900 mt-1 line-clamp-1">{c.title}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-400 italic">No complaints logged for this ticket</p>
            )}
          </Card>
        </div>
      </div>

      {/* Mandatory Status Transition Reason Modal */}
      <Modal
        isOpen={Boolean(transitionTarget)}
        onClose={() => setTransitionTarget(null)}
        title={`Confirm Status Transition: ${transitionTarget?.replace(/_/g, " ").toUpperCase()}`}
        description="CareOS requires a mandatory transition reason for every status update to preserve an immutable audit trail."
        maxWidth="md"
      >
        <form onSubmit={handleStatusTransition} className="space-y-4">
          {transitionError && (
            <div className="rounded bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
              {transitionError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Transition Reason / Explanation <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={transitionReason}
              onChange={(e) => setTransitionReason(e.target.value)}
              placeholder="e.g. Parts verified in warehouse; ready for technician assignment and dispatch..."
              className="w-full rounded-lg border border-neutral-300 p-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => setTransitionTarget(null)}
              className="rounded-lg border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isTransitionSubmitting || !transitionReason.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {isTransitionSubmitting ? "Updating Status..." : "Confirm Transition"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Assignment Modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title="Assign Field Technician"
        description="Assign this ticket to an authorized technician or operations user."
        maxWidth="sm"
      >
        <form onSubmit={handleAssignTicket} className="space-y-4">
          {assignError && (
            <div className="rounded bg-rose-50 p-2 text-xs text-rose-700 border border-rose-200">
              {assignError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">Technician User ID (UUID)</label>
            <input
              type="text"
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value)}
              placeholder="Enter User UUID or leave blank to unassign"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs font-mono text-neutral-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => setIsAssignModalOpen(false)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAssignSubmitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {isAssignSubmitting ? "Saving..." : "Save Assignment"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
