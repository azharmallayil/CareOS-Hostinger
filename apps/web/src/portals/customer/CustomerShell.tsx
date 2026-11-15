import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth-context.js";
import { Badge } from "../../components/ui/Badge.js";
import {
  LifeBuoy,
  Plus,
  Box,
  FileText,
  User,
  LogOut,
  ChevronDown,
  Building,
  Menu,
  X,
  ShieldCheck,
} from "lucide-react";

interface CustomerShellProps {
  children: React.ReactNode;
}

export function CustomerShell({ children }: CustomerShellProps) {
  const { user, profile, authContext, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const activeTenantId = authContext?.activeTenantId;
  const activeMembership = authContext?.activeMembership;

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const navItems = [
    { label: "Service Requests", path: "/customer", icon: LifeBuoy, exact: true },
    { label: "My Assets", path: "/customer/assets", icon: Box, exact: false, badge: "Step 11" },
    { label: "Billing & Invoices", path: "/customer/billing", icon: FileText, exact: false, badge: "Step 12" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 font-sans antialiased text-neutral-800">
      {/* Top Customer Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo & Tenant Identity */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-sm shadow-xs">
                C
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-neutral-900 tracking-tight">CareOS</span>
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-neutral-700">
                    CLIENT
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400">Customer Support Portal</p>
              </div>
            </div>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.exact
                  ? location.pathname === item.path
                  : location.pathname.startsWith(item.path);

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="rounded bg-neutral-100 px-1.5 py-0.2 text-[9px] font-normal text-neutral-500">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: Quick Action & User Menu */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => alert("Ticket creation will be available in Step 8 (Customer Portal & Tickets).")}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-500 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              New Request
            </button>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-full border border-neutral-200 p-1 pr-3 hover:bg-neutral-50"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {profile?.fullName?.charAt(0) || user?.email?.charAt(0) || "C"}
                </div>
                <span className="hidden sm:inline-block text-xs font-medium text-neutral-700 max-w-[120px] truncate">
                  {profile?.fullName || user?.email}
                </span>
                <ChevronDown className="h-3 w-3 text-neutral-400" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg">
                  <div className="border-b border-neutral-100 px-3 py-2 text-xs">
                    <div className="font-semibold text-neutral-900">{profile?.fullName}</div>
                    <div className="text-neutral-500 truncate">{user?.email}</div>
                    <div className="mt-1 text-[10px] text-neutral-400">
                      Organization: {activeTenantId?.slice(0, 8)}...
                    </div>
                  </div>
                  <div className="p-1">
                    <button
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="h-3.5 w-3.5 text-red-500" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded p-1 text-neutral-500 hover:bg-neutral-100 md:hidden"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="border-t border-neutral-200 bg-white px-4 py-3 md:hidden space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? location.pathname === item.path
                : location.pathname.startsWith(item.path);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold ${
                    isActive ? "bg-blue-50 text-blue-700" : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="rounded bg-neutral-100 px-1.5 py-0.2 text-[9px] text-neutral-500">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="mx-auto flex-1 w-full max-w-7xl p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}

export default CustomerShell;
