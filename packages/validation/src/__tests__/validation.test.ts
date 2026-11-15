import { describe, it, expect } from "vitest";
import { UuidSchema, PaginationQuerySchema, ReferenceNumberSchema } from "../index.js";

describe("@careos/validation", () => {
  it("validates valid UUIDs", () => {
    const valid = "123e4567-e89b-12d3-a456-426614174000";
    expect(UuidSchema.safeParse(valid).success).toBe(true);
    expect(UuidSchema.safeParse("not-a-uuid").success).toBe(false);
  });

  it("parses and coerces pagination query params", () => {
    const parsed = PaginationQuerySchema.parse({ page: "2", pageSize: "50" });
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(50);
  });

  it("validates reference numbers", () => {
    expect(ReferenceNumberSchema.safeParse("ACE-TKT-202611-00001").success).toBe(true);
    expect(ReferenceNumberSchema.safeParse("invalid-format").success).toBe(false);
  });
});
