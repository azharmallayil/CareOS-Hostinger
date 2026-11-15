import { z } from "zod";

// @careos/configuration
// Environment variable validation for all apps.
// Each app imports and calls parseEnv(process.env) at startup.
// If required vars are missing, the process exits with a clear error message.

/** Shared env vars required by both API and Worker. */
const SharedEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

/** API-specific env vars (Fastify on Hostinger managed Node.js). */
const ApiEnvSchema = SharedEnvSchema.extend({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default("0.0.0.0"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  COOKIE_SECRET: z.string().min(32),
  JWT_SECRET: z.string().min(32),
  SUPABASE_JWT_SECRET: z.string().min(32),
  SUPABASE_ANON_KEY: z.string().min(1),
  WEB_DIST_PATH: z.string().optional(),
});

/** Worker-specific env vars (OCI ARM64 background processor). */
const WorkerEnvSchema = SharedEnvSchema.extend({
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(5),
  POLL_INTERVAL_MS: z.coerce.number().int().min(500).default(3000),
  LEASE_DURATION_SECONDS: z.coerce.number().int().min(10).default(60),
  SMS_PROVIDER: z.enum(["console", "twilio"]).default("console"),
  EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
  PAYMENT_PROVIDER: z.enum(["none", "stripe"]).default("none"),
  ERP_PROVIDER: z.enum(["none", "generic-rest"]).default("none"),
});

export type SharedEnv = z.infer<typeof SharedEnvSchema>;
export type ApiEnv = z.infer<typeof ApiEnvSchema>;
export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

export function parseApiEnv(env: NodeJS.ProcessEnv): ApiEnv {
  const result = ApiEnvSchema.safeParse(env);
  if (!result.success) {
    console.error("❌  Missing or invalid environment variables:");
    for (const issue of result.error.issues) {
      console.error(`   ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

export function parseWorkerEnv(env: NodeJS.ProcessEnv): WorkerEnv {
  const result = WorkerEnvSchema.safeParse(env);
  if (!result.success) {
    console.error("❌  Missing or invalid environment variables:");
    for (const issue of result.error.issues) {
      console.error(`   ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}
