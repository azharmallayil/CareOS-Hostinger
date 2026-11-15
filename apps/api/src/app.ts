import type { FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import path from "node:path";
import fs from "node:fs";
import { healthRoutes } from "./routes/health.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { organizationRoutes } from "./routes/organization.js";
import { customerRoutes } from "./routes/customers.js";
import { assetRoutes } from "./routes/assets.js";
import { ticketRoutes } from "./routes/tickets.js";
import { complaintRoutes } from "./routes/complaints.js";
import { coverageRoutes } from "./routes/coverage.js";
import { quotationRoutes } from "./routes/quotations.js";
import { paymentRoutes } from "./routes/payments.js";
import { technicianRoutes } from "./routes/technicians.js";
import { dispatchRoutes } from "./routes/dispatch.js";
import { workOrderRoutes } from "./routes/work-orders.js";
import { evidenceRoutes } from "./routes/evidence.js";
import { bulkServiceRoutes } from "./routes/bulk-service.js";
import { maintenanceRoutes } from "./routes/maintenance.js";
import { rmaRoutes } from "./routes/rma.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { slaRoutes } from "./routes/sla.js";
import { serviceIntelligenceRoutes } from "./routes/service-intelligence.js";
import { integrationRoutes } from "./routes/integrations.js";
import { searchRoutes } from "./routes/search.js";
import { reportRoutes } from "./routes/reports.js";
import { knowledgeRoutes } from "./routes/knowledge.js";
import { aiRoutes } from "./routes/ai.js";

export async function buildApp(app: FastifyInstance): Promise<FastifyInstance> {
  // ── Security headers ───────────────────────────────────────────────────────
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:", "validator.swagger.io"],
      },
    },
  });

  // ── OpenAPI / Swagger Documentation ───────────────────────────────────────
  await app.register(fastifySwagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "CareOS Core API",
        description:
          "Enterprise Field Service, Fleet Telematics, Commercial Maintenance, and Support Desk API for CareOS.",
        version: "1.0.0",
        contact: {
          name: "CareOS Engineering",
          url: "https://careos.app",
        },
      },
      servers: [
        {
          url: "/",
          description: "Current environment host",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Provide the Supabase Auth JWT bearer token.",
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: "/documentation",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
    staticCSP: false,
  });

  // Direct OpenAPI 3.0 specification endpoint
  app.get("/api/v1/openapi.json", async (_req, reply) => {
    return reply.send(app.swagger());
  });

  // ── CORS ───────────────────────────────────────────────────────────────────
  const allowedOrigins = (process.env["CORS_ORIGINS"] ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim());

  await app.register(fastifyCors, {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "X-Request-ID",
    ],
    credentials: true,
  });

  // ── Cookies ────────────────────────────────────────────────────────────────
  await app.register(fastifyCookie, {
    secret: process.env["COOKIE_SECRET"] ?? "dev-secret-change-in-production",
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────
  await app.register(fastifyRateLimit, {
    max: 200,
    timeWindow: "1 minute",
    errorResponseBuilder: (_req, context) => ({
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: `Too many requests. Try again in ${String(context.after)}.`,
        retryAfter: context.after,
      },
    }),
  });

  // ── Hostinger static frontend serving (same-origin production) ────────────
  const webDistPath =
    process.env["WEB_DIST_PATH"] ??
    path.resolve(process.cwd(), "../web/dist");

  const hasStaticBuild = fs.existsSync(webDistPath);

  if (hasStaticBuild) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: "/",
      wildcard: false,
    });
  }

  // ── Authentication Plugin ──────────────────────────────────────────────────
  await app.register(authPlugin);

  // ── Routes ─────────────────────────────────────────────────────────────────
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(organizationRoutes, { prefix: "/api/v1/organization" });
  await app.register(customerRoutes, { prefix: "/api/v1/customers" });
  await app.register(assetRoutes, { prefix: "/api/v1/assets" });
  await app.register(ticketRoutes, { prefix: "/api/v1/tickets" });
  await app.register(complaintRoutes, { prefix: "/api/v1/complaints" });
  await app.register(coverageRoutes, { prefix: "/api/v1/coverage" });
  await app.register(quotationRoutes, { prefix: "/api/v1/quotations" });
  await app.register(paymentRoutes, { prefix: "/api/v1/payments" });
  await app.register(technicianRoutes, { prefix: "/api/v1/technicians" });
  await app.register(dispatchRoutes, { prefix: "/api/v1/dispatch" });
  await app.register(workOrderRoutes, { prefix: "/api/v1/work-orders" });
  await app.register(evidenceRoutes, { prefix: "/api/v1/evidence" });
  await app.register(bulkServiceRoutes, { prefix: "/api/v1/bulk-service" });
  await app.register(maintenanceRoutes, { prefix: "/api/v1/maintenance" });
  await app.register(rmaRoutes, { prefix: "/api/v1/rma" });
  await app.register(inventoryRoutes, { prefix: "/api/v1/inventory" });
  await app.register(slaRoutes, { prefix: "/api/v1/sla" });
  await app.register(serviceIntelligenceRoutes, { prefix: "/api/v1/intelligence" });
  await app.register(integrationRoutes, { prefix: "/api/v1/integrations" });
  await app.register(searchRoutes, { prefix: "/api/v1/search" });
  await app.register(reportRoutes, { prefix: "/api/v1/reports" });
  await app.register(knowledgeRoutes, { prefix: "/api/v1/knowledge" });
  await app.register(aiRoutes, { prefix: "/api/v1/ai" });

  // ── 404 handler with SPA fallback for Hostinger ────────────────────────────
  app.setNotFoundHandler((req, reply) => {
    // If client requested an API route, return 404 JSON
    if (req.url.startsWith("/api/")) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Route not found" },
      });
    }

    // Otherwise, if frontend build exists, serve index.html for SPA routing
    if (hasStaticBuild && req.method === "GET") {
      return reply.sendFile("index.html");
    }

    return reply.status(404).send({
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });

  // ── Error handler ──────────────────────────────────────────────────────────
  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode ?? 500;
    void reply.status(statusCode).send({
      error: {
        code: error.code ?? "INTERNAL_SERVER_ERROR",
        message:
          statusCode === 500 ? "An unexpected error occurred" : error.message,
      },
    });
  });

  return app;
}
