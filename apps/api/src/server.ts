import "dotenv/config";
import Fastify from "fastify";
import { buildApp } from "./app.js";

const server = Fastify({
  connectionTimeout: 15000,
  requestTimeout: 30000,
  keepAliveTimeout: 5000,
  logger: {
    level: process.env["LOG_LEVEL"] ?? "info",
    ...(process.env["NODE_ENV"] !== "production" && {
      transport: {
        target: "pino-pretty",
        options: { colorize: true },
      },
    }),
  },
  disableRequestLogging: false,
});

const start = async (): Promise<void> => {
  try {
    await buildApp(server);

    const port = parseInt(
      process.env["PORT"] ?? process.env["API_PORT"] ?? "3000",
      10
    );
    const host = process.env["HOST"] ?? process.env["API_HOST"] ?? "0.0.0.0";

    await server.listen({ port, host });
    server.log.info(`CareOS API running on ${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal: string): Promise<void> => {
  server.log.info(`Received ${signal}. Shutting down gracefully...`);
  await server.close();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

void start();
