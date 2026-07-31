// Visited directly by the admin clicking the link in
// request-password-reset's email — mirrors server.ts's /api/approve-reset.
// Uses the Supabase Admin API (service_role only) to actually set the
// user's new password, since Supabase Auth manages password hashing
// itself and doesn't accept a pre-hashed value — this is the one place a
// plaintext password is handled server-side, for the minimum time between
// staging and this call.
//
// Deploy: supabase functions deploy approve-password-reset
// Requires project secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY (RESEND_FROM_EMAIL optional)

import { createAdminClient } from "../_shared/adminClient.ts";
import { sendEmail, brandedEmailHtml } from "../_shared/resend.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const token = url.searchParams.get("token");

  if (!userId || !token) {
    return new Response("<h3>Missing approval details.</h3>", {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  const supabase = createAdminClient();

  const { data: pending, error: pendingError } = await supabase
    .from("pending_password_resets")
    .select("new_password, reset_token")
    .eq("user_id", userId)
    .single();

  if (pendingError || !pending || pending.reset_token !== token) {
    return new Response("<h3>No pending password reset request found for this scholar.</h3>", {
      status: 404,
      headers: { "Content-Type": "text/html" },
    });
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    password: pending.new_password,
  });

  if (updateError) {
    return new Response(`<h3>Failed to update password: ${updateError.message}</h3>`, {
      status: 500,
      headers: { "Content-Type": "text/html" },
    });
  }

  // Also (re-)approve the account, matching server.ts's behavior of setting
  // is_approved = true on a successful reset approval.
  await supabase.from("profiles").update({ is_approved: true }).eq("id", userId);
  await supabase.from("pending_password_resets").delete().eq("user_id", userId);

  const { data: userData } = await supabase.auth.admin.getUserById(userId);
  if (userData?.user?.email) {
    await sendEmail({
      to: userData.user.email,
      subject: "Your Password Reset Request Has Been Approved",
      html: brandedEmailHtml(
        "Scholar Password Reset Approved",
        `<p>Your request to reset your password for the <strong>Scholar Agentic</strong> workspace has been approved. You may now log in with your new password.</p>`
      ),
    });
  }

  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Password Reset Approved</title></head>
     <body style="font-family: sans-serif; background:#FAF8F5; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0;">
       <div style="max-width:500px; padding:40px; border:1px solid #D1CEC7; border-radius:24px; background:white; text-align:center; color:#1A365D;">
         <h2 style="font-family: Georgia, serif; font-style: italic; color:#C08A3E;">Password Reset Approved</h2>
         <p>The scholar's new password is now active.</p>
       </div>
     </body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
});
