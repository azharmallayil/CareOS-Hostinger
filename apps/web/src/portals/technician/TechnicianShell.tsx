import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth-context.js";
import { Badge } from "../../components/ui/Badge.js";
import {
  Wrench,
  Calendar,
  Package,
  User,
  LogOut,
  ChevronDown,
  Menu,
  X,
  Building2,
  Signal,
  CheckCircle,
  Clock,
  Coffee,
} from "lucide-react";

interface TechnicianShellProps {
  children: React.ReactNode;
}

type TechDutyStatus = "available" | "on_site" | "off_duty";

export function TechnicianShell({ children }: TechnicianShellProps) {
  const { user, profile, authContext, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [dutyStatus, setDutyStatus] = useState<TechDutyStatus>("available");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const activeTenantId = authContext?.activeTenantId;
  const activeMembership = authContext?.activeMembership;

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const statusConfigs = {
    available: {
      label: "Available / On Duty",
      icon: CheckCircle,
      badge: "success" as const,
      color: "bg-emerald-500",
      text: "text-emerald-700",
    },
    on_site: {
      label: "On Site / In Transit",
      icon: Clock,
      badge: "warning" as const,
      color: "bg-amber-500",
      text: "text-amber-700",
    },
    off_duty: {
      label: "Off Duty",
      icon: Coffee,
      badge: "neutral" as const,
      color: "bg-neutral-400",
      text: "text-neutral-600",
    },
  };

  const navItems = [
    { label: "Overview", path: "/technician", icon: Wrench, exact: true },
    { label: "My Schedule", path: "/technician/schedule", icon: Calendar, exact: false, badge: "Step 7" },
    { label: "Parts & Tools", path: "/technician/parts", icon: Package, exact: false, badge: "Step 11" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-neutral-100 font-sans antialiased text-neutral-800">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white shadow-xs">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          {/* Logo & Identity */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white font-bold shadow-xs">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-neutral-900 tracking-tight">CareOS</span>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                  FIELD TECH
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">Mobile Service Shell</p>
            </div>
          </div>

          {/* Right items: Duty Status & Profile */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Duty Status Selector */}
            <div className="relative">
              <button
                onClick={() => setStatusMenuOpen(!statusMenuOpen)}
                className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs font-semibold hover:bg-neutral-100"
              >
                <span className={`h-2 w-2 rounded-full ${statusConfigs[dutyStatus].color}`} />
                <span className="hidden sm:inline-block">{statusConfigs[dutyStatus].label}</span>
                <ChevronDown className="h-3 w-3 text-neutral-400" />
              </button>

              {statusMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    Change Duty Status
                  </div>
                  {(["available", "on_site", "off_duty"] as TechDutyStatus[]).map((st) => {
                    const cfg = statusConfigs[st];
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={st}
                        onClick={() => {
                          setDutyStatus(st);
                          setStatusMenuOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-left ${
                          dutyStatus === st ? "bg-neutral-100 font-semibold" : "hover:bg-neutral-50"
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${cfg.color}`} />
                        <span>{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Profile Menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-1.5 rounded-full border border-neutral-200 p-1 hover:bg-neutral-50"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
                  {profile?.fullName?.charAt(0) || user?.email?.charAt(0) || "T"}
                </div>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg">
                  <div className="border-b border-neutral-100 px-3 py-2 text-xs">
                    <div className="font-semibold text-neutral-900">{profile?.fullName}</div>
                    <div className="text-neutral-500 truncate">{user?.email}</div>
                    <div className="mt-1 text-[10px] font-mono text-neutral-400">
                      Tenant: {activeTenantId?.slice(0, 8)}...
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
          </div>
        </div>

        {/* Desktop Tab Bar */}
        <div className="hidden sm:block border-t border-neutral-100 bg-neutral-50/50">
          <div className="mx-auto flex max-w-5xl space-x-6 px-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? location.pathname === item.path
                : location.pathname.startsWith(item.path);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 border-b-2 py-2.5 text-xs font-semibold transition ${
                    isActive
                      ? "border-amber-500 text-amber-700"
                      : "border-transparent text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="rounded bg-neutral-200 px-1 py-0.2 text-[9px] text-neutral-600">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto flex-1 w-full max-w-5xl p-4 sm:p-6 pb-20 sm:pb-8">
        {children}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-200 bg-white py-2 sm:hidden shadow-lg">
        <div className="flex justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? location.pathname === item.path
              : location.pathname.startsWith(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 text-[10px] font-semibold ${
                  isActive ? "text-amber-600" : "text-neutral-400 hover:text-neutral-600"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default TechnicianShell;
