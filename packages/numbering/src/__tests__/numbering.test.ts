import { describe, it, expect } from "vitest";
import {
  formatReferenceNumber,
  isValidReferenceNumber,
  parseReferenceNumber,
  toYearMonth,
} from "../index.js";

describe("numbering", () => {
  it("formats reference numbers correctly with padding", () => {
    const formatted = formatReferenceNumber("ACE", "ticket", 2026, 1, 42);
    expect(formatted).toBe("ACE-TKT-202601-00042");

    const wo = formatReferenceNumber("CARE", "work_order", 2026, 11, 7);
    expect(wo).toBe("CARE-WO-202611-00007");

    const bsr = formatReferenceNumber("TENANT", "bulk_request", 2026, 3, 105);
    expect(bsr).toBe("TENANT-BSR-202603-00105");
  });

  it("validates reference numbers correctly", () => {
    expect(isValidReferenceNumber("ACE-TKT-202601-00042")).toBe(true);
    expect(isValidReferenceNumber("INVALID")).toBe(false);
    expect(isValidReferenceNumber("ACE-TKT-2601-42")).toBe(false);
  });

  it("parses reference numbers accurately", () => {
    const parsed = parseReferenceNumber("ACE-TKT-202601-00042");
    expect(parsed).toEqual({
      prefix: "ACE",
      suffix: "TKT",
      yearMonth: "202601",
      seq: 42,
    });
  });

  it("generates correct year_month strings", () => {
    const date = new Date(2026, 0, 15); // Jan 15, 2026
    expect(toYearMonth(date)).toBe("202601");
  });
});
