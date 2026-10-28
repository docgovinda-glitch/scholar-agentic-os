// Invoked by src/services/supabaseAuthService.ts's requestProfileUpdate().
// Deploy: supabase functions deploy request-profile-update
// Requires project secrets: RESEND_API_KEY, ADMIN_EMAIL (RESEND_FROM_EMAIL optional)
//
// Security invariant (F-04):
// - NEVER return `verificationKey` in any HTTP response body.
// - If RESEND_API_KEY / ADMIN_EMAIL is unconfigured or Resend delivery fails,
//   fail closed with HTTP 503 BEFORE any pending_profile_update persistence.

import { ADMIN_EMAIL } from "../_shared/adminClient.ts";
import { sendEmail, brandedEmailHtml } from "../_shared/resend.ts";
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

interface RequestBody {
  username: string;
  pendingEmail?: string;
  pendingPhone?: string;
  pendingFullName?: string;
  pendingAffiliation?: string;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const body: RequestBody = await req.json();
  const { username, pendingEmail, pendingPhone, pendingFullName, pendingAffiliation } = body;

  if (!username) {
    return new Response(JSON.stringify({ error: "Username is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  if (!ADMIN_EMAIL || !Deno.env.get("RESEND_API_KEY")) {
    return new Response(
      JSON.stringify({
        success: false,
        emailSent: false,
        error: "Profile update email service is unavailable.",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }

  const verificationKey = `UP-${Math.floor(100000 + Math.random() * 900000)}`;

  const rows = [
    pendingFullName && `<tr><td><strong>New Full Name</strong></td><td>${pendingFullName}</td></tr>`,
    pendingEmail && `<tr><td><strong>New Email</strong></td><td>${pendingEmail}</td></tr>`,
    pendingPhone && `<tr><td><strong>New WhatsApp Number</strong></td><td>${pendingPhone}</td></tr>`,
    pendingAffiliation && `<tr><td><strong>New Affiliation</strong></td><td>${pendingAffiliation}</td></tr>`,
  ]
    .filter(Boolean)
    .join("");

  const { sent, error } = await sendEmail({
    to: ADMIN_EMAIL,
    subject: `[Profile Update Request] Scholar Identity: ${username}`,
    html: brandedEmailHtml(
      "Scholar Profile Update Request",
      `<p>Scholar <strong>${username}</strong> has requested to update their profile details.</p>
       <table border="1" cellpadding="8" style="width:100%; border-collapse:collapse; border-color:#D1CEC7; background:white;">
         <tr style="background-color:#1A365D; color:white;"><th align="left">Field</th><th align="left">Requested Value</th></tr>
         ${rows}
       </table>
       <p>Verification Key to give the scholar once approved: <strong>${verificationKey}</strong></p>`
    ),
  });

  if (!sent) {
    return new Response(
      JSON.stringify({
        success: false,
        emailSent: false,
        error: error || "Failed to deliver admin verification email.",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }

  return new Response(JSON.stringify({ success: true, emailSent: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});
