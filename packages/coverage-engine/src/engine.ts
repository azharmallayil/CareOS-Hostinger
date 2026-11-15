import type { CoverageCheckParams, CoverageDecision, CoverageResult } from "./types.js";
import type { FreeServiceRuleVersion } from "@careos/shared-types";
import { addDays } from "@careos/shared-utils";

// ─── Phase 1: Warranty ────────────────────────────────────────────────────────

function checkWarranty(params: CoverageCheckParams): CoverageDecision | null {
  if (!params.asset) return null;

  const active = params.warranties.filter((w) => {
    const start = new Date(w.starts_at);
    const end = new Date(w.expires_at);
    return w.status === "active" && start <= params.reportDate && end >= params.reportDate;
  });

  if (active.length === 0) return null;
  if (active.length > 1) {
    return {
      type: "ambiguous",
      explanation: `Multiple active warranties found for asset ${params.asset.id}. CSR review required.`,
      candidates: active.map((w) => w.id),
    };
  }
  const w = active[0]!;
  return {
    type: "warranty",
    warrantyId: w.id,
    explanation: `Asset is covered by ${w.warranty_type} warranty from ${w.provider} (expires ${w.expires_at}).`,
  };
}

// ─── Phase 2: Contract ────────────────────────────────────────────────────────

function checkContract(params: CoverageCheckParams): CoverageDecision | null {
  const active = params.contracts.filter((c) => {
    const start = new Date(c.starts_at);
    const end = new Date(c.expires_at);
    const coversCategory =
      !params.asset || c.covers_categories.includes(params.asset.category);
    return (
      c.status === "active" &&
      start <= params.reportDate &&
      end >= params.reportDate &&
      coversCategory
    );
  });

  if (active.length === 0) return null;
  if (active.length > 1) {
    return {
      type: "ambiguous",
      explanation: `Multiple active contracts match this asset category. CSR review required.`,
      candidates: active.map((c) => c.id),
    };
  }
  const c = active[0]!;
  return {
    type: "contract",
    contractId: c.id,
    explanation: `Covered by service contract "${c.name}" (expires ${c.expires_at}).`,
  };
}

// ─── Phase 3: Free-service rule evaluation ────────────────────────────────────

function checkExclusions(
  version: FreeServiceRuleVersion,
  params: CoverageCheckParams
): string | null {
  for (const excl of version.exclusions) {
    if (excl.type === "prior_complaint_within_days") {
      const days = excl.value;
      const count = params.priorComplaintCounts.find((c) => c.withinDays === days)?.count ?? 0;
      if (count > 0) {
        return `Excluded: ${count} complaint(s) raised within the last ${days} days.`;
      }
    }
    if (excl.type === "asset_age_exceeds_years" && params.asset?.installation_date) {
      const ageMs =
        params.reportDate.getTime() - new Date(params.asset.installation_date).getTime();
      const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365.25);
      if (ageYears > excl.value) {
        return `Excluded: asset age (${ageYears.toFixed(1)} yrs) exceeds rule limit of ${excl.value} yrs.`;
      }
    }
  }
  return null;
}

function checkConditions(
  version: FreeServiceRuleVersion,
  params: CoverageCheckParams
): string | null {
  for (const cond of version.conditions) {
    if (cond.type === "within_days_of_installation") {
      if (!params.asset?.installation_date) {
        return `Condition not met: installation date unknown for asset.`;
      }
      const cutoff = addDays(new Date(params.asset.installation_date), cond.value ?? 0);
      if (params.reportDate > cutoff) {
        return `Condition not met: service request is outside the ${cond.value}-day post-installation window.`;
      }
    }
    if (cond.type === "first_service_only") {
      const prior = params.priorFreeServiceVisitCounts[version.rule_id] ?? 0;
      if (prior > 0) {
        return `Condition not met: free service has already been used for this rule.`;
      }
    }
  }
  return null;
}

function evaluateFreeServiceRule(
  entry: { rule: { id: string; is_enabled: boolean }; version: FreeServiceRuleVersion },
  params: CoverageCheckParams
): { matches: boolean; reason: string } {
  const { rule, version } = entry;

  if (!rule.is_enabled) return { matches: false, reason: "Rule is disabled." };

  // Date window
  const from = new Date(version.effective_from);
  const until = version.effective_until ? new Date(version.effective_until) : null;
  if (params.reportDate < from) return { matches: false, reason: "Rule not yet effective." };
  if (until && params.reportDate > until) return { matches: false, reason: "Rule has expired." };

  // Account type
  if (!version.eligible_account_types.includes(params.customerAccount.account_type)) {
    return { matches: false, reason: "Account type not eligible for this rule." };
  }

  // Specific account IDs
  if (
    version.eligible_account_ids &&
    !version.eligible_account_ids.includes(params.customerAccount.id)
  ) {
    return { matches: false, reason: "Customer account not in eligibility list." };
  }

  // Asset category
  if (params.asset && version.eligible_asset_categories) {
    if (!version.eligible_asset_categories.includes(params.asset.category)) {
      return { matches: false, reason: "Asset category not covered by rule." };
    }
  }

  // Device category
  if (params.deviceCategory && version.eligible_device_categories) {
    if (!version.eligible_device_categories.includes(params.deviceCategory)) {
      return { matches: false, reason: "Device category not covered by rule." };
    }
  }

  // Service category
  if (version.eligible_service_categories) {
    if (!version.eligible_service_categories.includes(params.serviceCategory)) {
      return { matches: false, reason: "Service category not covered by rule." };
    }
  }

  // Visit limit
  if (version.max_visits_per_asset != null) {
    const prior = params.priorFreeServiceVisitCounts[rule.id] ?? 0;
    if (prior >= version.max_visits_per_asset) {
      return {
        matches: false,
        reason: `Visit limit reached (${prior}/${version.max_visits_per_asset} used).`,
      };
    }
  }

  // Exclusions
  const exclusionReason = checkExclusions(version, params);
  if (exclusionReason) return { matches: false, reason: exclusionReason };

  // Conditions
  const conditionReason = checkConditions(version, params);
  if (conditionReason) return { matches: false, reason: conditionReason };

  return { matches: true, reason: "All criteria satisfied." };
}

function checkFreeService(params: CoverageCheckParams): CoverageDecision | null {
  // Rules are pre-sorted by priority ASC (lower number = higher priority)
  for (const entry of params.freeServiceRules) {
    const { matches, reason } = evaluateFreeServiceRule(entry, params);
    if (!matches) continue;

    const { rule, version } = entry;

    if (version.requires_approval) {
      return {
        type: "pending_review",
        ruleId: rule.id,
        ruleVersionId: version.id,
        explanation: `Eligible for free service under rule "${rule.id}" but requires authorised approval. ${reason}`,
        requiresApproval: true,
        approverRole: version.approver_role ?? "tenant_manager",
        approverUserId: version.approver_user_id ?? null,
      };
    }

    return {
      type: "free",
      ruleId: rule.id,
      ruleVersionId: version.id,
      explanation: `Eligible for free service under rule "${rule.id}". ${reason}`,
      requiresApproval: false,
      approverRole: null,
    };
  }
  return null;
}

// ─── Main coverage engine ─────────────────────────────────────────────────────

/**
 * Determine service coverage for a ticket.
 *
 * This is a pure function — all data must be fetched by the API service layer
 * and passed in. No database calls are made here.
 *
 * Evaluation order: Warranty → Contract → Free Service → Paid
 */
export function determineCoverage(params: CoverageCheckParams): CoverageResult {
  // Phase 1: Warranty
  const warrantyDecision = checkWarranty(params);
  if (warrantyDecision) {
    const isAmbiguous = warrantyDecision.type === "ambiguous";
    return {
      coverageType: isAmbiguous ? "pending_review" : "warranty",
      decision: warrantyDecision,
      ambiguous: isAmbiguous,
      eligibilityDecision: null,
    };
  }

  // Phase 2: Contract
  const contractDecision = checkContract(params);
  if (contractDecision) {
    const isAmbiguous = contractDecision.type === "ambiguous";
    return {
      coverageType: isAmbiguous ? "pending_review" : "contract",
      decision: contractDecision,
      ambiguous: isAmbiguous,
      eligibilityDecision: null,
    };
  }

  // Phase 3: Free-service rules
  const freeDecision = checkFreeService(params);
  if (freeDecision) {
    const coverageType =
      freeDecision.type === "pending_review" ? "pending_review" : "free";
    return {
      coverageType,
      decision: freeDecision,
      ambiguous: false,
      eligibilityDecision: {
        rule_id: (freeDecision.type === "free" || freeDecision.type === "pending_review") ? freeDecision.ruleId : null,
        rule_version_id: (freeDecision.type === "free" || freeDecision.type === "pending_review") ? freeDecision.ruleVersionId : null,
        is_eligible: true,
        explanation: freeDecision.explanation,
        requires_approval: freeDecision.type === "pending_review",
        approved_by: null,
        approved_at: null,
        approval_notes: null,
      },
    };
  }

  // Phase 4: Paid
  return {
    coverageType: "paid",
    decision: {
      type: "paid",
      explanation: "No warranty, contract, or free-service rule matched. Standard charges apply.",
    },
    ambiguous: false,
    eligibilityDecision: {
      rule_id: null,
      rule_version_id: null,
      is_eligible: false,
      explanation: "No free-service rule matched.",
      requires_approval: false,
      approved_by: null,
      approved_at: null,
      approval_notes: null,
    },
  };
}
