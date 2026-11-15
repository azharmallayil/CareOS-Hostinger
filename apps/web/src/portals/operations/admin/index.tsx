import React, { useState } from "react";
import { TenantSettingsView } from "./TenantSettingsView.js";
import { MembersView } from "./MembersView.js";
import { DepartmentsView } from "./DepartmentsView.js";
import { RolesView } from "./RolesView.js";
import { InvitationsView } from "./InvitationsView.js";
import { AuditLogsView } from "./AuditLogsView.js";
import { Settings, Users, Network, Shield, Mail, Activity } from "lucide-react";

type AdminTab = "settings" | "members" | "departments" | "roles" | "invitations" | "audit";

export function OrganizationAdminView() {
  const [activeTab, setActiveTab] = useState<AdminTab>("settings");

  const tabs: { id: AdminTab; label: string; icon: React.ElementType }[] = [
    { id: "settings", label: "Organization Profile", icon: Settings },
    { id: "members", label: "Members & Access", icon: Users },
    { id: "departments", label: "Departments & Branches", icon: Network },
    { id: "roles", label: "Roles & Permissions", icon: Shield },
    { id: "invitations", label: "Invitations", icon: Mail },
    { id: "audit", label: "Audit Logs", icon: Activity },
  ];

  return (
    <div className="space-y-6">
      {/* Tab Navigation Header */}
      <div className="border-b border-neutral-200 bg-white px-6 pt-5">
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Organization Administration
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Manage your workspace configuration, security boundaries, staff roles, and organizational structure
          </p>
        </div>

        <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 py-3 px-1 text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-blue-600" : "text-neutral-400"}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content Container */}
      <div className="px-6 pb-12">
        {activeTab === "settings" && <TenantSettingsView />}
        {activeTab === "members" && <MembersView />}
        {activeTab === "departments" && <DepartmentsView />}
        {activeTab === "roles" && <RolesView />}
        {activeTab === "invitations" && <InvitationsView />}
        {activeTab === "audit" && <AuditLogsView />}
      </div>
    </div>
  );
}

export default OrganizationAdminView;
