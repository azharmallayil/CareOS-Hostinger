import React, { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { AuthProvider, useAuth } from "./lib/auth-context.js";
import { ProtectedRoute, PortalGuard, PlatformAdminGuard } from "./components/RouteGuards.js";
import { LoginPage } from "./pages/auth/LoginPage.js";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage.js";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage.js";
import { AcceptInvitationPage } from "./pages/auth/AcceptInvitationPage.js";
import { UnauthorizedPage } from "./pages/auth/UnauthorizedPage.js";
import { TenantSelectPage } from "./pages/auth/TenantSelectPage.js";

// ── Portal lazy imports — each portal is a separate chunk ─────────────────────
const CustomerPortal = lazy(() => import("./portals/customer/index.js"));
const OperationsPortal = lazy(() => import("./portals/operations/index.js"));
const TechnicianPortal = lazy(() => import("./portals/technician/index.js"));
const AdminPortal = lazy(() => import("./portals/admin/index.js"));

// ── Router ────────────────────────────────────────────────────────────────────
const router = createBrowserRouter([
  // Public Auth Routes
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/forgot-password",
    element: <ForgotPasswordPage />,
  },
  {
    path: "/reset-password",
    element: <ResetPasswordPage />,
  },
  {
    path: "/accept-invitation",
    element: <AcceptInvitationPage />,
  },
  {
    path: "/unauthorized",
    element: <UnauthorizedPage />,
  },

  // Protected Tenant & Portal Selection
  {
    path: "/select-tenant",
    element: (
      <ProtectedRoute>
        <TenantSelectPage />
      </ProtectedRoute>
    ),
  },

  // Protected Portals with Strict Membership Guards
  {
    path: "/customer/*",
    element: (
      <ProtectedRoute>
        <PortalGuard portal="customer">
          <Suspense fallback={<PortalLoader title="Loading Customer Portal..." />}>
            <CustomerPortal />
          </Suspense>
        </PortalGuard>
      </ProtectedRoute>
    ),
  },
  {
    path: "/operations/*",
    element: (
      <ProtectedRoute>
        <PortalGuard portal="operations">
          <Suspense fallback={<PortalLoader title="Loading Operations Portal..." />}>
            <OperationsPortal />
          </Suspense>
        </PortalGuard>
      </ProtectedRoute>
    ),
  },
  {
    path: "/technician/*",
    element: (
      <ProtectedRoute>
        <PortalGuard portal="technician">
          <Suspense fallback={<PortalLoader title="Loading Technician Portal..." />}>
            <TechnicianPortal />
          </Suspense>
        </PortalGuard>
      </ProtectedRoute>
    ),
  },
  {
    path: "/admin/*",
    element: (
      <ProtectedRoute>
        <PlatformAdminGuard>
          <Suspense fallback={<PortalLoader title="Loading Platform Admin..." />}>
            <AdminPortal />
          </Suspense>
        </PlatformAdminGuard>
      </ProtectedRoute>
    ),
  },

  // Root redirect
  {
    path: "/",
    element: <RootRedirect />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
]);

// ── Query client ──────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

// ── Root app ──────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function PortalLoader({ title = "Loading..." }: { title?: string }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-neutral-50">
      <div
        className="h-9 w-9 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"
        role="status"
        aria-label="Loading"
      />
      <p className="text-xs font-medium text-neutral-500">{title}</p>
    </div>
  );
}

function RootRedirect() {
  const { user, authContext, isLoading } = useAuth();

  if (isLoading) {
    return <PortalLoader title="Initializing CareOS session..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (authContext?.isPlatformAdmin) {
    return <Navigate to="/admin" replace />;
  }

  const activePortal = authContext?.activeMembership?.portal;
  if (activePortal === "operations") return <Navigate to="/operations" replace />;
  if (activePortal === "technician") return <Navigate to="/technician" replace />;
  if (activePortal === "customer") return <Navigate to="/customer" replace />;

  if ((authContext?.memberships || []).length > 1) {
    return <Navigate to="/select-tenant" replace />;
  }

  return <Navigate to="/unauthorized" replace />;
}

function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-neutral-50">
      <h1 className="text-2xl font-bold text-neutral-900">404 — Page not found</h1>
      <p className="text-neutral-500">The URL you requested does not exist.</p>
      <a href="/" className="text-sm font-medium text-blue-600 hover:text-blue-500">
        Return to Home
      </a>
    </div>
  );
}
