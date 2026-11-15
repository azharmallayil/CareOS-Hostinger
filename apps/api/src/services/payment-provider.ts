// ============================================================================
// CareOS Payment Provider Abstraction
// STRICT CONSTRAINT: Do not select or claim integration with a real provider
// until owner approval. Server-side verification only via signed webhooks,
// idempotency keys, and reconciliation. Never store raw card data.
// ============================================================================

import crypto from "node:crypto";

export interface CreatePaymentIntentParams {
  tenantId: string;
  invoiceId: string;
  ticketId: string;
  amount: number;
  currency: string;
  customerEmail?: string | undefined;
  idempotencyKey?: string | undefined;
}

export interface PaymentIntentResult {
  provider: string;
  paymentIntentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
  status: "requires_payment_method" | "processing" | "succeeded";
  expiresAt: string;
}

export interface WebhookEventPayload {
  id: string;
  type: "payment.succeeded" | "payment.failed" | "payment.refunded";
  created: number;
  data: {
    paymentIntentId: string;
    invoiceId: string;
    ticketId: string;
    amount: number;
    currency: string;
    method: "card_online" | "pos_terminal" | "bank_transfer";
    providerReference: string;
  };
}

export interface PaymentProvider {
  readonly name: string;
  createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult>;
  verifyWebhookSignature(rawPayload: string, signature: string, secret: string): boolean;
  signWebhookPayload(rawPayload: string, secret: string): string;
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock_gateway";

  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult> {
    const paymentIntentId = `pi_mock_${crypto.randomBytes(12).toString("hex")}`;
    const clientSecret = `cs_mock_${crypto.randomBytes(16).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    return {
      provider: this.name,
      paymentIntentId,
      clientSecret,
      amount: params.amount,
      currency: params.currency,
      status: "requires_payment_method",
      expiresAt,
    };
  }

  signWebhookPayload(rawPayload: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(rawPayload).digest("hex");
  }

  verifyWebhookSignature(rawPayload: string, signature: string, secret: string): boolean {
    if (!signature || !secret || !rawPayload) return false;
    const expected = this.signWebhookPayload(rawPayload, secret);
    try {
      return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
    } catch {
      return false;
    }
  }
}

export const paymentProvider: PaymentProvider = new MockPaymentProvider();
