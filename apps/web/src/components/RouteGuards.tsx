import React, { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { Portal } from "@careos/shared-types";
import { canAccessPortal } from "@careos/auth";
import { useAuth } from "../lib/auth-context.js";

interface GuardProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: GuardProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50">
        <div
          className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"
          role="status"
          aria-label="Checking authentication..."
        />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export function PortalGuard({
  portal,
  children,
}: {
  portal: Portal;
  children: ReactNode;
}) {
  const { authContext, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50">
        <div
          className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"
          role="status"
          aria-label="Verifying portal membership..."
        />
      </div>
    );
  }

  if (!authContext) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isAllowed = canAccessPortal(authContext, portal);

  if (!isAllowed) {
    return (
      <Navigate
        to={`/unauthorized?portal=${portal}`}
        state={{ attemptedPortal: portal }}
        replace
      />
    );
  }

  return <>{children}</>;
}

export function PlatformAdminGuard({ children }: GuardProps) {
  const { authContext, isPlatformAdmin, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50">
        <div
          className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"
          role="status"
          aria-label="Verifying platform administrator rights..."
        />
      </div>
    );
  }

  if (!authContext) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isPlatformAdmin) {
    return (
      <Navigate
        to="/unauthorized?portal=admin"
        state={{ attemptedPortal: "admin" }}
        replace
      />
    );
  }

  return <>{children}</>;
}
