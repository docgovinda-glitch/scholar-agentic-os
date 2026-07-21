/**
 * Supabase client singleton — Phase 1 hosting migration
 * (docs/planning/hosting-and-topology.md).
 *
 * Client-side only: uses the anon key, which is safe to expose in the
 * bundle by design — Row Level Security (supabase/schema.sql) is what
 * actually governs access, not secrecy of this key. The service_role key
 * (used by supabase/functions/* and scripts/migrate-users-to-supabase.mjs)
 * must never appear here or anywhere client-side.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

let client: SupabaseClient | null = null;

/**
 * Returns the shared Supabase client. Throws a clear, actionable error if
 * VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY aren't set, rather than failing
 * deep inside an unrelated call with an opaque network error (DEPLOY-4's
 * re-scoped "fail fast on missing config", applied client-side per
 * hosting-and-topology.md §6 since there's no server startup to check at).
 */
export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY " +
        "(see .env.example). Create a free project at https://supabase.com and run " +
        "supabase/schema.sql in its SQL Editor first."
    );
  }
  if (!client) {
    client = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string);
  }
  return client;
}
