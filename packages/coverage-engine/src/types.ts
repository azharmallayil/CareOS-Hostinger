import type {
  Asset,
  Contract,
  CustomerAccount,
  FreeServiceEligibilityDecision,
  FreeServiceRule,
  FreeServiceRuleVersion,
  Ticket,
  Warranty,
} from "@careos/shared-types";
import type { CoverageType } from "@careos/shared-types";

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CoverageCheckParams {
  reportDate: Date;
  tenantId: string;

  // Customer context
  customerAccount: Pick<CustomerAccount, "id" | "account_type">;

  // Asset context — nullable for platform/non-asset tickets
  asset: Pick<Asset, "id" | "category" | "installation_date"> | null;
  deviceCategory?: string | null;

  // Service category from ticket
  serviceCategory: string;

  // Data fetched by the API service layer
  warranties: Warranty[];
  contracts: Contract[];
  freeServiceRules: Array<{
    rule: FreeServiceRule;
    version: FreeServiceRuleVersion;
  }>;

  /** Prior free-service ticket counts per rule (ruleId → count) */
  priorFreeServiceVisitCounts: Record<string, number>;

  /** Prior complaint count within lookback windows (for exclusion checks) */
  priorComplaintCounts: Array<{
    withinDays: number;
    count: number;
  }>;
}

// ─── Output types ─────────────────────────────────────────────────────────────

export type CoverageDecision =
  | { type: "warranty"; warrantyId: string; explanation: string }
  | { type: "contract"; contractId: string; explanation: string }
  | {
      type: "free";
      ruleId: string;
      ruleVersionId: string;
      explanation: string;
      requiresApproval: false;
      approverRole: null;
    }
  | {
      type: "pending_review";
      ruleId: string;
      ruleVersionId: string;
      explanation: string;
      requiresApproval: true;
      approverRole: string;
      approverUserId: string | null;
    }
  | { type: "paid"; explanation: string }
  | { type: "ambiguous"; explanation: string; candidates: string[] };

export interface CoverageResult {
  coverageType: CoverageType;
  decision: CoverageDecision;
  ambiguous: boolean;
  eligibilityDecision: Omit<
    FreeServiceEligibilityDecision,
    "id" | "tenant_id" | "ticket_id" | "evaluated_at"
  > | null;
}
