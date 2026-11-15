import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  // Pure-function packages — no DOM, no network
  {
    test: {
      name: "packages",
      include: ["packages/*/src/**/*.test.ts", "tests/unit/**/*.test.ts"],
      environment: "node",
    },
  },
  // API integration tests
  {
    test: {
      name: "api",
      include: ["tests/integration/**/*.test.ts"],
      environment: "node",
      globalSetup: ["tests/integration/setup.ts"],
    },
  },
]);
