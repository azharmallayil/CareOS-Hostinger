import { describe, it, expect } from "vitest";
import { can, canTransition, isValidTransition } from "../index.js";

describe("permissions", () => {
  describe("can()", () => {
    it("allows tenant_admin full operations permissions", () => {
      expect(can("tenant_admin", "ticket:create")).toBe(true);
      expect(can("tenant_admin", "ticket:transition_status")).toBe(true);
      expect(can("tenant_admin", "tenant:update_settings")).toBe(true);
      expect(can("tenant_admin", "bulk_request:create")).toBe(true);
    });

    it("restricts dispatcher from billing and settings actions", () => {
      expect(can("dispatcher", "work_order:assign_technician")).toBe(true);
      expect(can("dispatcher", "ticket:read")).toBe(true);
      expect(can("dispatcher", "tenant:update_settings")).toBe(false);
      expect(can("dispatcher", "quotation:create")).toBe(false);
    });

    it("restricts CSR from assigning technicians or changing settings", () => {
      expect(can("csr", "ticket:create")).toBe(true);
      expect(can("csr", "complaint:create")).toBe(true);
      expect(can("csr", "work_order:assign_technician")).toBe(false);
    });

    it("allows customer only customer-facing actions", () => {
      expect(can("customer_individual", "ticket:create")).toBe(true);
      expect(can("customer_individual", "quotation:approve")).toBe(true);
      expect(can("customer_individual", "work_order:assign_technician")).toBe(false);
      expect(can("customer_individual", "audit_log:read")).toBe(false);
    });
  });

  describe("canTransition()", () => {
    it("validates state machine transitions", () => {
      expect(isValidTransition("draft", "open")).toBe(true);
      expect(isValidTransition("open", "resolved")).toBe(false); // must go through lifecycle
      expect(isValidTransition("open", "triaged")).toBe(true);
      expect(isValidTransition("scheduled", "in_progress")).toBe(true);
    });

    it("enforces role-based transition access", () => {
      // CSR can move open -> triaged
      expect(canTransition("csr", "open", "triaged")).toBe(true);

      // CSR cannot move scheduled -> in_progress (technician or dispatcher role)
      expect(canTransition("csr", "scheduled", "in_progress")).toBe(false);
      expect(canTransition("technician", "scheduled", "in_progress")).toBe(true);

      // Customer can submit draft -> open
      expect(canTransition("customer_individual", "draft", "open")).toBe(true);

      // Only tenant_admin can force re-open from closed
      expect(canTransition("tenant_admin", "closed", "open")).toBe(true);
      expect(canTransition("csr", "closed", "open")).toBe(false);
    });
  });
});
