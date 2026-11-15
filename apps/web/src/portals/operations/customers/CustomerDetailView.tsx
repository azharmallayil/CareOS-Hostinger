import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../lib/auth-context.js";
import { Card, CardHeader } from "../../../components/ui/Card.js";
import { Badge } from "../../../components/ui/Badge.js";
import { Input } from "../../../components/ui/Input.js";
import { Select } from "../../../components/ui/Select.js";
import { Modal } from "../../../components/ui/Modal.js";
import {
  Building2,
  ArrowLeft,
  MapPin,
  Users,
  Key,
  Plus,
  Mail,
  Phone,
  Globe,
  FileText,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Trash2,
  RefreshCw,
  Compass,
  CreditCard,
  ShieldCheck,
} from "lucide-react";

interface CustomerSite {
  id: string;
  name: string;
  code: string | null;
  is_primary: boolean;
  status: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string | null;
  postal_code: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number;
  access_instructions: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
}

interface CustomerContact {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  job_title: string | null;
  department: string | null;
  site_id: string | null;
  is_primary: boolean;
  is_billing_contact: boolean;
  is_service_contact: boolean;
  notes: string | null;
}

interface CustomerUserLink {
  id: string;
  user_id: string;
  portal_role: "customer_admin" | "customer_user" | "customer_viewer";
  is_active: boolean;
  created_at: string;
  profiles?: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
  customer_contacts?: {
    id: string;
    full_name: string;
    job_title: string | null;
  } | null;
}

interface CustomerAccountDetail {
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
  notes: string | null;
  created_at: string;
  customer_sites: CustomerSite[];
  customer_contacts: CustomerContact[];
}

type CustomerTab = "overview" | "sites" | "contacts" | "portal_users";

export function CustomerDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session, authContext } = useAuth();

  const [customer, setCustomer] = useState<CustomerAccountDetail | null>(null);
  const [portalUsers, setPortalUsers] = useState<CustomerUserLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CustomerTab>("overview");

  // Add Site Modal
  const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);
  const [siteName, setSiteName] = useState("");
  const [siteCode, setSiteCode] = useState("");
  const [siteIsPrimary, setSiteIsPrimary] = useState(false);
  const [siteAddress1, setSiteAddress1] = useState("");
  const [siteCity, setSiteCity] = useState("Riyadh");
  const [siteLat, setSiteLat] = useState("");
  const [siteLng, setSiteLng] = useState("");
  const [siteContactName, setSiteContactName] = useState("");
  const [siteContactPhone, setSiteContactPhone] = useState("");
  const [siteInstructions, setSiteInstructions] = useState("");

  // Add Contact Modal
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactIsPrimary, setContactIsPrimary] = useState(false);
  const [contactIsBilling, setContactIsBilling] = useState(false);
  const [contactIsService, setContactIsService] = useState(true);

  // Link User Modal
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkUserId, setLinkUserId] = useState("");
  const [linkPortalRole, setLinkPortalRole] = useState<"customer_admin" | "customer_user" | "customer_viewer">("customer_user");
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchCustomer = () => {
    if (!session?.access_token || !id) return;
    setIsLoading(true);
    setErrorMsg(null);

    fetch(`/api/v1/customers/${id}`, {
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
          setCustomer(payload.data);
        }
      })
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setIsLoading(false));
  };

  const fetchPortalUsers = () => {
    if (!session?.access_token || !id) return;

    fetch(`/api/v1/customers/${id}/users`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "X-Tenant-ID": authContext?.activeTenantId || "",
      },
    })
      .then((res) => res.json())
      .then((payload) => {
        if (payload.data) setPortalUsers(payload.data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchCustomer();
    fetchPortalUsers();
  }, [session?.access_token, authContext?.activeTenantId, id]);

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token || !id || !siteName || !siteAddress1 || !siteCity) return;

    setModalSubmitting(true);
    setModalError(null);

    try {
      const res = await fetch(`/api/v1/customers/${id}/sites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          "X-Tenant-ID": authContext?.activeTenantId || "",
        },
        body: JSON.stringify({
          name: siteName,
          code: siteCode || undefined,
          isPrimary: siteIsPrimary,
          addressLine1: siteAddress1,
          city: siteCity,
          latitude: siteLat ? parseFloat(siteLat) : undefined,
          longitude: siteLng ? parseFloat(siteLng) : undefined,
          contactName: siteContactName || undefined,
          contactPhone: siteContactPhone || undefined,
          accessInstructions: siteInstructions || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error?.message || "Failed to create site");

      setIsSiteModalOpen(false);
      setSiteName("");
      setSiteCode("");
      setSiteAddress1("");
      setSiteLat("");
      setSiteLng("");
      setSiteContactName("");
      setSiteContactPhone("");
      setSiteInstructions("");
      fetchCustomer();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token || !id || !contactName) return;

    setModalSubmitting(true);
    setModalError(null);

    try {
      const res = await fetch(`/api/v1/customers/${id}/contacts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          "X-Tenant-ID": authContext?.activeTenantId || "",
        },
        body: JSON.stringify({
          fullName: contactName,
          jobTitle: contactTitle || undefined,
          email: contactEmail || undefined,
          phone: contactPhone || undefined,
          isPrimary: contactIsPrimary,
          isBillingContact: contactIsBilling,
          isServiceContact: contactIsService,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error?.message || "Failed to create contact");

      setIsContactModalOpen(false);
      setContactName("");
      setContactTitle("");
      setContactEmail("");
      setContactPhone("");
      fetchCustomer();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleLinkUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token || !id || !linkUserId) return;

    setModalSubmitting(true);
    setModalError(null);

    try {
      const res = await fetch(`/api/v1/customers/${id}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          "X-Tenant-ID": authContext?.activeTenantId || "",
        },
        body: JSON.stringify({
          userId: linkUserId,
          portalRole: linkPortalRole,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error?.message || "Failed to link user");

      setIsLinkModalOpen(false);
      setLinkUserId("");
      fetchPortalUsers();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleUnlinkUser = async (targetUserId: string) => {
    if (!session?.access_token || !id) return;
    if (!confirm("Revoke customer portal access for this user?")) return;

    try {
      const res = await fetch(`/api/v1/customers/${id}/users/${targetUserId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "X-Tenant-ID": authContext?.activeTenantId || "",
        },
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error?.message || "Failed to unlink user");

      fetchPortalUsers();
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

  if (errorMsg || !customer) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <Link
          to="/operations/customers"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-500"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Customer Accounts
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {errorMsg || "Customer account not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Back button */}
      <div>
        <Link
          to="/operations/customers"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-900 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Customers Directory
        </Link>
      </div>

      {/* Customer Header Card */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 font-bold text-white text-lg shadow-xs">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                  {customer.name}
                </h1>
                <Badge variant={customer.status === "active" ? "success" : "neutral"}>
                  {customer.status}
                </Badge>
                <Badge variant="primary">{customer.account_type}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                <span className="font-mono text-neutral-700 font-medium">
                  {customer.account_number}
                </span>
                {customer.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5 text-neutral-400" />
                    {customer.email}
                  </span>
                )}
                {customer.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5 text-neutral-400" />
                    {customer.phone}
                  </span>
                )}
                {customer.tax_id && (
                  <span>VAT: {customer.tax_id}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-neutral-400">
              Registered {new Date(customer.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-6 border-t border-neutral-100 pt-3">
          <nav className="flex space-x-6 text-xs font-semibold">
            {[
              { id: "overview", label: "Overview & Billing", icon: FileText },
              { id: "sites", label: `Branches & Sites (${customer.customer_sites?.length || 0})`, icon: MapPin },
              { id: "contacts", label: `Contacts (${customer.customer_contacts?.length || 0})`, icon: Users },
              { id: "portal_users", label: `Portal Access (${portalUsers.length})`, icon: ShieldCheck },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as CustomerTab)}
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

      {/* Tab 1: Overview & Billing */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader
              title="Billing & Organization Details"
              description="Official legal registration and invoice dispatch parameters"
            />
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-neutral-400">Street Address:</span>
                <p className="mt-0.5 font-medium text-neutral-900">
                  {customer.billing_address?.street || "Not specified"}
                </p>
              </div>
              <div>
                <span className="text-neutral-400">City & Country:</span>
                <p className="mt-0.5 font-medium text-neutral-900">
                  {customer.billing_address?.city || "Riyadh"},{" "}
                  {customer.billing_address?.country || "Saudi Arabia"}
                </p>
              </div>
              <div>
                <span className="text-neutral-400">VAT / Tax Identification:</span>
                <p className="mt-0.5 font-mono font-medium text-neutral-900">
                  {customer.tax_id || "None"}
                </p>
              </div>
              <div>
                <span className="text-neutral-400">Payment Terms:</span>
                <p className="mt-0.5 font-medium text-neutral-900">
                  Net {customer.payment_terms_days} Days ({customer.currency})
                </p>
              </div>
              {customer.website && (
                <div className="col-span-2">
                  <span className="text-neutral-400">Website:</span>
                  <p className="mt-0.5 font-medium text-blue-600">
                    <a href={customer.website} target="_blank" rel="noreferrer">
                      {customer.website}
                    </a>
                  </p>
                </div>
              )}
            </div>

            {customer.notes && (
              <div className="mt-4 border-t border-neutral-100 pt-3">
                <span className="text-neutral-400 text-xs">Account Notes:</span>
                <p className="mt-1 text-xs text-neutral-700 whitespace-pre-line">
                  {customer.notes}
                </p>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Account Summary" description="Operational metrics" />
            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-neutral-100">
                <span className="text-neutral-500">Service Locations:</span>
                <strong className="text-neutral-900">{customer.customer_sites?.length || 0}</strong>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-neutral-100">
                <span className="text-neutral-500">Key Contacts:</span>
                <strong className="text-neutral-900">{customer.customer_contacts?.length || 0}</strong>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-neutral-100">
                <span className="text-neutral-500">Client Portal Users:</span>
                <strong className="text-neutral-900">{portalUsers.length}</strong>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-neutral-500">Status:</span>
                <Badge variant={customer.status === "active" ? "success" : "neutral"}>
                  {customer.status}
                </Badge>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 2: Branches & Sites */}
      {activeTab === "sites" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">
                Service Facilities & Branches
              </h3>
              <p className="text-xs text-neutral-500">
                Specific service locations and physical dispatch addresses for this client
              </p>
            </div>
            <button
              onClick={() => setIsSiteModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Site
            </button>
          </div>

          {customer.customer_sites?.length === 0 ? (
            <Card>
              <div className="py-12 text-center">
                <MapPin className="mx-auto h-8 w-8 text-neutral-300" />
                <h4 className="mt-2 text-sm font-semibold text-neutral-900">No branches or sites added</h4>
                <p className="mt-1 text-xs text-neutral-500">
                  Register dispatch locations such as depots, warehouses, clinics, or office branches.
                </p>
                <button
                  onClick={() => setIsSiteModalOpen(true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Site
                </button>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {customer.customer_sites.map((s) => (
                <Card key={s.id} className="relative">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-sm text-neutral-900">{s.name}</h4>
                        {s.is_primary && <Badge variant="primary">Primary Facility</Badge>}
                        {s.code && (
                          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-mono text-neutral-600">
                            {s.code}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-neutral-600">
                        {s.address_line1}, {s.city}
                      </p>
                    </div>
                    <Badge variant={s.status === "active" ? "success" : "neutral"}>
                      {s.status}
                    </Badge>
                  </div>

                  <div className="mt-3 border-t border-neutral-100 pt-3 grid grid-cols-2 gap-2 text-xs text-neutral-500">
                    {s.latitude && s.longitude && (
                      <div className="flex items-center gap-1 text-[11px] font-mono">
                        <Compass className="h-3 w-3 text-blue-500" />
                        <span>{s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}</span>
                      </div>
                    )}
                    {s.contact_name && (
                      <div className="flex items-center gap-1 text-[11px]">
                        <Users className="h-3 w-3 text-neutral-400" />
                        <span className="truncate">{s.contact_name}</span>
                      </div>
                    )}
                    {s.contact_phone && (
                      <div className="flex items-center gap-1 text-[11px]">
                        <Phone className="h-3 w-3 text-neutral-400" />
                        <span>{s.contact_phone}</span>
                      </div>
                    )}
                  </div>

                  {s.access_instructions && (
                    <div className="mt-2 rounded bg-neutral-50 p-2 text-[11px] text-neutral-600">
                      <span className="font-semibold text-neutral-700">Access: </span>
                      {s.access_instructions}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Contacts */}
      {activeTab === "contacts" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">
                Customer Contacts Directory
              </h3>
              <p className="text-xs text-neutral-500">
                Facility directors, operations managers, and billing liaisons
              </p>
            </div>
            <button
              onClick={() => setIsContactModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Contact
            </button>
          </div>

          {customer.customer_contacts?.length === 0 ? (
            <Card>
              <div className="py-12 text-center">
                <Users className="mx-auto h-8 w-8 text-neutral-300" />
                <h4 className="mt-2 text-sm font-semibold text-neutral-900">No contacts recorded</h4>
                <p className="mt-1 text-xs text-neutral-500">
                  Add key stakeholders and emergency service contacts for this account.
                </p>
                <button
                  onClick={() => setIsContactModalOpen(true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Contact
                </button>
              </div>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-neutral-200 bg-neutral-50/75 text-neutral-500 uppercase font-semibold">
                    <tr>
                      <th className="px-4 py-3">Full Name</th>
                      <th className="px-4 py-3">Job Title & Dept</th>
                      <th className="px-4 py-3">Contact Details</th>
                      <th className="px-4 py-3">Roles / Flags</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {customer.customer_contacts.map((ct) => (
                      <tr key={ct.id} className="hover:bg-neutral-50/50">
                        <td className="px-4 py-3 font-semibold text-neutral-900">
                          {ct.full_name}
                        </td>
                        <td className="px-4 py-3 text-neutral-600">
                          <div>{ct.job_title || "—"}</div>
                          {ct.department && (
                            <div className="text-[10px] text-neutral-400">{ct.department}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-neutral-600">
                          {ct.email && <div>{ct.email}</div>}
                          {ct.phone && <div className="text-neutral-500">{ct.phone}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {ct.is_primary && <Badge variant="primary">Primary</Badge>}
                            {ct.is_service_contact && <Badge variant="success">Service Contact</Badge>}
                            {ct.is_billing_contact && <Badge variant="warning">Billing</Badge>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Tab 4: Customer Portal Users */}
      {activeTab === "portal_users" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">
                Customer Portal Access Links
              </h3>
              <p className="text-xs text-neutral-500">
                Users with authorized login access to this customer's portal workspace
              </p>
            </div>
            <button
              onClick={() => setIsLinkModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              Link Portal User
            </button>
          </div>

          {portalUsers.length === 0 ? (
            <Card>
              <div className="py-12 text-center">
                <ShieldCheck className="mx-auto h-8 w-8 text-neutral-300" />
                <h4 className="mt-2 text-sm font-semibold text-neutral-900">No portal users linked</h4>
                <p className="mt-1 text-xs text-neutral-500 max-w-sm mx-auto">
                  Customer users must be explicitly linked to this account to view tickets and assets in the Customer Portal.
                </p>
                <button
                  onClick={() => setIsLinkModalOpen(true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Link User
                </button>
              </div>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-neutral-200 bg-neutral-50/75 text-neutral-500 uppercase font-semibold">
                    <tr>
                      <th className="px-4 py-3">User Profile</th>
                      <th className="px-4 py-3">Portal Scope</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Linked Date</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {portalUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-neutral-50/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-700 font-bold text-xs">
                              {u.profiles?.full_name?.charAt(0) || u.profiles?.email?.charAt(0) || "U"}
                            </div>
                            <div>
                              <div className="font-semibold text-neutral-900">
                                {u.profiles?.full_name || "User"}
                              </div>
                              <div className="text-[10px] text-neutral-400">{u.profiles?.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="primary">{u.portal_role}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={u.is_active ? "success" : "neutral"}>
                            {u.is_active ? "Active" : "Disabled"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-neutral-500">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleUnlinkUser(u.user_id)}
                            className="rounded p-1 text-neutral-400 hover:text-red-600 hover:bg-red-50"
                            title="Revoke access"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Add Site Modal */}
      {isSiteModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsSiteModalOpen(false)}
          title="Add Customer Facility / Branch"
        >
          <form onSubmit={handleCreateSite} className="space-y-3 text-xs">
            {modalError && (
              <div className="rounded-lg bg-red-50 p-2 text-red-700">{modalError}</div>
            )}
            <Input
              label="Site / Branch Name"
              required
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="e.g. Central Warehouse Riyadh, King Fahad Depot"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Site Code (Optional)"
                value={siteCode}
                onChange={(e) => setSiteCode(e.target.value)}
                placeholder="RUH-01"
              />
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="primarySite"
                  checked={siteIsPrimary}
                  onChange={(e) => setSiteIsPrimary(e.target.checked)}
                  className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="primarySite" className="text-xs font-medium text-neutral-700">
                  Primary Facility
                </label>
              </div>
            </div>

            <Input
              label="Street Address"
              required
              value={siteAddress1}
              onChange={(e) => setSiteAddress1(e.target.value)}
              placeholder="P.O. Box 1234, Al-Malaz"
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="City"
                required
                value={siteCity}
                onChange={(e) => setSiteCity(e.target.value)}
              />
              <Input
                label="Latitude / Longitude (e.g. 24.7136, 46.6753)"
                value={siteLat && siteLng ? `${siteLat}, ${siteLng}` : ""}
                onChange={(e) => {
                  const parts = e.target.value.split(",");
                  if (parts[0]) setSiteLat(parts[0].trim());
                  if (parts[1]) setSiteLng(parts[1].trim());
                }}
                placeholder="24.7136, 46.6753"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Site Contact Name"
                value={siteContactName}
                onChange={(e) => setSiteContactName(e.target.value)}
                placeholder="Manager on duty"
              />
              <Input
                label="Site Phone"
                value={siteContactPhone}
                onChange={(e) => setSiteContactPhone(e.target.value)}
                placeholder="+966 50 123 4567"
              />
            </div>

            <Input
              label="Access Instructions & Security Protocols"
              value={siteInstructions}
              onChange={(e) => setSiteInstructions(e.target.value)}
              placeholder="Gate 3 entry, security badge inspection required"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsSiteModalOpen(false)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={modalSubmitting || !siteName || !siteAddress1}
                className="rounded-lg bg-blue-600 px-3.5 py-1.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {modalSubmitting ? "Saving..." : "Add Site"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Contact Modal */}
      {isContactModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsContactModalOpen(false)}
          title="Add Customer Contact"
        >
          <form onSubmit={handleCreateContact} className="space-y-3 text-xs">
            {modalError && (
              <div className="rounded-lg bg-red-50 p-2 text-red-700">{modalError}</div>
            )}
            <Input
              label="Full Name"
              required
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Fahad Al-Otaibi"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Job Title"
                value={contactTitle}
                onChange={(e) => setContactTitle(e.target.value)}
                placeholder="Operations Director"
              />
              <Input
                label="Email Address"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="fahad@client.com"
              />
            </div>
            <Input
              label="Phone / Mobile"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+966 50 111 2222"
            />

            <div className="flex flex-wrap gap-4 pt-2">
              <label className="flex items-center gap-1.5 text-xs text-neutral-700">
                <input
                  type="checkbox"
                  checked={contactIsService}
                  onChange={(e) => setContactIsService(e.target.checked)}
                  className="rounded border-neutral-300 text-blue-600"
                />
                Service Contact
              </label>
              <label className="flex items-center gap-1.5 text-xs text-neutral-700">
                <input
                  type="checkbox"
                  checked={contactIsBilling}
                  onChange={(e) => setContactIsBilling(e.target.checked)}
                  className="rounded border-neutral-300 text-blue-600"
                />
                Billing Contact
              </label>
              <label className="flex items-center gap-1.5 text-xs text-neutral-700">
                <input
                  type="checkbox"
                  checked={contactIsPrimary}
                  onChange={(e) => setContactIsPrimary(e.target.checked)}
                  className="rounded border-neutral-300 text-blue-600"
                />
                Primary Contact
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsContactModalOpen(false)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={modalSubmitting || !contactName}
                className="rounded-lg bg-blue-600 px-3.5 py-1.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {modalSubmitting ? "Saving..." : "Add Contact"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Link User Modal */}
      {isLinkModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsLinkModalOpen(false)}
          title="Grant Customer Portal Access"
        >
          <form onSubmit={handleLinkUser} className="space-y-3 text-xs">
            {modalError && (
              <div className="rounded-lg bg-red-50 p-2 text-red-700">{modalError}</div>
            )}
            <Input
              label="User ID / UUID"
              required
              value={linkUserId}
              onChange={(e) => setLinkUserId(e.target.value)}
              placeholder="User UUID from tenant members"
              hint="User must have a customer portal membership in this organization."
            />

            <Select
              label="Portal Role"
              value={linkPortalRole}
              onChange={(e) => setLinkPortalRole(e.target.value as any)}
              options={[
                { value: "customer_admin", label: "Customer Admin (Full Client Access)" },
                { value: "customer_user", label: "Customer User (Standard Requests & Assets)" },
                { value: "customer_viewer", label: "Customer Viewer (Read Only)" },
              ]}
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsLinkModalOpen(false)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={modalSubmitting || !linkUserId}
                className="rounded-lg bg-blue-600 px-3.5 py-1.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {modalSubmitting ? "Linking..." : "Grant Access"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default CustomerDetailView;
