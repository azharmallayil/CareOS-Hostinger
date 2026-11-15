import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../lib/auth-context.js";
import { Card } from "../../../components/ui/Card.js";
import { Badge } from "../../../components/ui/Badge.js";
import { Modal } from "../../../components/ui/Modal.js";
import {
  CreditCard,
  Search,
  RefreshCw,
  Building2,
  LifeBuoy,
  ChevronRight,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  DollarSign,
  ShieldCheck,
} from "lucide-react";

export interface QuotationRecord {
  id: string;
  quotation_number: string;
  ticket_id: string;
  customer_account_id: string;
  status: "draft" | "sent" | "approved" | "rejected" | "expired" | "invoiced";
  current_version: number;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  valid_until: string;
  created_at: string;
  tickets?: {
    id: string;
    ticket_number: string;
    title: string;
  } | null;
  customer_accounts?: {
    id: string;
    name: string;
    account_number: string;
  } | null;
}

export function QuotationListView() {
  const { session, authContext } = useAuth();

  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const tenantId = authContext?.activeTenantId;
  const token = session?.access_token;

  const fetchData = async () => {
    if (!token || !tenantId) return;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const qParams = new URLSearchParams();
      if (statusFilter) qParams.set("status", statusFilter);

      const [quotesRes, invoicesRes] = await Promise.all([
        fetch(`/api/v1/quotations?${qParams.toString()}`, {
          headers: { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId },
        }),
        fetch("/api/v1/payments/invoices", {
          headers: { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId },
        }),
      ]);

      const quotesData = await quotesRes.json();
      const invoicesData = await invoicesRes.json();

      if (quotesData.data) setQuotations(quotesData.data);
      if (invoicesData.data) setInvoices(invoicesData.data);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load quotations");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, tenantId, statusFilter]);

  const filteredQuotes = quotations.filter((q) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      q.quotation_number.toLowerCase().includes(s) ||
      q.tickets?.title?.toLowerCase().includes(s) ||
      q.tickets?.ticket_number?.toLowerCase().includes(s) ||
      q.customer_accounts?.name?.toLowerCase().includes(s)
    );
  });

  const totalValue = quotations.reduce((acc, q) => acc + Number(q.total_amount || 0), 0);
  const totalInvoiced = invoices
    .filter((inv) => inv.status === "paid")
    .reduce((acc, inv) => acc + Number(inv.amount_paid || 0), 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="neutral">Draft (v1)</Badge>;
      case "sent":
        return <Badge variant="info">Sent to Client</Badge>;
      case "approved":
        return <Badge variant="success">Approved</Badge>;
      case "rejected":
        return <Badge variant="error">Rejected</Badge>;
      case "invoiced":
        return <Badge variant="primary">Invoiced</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Commercial & Quotations</h1>
            <Badge variant="primary">Step 10</Badge>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            Labour & parts estimates, 15% VAT calculation, customer sign-off, invoices, and server-side payment verification.
          </p>
        </div>

        <button
          onClick={fetchData}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-sm font-semibold text-neutral-700 shadow-xs hover:bg-neutral-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh Registry
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 border-l-4 border-l-blue-600">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-neutral-500">Total Quotations</p>
              <p className="mt-1 text-2xl font-bold text-neutral-900">{quotations.length}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FileText className="h-5 w-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-neutral-500">Awaiting Client Approval</p>
              <p className="mt-1 text-2xl font-bold text-neutral-900">
                {quotations.filter((q) => q.status === "sent").length}
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
              <p className="text-xs font-medium text-neutral-500">Total Quoted Value</p>
              <p className="mt-1 text-2xl font-bold text-neutral-900">
                SAR {totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CreditCard className="h-5 w-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-purple-600">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-neutral-500">Verified Paid Invoices</p>
              <p className="mt-1 text-2xl font-bold text-neutral-900">
                SAR {totalInvoiced.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search quotation #, ticket, or customer..."
              className="w-full rounded-lg border border-neutral-300 pl-9 pr-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:border-blue-600 focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent to Client</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="invoiced">Invoiced</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Quotations Table */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
              <p className="text-sm font-medium text-neutral-500">Loading commercial registry...</p>
            </div>
          </div>
        ) : filteredQuotes.length === 0 ? (
          <div className="p-12 text-center">
            <CreditCard className="mx-auto h-12 w-12 text-neutral-300" />
            <h3 className="mt-3 text-base font-semibold text-neutral-900">No quotations found</h3>
            <p className="mt-1 text-sm text-neutral-500 max-w-sm mx-auto">
              Quotations are generated directly from support tickets in the Support Desk.
            </p>
            <Link
              to="/operations/tickets"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700"
            >
              <LifeBuoy className="h-4 w-4" /> Go to Support Desk
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-neutral-600">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-4 py-3.5">Quotation #</th>
                  <th className="px-4 py-3.5">Service Ticket</th>
                  <th className="px-4 py-3.5">Customer Account</th>
                  <th className="px-4 py-3.5">Subtotal</th>
                  <th className="px-4 py-3.5">VAT (15%)</th>
                  <th className="px-4 py-3.5">Total Amount</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {filteredQuotes.map((q) => (
                  <tr key={q.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="font-mono font-bold text-blue-600">{q.quotation_number}</div>
                      <div className="text-[11px] text-neutral-400">Version {q.current_version}</div>
                    </td>

                    <td className="px-4 py-3.5">
                      {q.tickets ? (
                        <Link
                          to={`/operations/tickets/${q.tickets.id}`}
                          className="font-medium text-neutral-900 hover:text-blue-600"
                        >
                          <span className="font-mono text-xs font-semibold">{q.tickets.ticket_number}:</span>{" "}
                          <span className="line-clamp-1">{q.tickets.title}</span>
                        </Link>
                      ) : (
                        <span className="text-neutral-400 italic">None</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-medium text-neutral-900 flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                        <span>{q.customer_accounts?.name || "—"}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 font-mono text-xs">
                      SAR {Number(q.subtotal).toFixed(2)}
                    </td>

                    <td className="px-4 py-3.5 font-mono text-xs text-neutral-500">
                      SAR {Number(q.tax_amount).toFixed(2)}
                    </td>

                    <td className="px-4 py-3.5 font-mono font-semibold text-neutral-900">
                      SAR {Number(q.total_amount).toFixed(2)}
                    </td>

                    <td className="px-4 py-3.5">{getStatusBadge(q.status)}</td>

                    <td className="px-4 py-3.5 text-right">
                      {q.tickets ? (
                        <Link
                          to={`/operations/tickets/${q.tickets.id}`}
                          className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
                        >
                          Manage <ChevronRight className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-neutral-400 text-xs">—</span>
                      )}
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
