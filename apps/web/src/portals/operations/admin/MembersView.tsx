import React, { useEffect, useState } from "react";
import { useAuth } from "../../../lib/auth-context.js";
import { DataTable, type Column } from "../../../components/ui/DataTable.js";
import { Modal } from "../../../components/ui/Modal.js";
import { Select } from "../../../components/ui/Select.js";
import { Badge } from "../../../components/ui/Badge.js";
import { UserCheck, Shield, UserX, Plus, Trash2 } from "lucide-react";

interface Member {
  id: string;
  user_id: string;
  portal: string;
  department_id?: string | null;
  is_active: boolean;
  joined_at?: string | null;
  departments?: { id: string; name: string } | null;
  profiles?: {
    id: string;
    full_name: string;
    email: string;
    phone?: string | null;
  } | null;
  membership_roles?: Array<{
    roles: {
      id: string;
      name: string;
      display_name: string;
      is_system_role: boolean;
    };
  }>;
}

interface Role {
  id: string;
  name: string;
  display_name: string;
  is_system_role: boolean;
}

export function MembersView() {
  const { session, authContext } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Role Assignment Modal State
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [roleToAssign, setRoleToAssign] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchMembers = () => {
    if (!session?.access_token) return;
    setIsLoading(true);
    setErrorMsg(null);

    Promise.all([
      fetch("/api/v1/organization/members", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "X-Tenant-ID": authContext?.activeTenantId || "",
        },
      }).then((r) => r.json()),
      fetch("/api/v1/organization/roles", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "X-Tenant-ID": authContext?.activeTenantId || "",
        },
      }).then((r) => r.json()),
    ])
      .then(([membersRes, rolesRes]) => {
        if (membersRes.error) setErrorMsg(membersRes.error.message);
        else setMembers(membersRes.data || []);

        if (rolesRes.data) setAvailableRoles(rolesRes.data);
      })
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchMembers();
  }, [session, authContext?.activeTenantId]);

  const handleToggleActive = async (member: Member) => {
    if (!session?.access_token) return;
    try {
      await fetch(`/api/v1/organization/members/${member.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          "X-Tenant-ID": authContext?.activeTenantId || "",
        },
        body: JSON.stringify({ isActive: !member.is_active }),
      });
      fetchMembers();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleOpenRoleModal = (member: Member) => {
    setSelectedMember(member);
    setRoleToAssign("");
    setIsRoleModalOpen(true);
  };

  const handleAssignRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token || !selectedMember || !roleToAssign) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/v1/organization/members/${selectedMember.id}/roles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          "X-Tenant-ID": authContext?.activeTenantId || "",
        },
        body: JSON.stringify({ roleId: roleToAssign }),
      });

      const payload = await res.json();
      if (!res.ok || payload.error) {
        throw new Error(payload.error?.message || "Failed to assign role");
      }

      setIsRoleModalOpen(false);
      fetchMembers();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeRole = async (memberId: string, roleId: string) => {
    if (!session?.access_token) return;

    try {
      await fetch(`/api/v1/organization/members/${memberId}/roles/${roleId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "X-Tenant-ID": authContext?.activeTenantId || "",
        },
      });
      fetchMembers();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const columns: Column<Member>[] = [
    {
      key: "user",
      header: "Member Profile",
      render: (m) => (
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-semibold text-xs shrink-0">
            {m.profiles?.full_name ? m.profiles.full_name.charAt(0).toUpperCase() : "U"}
          </div>
          <div>
            <span className="font-semibold text-neutral-900 block text-xs">
              {m.profiles?.full_name || "CareOS User"}
            </span>
            <span className="text-neutral-500 text-[11px] block">
              {m.profiles?.email || "No email"}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "portal",
      header: "Portal Access",
      render: (m) => (
        <Badge variant="neutral" size="sm" className="capitalize">
          {m.portal}
        </Badge>
      ),
    },
    {
      key: "departments",
      header: "Department",
      render: (m) => <span>{m.departments?.name || "General"}</span>,
    },
    {
      key: "roles",
      header: "Assigned Roles",
      render: (m) => {
        const assigned = m.membership_roles?.map((mr) => mr.roles) || [];
        if (assigned.length === 0) {
          return <span className="text-neutral-400 text-xs italic">No roles</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {assigned.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-700"
              >
                {r.display_name}
                <button
                  onClick={() => void handleRevokeRole(m.id, r.id)}
                  className="text-neutral-400 hover:text-red-600 ml-0.5"
                  title="Remove Role"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: "is_active",
      header: "Status",
      render: (m) => (
        <Badge variant={m.is_active ? "success" : "error"} dot>
          {m.is_active ? "Active" : "Deactivated"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (m) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => handleOpenRoleModal(m)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 p-1 font-medium"
          >
            <Shield className="w-3.5 h-3.5" />
            Roles
          </button>
          <button
            onClick={() => void handleToggleActive(m)}
            className={`text-xs px-2 py-0.5 rounded border ${
              m.is_active
                ? "border-neutral-200 text-neutral-600 hover:bg-neutral-100"
                : "border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
            }`}
          >
            {m.is_active ? "Deactivate" : "Activate"}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Members & Role Assignments</h2>
        <p className="text-xs text-neutral-500">
          Manage workspace members, grant role permissions, and control active portal access
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
          {errorMsg}
        </div>
      )}

      <DataTable
        columns={columns}
        data={members}
        keyExtractor={(m) => m.id}
        isLoading={isLoading}
        emptyTitle="No members found"
        emptyDescription="Invite users to this organization from the Invitations tab."
      />

      {/* Role Assignment Modal */}
      <Modal
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        title="Assign Role to Member"
        description={`Grant a functional role to ${selectedMember?.profiles?.full_name || "member"}`}
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsRoleModalOpen(false)}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-neutral-600 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              onClick={handleAssignRole}
              disabled={isSubmitting || !roleToAssign}
              className="px-4 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? "Assigning..." : "Assign Role"}
            </button>
          </>
        }
      >
        <form onSubmit={handleAssignRole} className="space-y-4">
          <Select
            label="Select Role to Grant"
            value={roleToAssign}
            onChange={(e) => setRoleToAssign(e.target.value)}
            required
          >
            <option value="">Choose a role...</option>
            {availableRoles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.display_name} {r.is_system_role ? "(System)" : "(Custom)"}
              </option>
            ))}
          </Select>
          <p className="text-xs text-neutral-400">
            Roles dictate permitted actions across support desks, dispatch, quotations, and equipment.
          </p>
        </form>
      </Modal>
    </div>
  );
}
