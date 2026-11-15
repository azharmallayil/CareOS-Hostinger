import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth-context.js";
import { Badge } from "../../components/ui/Badge.js";
import { GlobalSearchModal } from "../../components/search/GlobalSearchModal.js";
import { CareOSAssistChat } from "../../components/ai/CareOSAssistChat.js";
import {
  Truck,
  Building2,
  ChevronDown,
  LayoutDashboard,
  Settings2,
  LogOut,
  Menu,
  X,
  User,
  Shield,
  Layers,
  Wrench,
  LifeBuoy,
  CreditCard,
  Cpu,
  ShieldAlert,
  ArrowRightLeft,
  BarChart3,
  Link2,
  Search,
  FileSpreadsheet,
  BookOpen,
  Sparkles,
} from "lucide-react";

interface OperationsShellProps {
  children: React.ReactNode;
}

export function OperationsShell({ children }: OperationsShellProps) {
  const { user, profile, authContext, signOut, switchTenant } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [tenantSwitcherOpen, setTenantSwitcherOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const activeTenantId = authContext?.activeTenantId;
  const activeMembership = authContext?.activeMembership;
  const memberships = authContext?.memberships || [];

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const navItems = [
    {
      label: "Overview",
      path: "/operations",
      icon: LayoutDashboard,
      exact: true,
    },
    {
      label: "Customer Accounts",
      path: "/operations/customers",
      icon: Building2,
      exact: false,
    },
    {
      label: "Fleet & Assets",
      path: "/operations/assets",
      icon: Truck,
      exact: false,
    },
    {
      label: "Support Desk & Tickets",
      path: "/operations/tickets",
      icon: LifeBuoy,
      exact: false,
    },
    {
      label: "Dispatch & Work Orders",
      path: "/operations/dispatch",
      icon: Wrench,
      exact: false,
    },
    {
      label: "Coverage & Quotations",
      path: "/operations/quotations",
      icon: CreditCard,
      exact: false,
    },
    {
      label: "Inventory & RMA",
      path: "/operations/inventory",
      icon: Layers,
      exact: false,
    },
    {
      label: "Service Intelligence",
      path: "/operations/intelligence",
      icon: BarChart3,
      exact: false,
    },
    {
      label: "Integrations & ERP",
      path: "/operations/integrations",
      icon: Link2,
      exact: false,
    },
    {
      label: "Reports & Analytics",
      path: "/operations/reports",
      icon: FileSpreadsheet,
      exact: false,
    },
    {
      label: "Knowledge Base",
      path: "/operations/knowledge",
      icon: BookOpen,
      exact: false,
    },
    {
      label: "Complaints",
      path: "/operations/complaints",
      icon: ShieldAlert,
      exact: false,
    },
    {
      label: "Organization Admin",
      path: "/operations/admin",
      icon: Settings2,
      exact: false,
    },
  ];

  // Future modules indicated with badges to enforce clear roadmap visibility without building module tables
  const plannedModules = [
    { label: "Device & SIM Registry", icon: Cpu, step: "Step 8" },
    { label: "Telematics & ERP Connectors", icon: ArrowRightLeft, step: "Step 15" },
  ];

  return (
    <div className="flex h-screen bg-neutral-100 font-sans antialiased text-neutral-800">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-neutral-900/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-neutral-200 bg-white transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-0 -translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-neutral-200 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-sm shadow-sm">
              C
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-neutral-900 tracking-tight">CareOS</span>
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                  OPS
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">Operations Portal</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tenant Switcher Card */}
        <div className="border-b border-neutral-100 p-3">
          <div className="relative">
            <button
              onClick={() => setTenantSwitcherOpen(!tenantSwitcherOpen)}
              className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50/75 p-2 text-left text-xs transition hover:bg-neutral-100/80"
            >
              <div className="flex items-center gap-2 truncate">
                <Building2 className="h-4 w-4 shrink-0 text-neutral-500" />
                <div className="truncate">
                  <div className="font-semibold text-neutral-900 truncate">
                    {activeMembership ? `Tenant ${activeMembership.tenantId.slice(0, 8)}` : "Select Organization"}
                  </div>
                  <div className="text-[10px] text-neutral-400 font-mono">
                    ID: {activeTenantId?.slice(0, 8)}...
                  </div>
                </div>
              </div>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
            </button>

            {/* Dropdown for tenant switching */}
            {tenantSwitcherOpen && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  Your Organizations
                </div>
                {memberships.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      switchTenant(m.tenantId);
                      setTenantSwitcherOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-xs text-left ${
                      m.tenantId === activeTenantId
                        ? "bg-blue-50 font-semibold text-blue-700"
                        : "text-neutral-700 hover:bg-neutral-100"
                    }`}
                  >
                    <span className="truncate">Org {m.tenantId.slice(0, 8)}</span>
                    <Badge variant={m.tenantId === activeTenantId ? "primary" : "neutral"}>
                      {m.portal}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Nav Links */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <div>
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Workspace
            </div>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.exact
                  ? location.pathname === item.path
                  : location.pathname.startsWith(item.path);

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                      isActive
                        ? "bg-blue-50 text-blue-600 shadow-xs"
                        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? "text-blue-600" : "text-neutral-400"}`} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Planned Enterprise Business Modules (Upcoming Roadmap Steps) */}
          <div>
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Enterprise Roadmap
            </div>
            <div className="space-y-1">
              {plannedModules.map((mod) => {
                const Icon = mod.icon;
                return (
                  <div
                    key={mod.label}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-xs text-neutral-400 cursor-not-allowed select-none"
                    title={`Scheduled for implementation in ${mod.step}`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-neutral-300" />
                      <span>{mod.label}</span>
                    </div>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[9px] font-medium text-neutral-500">
                      {mod.step}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar Footer User Info */}
        <div className="border-t border-neutral-200 p-3">
          <div className="flex items-center justify-between rounded-lg bg-neutral-50 p-2">
            <div className="flex items-center gap-2 truncate">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-xs">
                {profile?.fullName?.charAt(0) || user?.email?.charAt(0) || "U"}
              </div>
              <div className="truncate text-xs">
                <div className="font-semibold text-neutral-900 truncate">
                  {profile?.fullName || user?.email}
                </div>
                <div className="text-[10px] text-neutral-400 truncate">
                  {activeMembership?.roles.join(", ") || "Member"}
                </div>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign Out"
              className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded p-1 text-neutral-500 hover:bg-neutral-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-500">Security Mode:</span>
              <Badge variant="success">RLS Enforced</Badge>
              <span className="hidden sm:inline-block text-neutral-300">|</span>
              <span className="hidden sm:inline-block text-xs font-mono text-neutral-400">
                Tenant: {activeTenantId?.slice(0, 8)}...
              </span>
            </div>
          </div>

          {/* Header Center - Global Search */}
          <div className="flex-1 max-w-md mx-4">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 px-3 py-1.5 text-xs text-neutral-500 transition shadow-xs"
            >
              <div className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-neutral-400" />
                <span className="hidden sm:inline">Search tickets, fleet, accounts...</span>
                <span className="sm:hidden">Search...</span>
              </div>
              <kbd className="hidden sm:inline-block rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[10px] font-mono text-neutral-400">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Header Right */}
          <div className="flex items-center gap-3">
            {/* CareOS Assist AI Toggle */}
            <button
              onClick={() => setAssistOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:from-blue-700 hover:to-indigo-700 transition"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">CareOS Assist</span>
            </button>

            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-full border border-neutral-200 p-1 pr-3 hover:bg-neutral-50"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  {profile?.fullName?.charAt(0) || user?.email?.charAt(0) || "U"}
                </div>
                <span className="text-xs font-medium text-neutral-700 max-w-[120px] truncate">
                  {profile?.fullName || user?.email}
                </span>
                <ChevronDown className="h-3 w-3 text-neutral-400" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg">
                  <div className="border-b border-neutral-100 px-3 py-2 text-xs">
                    <div className="font-semibold text-neutral-900">{profile?.fullName}</div>
                    <div className="text-neutral-500 truncate">{user?.email}</div>
                  </div>
                  <div className="p-1">
                    <Link
                      to="/operations/admin"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 rounded px-2.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
                    >
                      <Settings2 className="h-3.5 w-3.5 text-neutral-400" />
                      Organization Admin
                    </Link>
                    <Link
                      to="/select-tenant"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 rounded px-2.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
                    >
                      <Building2 className="h-3.5 w-3.5 text-neutral-400" />
                      Switch Organization
                    </Link>
                  </div>
                  <div className="border-t border-neutral-100 p-1">
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
        </header>

        {/* Scrollable Main Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Global Search Dialog */}
      <GlobalSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* CareOS Assist AI Drawer */}
      <CareOSAssistChat isOpen={assistOpen} onClose={() => setAssistOpen(false)} portalMode="internal" />
    </div>
  );
}

export default OperationsShell;
