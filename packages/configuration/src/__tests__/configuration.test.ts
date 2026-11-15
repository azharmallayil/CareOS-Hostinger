import { describe, it, expect } from "vitest";
import { parseApiEnv, parseWorkerEnv } from "../index.js";

describe("@careos/configuration", () => {
  it("validates API environment variables correctly", () => {
    const validEnv = {
      NODE_ENV: "test",
      PORT: "3000",
      HOST: "0.0.0.0",
      SUPABASE_URL: "https://vbckrirksziluvwqpamx.supabase.co",
      SUPABASE_ANON_KEY: "test-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      SUPABASE_JWT_SECRET: "test-jwt-secret-at-least-32-chars-long",
      COOKIE_SECRET: "test-cookie-secret-at-least-32-chars",
      JWT_SECRET: "test-internal-jwt-secret-at-least-32",
    };

    const parsed = parseApiEnv(validEnv);
    expect(parsed.PORT).toBe(3000);
    expect(parsed.HOST).toBe("0.0.0.0");
    expect(parsed.SUPABASE_URL).toBe("https://vbckrirksziluvwqpamx.supabase.co");
  });

  it("validates Worker environment variables correctly without requiring Redis", () => {
    const validEnv = {
      NODE_ENV: "test",
      SUPABASE_URL: "https://vbckrirksziluvwqpamx.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      POLL_INTERVAL_MS: "3000",
      LEASE_DURATION_SECONDS: "60",
      WORKER_CONCURRENCY: "3",
    };

    const parsed = parseWorkerEnv(validEnv);
    expect(parsed.POLL_INTERVAL_MS).toBe(3000);
    expect(parsed.LEASE_DURATION_SECONDS).toBe(60);
    expect(parsed.WORKER_CONCURRENCY).toBe(3);
  });
});
