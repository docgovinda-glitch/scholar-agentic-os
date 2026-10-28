// Invoked by src/services/supabaseAuthService.ts's requestProfileUpdate().
// Deploy: supabase functions deploy request-profile-update
//
// Security invariant (F-04 / TICKET-SEC-01):
// - This unauthenticated endpoint previously accepted any `username`, generated a
//   6-digit `verificationKey`, and returned `verificationKey` in the HTTP response body.
// - Per privacy-over-availability lockdown (F-04), this endpoint is disabled and
//   returns HTTP 410 Gone with a clear user-facing message until authenticated
//   re-verification is implemented in TICKET-SEC-01.
// - NEVER generate or return `verificationKey` in any HTTP response body.
// - If RESEND_API_KEY / ADMIN_EMAIL is unconfigured, fail closed with HTTP 503.

import { ADMIN_EMAIL } from "../_shared/adminClient.ts";
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

export const PROFILE_UPDATE_DISABLED_MESSAGE =
  "Email and username change requests requiring administrator verification are temporarily unavailable during a security upgrade (TICKET-SEC-01). You can still update your Full Name, Phone Number, and Institution directly in Account Settings.";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (!ADMIN_EMAIL || !Deno.env.get("RESEND_API_KEY")) {
    return new Response(
      JSON.stringify({
        success: false,
        emailSent: false,
        code: "PROFILE_UPDATE_UNAVAILABLE",
        error: "Profile update email service is unavailable.",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }

  return new Response(
    JSON.stringify({
      success: false,
      emailSent: false,
      code: "PROFILE_UPDATE_DISABLED",
      error: PROFILE_UPDATE_DISABLED_MESSAGE,
    }),
    {
      status: 410,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    }
  );
});
