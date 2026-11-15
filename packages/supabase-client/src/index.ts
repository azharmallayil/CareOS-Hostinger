import { createClient } from "@supabase/supabase-js";
import { createServerClient as _createServerClient } from "@supabase/ssr";

// ─── Browser client (anon key + user JWT) ────────────────────────────────────

/**
 * Create a Supabase client for browser usage.
 * Uses the anon key; authentication is via the user's JWT session.
 */
export function createBrowserClient(supabaseUrl: string, supabaseAnonKey: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: "pkce",
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      storageKey: "careos-auth",
    },
  });
}

// ─── Server client (service role key) ────────────────────────────────────────

/**
 * Create a Supabase admin client for server-side usage (Fastify API, Worker).
 * Uses the service role key — bypasses RLS unless you explicitly set the JWT.
 * Always scope queries by setting the user JWT before querying tenant data.
 */
export function createAdminClient(supabaseUrl: string, supabaseServiceRoleKey: string) {
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Create an authenticated Supabase client for a specific user JWT.
 * This causes RLS policies to evaluate correctly for that user's context.
 */
export function createUserClient(
  supabaseUrl: string,
  supabaseAnonKey: string,
  accessToken: string
) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Re-export types from supabase-js for convenience
export type { SupabaseClient, User, Session } from "@supabase/supabase-js";
export { _createServerClient as createServerClient };
