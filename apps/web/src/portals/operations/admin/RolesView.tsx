import React, { useEffect, useState } from "react";
import { useAuth } from "../../../lib/auth-context.js";
import { Card, CardHeader } from "../../../components/ui/Card.js";
import { Badge } from "../../../components/ui/Badge.js";
import { Modal } from "../../../components/ui/Modal.js";
import { Shield, Key, Search, RefreshCw, Layers } from "lucide-react";

interface Permission {
  id: string;
  action: string;
  resource: string;
}

interface RolePermission {
  permissions: Permission;
}

interface Role {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  is_system_role: boolean;
  is_active: boolean;
  role_permissions: RolePermission[];
}

export function RolesView() {
  const { session, authContext } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [inspectRole, setInspectRole] = useState<Role | null>(null);

  const fetchRoles = () => {
    if (!session?.access_token) return;
    setIsLoading(true);
    setErrorMsg(null);

    fetch("/api/v1/organization/roles", {
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
          setRoles(payload.data);
        }
      })
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchRoles();
  }, [session?.access_token, authContext?.activeTenantId]);

  const filteredRoles = roles.filter(
    (r) =>
      r.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900">
            Roles & Permissions
          </h2>
          <p className="text-sm text-neutral-500">
            RBAC matrix and role definitions scoped to your organization
          </p>
        </div>
        <button
          onClick={fetchRoles}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Filter and stats */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search roles by name or key..."
            className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm placeholder-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span>Total roles: <strong className="text-neutral-900">{roles.length}</strong></span>
          <span>•</span>
          <span>System protected: <strong className="text-neutral-900">{roles.filter((r) => r.is_system_role).length}</strong></span>
        </div>
      </div>

      {/* Roles Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl border border-neutral-200 bg-white p-5" />
          ))}
        </div>
      ) : filteredRoles.length === 0 ? (
        <Card>
          <div className="py-12 text-center text-sm text-neutral-500">
            No roles matched your search criteria.
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredRoles.map((role) => {
            const permCount = role.role_permissions?.length || 0;
            return (
              <div
                key={role.id}
                className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-300 hover:shadow"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <Shield className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-neutral-900">{role.display_name}</h3>
                        <p className="font-mono text-xs text-neutral-400">{role.name}</p>
                      </div>
                    </div>
                    {role.is_system_role ? (
                      <Badge variant="primary">System</Badge>
                    ) : (
                      <Badge variant="neutral">Custom</Badge>
                    )}
                  </div>

                  <p className="mt-3 text-xs text-neutral-600 line-clamp-2">
                    {role.description || "Standard organization role definition."}
                  </p>
                </div>

                <div className="mt-4 border-t border-neutral-100 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                      <Key className="h-3.5 w-3.5 text-neutral-400" />
                      {permCount} {permCount === 1 ? "permission" : "permissions"}
                    </span>
                    <button
                      onClick={() => setInspectRole(role)}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-500"
                    >
                      View Permissions →
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Permissions Detail Modal */}
      {inspectRole && (
        <Modal
          isOpen={true}
          onClose={() => setInspectRole(null)}
          title={`Role Permissions: ${inspectRole.display_name}`}
        >
          <div className="space-y-4">
            <div className="rounded-lg bg-neutral-50 p-3 text-xs">
              <div className="grid grid-cols-2 gap-2 text-neutral-600">
                <div>
                  <span className="text-neutral-400">System Key:</span>{" "}
                  <code className="font-mono text-neutral-800">{inspectRole.name}</code>
                </div>
                <div>
                  <span className="text-neutral-400">Type:</span>{" "}
                  <span className="font-semibold text-neutral-800">
                    {inspectRole.is_system_role ? "System Role (Immutable)" : "Custom Role"}
                  </span>
                </div>
              </div>
              {inspectRole.description && (
                <p className="mt-2 text-neutral-700">{inspectRole.description}</p>
              )}
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Assigned Permissions ({inspectRole.role_permissions?.length || 0})
              </h4>
              {inspectRole.role_permissions?.length === 0 ? (
                <p className="text-xs text-neutral-500 italic">No explicit permissions assigned to this role.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto rounded-lg border border-neutral-200 divide-y divide-neutral-100">
                  {inspectRole.role_permissions.map((rp, idx) => {
                    const p = rp.permissions;
                    return (
                      <div key={p.id || idx} className="flex items-center justify-between p-2.5 text-xs">
                        <div className="flex items-center gap-2">
                          <Layers className="h-3.5 w-3.5 text-blue-500" />
                          <span className="font-medium text-neutral-900">{p.resource}</span>
                        </div>
                        <Badge variant="neutral">{p.action}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectRole(null)}
                className="rounded-lg bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-200"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
