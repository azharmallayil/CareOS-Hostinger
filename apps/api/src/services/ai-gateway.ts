import type { createAdminClient } from "@careos/supabase-client";

type AdminClientType = ReturnType<typeof createAdminClient>;

export type AiProviderType = "deterministic_fallback" | "gemini_free" | "ollama_local" | "mock";

export interface AiGatewayOptions {
  provider?: AiProviderType | undefined;
  portalMode: "customer" | "internal";
  tenantId: string;
  userId: string;
  userEmail?: string | undefined;
  contextEntityType?: ("ticket" | "asset" | "quotation" | "general") | undefined;
  contextEntityId?: string | undefined;
}

export interface AiGatewayResponse {
  reply: string;
  citations: Array<{ id: string; title: string; category: string; slug: string }>;
  providerUsed: string;
  requiresHumanApproval: boolean;
  actionRequested?: string | undefined;
}

// Prompt Injection Defense Patterns
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /system\s+prompt/i,
  /override\s+(all\s+)?rules/i,
  /you\s+are\s+now\s+in\s+developer\s+mode/i,
  /reveal\s+(api\s+key|secret|internal\s+notes|password|database)/i,
  /disregard\s+safety/i,
  /act\s+as\s+(an?\s+)?admin(istrator)?/i,
];

// Consequential Actions that MUST require human approval
const CONSEQUENTIAL_ACTION_PATTERNS = [
  { pattern: /approve\s+(the\s+)?warranty/i, action: "warranty_approval" },
  { pattern: /waive\s+(the\s+)?(fee|payment|charge|amount)/i, action: "payment_waiver" },
  { pattern: /dispatch\s+(a\s+)?technician\s+immediately/i, action: "forced_dispatch" },
  { pattern: /(close|resolve|cancel)\s+(the\s+)?(ticket|complaint)/i, action: "status_closure" },
  { pattern: /modify\s+(the\s+)?(stock|inventory|price|cost)/i, action: "inventory_adjustment" },
];

export class CareOSAiGateway {
  private provider: AiProviderType;

  constructor(provider?: AiProviderType) {
    this.provider =
      provider ||
      (process.env["AI_PROVIDER"] as AiProviderType) ||
      (process.env["GEMINI_API_KEY"] ? "gemini_free" : "deterministic_fallback");
  }

  /**
   * Sanitizes input and detects malicious prompt injections.
   */
  public detectPromptInjection(input: string): boolean {
    if (!input || typeof input !== "string") return false;
    return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(input));
  }

  /**
   * Detects if the prompt attempts to trigger an unauthorized consequential action.
   */
  public detectConsequentialAction(input: string): { isConsequential: boolean; action?: string } {
    for (const item of CONSEQUENTIAL_ACTION_PATTERNS) {
      if (item.pattern.test(input)) {
        return { isConsequential: true, action: item.action };
      }
    }
    return { isConsequential: false };
  }

  /**
   * Main chat invocation method.
   */
  public async generateResponse(
    userMessage: string,
    options: AiGatewayOptions,
    dbClient: AdminClientType | null
  ): Promise<AiGatewayResponse> {
    const trimmed = userMessage.trim();

    // 1. Prompt Injection Gate
    if (this.detectPromptInjection(trimmed)) {
      return {
        reply:
          "I detected instructions attempting to override system security boundaries. CareOS Assist operates strictly within authorized tenant safety guidelines.",
        citations: [],
        providerUsed: "security_guard",
        requiresHumanApproval: false,
      };
    }

    // 2. Consequential Action Safety Gate
    const actionCheck = this.detectConsequentialAction(trimmed);
    if (actionCheck.isConsequential) {
      return {
        reply:
          `CareOS Assist cannot execute consequential approvals or status modifications automatically (${actionCheck.action}). ` +
          "This action requires review and sign-off by an authorized operations supervisor. I have created an escalation placeholder for manual review.",
        citations: [],
        providerUsed: "consequential_safety_guard",
        requiresHumanApproval: true,
        actionRequested: actionCheck.action,
      };
    }

    // 3. Retrieve relevant tenant-scoped knowledge articles
    const citations: AiGatewayResponse["citations"] = [];
    let knowledgeContext = "";

    if (dbClient) {
      let query = dbClient
        .from("knowledge_articles")
        .select("id, title, category, slug, content, summary, target_audience")
        .eq("tenant_id", options.tenantId)
        .eq("is_published", true);

      // Customer mode NEVER retrieves internal articles
      if (options.portalMode === "customer") {
        query = query.in("target_audience", ["customer", "all"]);
      }

      const { data: articles } = await query.limit(5);

      if (articles && articles.length > 0) {
        // Keyword relevance matching
        const words = trimmed.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        const matchingArticles = articles.filter((art: any) => {
          const text = `${art.title} ${art.summary || ""} ${art.category}`.toLowerCase();
          return words.some((w) => text.includes(w));
        });

        const selected = matchingArticles.length > 0 ? matchingArticles : articles.slice(0, 2);
        for (const art of selected) {
          citations.push({
            id: art.id,
            title: art.title,
            category: art.category,
            slug: art.slug,
          });
          knowledgeContext += `\n[Article: ${art.title} (${art.category})]:\n${art.summary || art.content.slice(0, 300)}...\n`;
        }
      }
    }

    // 4. Dispatch to selected provider (defaults to deterministic fallback)
    if (this.provider === "gemini_free" && process.env["GEMINI_API_KEY"]) {
      try {
        return await this.callGeminiApi(trimmed, knowledgeContext, citations, options);
      } catch (err) {
        console.warn("Gemini API call failed, falling back to deterministic engine:", err);
      }
    }

    // 5. Deterministic Fallback Engine
    return this.executeDeterministicFallback(trimmed, knowledgeContext, citations, options, dbClient);
  }

  /**
   * Deterministic Rule-Based Fallback Engine (Zero cost, offline/standalone, always reliable).
   */
  private async executeDeterministicFallback(
    message: string,
    knowledgeContext: string,
    citations: AiGatewayResponse["citations"],
    options: AiGatewayOptions,
    dbClient: AdminClientType | null
  ): Promise<AiGatewayResponse> {
    const lower = message.toLowerCase();

    // Contextual Ticket Lookup
    const ticketMatch = message.match(/TKT-\d{4}-\d{4,6}/i);
    if (ticketMatch && dbClient) {
      const ticketNum = ticketMatch[0].toUpperCase();
      const { data: ticket } = await dbClient
        .from("tickets")
        .select("id, ticket_number, title, status, priority, created_at")
        .eq("tenant_id", options.tenantId)
        .eq("ticket_number", ticketNum)
        .single();

      if (ticket) {
        const reply =
          `Ticket **${ticket.ticket_number}** ("${ticket.title}") is currently **${ticket.status.replace(/_/g, " ").toUpperCase()}**. ` +
          `It was created on ${new Date(ticket.created_at).toLocaleDateString()} with **${ticket.priority}** priority. ` +
          "Our operational team is actively managing this request according to your service level agreement.";
        return {
          reply,
          citations,
          providerUsed: "deterministic_fallback",
          requiresHumanApproval: false,
        };
      }
    }

    // Warranty & Coverage Inquiries
    if (lower.includes("warranty") || lower.includes("coverage")) {
      const reply =
        "Under CareOS service governance, telematics equipment is covered under distinct service tracks:\n" +
        "1. **Warranty:** Active hardware warranties cover manufacturer defects, sensor failures, and component replacements without labour charges.\n" +
        "2. **Service Contract:** SLA contract entitlements provide routine maintenance visits and parts discounts.\n" +
        "3. **Paid Service:** Quotations are presented upfront with itemized parts, labour, and 15% VAT for customer sign-off prior to dispatch.\n\n" +
        "Would you like me to draft an inspection request for your vehicle?";
      return {
        reply,
        citations,
        providerUsed: "deterministic_fallback",
        requiresHumanApproval: false,
      };
    }

    // Camera / MDVR Troubleshooting Inquiries
    if (lower.includes("camera") || lower.includes("mdvr") || lower.includes("video") || lower.includes("offline")) {
      const reply =
        "Here are the approved troubleshooting steps for telematics cameras and MDVR units:\n" +
        "1. **Check Power:** Verify the green LED on the MDVR main unit. Ensure the 12V ignition lead is securely connected.\n" +
        "2. **Check Aviation Cable:** Inspect the 4-pin aviation connector from the camera to the MDVR channel. Ensure the screw collar is tight.\n" +
        "3. **Power Cycle:** Turn vehicle ignition off for 30 seconds, then restart to re-initialize camera video sync.\n" +
        "4. **Lens Check:** Ensure the front/IR camera lens is free of dust, condensation, or obstruction.\n\n" +
        "If video signal does not restore, an authorized field technician visit can be scheduled.";
      return {
        reply,
        citations,
        providerUsed: "deterministic_fallback",
        requiresHumanApproval: false,
      };
    }

    // Fallback general guidance with knowledge context
    let reply =
      options.portalMode === "customer"
        ? "Hello! I am CareOS Assist. I can help explain your ticket status, equipment warranty, quotations, and approved troubleshooting steps for your fleet telematics."
        : "CareOS Assist (Internal Operations Mode). I can assist with ticket summaries, equipment troubleshooting manuals, and SLA escalation tracking.";

    if (citations.length > 0) {
      reply += `\n\nI found relevant information in our knowledge base: **${citations.map((c) => c.title).join(", ")}**.`;
    }

    return {
      reply,
      citations,
      providerUsed: "deterministic_fallback",
      requiresHumanApproval: false,
    };
  }

  /**
   * Gemini API integration adapter.
   */
  private async callGeminiApi(
    userMessage: string,
    knowledgeContext: string,
    citations: AiGatewayResponse["citations"],
    options: AiGatewayOptions
  ): Promise<AiGatewayResponse> {
    const apiKey = process.env["GEMINI_API_KEY"];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const systemPrompt =
      options.portalMode === "customer"
        ? "You are CareOS Assist, an enterprise fleet telematics support AI for customer users. " +
          "Strict safety rules: Never disclose internal technician notes, margins, costs, or secrets. " +
          "Never execute or approve warranty, payments, dispatch, or ticket closures. All consequential actions require human authorization. " +
          "Base your answers on the provided knowledge context:"
        : "You are CareOS Assist in Internal Operations Mode. Assist operators with ticket summaries, technical diagnostics, and SLA reviews. " +
          "Never approve consequential actions automatically.";

    const promptText = `${systemPrompt}\n\nContext:\n${knowledgeContext}\n\nUser Question:\n${userMessage}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      throw new Error(`Gemini API returned HTTP ${res.status}`);
    }

    const json = (await res.json()) as any;
    const replyText = json.candidates?.[0]?.content?.parts?.[0]?.text || "Response generated.";

    return {
      reply: replyText,
      citations,
      providerUsed: "gemini_free",
      requiresHumanApproval: false,
    };
  }
}
