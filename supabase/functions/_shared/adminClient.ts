// Service-role Supabase client for Edge Functions only. Never import this
// pattern client-side — SUPABASE_SERVICE_ROLE_KEY bypasses Row Level
// Security entirely, which is exactly why approving another user's account
// (setting is_approved / updating their password) has to happen here and
// not from src/services/supabaseAuthService.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function createAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in this function's environment.");
  }
  return createClient(url, serviceRoleKey);
}

// Configurable via `supabase secrets set ADMIN_EMAIL=...` — see DEPLOYMENT_README.md §1.
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "";
export { ADMIN_EMAIL };
