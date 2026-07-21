// Invoked by src/services/supabaseAuthService.ts's signUp() right after
// supabase.auth.signUp() succeeds. Mirrors server.ts's /api/register
// admin-notification email (the "access request" email with the scholar's
// details table and an Approve & Set Approved link).
//
// Deploy: supabase functions deploy send-approval-email
// Requires project secrets: RESEND_API_KEY, ADMIN_EMAIL

import { ADMIN_EMAIL } from "../_shared/adminClient.ts";
import { sendEmail, brandedEmailHtml } from "../_shared/resend.ts";

interface RequestBody {
  userId: string;
  username: string;
  fullName: string;
  email: string;
  phone: string;
  affiliation: string;
  authenticId: string;
}

Deno.serve(async (req) => {
  const body: RequestBody = await req.json();
  const { userId, username, fullName, email, phone, affiliation, authenticId } = body;

  const functionsBaseUrl = Deno.env.get("SUPABASE_URL") + "/functions/v1";
  const approveUrl = `${functionsBaseUrl}/approve-registration?userId=${encodeURIComponent(userId)}`;

  const html = brandedEmailHtml(
    "Scholar Access Request",
    `
      <p>A new researcher has requested access to the <strong>Scholar Agentic</strong> workspace.</p>
      <table border="1" cellpadding="8" style="width: 100%; border-collapse: collapse; border-color: #D1CEC7; background-color: white; border-radius: 8px;">
        <tr style="background-color: #1A365D; color: white;"><th align="left">Field</th><th align="left">Details</th></tr>
        <tr><td><strong>Scholar Username</strong></td><td>${username}</td></tr>
        <tr><td><strong>Full Name</strong></td><td>${fullName}</td></tr>
        <tr><td><strong>Email Address</strong></td><td>${email}</td></tr>
        <tr><td><strong>Phone Number</strong></td><td>${phone || "None"}</td></tr>
        <tr><td><strong>Affiliation / University</strong></td><td>${affiliation}</td></tr>
        <tr><td><strong>Authentic ID Type/No.</strong></td><td>${authenticId || "None"}</td></tr>
      </table>
      <p align="center" style="margin: 24px 0;">
        <a href="${approveUrl}" style="background-color: #C08A3E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Approve Scholar</a>
      </p>
    `
  );

  const { sent, error } = await sendEmail({
    to: ADMIN_EMAIL,
    subject: `[Access Request] Scholar Identity: ${username}`,
    html,
  });

  return new Response(JSON.stringify({ success: true, emailSent: sent, error }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
