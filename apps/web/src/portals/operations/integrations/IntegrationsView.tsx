import React, { useState, useEffect } from "react";
import { useAuth } from "../../../lib/auth-context.js";
import { Card, CardHeader } from "../../../components/ui/Card.js";
import { Badge } from "../../../components/ui/Badge.js";
import { Modal } from "../../../components/ui/Modal.js";
import { Input } from "../../../components/ui/Input.js";
import { Select } from "../../../components/ui/Select.js";
import {
  Link2,
  Radio,
  Server,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  Play,
  Copy,
  Clock,
  Layers,
  FileText,
  Activity,
} from "lucide-react";

interface IntegrationConnection {
  id: string;
  tenantId: string;
  integrationType: "erp" | "telematics";
  providerCode: string;
  name: string;
  baseUrl?: string;
  authType: string;
  hasCredentials: boolean;
  hasWebhookSecret: boolean;
  isActive: boolean;
  settings: Record<string, unknown>;
  createdAt: string;
}

interface InboundEvent {
  id: string;
  event_type: string;
  source_event_id?: string;
  idempotency_key: string;
  status: "pending" | "processed" | "ignored_duplicate" | "ignored_heartbeat" | "failed";
  payload: {
    deviceId?: string;
    eventType?: string;
    timestamp?: string;
    faultDetails?: { errorCode?: string; cameraName?: string };
    alertDetails?: { alertCategory?: string; severity?: string };
  };
  created_at: string;
}

interface SyncLog {
  id: string;
  direction: "inbound" | "outbound";
  entity_type: string;
  status: "success" | "warning" | "error";
  records_processed: number;
  records_failed: number;
  details: Record<string, unknown>;
  created_at: string;
}

export function IntegrationsView() {
  const { authContext, session } = useAuth();
  const token = session?.access_token;
  const activeTenantId = authContext?.activeTenantId;

  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [inboxEvents, setInboxEvents] = useState<InboundEvent[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Test connection state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  // Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newConn, setNewConn] = useState({
    integrationType: "erp" as "erp" | "telematics",
    name: "",
    providerCode: "generic_rest_erp",
    baseUrl: "https://sandbox.local/erp",
    authType: "api_key",
    apiKey: "",
  });

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      const [connRes, inboxRes, logsRes] = await Promise.all([
        fetch("/api/v1/integrations/connections", { credentials: "include", headers }),
        fetch("/api/v1/integrations/inbox", { credentials: "include", headers }),
        fetch("/api/v1/integrations/logs", { credentials: "include", headers }),
      ]);

      if (connRes.ok) {
        const data = await connRes.json();
        setConnections(data.connections || []);
      }
      if (inboxRes.ok) {
        const data = await inboxRes.json();
        setInboxEvents(data.events || []);
      }
      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data.logs || []);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to load integrations: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [token, activeTenantId]);

  const handleTestConnection = async (id: string) => {
    if (!token) return;
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/v1/integrations/connections/${id}/test`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await res.json();
      if (res.ok && data.testResult?.connected) {
        setTestResult({
          id,
          success: true,
          message: `Connected (${data.testResult.latencyMs ?? 15}ms) - ${data.testResult.version || "Handshake OK"}`,
        });
      } else {
        setTestResult({
          id,
          success: false,
          message: data.testResult?.error || data.error?.message || "Connection failed",
        });
      }
      void fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({ id, success: false, message: msg });
    } finally {
      setTestingId(null);
    }
  };

  const handleCreateConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      const payload = {
        integrationType: newConn.integrationType,
        providerCode: newConn.providerCode,
        name: newConn.name,
        baseUrl: newConn.baseUrl,
        authType: newConn.authType,
        credentials: newConn.apiKey ? { apiKey: newConn.apiKey } : {},
      };

      const res = await fetch("/api/v1/integrations/connections", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowCreateModal(false);
        setNewConn({
          integrationType: "erp",
          name: "",
          providerCode: "generic_rest_erp",
          baseUrl: "https://sandbox.local/erp",
          authType: "api_key",
          apiKey: "",
        });
        void fetchData();
      } else {
        const data = await res.json();
        setError(data.error?.message || "Failed to create connection");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  };

  return (
    <div className="space-y-6 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-indigo-700">
              Integrations & Connectors
            </span>
            <Badge variant="primary">Step 15 Active</Badge>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            ERP & Telematics Integrations
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Canonical data contracts, telematics webhook ingestion, ERP outbox synchronization, and durable worker retries.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchData()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Connection
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Security Vault Banner */}
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-emerald-900">
        <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
        <div className="flex-1">
          <span className="font-semibold">Security Architecture: </span>
          Authentication credentials, API keys, and HMAC webhook secrets are stored encrypted at rest on the server and are strictly never transmitted to browser clients.
        </div>
      </div>

      {/* Active Connections */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ERP Card */}
        <Card>
          <CardHeader
            title="Generic REST ERP Connector"
            description="Outbound transactional invoice and customer sync with external ID mapping."
          />
          <div className="mt-4 space-y-4">
            {connections.filter((c) => c.integrationType === "erp").length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-200 p-6 text-center text-xs text-neutral-400">
                No active ERP connector configured. Click "Add Connection" to connect your ERP.
              </div>
            ) : (
              connections
                .filter((c) => c.integrationType === "erp")
                .map((c) => (
                  <div key={c.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-blue-600" />
                        <span className="font-semibold text-sm text-neutral-900">{c.name}</span>
                        <Badge variant="success">Active</Badge>
                      </div>
                      <button
                        onClick={() => void handleTestConnection(c.id)}
                        disabled={testingId === c.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:opacity-50"
                      >
                        <Play className={`h-3 w-3 ${testingId === c.id ? "animate-spin" : ""}`} />
                        Test Ping
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-neutral-400">Base URL:</span>
                        <p className="font-mono text-neutral-700 truncate">{c.baseUrl || "Mock Sandbox"}</p>
                      </div>
                      <div>
                        <span className="text-neutral-400">Auth Method:</span>
                        <p className="font-medium text-neutral-700 capitalize">{c.authType.replace(/_/g, " ")}</p>
                      </div>
                    </div>

                    {testResult && testResult.id === c.id && (
                      <div
                        className={`mt-3 rounded-lg p-2.5 text-xs font-medium ${
                          testResult.success
                            ? "bg-emerald-100/70 text-emerald-800"
                            : "bg-red-100/70 text-red-800"
                        }`}
                      >
                        {testResult.message}
                      </div>
                    )}
                  </div>
                ))
            )}
          </div>
        </Card>

        {/* Telematics Card */}
        <Card>
          <CardHeader
            title="Generic Telematics Webhook Intake"
            description="HMAC-signed event ingestion for camera faults, DMS/ADAS alerts, and online status."
          />
          <div className="mt-4 space-y-4">
            {connections.filter((c) => c.integrationType === "telematics").length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-200 p-6 text-center text-xs text-neutral-400">
                No telematics webhook registered. Default endpoint active at <code>/api/v1/integrations/telematics/webhook</code>.
              </div>
            ) : (
              connections
                .filter((c) => c.integrationType === "telematics")
                .map((c) => (
                  <div key={c.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Radio className="h-4 w-4 text-emerald-600" />
                        <span className="font-semibold text-sm text-neutral-900">{c.name}</span>
                        <Badge variant="success">Listening</Badge>
                      </div>
                      <Badge variant="neutral">HMAC-SHA256</Badge>
                    </div>

                    <div className="mt-3 text-xs">
                      <span className="text-neutral-400">Webhook Endpoint URL:</span>
                      <div className="mt-1 flex items-center gap-2 rounded-lg border border-neutral-200 bg-white p-2 font-mono text-[11px] text-neutral-700">
                        <span className="truncate flex-1">/api/v1/integrations/telematics/webhook?connectionId={c.id}</span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
                      <span>Deduplication: 60m heartbeat debounce</span>
                      <span className="text-emerald-600 font-medium">GPS Breadcrumb Stream Filtered</span>
                    </div>
                  </div>
                ))
            )}
          </div>
        </Card>
      </div>

      {/* Inbound Telematics Event Stream */}
      <Card>
        <CardHeader
          title="Inbound Telematics Event Stream (Inbox)"
          description="Normalized events received via generic webhook with automated incident evaluation."
        />
        <div className="mt-4 overflow-x-auto">
          {inboxEvents.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-400">
              No telematics events ingested yet. High-frequency routine GPS streams are filtered out by design.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Timestamp</th>
                  <th className="py-2.5 px-3 font-semibold">Event Type</th>
                  <th className="py-2.5 px-3 font-semibold">Device / IMEI</th>
                  <th className="py-2.5 px-3 font-semibold">Ingestion Status</th>
                  <th className="py-2.5 px-3 font-semibold">Normalized Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-neutral-700">
                {inboxEvents.map((evt) => {
                  const isFault = evt.event_type.includes("fault") || evt.event_type.includes("alert");
                  return (
                    <tr key={evt.id} className="hover:bg-neutral-50/50">
                      <td className="py-3 px-3 font-mono text-neutral-500">
                        {new Date(evt.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </td>
                      <td className="py-3 px-3">
                        <Badge variant={isFault ? "error" : "primary"}>
                          {evt.event_type}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 font-mono font-medium text-neutral-900">
                        {evt.payload?.deviceId || "N/A"}
                      </td>
                      <td className="py-3 px-3">
                        <Badge
                          variant={
                            evt.status === "processed"
                              ? "success"
                              : evt.status === "ignored_heartbeat"
                              ? "neutral"
                              : "warning"
                          }
                        >
                          {evt.status.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-neutral-600">
                        {evt.payload?.faultDetails?.errorCode
                          ? `${evt.payload.faultDetails.cameraName ?? "Camera"}: ${evt.payload.faultDetails.errorCode}`
                          : evt.payload?.alertDetails?.alertCategory
                          ? `Alert: ${evt.payload.alertDetails.alertCategory.toUpperCase()} (${evt.payload.alertDetails.severity})`
                          : "Status Telemetry Normal"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Integration Sync Logs Audit Trail */}
      <Card>
        <CardHeader
          title="Integration Sync Logs & Audit Trail"
          description="Durable sync execution history, ERP push transactions, and worker retries."
        />
        <div className="mt-4 overflow-x-auto">
          {logs.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-400">
              No synchronization operations recorded in current tenant yet.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Timestamp</th>
                  <th className="py-2.5 px-3 font-semibold">Direction</th>
                  <th className="py-2.5 px-3 font-semibold">Operation</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-3 font-semibold">Records</th>
                  <th className="py-2.5 px-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-neutral-700">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-neutral-50/50">
                    <td className="py-3 px-3 font-mono text-neutral-500">
                      {new Date(log.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "medium" })}
                    </td>
                    <td className="py-3 px-3 uppercase font-semibold text-neutral-600">
                      {log.direction}
                    </td>
                    <td className="py-3 px-3 font-medium text-neutral-900">{log.entity_type}</td>
                    <td className="py-3 px-3">
                      <Badge variant={log.status === "success" ? "success" : "error"}>
                        {log.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 font-mono">
                      {log.records_processed} / {log.records_failed} fail
                    </td>
                    <td className="py-3 px-3 text-neutral-500 font-mono text-[11px] truncate max-w-xs">
                      {JSON.stringify(log.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Create Connection Modal */}
      {showCreateModal && (
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Configure Integration Connection"
        >
          <form onSubmit={handleCreateConnection} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700">Integration Type</label>
              <select
                value={newConn.integrationType}
                onChange={(e) =>
                  setNewConn({
                    ...newConn,
                    integrationType: e.target.value as "erp" | "telematics",
                    providerCode: e.target.value === "erp" ? "generic_rest_erp" : "generic_webhook_telematics",
                  })
                }
                className="mt-1 block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900"
              >
                <option value="erp">Generic REST ERP</option>
                <option value="telematics">Generic Webhook Telematics</option>
              </select>
            </div>

            <Input
              label="Connection Name"
              placeholder="e.g. Acme Enterprise ERP or Fleet Webhook"
              value={newConn.name}
              onChange={(e) => setNewConn({ ...newConn, name: e.target.value })}
              required
            />

            {newConn.integrationType === "erp" && (
              <>
                <Input
                  label="ERP REST Base URL"
                  placeholder="https://erp.acme.com/api"
                  value={newConn.baseUrl}
                  onChange={(e) => setNewConn({ ...newConn, baseUrl: e.target.value })}
                  required
                />

                <div>
                  <label className="block text-xs font-semibold text-neutral-700">Authentication Method</label>
                  <select
                    value={newConn.authType}
                    onChange={(e) => setNewConn({ ...newConn, authType: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900"
                  >
                    <option value="api_key">API Key (X-API-Key)</option>
                    <option value="bearer_token">Bearer Token</option>
                    <option value="basic_auth">Basic Auth</option>
                    <option value="none">None / Sandbox</option>
                  </select>
                </div>

                <Input
                  label="API Key / Token"
                  type="password"
                  placeholder="••••••••••••••••"
                  value={newConn.apiKey}
                  onChange={(e) => setNewConn({ ...newConn, apiKey: e.target.value })}
                />
              </>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700"
              >
                Save Connection
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
