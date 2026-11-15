import { describe, it, expect } from "vitest";
import { determineCoverage } from "../index.js";
import type { CoverageCheckParams } from "../types.js";
import type { Warranty, Contract, FreeServiceRule, FreeServiceRuleVersion } from "@careos/shared-types";

describe("coverage-engine", () => {
  const baseParams: CoverageCheckParams = {
    reportDate: new Date("2026-06-01T10:00:00Z"),
    tenantId: "tenant-uuid-1",
    customerAccount: {
      id: "cust-uuid-1",
      account_type: "individual",
    },
    asset: {
      id: "asset-uuid-1",
      category: "hvac",
      installation_date: "2026-01-01",
    },
    deviceCategory: null,
    serviceCategory: "cooling_failure",
    warranties: [],
    contracts: [],
    freeServiceRules: [],
    priorFreeServiceVisitCounts: {},
    priorComplaintCounts: [],
  };

  it("identifies active warranty coverage (Phase 1)", () => {
    const warranty: Warranty = {
      id: "war-1",
      tenant_id: "tenant-uuid-1",
      asset_id: "asset-uuid-1",
      warranty_type: "manufacturer",
      provider: "Carrier",
      starts_at: "2026-01-01",
      expires_at: "2027-01-01",
      covers_parts: true,
      covers_labour: true,
      status: "active",
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };

    const result = determineCoverage({
      ...baseParams,
      warranties: [warranty],
    });

    expect(result.coverageType).toBe("warranty");
    expect(result.decision.type).toBe("warranty");
    expect(result.ambiguous).toBe(false);
  });

  it("identifies active contract coverage (Phase 2)", () => {
    const contract: Contract = {
      id: "con-1",
      tenant_id: "tenant-uuid-1",
      customer_account_id: "cust-uuid-1",
      contract_number: "CTR-001",
      name: "Annual Care HVAC",
      covers_categories: ["hvac"],
      includes_parts: true,
      includes_labour: true,
      starts_at: "2026-01-01",
      expires_at: "2026-12-31",
      status: "active",
      terms: {},
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };

    const result = determineCoverage({
      ...baseParams,
      contracts: [contract],
    });

    expect(result.coverageType).toBe("contract");
    expect(result.decision.type).toBe("contract");
  });

  it("evaluates free-service rule without approval (Phase 3)", () => {
    const rule: FreeServiceRule = {
      id: "rule-1",
      tenant_id: "tenant-uuid-1",
      name: "New Install Free Visit",
      is_enabled: true,
      priority: 10,
      created_by: "user-1",
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };

    const version: FreeServiceRuleVersion = {
      id: "ver-1",
      rule_id: "rule-1",
      tenant_id: "tenant-uuid-1",
      version_number: 1,
      eligible_account_types: ["individual"],
      eligible_asset_categories: ["hvac"],
      effective_from: "2026-01-01",
      max_visits_per_asset: 1,
      covers_labour: true,
      covers_parts: false,
      covers_travel_charge: false,
      requires_approval: false,
      exclusions: [],
      conditions: [{ type: "within_days_of_installation", value: 180 }],
      status: "approved",
      authored_by: "user-1",
      created_at: "2026-01-01",
    };

    const result = determineCoverage({
      ...baseParams,
      freeServiceRules: [{ rule, version }],
    });

    expect(result.coverageType).toBe("free");
    expect(result.decision.type).toBe("free");
    expect(result.eligibilityDecision?.is_eligible).toBe(true);
    expect(result.eligibilityDecision?.requires_approval).toBe(false);
  });

  it("routes to pending_review when free-service rule requires human approval", () => {
    const rule: FreeServiceRule = {
      id: "rule-2",
      tenant_id: "tenant-uuid-1",
      name: "Commercial Goodwill Inspection",
      is_enabled: true,
      priority: 10,
      created_by: "user-1",
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };

    const version: FreeServiceRuleVersion = {
      id: "ver-2",
      rule_id: "rule-2",
      tenant_id: "tenant-uuid-1",
      version_number: 1,
      eligible_account_types: ["individual"],
      eligible_asset_categories: ["hvac"],
      effective_from: "2026-01-01",
      requires_approval: true,
      approver_role: "tenant_manager",
      covers_labour: true,
      covers_parts: false,
      covers_travel_charge: false,
      exclusions: [],
      conditions: [],
      status: "approved",
      authored_by: "user-1",
      created_at: "2026-01-01",
    };

    const result = determineCoverage({
      ...baseParams,
      freeServiceRules: [{ rule, version }],
    });

    expect(result.coverageType).toBe("pending_review");
    expect(result.decision.type).toBe("pending_review");
    if (result.decision.type === "pending_review") {
      expect(result.decision.requiresApproval).toBe(true);
      expect(result.decision.approverRole).toBe("tenant_manager");
    }
  });

  it("defaults to paid when no coverage applies (Phase 4)", () => {
    const result = determineCoverage(baseParams);
    expect(result.coverageType).toBe("paid");
    expect(result.decision.type).toBe("paid");
  });

  it("handles platform tickets without asset (Phase 5)", () => {
    const platformParams: CoverageCheckParams = {
      ...baseParams,
      asset: null,
    };
    const result = determineCoverage(platformParams);
    expect(result.coverageType).toBe("paid");
  });
});
