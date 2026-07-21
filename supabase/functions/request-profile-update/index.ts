// Invoked by src/services/supabaseAuthService.ts's requestProfileUpdate().
// Mirrors server.ts's /api/request-profile-update EXACTLY, including its
// current limitation: this is stateless — it only sends notification
// emails and does not persist or apply the requested change itself
// (the original didn't either; the actual field updates happened
// client-side once the scholar entered the emailed verification key).
// Not changed/improved in this pass — see docs/planning/hosting-and-topology.md
// for why fidelity to existing behavior was prioritized over redesigning it.
//
// Deploy: supabase functions deploy request-profile-update
// Requires project secrets: RESEND_API_KEY, ADMIN_EMAIL

import { ADMIN_EMAIL } from "../_shared/adminClient.ts";
import { sendEmail, brandedEmailHtml } from "../_shared/resend.ts";

interface RequestBody {
  username: string;
  pendingEmail?: string;
  pendingPhone?: string;
  pendingFullName?: string;
  pendingAffiliation?: string;
  pendingAuthenticId?: string;
  pendingIdDocumentName?: string;
}

Deno.serve(async (req) => {
  const body: RequestBody = await req.json();
  const { username, pendingEmail, pendingPhone, pendingFullName, pendingAffiliation, pendingAuthenticId, pendingIdDocumentName } = body;

  if (!username) {
    return new Response(JSON.stringify({ error: "Username is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const verificationKey = `UP-${Math.floor(100000 + Math.random() * 900000)}`;

  const rows = [
    pendingFullName && `<tr><td><strong>New Full Name</strong></td><td>${pendingFullName}</td></tr>`,
    pendingEmail && `<tr><td><strong>New Email</strong></td><td>${pendingEmail}</td></tr>`,
    pendingPhone && `<tr><td><strong>New WhatsApp Number</strong></td><td>${pendingPhone}</td></tr>`,
    pendingAffiliation && `<tr><td><strong>New Affiliation</strong></td><td>${pendingAffiliation}</td></tr>`,
    pendingAuthenticId && `<tr><td><strong>New Authentic ID</strong></td><td>${pendingAuthenticId}</td></tr>`,
    pendingIdDocumentName && `<tr><td><strong>Uploaded Identification</strong></td><td>${pendingIdDocumentName}</td></tr>`,
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

  return new Response(JSON.stringify({ success: true, emailSent: sent, verificationKey, error }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
