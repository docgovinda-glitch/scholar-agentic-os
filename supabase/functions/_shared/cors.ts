// Shared CORS handling for Edge Functions invoked via supabase.functions.invoke()
// (i.e. a real cross-origin fetch() from the browser) — as opposed to functions
// like approve-registration, which are only ever reached via a direct browser
// navigation (an email link click) and are never subject to CORS at all, so they
// don't need this.
//
// Root cause this fixes (diagnosed 2026-07-22): neither send-approval-email nor
// request-profile-update had any method check before calling `await req.json()`.
// A CORS preflight OPTIONS request has no body, so req.json() threw a SyntaxError
// on every preflight — surfaced by Supabase's edge runtime as a bare 500
// EDGE_FUNCTION_ERROR, with no application-level error message at all. Even the
// real POST response never carried an Access-Control-Allow-Origin header, so a
// real browser would have blocked reading it even had the preflight succeeded.
// This is why a direct curl POST (which never triggers a preflight, unlike a
// real browser fetch()) looked completely fine the whole time — the bug is
// invisible to anything that doesn't go through an actual browser-enforced
// CORS preflight, which is also why it slipped past this project's Vitest/tsc
// checks (supabase/functions is a separate Deno runtime, deliberately excluded
// from both — see tsconfig.json and .claude/HANDOVER.md).

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Call at the top of every Deno.serve handler invoked via
 * supabase.functions.invoke(). Returns a response to send immediately for a
 * preflight request, or null if the caller should continue handling the real
 * request — and MUST do so before any `await req.json()` call, since an
 * OPTIONS request's empty body is exactly what made this crash in the first
 * place.
 */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}
