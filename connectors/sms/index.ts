// SMS connector abstraction.
// The concrete implementation is selected by the SMS_PROVIDER env variable.

export interface SmsParams {
  to: string; // E.164 format
  body: string; // Max 160 chars for single SMS
  tenantId: string;
}

export interface SmsResult {
  messageId: string;
  status: "queued" | "sent";
}

export interface SmsConnector {
  send(params: SmsParams): Promise<SmsResult>;
}

// ── Console adapter (development / testing) ───────────────────────────────────
class ConsoleSmsConnector implements SmsConnector {
  async send(params: SmsParams): Promise<SmsResult> {
    console.log(`[SMS → ${params.to}] ${params.body}`);
    return { messageId: `console-${Date.now()}`, status: "sent" };
  }
}

// ── Twilio adapter (stub — implemented in Step 13) ────────────────────────────
class TwilioSmsConnector implements SmsConnector {
  async send(_params: SmsParams): Promise<SmsResult> {
    throw new Error("Twilio SMS connector not yet implemented. See Step 13.");
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────
export function createSmsConnector(provider?: string): SmsConnector {
  const p = provider ?? process.env["SMS_PROVIDER"] ?? "console";
  switch (p) {
    case "twilio":
      return new TwilioSmsConnector();
    case "console":
    default:
      return new ConsoleSmsConnector();
  }
}
