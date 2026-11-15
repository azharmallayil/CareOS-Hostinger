import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/health", async (_req, reply) => {
    return reply.status(200).send({
      status: "ok",
      service: "careos-api",
      timestamp: new Date().toISOString(),
      version: process.env["npm_package_version"] ?? "0.1.0",
    });
  });

  app.get("/api/v1/ping", async (_req, reply) => {
    return reply.status(200).send({ pong: true });
  });
};
