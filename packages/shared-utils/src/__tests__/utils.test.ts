import { describe, it, expect } from "vitest";
import {
  toSlug,
  maskString,
  normalisePhone,
  buildPaginationMeta,
  calcOffset,
  isUuid,
} from "../index.js";

describe("shared-utils", () => {
  it("converts strings to slugs", () => {
    expect(toSlug("CareOS Operations Portal")).toBe("careos-operations-portal");
    expect(toSlug("  Special & Characters #123  ")).toBe("special-characters-123");
  });

  it("masks sensitive strings", () => {
    expect(maskString("my-super-secret-api-key", 4, 4)).toBe("my-s***-key");
    expect(maskString("short", 4, 4)).toBe("***");
  });

  it("normalises phone numbers to E.164", () => {
    expect(normalisePhone("0501234567", "966")).toBe("+966501234567");
    expect(normalisePhone("+966501234567")).toBe("+966501234567");
    expect(normalisePhone("00966501234567")).toBe("+966501234567");
  });

  it("calculates pagination metadata correctly", () => {
    const meta = buildPaginationMeta(2, 10, 45);
    expect(meta).toEqual({
      page: 2,
      pageSize: 10,
      totalItems: 45,
      totalPages: 5,
      hasNextPage: true,
      hasPreviousPage: true,
    });

    expect(calcOffset(2, 10)).toBe(10);
    expect(calcOffset(1, 10)).toBe(0);
  });

  it("validates UUIDs", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});
