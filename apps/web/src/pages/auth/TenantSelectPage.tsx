import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth-context.js";

export function TenantSelectPage() {
  const { authContext, switchTenant, signOut } = useAuth();
  const navigate = useNavigate();

  const activeMemberships = (authContext?.memberships || []).filter((m) => m.isActive);

  const handleSelect = async (tenantId: string, portal: string) => {
    await switchTenant(tenantId);
    navigate(`/${portal}`, { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-4">
      <div className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Select Workspace</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Choose the organization and portal you want to work in
          </p>
        </div>

        <div className="space-y-3">
          {activeMemberships.map((mem) => {
            const isCurrent = mem.tenantId === authContext?.activeTenantId;
            return (
              <div
                key={mem.id}
                onClick={() => void handleSelect(mem.tenantId, mem.portal)}
                className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                  isCurrent
                    ? "border-blue-600 bg-blue-50/50"
                    : "border-neutral-200 hover:border-blue-300 hover:bg-neutral-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-neutral-900">{mem.tenantName}</h2>
                    <p className="text-xs text-neutral-500">
                      Portal: <span className="capitalize">{mem.portal}</span>
                    </p>
                  </div>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600 capitalize">
                    {mem.roles[0] || "member"}
                  </span>
                </div>
              </div>
            );
          })}

          {activeMemberships.length === 0 && (
            <p className="text-center text-sm text-neutral-500 py-4">
              No active workspaces available.
            </p>
          )}
        </div>

        <div className="mt-6 border-t border-neutral-100 pt-4 text-center">
          <button
            onClick={() => void signOut()}
            className="text-xs text-red-600 hover:text-red-700"
          >
            Sign out of CareOS
          </button>
        </div>
      </div>
    </div>
  );
}
