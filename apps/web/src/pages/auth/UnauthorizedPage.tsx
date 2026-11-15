import React from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth-context.js";

export function UnauthorizedPage() {
  const [searchParams] = useSearchParams();
  const attemptedPortal = searchParams.get("portal") || "workspace";
  const { authContext, signOut } = useAuth();
  const navigate = useNavigate();

  const permittedPortals = Array.from(
    new Set((authContext?.memberships || []).filter((m) => m.isActive).map((m) => m.portal))
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-neutral-900">Access Restricted</h1>
        <p className="mt-2 text-sm text-neutral-500">
          You do not have active membership access to the <strong>{attemptedPortal}</strong> portal.
        </p>

        {permittedPortals.length > 0 ? (
          <div className="mt-6">
            <p className="text-xs font-medium text-neutral-400">Available portals for your account:</p>
            <div className="mt-3 flex flex-col gap-2">
              {permittedPortals.map((p) => (
                <button
                  key={p}
                  onClick={() => navigate(`/${p}`, { replace: true })}
                  className="w-full rounded-lg bg-blue-50 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                >
                  Enter {p.charAt(0).toUpperCase() + p.slice(1)} Portal
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-xs text-neutral-400">
            Your account does not currently hold any active tenant memberships.
          </p>
        )}

        <div className="mt-6 border-t border-neutral-100 pt-4 flex justify-between items-center text-xs">
          <button
            onClick={() => navigate(-1)}
            className="text-neutral-500 hover:text-neutral-700"
          >
            ← Go Back
          </button>
          <button
            onClick={() => void signOut()}
            className="text-red-600 hover:text-red-700 font-medium"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
