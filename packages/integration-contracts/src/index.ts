// @careos/integration-contracts
// Typed contracts for external integrations: ERP, telematics, payment, SMS, email.
// Connectors in connectors/ implement these contracts.
// The API interacts with integrations exclusively through these contracts.

export type IntegrationAuthType =
  | "none"
  | "bearer_token"
  | "api_key"
  | "hmac_signature"
  | "basic_auth";

export interface ConnectorHealth {
  connected: boolean;
  latencyMs?: number;
  version?: string;
  error?: string;
}

export interface SyncResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  externalReference?: string;
}

// ── Canonical ERP Models ──────────────────────────────────────────────────────
export interface CanonicalCustomer {
  id: string; // CareOS internal UUID
  name: string;
  accountNumber: string;
  email?: string | undefined;
  phone?: string | undefined;
  taxNumber?: string | undefined;
  billingAddress?: {
    street?: string | undefined;
    city?: string | undefined;
    postalCode?: string | undefined;
    country?: string | undefined;
  } | undefined;
}

export interface CanonicalInvoiceLineItem {
  id?: string | undefined;
  description: string;
  itemCode?: string | undefined;
  quantity: number;
  unitPrice: number;
  discountPercentage: number;
  vatRatePercentage: number;
  lineTotal: number;
}

export interface CanonicalInvoice {
  id: string; // CareOS Quotation/Invoice UUID
  invoiceNumber: string;
  customerId: string;
  customerExternalId?: string | undefined;
  ticketId?: string | undefined;
  currency: string;
  subtotal: number;
  discountAmount: number;
  vatAmount: number;
  totalAmount: number;
  issuedAt: string;
  dueAt?: string | undefined;
  items: CanonicalInvoiceLineItem[];
}

export interface CanonicalInventoryItem {
  sku: string;
  name: string;
  stockOnHand: number;
  unitCost?: number | undefined;
  warehouseCode?: string | undefined;
}

export interface ErpConnectionConfig {
  baseUrl: string;
  authType: IntegrationAuthType;
  credentials: {
    apiKey?: string;
    token?: string;
    username?: string;
    password?: string;
  };
  fieldMappings?: Record<string, string>;
  timeoutMs?: number;
}

export interface ErpConnector {
  checkConnection(config: ErpConnectionConfig): Promise<ConnectorHealth>;
  pushCustomer(
    customer: CanonicalCustomer,
    config: ErpConnectionConfig
  ): Promise<SyncResult<{ erpCustomerId: string }>>;
  pullCustomer(
    externalId: string,
    config: ErpConnectionConfig
  ): Promise<SyncResult<CanonicalCustomer>>;
  pushInvoice(
    invoice: CanonicalInvoice,
    config: ErpConnectionConfig
  ): Promise<SyncResult<{ erpInvoiceId: string; reference: string }>>;
  syncInventory(
    config: ErpConnectionConfig
  ): Promise<SyncResult<CanonicalInventoryItem[]>>;
}

// ── Canonical Telematics Models ───────────────────────────────────────────────
export type TelematicsEventType =
  | "device:online"
  | "device:offline"
  | "device:last_seen"
  | "camera:fault"
  | "mdvr:fault"
  | "alert:dms"
  | "alert:adas"
  | "alert:ivms"
  | "alert:piwas";

export interface NormalizedTelematicsEvent {
  eventType: TelematicsEventType;
  deviceId: string;
  imei?: string | undefined;
  assetId?: string | undefined;
  timestamp: string;
  sourceEventId?: string | undefined;
  location?: {
    latitude: number;
    longitude: number;
    speedKmH?: number | undefined;
    headingDeg?: number | undefined;
  } | undefined;
  telemetry?: {
    batteryVoltage?: number | undefined;
    ignitionOn?: boolean | undefined;
    odometerKm?: number | undefined;
    firmwareVersion?: string | undefined;
  } | undefined;
  faultDetails?: {
    channel?: number | undefined;
    cameraName?: string | undefined;
    errorCode?: string | undefined;
    storageStatus?: "ok" | "degraded" | "failed" | "missing" | undefined;
    description?: string | undefined;
  } | undefined;
  alertDetails?: {
    alertCategory: "dms" | "adas" | "ivms" | "piwas";
    alertSubtype: string; // e.g. "drowsiness", "lane_departure", "harsh_brake", "pedestrian_collision"
    severity: "low" | "medium" | "high" | "critical";
    confidenceScore?: number | undefined;
    snapshotUrl?: string | undefined;
  } | undefined;
  rawPayload: Record<string, unknown>;
}

export interface TelematicsConnectorConfig {
  webhookSecret?: string;
  signatureHeader?: string; // Default: 'x-careos-signature'
  debounceWindowMinutes?: number; // Routine heartbeat deduplication window
}

export interface TelematicsConnector {
  verifyWebhookSignature(
    payloadRaw: string,
    signature: string,
    secret: string
  ): boolean;
  normalizeEvent(
    rawPayload: Record<string, unknown>
  ): NormalizedTelematicsEvent | null;
  shouldDeduplicate(
    incoming: NormalizedTelematicsEvent,
    recent?: NormalizedTelematicsEvent
  ): boolean;
  requiresTicketGeneration(
    event: NormalizedTelematicsEvent
  ): { generateTicket: boolean; priority?: string; category?: string; title?: string };
}
