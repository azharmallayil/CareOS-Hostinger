import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../lib/auth-context.js";
import { Card } from "../../../components/ui/Card.js";
import { Badge } from "../../../components/ui/Badge.js";
import { Input } from "../../../components/ui/Input.js";
import { Select } from "../../../components/ui/Select.js";
import { Modal } from "../../../components/ui/Modal.js";
import {
  Users,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Building2,
  MapPin,
  ChevronRight,
  ChevronLeft,
  Mail,
  Phone,
  ArrowUpDown,
} from "lucide-react";

export interface CustomerAccount {
  id: string;
  account_number: string;
  name: string;
  account_type: "commercial" | "residential" | "enterprise" | "government";
  status: "active" | "suspended" | "archived" | "lead";
  email: string | null;
  phone: string | null;
  tax_id: string | null;
  website: string | null;
  currency: string;
  payment_terms_days: number;
  billing_address: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  created_at: string;
  customer_sites?: [{ count: number }];
  customer_contacts?: [{ count: number }];
}

export function CustomerListView() {
  const { session, authContext } = useAuth();
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<CustomerAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<"commercial" | "residential" | "enterprise" | "government">("commercial");
  const [status, setStatus] = useState<"active" | "lead">("active");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [taxId, setTaxId] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("Riyadh");
  const [country, setCountry] = useState("Saudi Arabia");
  const [paymentTerms, setPaymentTerms] = useState("30");
  const [notes, setNotes] = useState("");

  const fetchCustomers = () => {
    if (!session?.access_token) return;
    setIsLoading(true);
    setErrorMsg(null);

    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter) params.set("type", typeFilter);
    params.set("page", page.toString());
    params.set("limit", "15");

    fetch(`/api/v1/customers?${params.toString()}`, {
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
          setCustomers(payload.data);
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
    fetchCustomers();
  }, [session?.access_token, authContext?.activeTenantId, page, statusFilter, typeFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchCustomers();
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token || !name) return;

    setIsSubmitting(true);
    setModalError(null);

    try {
      const res = await fetch("/api/v1/customers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          "X-Tenant-ID": authContext?.activeTenantId || "",
        },
        body: JSON.stringify({
          name,
          accountType,
          status,
          email: email || undefined,
          phone: phone || undefined,
          taxId: taxId || undefined,
          currency: "SAR",
          paymentTermsDays: parseInt(paymentTerms, 10) || 30,
          billingAddress: {
            street: street || undefined,
            city,
            country,
          },
          notes: notes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error?.message || "Failed to create customer account");
      }

      setIsCreateOpen(false);
      setName("");
      setEmail("");
      setPhone("");
      setTaxId("");
      setStreet("");
      setNotes("");
      fetchCustomers();
      navigate(`/operations/customers/${data.data.id}`);
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
      case "suspended":
        return <Badge variant="error">Suspended</Badge>;
      case "archived":
        return <Badge variant="neutral">Archived</Badge>;
      case "lead":
        return <Badge variant="warning">Lead</Badge>;
      default:
        return <Badge variant="neutral">{st}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "enterprise":
        return <Badge variant="primary">Enterprise</Badge>;
      case "commercial":
        return <Badge variant="info">Commercial</Badge>;
      case "government":
        return <Badge variant="warning">Government</Badge>;
      default:
        return <Badge variant="neutral">Residential</Badge>;
    }
  };

  return (
    <div className="space-y-6 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
              Customer Accounts
            </h1>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
              {totalCount} Total
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Manage commercial and residential client accounts, service branches, facility contacts, and portal access
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchCustomers}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            New Customer
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
              placeholder="Search by account name, number, or email..."
              className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-xs placeholder-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </form>

          <div className="flex items-center gap-2">
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
              <option value="lead">Lead</option>
              <option value="suspended">Suspended</option>
              <option value="archived">Archived</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="">All Types</option>
              <option value="commercial">Commercial</option>
              <option value="enterprise">Enterprise</option>
              <option value="government">Government</option>
              <option value="residential">Residential</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Customer Accounts Data Table */}
      <Card>
        {isLoading ? (
          <div className="p-12 text-center text-sm text-neutral-500">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-neutral-400" />
            <p className="mt-2 text-xs">Loading customer directory...</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="py-16 text-center">
            <Building2 className="mx-auto h-10 w-10 text-neutral-300" />
            <h3 className="mt-3 text-sm font-semibold text-neutral-900">No customer accounts found</h3>
            <p className="mt-1 text-xs text-neutral-500 max-w-sm mx-auto">
              Get started by registering commercial clients, branches, and authorized contact persons.
            </p>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
            >
              <Plus className="h-3.5 w-3.5" />
              New Customer Account
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-200 bg-neutral-50/75 text-neutral-500 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Contact Details</th>
                  <th className="px-4 py-3">Sites / Branches</th>
                  <th className="px-4 py-3">Billing City</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {customers.map((c) => {
                  const sitesCount = c.customer_sites?.[0]?.count || 0;
                  const contactsCount = c.customer_contacts?.[0]?.count || 0;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => navigate(`/operations/customers/${c.id}`)}
                      className="cursor-pointer hover:bg-neutral-50/60 transition"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 font-bold text-blue-600">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-neutral-900 hover:text-blue-600 transition">
                              {c.name}
                            </div>
                            <div className="font-mono text-[10px] text-neutral-400">
                              {c.account_number}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">{getTypeBadge(c.account_type)}</td>
                      <td className="px-4 py-3.5">{getStatusBadge(c.status)}</td>
                      <td className="px-4 py-3.5 text-neutral-600">
                        {c.email ? (
                          <div className="flex items-center gap-1.5">
                            <Mail className="h-3 w-3 text-neutral-400" />
                            <span>{c.email}</span>
                          </div>
                        ) : c.phone ? (
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3 w-3 text-neutral-400" />
                            <span>{c.phone}</span>
                          </div>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1 text-neutral-700">
                          <MapPin className="h-3.5 w-3.5 text-neutral-400" />
                          <strong>{sitesCount}</strong> {sitesCount === 1 ? "site" : "sites"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-neutral-600">
                        {c.billing_address?.city || "—"}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <ChevronRight className="h-4 w-4 text-neutral-400 ml-auto" />
                      </td>
                    </tr>
                  );
                })}
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

      {/* Create Customer Modal */}
      {isCreateOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsCreateOpen(false)}
          title="Create Customer Account"
        >
          <form onSubmit={handleCreateCustomer} className="space-y-4">
            {modalError && (
              <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">
                {modalError}
              </div>
            )}

            <Input
              label="Customer Account / Client Name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Al-Futtaim Logistics, Riyadh Metro Depot"
            />

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Account Type"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as any)}
                options={[
                  { value: "commercial", label: "Commercial" },
                  { value: "enterprise", label: "Enterprise" },
                  { value: "government", label: "Government" },
                  { value: "residential", label: "Residential" },
                ]}
              />

              <Select
                label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                options={[
                  { value: "active", label: "Active" },
                  { value: "lead", label: "Lead / Prospect" },
                ]}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Primary Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="billing@client.com"
              />

              <Input
                label="Phone Number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+966 50 000 0000"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="VAT / Tax ID"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="300000000000003"
              />

              <Input
                label="Payment Terms (Days)"
                type="number"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
              />
            </div>

            <div className="border-t border-neutral-100 pt-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Billing Address
              </h4>
              <div className="space-y-2">
                <Input
                  label="Street Address"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="King Fahd Road, Olaya District"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="City"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                  <Input
                    label="Country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !name}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                {isSubmitting ? "Creating..." : "Create Account"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default CustomerListView;
