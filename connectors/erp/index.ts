import type {
  ErpConnector,
  ErpConnectionConfig,
  ConnectorHealth,
  SyncResult,
  CanonicalCustomer,
  CanonicalInvoice,
  CanonicalInvoiceLineItem,
  CanonicalInventoryItem,
} from "@careos/integration-contracts";

/**
 * Builds HTTP authorization header based on configured auth type.
 */
function buildAuthHeaders(config: ErpConnectionConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  switch (config.authType) {
    case "bearer_token":
      if (config.credentials.token) {
        headers["Authorization"] = `Bearer ${config.credentials.token}`;
      }
      break;
    case "api_key":
      if (config.credentials.apiKey) {
        headers["X-API-Key"] = config.credentials.apiKey;
      }
      break;
    case "basic_auth":
      if (config.credentials.username && config.credentials.password) {
        const token = Buffer.from(
          `${config.credentials.username}:${config.credentials.password}`
        ).toString("base64");
        headers["Authorization"] = `Basic ${token}`;
      }
      break;
    default:
      break;
  }

  return headers;
}

/**
 * Applies field mappings to transform internal schema to external ERP schema.
 */
function mapFields(
  source: Record<string, unknown>,
  mappings?: Record<string, string>
): Record<string, unknown> {
  if (!mappings || Object.keys(mappings).length === 0) {
    return source;
  }

  const result: Record<string, unknown> = { ...source };
  for (const [internalKey, externalKey] of Object.entries(mappings)) {
    if (source[internalKey] !== undefined) {
      result[externalKey] = source[internalKey];
      if (internalKey !== externalKey) {
        delete result[internalKey];
      }
    }
  }
  return result;
}

export class GenericRestErpConnector implements ErpConnector {
  async checkConnection(config: ErpConnectionConfig): Promise<ConnectorHealth> {
    // If mock/sandbox URL or test environment
    if (!config.baseUrl || config.baseUrl.includes("mock") || config.baseUrl.includes("sandbox.local")) {
      return {
        connected: true,
        version: "Generic-REST-ERP-Mock-v1.0",
        latencyMs: 15,
      };
    }

    const start = Date.now();
    try {
      const url = `${config.baseUrl.replace(/\/+$/, "")}/health`;
      const res = await fetch(url, {
        method: "GET",
        headers: buildAuthHeaders(config),
        signal: AbortSignal.timeout(config.timeoutMs ?? 5000),
      });

      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return {
          connected: false,
          latencyMs,
          error: `HTTP ${res.status}: ${res.statusText}`,
        };
      }

      return {
        connected: true,
        latencyMs,
        version: "Generic-REST-ERP-v1.0",
      };
    } catch (err: unknown) {
      return {
        connected: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async pushCustomer(
    customer: CanonicalCustomer,
    config: ErpConnectionConfig
  ): Promise<SyncResult<{ erpCustomerId: string }>> {
    // Sandbox / Mock fallback
    if (!config.baseUrl || config.baseUrl.includes("mock") || config.baseUrl.includes("sandbox.local")) {
      const generatedId = `ERP-CUST-${customer.accountNumber || customer.id.slice(0, 8)}`;
      return {
        success: true,
        data: { erpCustomerId: generatedId },
        externalReference: generatedId,
      };
    }

    try {
      const payload = mapFields(
        {
          internalId: customer.id,
          name: customer.name,
          accountNumber: customer.accountNumber,
          email: customer.email,
          phone: customer.phone,
          taxNumber: customer.taxNumber,
          billingAddress: customer.billingAddress,
        },
        config.fieldMappings
      );

      const url = `${config.baseUrl.replace(/\/+$/, "")}/api/customers`;
      const res = await fetch(url, {
        method: "POST",
        headers: buildAuthHeaders(config),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(config.timeoutMs ?? 8000),
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          success: false,
          error: `ERP push customer failed (HTTP ${res.status}): ${text}`,
        };
      }

      const json = (await res.json()) as { id?: string; customerId?: string };
      const erpCustomerId = json.id ?? json.customerId ?? `ERP-${customer.id.slice(0, 8)}`;

      return {
        success: true,
        data: { erpCustomerId },
        externalReference: erpCustomerId,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async pullCustomer(
    externalId: string,
    config: ErpConnectionConfig
  ): Promise<SyncResult<CanonicalCustomer>> {
    if (!config.baseUrl || config.baseUrl.includes("mock") || config.baseUrl.includes("sandbox.local")) {
      return {
        success: true,
        data: {
          id: "mock-internal-id",
          name: `Synced Account ${externalId}`,
          accountNumber: externalId,
          email: "billing@mock-customer.com",
        },
      };
    }

    try {
      const url = `${config.baseUrl.replace(/\/+$/, "")}/api/customers/${externalId}`;
      const res = await fetch(url, {
        method: "GET",
        headers: buildAuthHeaders(config),
        signal: AbortSignal.timeout(config.timeoutMs ?? 8000),
      });

      if (!res.ok) {
        return {
          success: false,
          error: `ERP pull customer failed (HTTP ${res.status})`,
        };
      }

      const json = (await res.json()) as Record<string, unknown>;
      return {
        success: true,
        data: {
          id: (json["internalId"] as string) ?? "",
          name: (json["name"] as string) ?? "Unknown",
          accountNumber: (json["accountNumber"] as string) ?? externalId,
          email: json["email"] as string | undefined,
          phone: json["phone"] as string | undefined,
        },
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async pushInvoice(
    invoice: CanonicalInvoice,
    config: ErpConnectionConfig
  ): Promise<SyncResult<{ erpInvoiceId: string; reference: string }>> {
    if (!config.baseUrl || config.baseUrl.includes("mock") || config.baseUrl.includes("sandbox.local")) {
      const generatedId = `ERP-INV-${invoice.invoiceNumber}`;
      return {
        success: true,
        data: {
          erpInvoiceId: generatedId,
          reference: `REF-${invoice.invoiceNumber}`,
        },
        externalReference: generatedId,
      };
    }

    try {
      const payload = mapFields(
        {
          invoiceNumber: invoice.invoiceNumber,
          customerExternalId: invoice.customerExternalId,
          currency: invoice.currency,
          subtotal: invoice.subtotal,
          discountAmount: invoice.discountAmount,
          vatAmount: invoice.vatAmount,
          totalAmount: invoice.totalAmount,
          issuedAt: invoice.issuedAt,
          lines: invoice.items.map((line: CanonicalInvoiceLineItem) => ({
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
          })),
        },
        config.fieldMappings
      );

      const url = `${config.baseUrl.replace(/\/+$/, "")}/api/invoices`;
      const res = await fetch(url, {
        method: "POST",
        headers: buildAuthHeaders(config),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(config.timeoutMs ?? 8000),
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          success: false,
          error: `ERP push invoice failed (HTTP ${res.status}): ${text}`,
        };
      }

      const json = (await res.json()) as { id?: string; referenceNumber?: string };
      const erpInvoiceId = json.id ?? `ERP-${invoice.invoiceNumber}`;
      const reference = json.referenceNumber ?? `REF-${invoice.invoiceNumber}`;

      return {
        success: true,
        data: { erpInvoiceId, reference },
        externalReference: erpInvoiceId,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async syncInventory(
    config: ErpConnectionConfig
  ): Promise<SyncResult<CanonicalInventoryItem[]>> {
    if (!config.baseUrl || config.baseUrl.includes("mock") || config.baseUrl.includes("sandbox.local")) {
      return {
        success: true,
        data: [
          { sku: "TEL-4G-MDVR-01", name: "4-Channel MDVR Unit", stockOnHand: 45, unitCost: 450 },
          { sku: "CAM-DMS-IR-02", name: "DMS Driver Fatigue IR Camera", stockOnHand: 80, unitCost: 120 },
          { sku: "CAB-EXT-5M", name: "5-Meter Aviation Cable", stockOnHand: 150, unitCost: 15 },
        ],
      };
    }

    try {
      const url = `${config.baseUrl.replace(/\/+$/, "")}/api/inventory`;
      const res = await fetch(url, {
        method: "GET",
        headers: buildAuthHeaders(config),
        signal: AbortSignal.timeout(config.timeoutMs ?? 8000),
      });

      if (!res.ok) {
        return { success: false, error: `ERP inventory sync failed (HTTP ${res.status})` };
      }

      const items = (await res.json()) as CanonicalInventoryItem[];
      return { success: true, data: items };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export function createErpConnector(_adapter = "generic_rest"): ErpConnector {
  return new GenericRestErpConnector();
}
