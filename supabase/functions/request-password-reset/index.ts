// Invoked by src/services/supabaseAuthService.ts's requestPasswordReset().
// Mirrors server.ts's /api/request-password-reset: stages the requested
// new password (pending_password_resets — service-role only, RLS blocks
// direct client writes) and emails the admin an approval link. The
// password does NOT take effect until approve-password-reset runs.
//
// Deploy: supabase functions deploy request-password-reset
// Requires project secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, ADMIN_EMAIL (RESEND_FROM_EMAIL optional)

import { createAdminClient, ADMIN_EMAIL } from "../_shared/adminClient.ts";
import { sendEmail, brandedEmailHtml } from "../_shared/resend.ts";

interface RequestBody {
  username: string;
  email: string;
  newPassword: string;
}

Deno.serve(async (req) => {
  const { username, email, newPassword }: RequestBody = await req.json();

  if (!username || !email || !newPassword) {
    return new Response(JSON.stringify({ error: "Missing required fields for password reset request." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createAdminClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .single();

  if (profileError || !profile) {
    return new Response(JSON.stringify({ error: "No scholar found with that username." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resetToken = crypto.randomUUID();

  const { error: upsertError } = await supabase.from("pending_password_resets").upsert(
    {
      user_id: profile.id,
      new_password: newPassword,
      reset_token: resetToken,
      requested_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (upsertError) {
    return new Response(JSON.stringify({ error: upsertError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const functionsBaseUrl = Deno.env.get("SUPABASE_URL") + "/functions/v1";
  const approveResetUrl = `${functionsBaseUrl}/approve-password-reset?userId=${encodeURIComponent(profile.id)}&token=${resetToken}`;

  const { sent, error } = await sendEmail({
    to: ADMIN_EMAIL,
    subject: `[Password Reset Request] Scholar Identity: ${username}`,
    html: brandedEmailHtml(
      "Scholar Password Reset Approval Request",
      `<p>A password reset has been requested for scholar: <strong>${username}</strong> (${email}).</p>
       <p align="center" style="margin: 24px 0;">
         <a href="${approveResetUrl}" style="background-color: #C08A3E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Approve Reset Password</a>
       </p>`
    ),
  });

  return new Response(JSON.stringify({ success: true, emailSent: sent, error }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
