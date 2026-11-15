import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth-context.js";
import { Badge } from "../../components/ui/Badge.js";
import {
  ShieldAlert,
  Building,
  Activity,
  Server,
  LogOut,
  ChevronDown,
  Menu,
  X,
  ExternalLink,
} from "lucide-react";

interface AdminShellProps {
  children: React.ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const navItems = [
    { label: "Tenants Directory", path: "/admin", icon: Building, exact: true },
    { label: "Global Audit Log", path: "/admin/audit", icon: Activity, exact: false },
    { label: "Infrastructure & Telemetry", path: "/admin/system", icon: Server, exact: false },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-neutral-900 font-sans antialiased text-neutral-100">
      {/* Top Admin Header */}
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo & Platform Badge */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-600 text-white font-bold text-sm shadow-xs">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-white tracking-tight">CareOS</span>
                  <span className="rounded bg-red-950 border border-red-800 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-300">
                    SUPERADMIN
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400">SaaS Platform Control Plane</p>
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
                        ? "bg-neutral-800 text-white shadow-xs"
                        : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right side: Security badge & Profile */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 rounded-lg bg-neutral-900 px-2.5 py-1 text-xs border border-neutral-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-neutral-300">Platform Gateway Active</span>
            </div>

            {/* User Profile */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 p-1 pr-3 hover:bg-neutral-800"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
                  {profile?.fullName?.charAt(0) || user?.email?.charAt(0) || "A"}
                </div>
                <span className="hidden sm:inline-block text-xs font-medium text-neutral-200 max-w-[120px] truncate">
                  {profile?.fullName || user?.email}
                </span>
                <ChevronDown className="h-3 w-3 text-neutral-400" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-neutral-800 bg-neutral-900 p-1 shadow-2xl">
                  <div className="border-b border-neutral-800 px-3 py-2 text-xs">
                    <div className="font-semibold text-white">{profile?.fullName}</div>
                    <div className="text-neutral-400 truncate">{user?.email}</div>
                    <div className="mt-1 text-[10px] text-red-400 font-bold uppercase tracking-wider">
                      Platform Administrator
                    </div>
                  </div>
                  <div className="p-1">
                    <button
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-950/50"
                    >
                      <LogOut className="h-3.5 w-3.5 text-red-400" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-800 md:hidden"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="border-t border-neutral-800 bg-neutral-950 px-4 py-3 md:hidden space-y-1">
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
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${
                    isActive ? "bg-neutral-800 text-white" : "text-neutral-400 hover:bg-neutral-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
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

export default AdminShell;
