export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType: string;
}

export interface EmailParams {
  to: string | string[];
  subject: string;
  htmlBody: string;
  textBody: string;
  fromName?: string;
  fromAddress?: string;
  attachments?: EmailAttachment[];
  tenantId: string;
}

export interface EmailResult {
  messageId: string;
}

export interface EmailConnector {
  send(params: EmailParams): Promise<EmailResult>;
}

class ConsoleEmailConnector implements EmailConnector {
  async send(params: EmailParams): Promise<EmailResult> {
    console.log(`[EMAIL → ${Array.isArray(params.to) ? params.to.join(",") : params.to}] ${params.subject}`);
    return { messageId: `console-${Date.now()}` };
  }
}

class ResendEmailConnector implements EmailConnector {
  async send(_params: EmailParams): Promise<EmailResult> {
    throw new Error("Resend email connector not yet implemented. See Step 13.");
  }
}

export function createEmailConnector(provider?: string): EmailConnector {
  const p = provider ?? process.env["EMAIL_PROVIDER"] ?? "console";
  switch (p) {
    case "resend":
      return new ResendEmailConnector();
    case "console":
    default:
      return new ConsoleEmailConnector();
  }
}
