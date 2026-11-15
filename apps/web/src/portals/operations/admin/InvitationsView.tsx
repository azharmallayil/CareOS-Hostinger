import React, { useEffect, useState } from "react";
import { useAuth } from "../../../lib/auth-context.js";
import { Card } from "../../../components/ui/Card.js";
import { Badge } from "../../../components/ui/Badge.js";
import { Modal } from "../../../components/ui/Modal.js";
import { Input } from "../../../components/ui/Input.js";
import { Select } from "../../../components/ui/Select.js";
import { Mail, Plus, Copy, Check, Trash2, RefreshCw, Send, AlertCircle } from "lucide-react";

interface RoleOption {
  id: string;
  name: string;
  display_name: string;
}

interface DepartmentOption {
  id: string;
  name: string;
}

interface Invitation {
  id: string;
  email: string;
  portal: "operations" | "technician" | "customer";
  token: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  roles?: {
    id: string;
    name: string;
    display_name: string;
  } | null;
  departments?: {
    id: string;
    name: string;
  } | null;
}

export function InvitationsView() {
  const { session, authContext } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Invite modal state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [portal, setPortal] = useState<"operations" | "technician" | "customer">("operations");
  const [roleId, setRoleId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Copy token feedback
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const fetchInvitations = () => {
    if (!session?.access_token) return;
    setIsLoading(true);
    setErrorMsg(null);

    fetch("/api/v1/organization/invitations", {
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
          setInvitations(payload.data);
        }
      })
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setIsLoading(false));
  };

  const fetchDependencies = () => {
    if (!session?.access_token) return;

    // Fetch roles
    fetch("/api/v1/organization/roles", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "X-Tenant-ID": authContext?.activeTenantId || "",
      },
    })
      .then((res) => res.json())
      .then((payload) => {
        if (payload.data) setRoles(payload.data);
      })
      .catch(() => {});

    // Fetch departments
    fetch("/api/v1/organization/departments", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "X-Tenant-ID": authContext?.activeTenantId || "",
      },
    })
      .then((res) => res.json())
      .then((payload) => {
        if (payload.data) setDepartments(payload.data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchInvitations();
    fetchDependencies();
  }, [session?.access_token, authContext?.activeTenantId]);

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token || !email) return;

    setIsSubmitting(true);
    setModalError(null);

    try {
      const res = await fetch("/api/v1/organization/invitations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          "X-Tenant-ID": authContext?.activeTenantId || "",
        },
        body: JSON.stringify({
          email,
          portal,
          roleId: roleId || undefined,
          departmentId: departmentId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error?.message || "Failed to create invitation");
      }

      setIsInviteModalOpen(false);
      setEmail("");
      setRoleId("");
      setDepartmentId("");
      fetchInvitations();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!session?.access_token) return;
    if (!confirm("Are you sure you want to revoke this invitation? The recipient will not be able to join.")) return;

    try {
      const res = await fetch(`/api/v1/organization/invitations/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "X-Tenant-ID": authContext?.activeTenantId || "",
        },
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error?.message || "Failed to revoke invitation");
      }

      fetchInvitations();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const copyInviteLink = (token: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://app.careos.com";
    const inviteUrl = `${origin}/accept-invitation?token=${token}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const getStatusBadge = (inv: Invitation) => {
    if (inv.accepted_at) return <Badge variant="success">Accepted</Badge>;
    if (inv.revoked_at) return <Badge variant="error">Revoked</Badge>;
    if (new Date(inv.expires_at) < new Date()) return <Badge variant="warning">Expired</Badge>;
    return <Badge variant="info">Pending</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900">
            User Invitations
          </h2>
          <p className="text-sm text-neutral-500">
            Invite colleagues and manage access links for Operations, Technician, and Customer portals
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchInvitations}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setIsInviteModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            Invite User
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Invitations Table */}
      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-neutral-500">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-neutral-400" />
            <p className="mt-2">Loading invitations...</p>
          </div>
        ) : invitations.length === 0 ? (
          <div className="py-12 text-center">
            <Mail className="mx-auto h-8 w-8 text-neutral-300" />
            <h3 className="mt-2 text-sm font-semibold text-neutral-900">No invitations sent</h3>
            <p className="mt-1 text-xs text-neutral-500">Get started by sending an invitation to your team.</p>
            <button
              onClick={() => setIsInviteModalOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
            >
              <Plus className="h-3.5 w-3.5" />
              Invite User
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-200 bg-neutral-50/75 text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-semibold">Recipient</th>
                  <th className="px-4 py-3 font-semibold">Target Portal</th>
                  <th className="px-4 py-3 font-semibold">Assigned Role</th>
                  <th className="px-4 py-3 font-semibold">Department</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Expires</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {invitations.map((inv) => {
                  const isPending = !inv.accepted_at && !inv.revoked_at && new Date(inv.expires_at) >= new Date();
                  return (
                    <tr key={inv.id} className="hover:bg-neutral-50/50">
                      <td className="px-4 py-3.5 font-medium text-neutral-900">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-neutral-400" />
                          <span>{inv.email}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 capitalize">
                        <Badge variant="neutral">{inv.portal}</Badge>
                      </td>
                      <td className="px-4 py-3.5 text-neutral-600">
                        {inv.roles?.display_name || <span className="text-neutral-400">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-neutral-600">
                        {inv.departments?.name || <span className="text-neutral-400">—</span>}
                      </td>
                      <td className="px-4 py-3.5">{getStatusBadge(inv)}</td>
                      <td className="px-4 py-3.5 text-neutral-500">
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isPending && (
                            <>
                              <button
                                onClick={() => copyInviteLink(inv.token)}
                                title="Copy Invitation Link"
                                className="inline-flex items-center gap-1 rounded border border-neutral-200 bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50"
                              >
                                {copiedToken === inv.token ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-600" />
                                    <span className="text-emerald-600">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3 text-neutral-400" />
                                    <span>Copy Link</span>
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => handleRevoke(inv.id)}
                                title="Revoke invitation"
                                className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Invite Modal */}
      {isInviteModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsInviteModalOpen(false)}
          title="Invite User to Organization"
        >
          <form onSubmit={handleCreateInvite} className="space-y-4">
            {modalError && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                <span>{modalError}</span>
              </div>
            )}

            <Input
              label="Recipient Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
              hint="An invitation with secure one-time onboarding token will be created."
            />

            <Select
              label="Target Portal"
              value={portal}
              onChange={(e) => setPortal(e.target.value as any)}
              options={[
                { value: "operations", label: "Operations Portal (/operations)" },
                { value: "technician", label: "Technician Portal (/technician)" },
                { value: "customer", label: "Customer Portal (/customer)" },
              ]}
              hint="Controls which portal shell and authorization scope the member accesses."
            />

            <Select
              label="Role (Optional)"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              options={[
                { value: "", label: "Select a role..." },
                ...roles.map((r) => ({ value: r.id, label: `${r.display_name} (${r.name})` })),
              ]}
              hint="Privileges will be assigned automatically upon accepting."
            />

            <Select
              label="Department (Optional)"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              options={[
                { value: "", label: "No department / Central" },
                ...departments.map((d) => ({ value: d.id, label: d.name })),
              ]}
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(false)}
                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !email}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {isSubmitting ? "Generating..." : "Generate Invitation"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
