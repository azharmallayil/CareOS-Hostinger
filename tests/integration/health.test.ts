import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../apps/api/src/app.js";

describe("API Health Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await buildApp(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/health returns 200 OK with service info", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("careos-api");
  });

  it("GET /api/v1/ping returns 200 with pong", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/ping",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pong).toBe(true);
  });
});
