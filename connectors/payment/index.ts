export interface PaymentIntentParams {
  amount: number; // smallest currency unit (fils/piastres/cents)
  currency: string; // ISO 4217
  invoiceId: string;
  customerEmail: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntentResult {
  intentId: string;
  clientSecret: string;
}

export interface RefundParams {
  paymentId: string;
  amount?: number;
  reason: string;
}

export interface PaymentConnector {
  createPaymentIntent(params: PaymentIntentParams): Promise<PaymentIntentResult>;
  capturePayment(intentId: string): Promise<{ status: "succeeded" | "failed" }>;
  refund(params: RefundParams): Promise<{ refundId: string }>;
  verifyWebhookSignature(payload: Buffer, signature: string, secret: string): boolean;
}

class StripePaymentConnector implements PaymentConnector {
  async createPaymentIntent(_params: PaymentIntentParams): Promise<PaymentIntentResult> {
    throw new Error("Stripe connector not yet implemented. See Step 8.");
  }
  async capturePayment(_intentId: string): Promise<{ status: "succeeded" | "failed" }> {
    throw new Error("Stripe connector not yet implemented. See Step 8.");
  }
  async refund(_params: RefundParams): Promise<{ refundId: string }> {
    throw new Error("Stripe connector not yet implemented. See Step 8.");
  }
  verifyWebhookSignature(_payload: Buffer, _sig: string, _secret: string): boolean {
    throw new Error("Stripe connector not yet implemented. See Step 8.");
  }
}

export function createPaymentConnector(provider?: string): PaymentConnector {
  const p = provider ?? process.env["PAYMENT_PROVIDER"] ?? "stripe";
  switch (p) {
    case "stripe":
    default:
      return new StripePaymentConnector();
  }
}
