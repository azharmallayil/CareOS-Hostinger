import React, { useEffect, useState } from "react";
import { useAuth } from "../../../lib/auth-context.js";
import { Card } from "../../../components/ui/Card.js";
import { Badge } from "../../../components/ui/Badge.js";
import { Modal } from "../../../components/ui/Modal.js";
import { Activity, Search, RefreshCw, Eye, FileText, User } from "lucide-react";

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  old_data: any;
  new_data: any;
  created_at: string;
  profiles?: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
}

export function AuditLogsView() {
  const { session, authContext } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [inspectLog, setInspectLog] = useState<AuditLog | null>(null);

  const fetchLogs = () => {
    if (!session?.access_token) return;
    setIsLoading(true);
    setErrorMsg(null);

    fetch("/api/v1/organization/audit-logs", {
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
          setLogs(payload.data);
        }
      })
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchLogs();
  }, [session?.access_token, authContext?.activeTenantId]);

  const filteredLogs = logs.filter(
    (l) =>
      l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.resource_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.profiles?.email && l.profiles.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.profiles?.full_name && l.profiles.full_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getActionBadgeVariant = (action: string): "neutral" | "primary" | "success" | "warning" | "error" | "info" => {
    if (action.includes("created") || action.includes("assigned")) return "success";
    if (action.includes("updated")) return "info";
    if (action.includes("revoked") || action.includes("deactivated") || action.includes("deleted")) return "error";
    return "neutral";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900">
            Organization Audit Logs
          </h2>
          <p className="text-sm text-neutral-500">
            Immutable log of privileged actions, membership changes, and tenant settings modifications
          </p>
        </div>
        <button
          onClick={fetchLogs}
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

      {/* Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by action, resource, or actor..."
            className="w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm placeholder-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="text-xs text-neutral-500">
          Showing latest <strong className="text-neutral-900">{filteredLogs.length}</strong> events
        </div>
      </div>

      {/* Table */}
      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-neutral-500">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-neutral-400" />
            <p className="mt-2">Loading audit trail...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-12 text-center">
            <Activity className="mx-auto h-8 w-8 text-neutral-300" />
            <h3 className="mt-2 text-sm font-semibold text-neutral-900">No audit events found</h3>
            <p className="mt-1 text-xs text-neutral-500">Privileged organization actions will appear here automatically.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-200 bg-neutral-50/75 text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-semibold">Timestamp</th>
                  <th className="px-4 py-3 font-semibold">Actor</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Resource</th>
                  <th className="px-4 py-3 font-semibold">Resource ID</th>
                  <th className="px-4 py-3 font-semibold text-right">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-mono">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-neutral-50/50">
                    <td className="px-4 py-3 text-neutral-500 whitespace-nowrap font-sans text-xs">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-sans text-neutral-900">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-neutral-400" />
                        <span className="font-medium">
                          {log.profiles?.full_name || log.profiles?.email || "System / Admin"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-sans">
                      <Badge variant={getActionBadgeVariant(log.action)}>{log.action}</Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {log.resource_type}
                    </td>
                    <td className="px-4 py-3 text-neutral-400 max-w-[120px] truncate" title={log.resource_id || ""}>
                      {log.resource_id || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-sans">
                      <button
                        onClick={() => setInspectLog(log)}
                        className="inline-flex items-center gap-1 rounded border border-neutral-200 bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50"
                      >
                        <Eye className="h-3 w-3 text-neutral-400" />
                        View Diff
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Inspect Diff Modal */}
      {inspectLog && (
        <Modal
          isOpen={true}
          onClose={() => setInspectLog(null)}
          title={`Audit Event: ${inspectLog.action}`}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600">
              <div>
                <span className="text-neutral-400">Time:</span>{" "}
                <span className="font-medium text-neutral-800">
                  {new Date(inspectLog.created_at).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-neutral-400">Actor:</span>{" "}
                <span className="font-medium text-neutral-800">
                  {inspectLog.profiles?.full_name || inspectLog.profiles?.email || inspectLog.user_id}
                </span>
              </div>
              <div>
                <span className="text-neutral-400">Resource:</span>{" "}
                <code className="font-mono text-neutral-800">{inspectLog.resource_type}</code>
              </div>
              <div>
                <span className="text-neutral-400">Resource ID:</span>{" "}
                <code className="font-mono text-neutral-800">{inspectLog.resource_id || "—"}</code>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-1 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  Previous State (Old)
                </h4>
                <pre className="max-h-60 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-900 p-3 text-[11px] font-mono text-neutral-200">
                  {inspectLog.old_data
                    ? JSON.stringify(inspectLog.old_data, null, 2)
                    : "// No previous state"}
                </pre>
              </div>
              <div>
                <h4 className="mb-1 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  New State (Changes)
                </h4>
                <pre className="max-h-60 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-900 p-3 text-[11px] font-mono text-emerald-400">
                  {inspectLog.new_data
                    ? JSON.stringify(inspectLog.new_data, null, 2)
                    : "// No new state"}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectLog(null)}
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
