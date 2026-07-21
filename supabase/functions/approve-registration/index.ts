// Visited directly by the admin clicking the link in send-approval-email's
// message (a GET request from a browser, not called by the app's own
// client code) — mirrors server.ts's /api/approve.
//
// Intentional simplification vs. the old flow: server.ts additionally
// emailed the user a separate "activation key" they had to re-enter, which
// existed only because the old system had no real authentication of its
// own. With Supabase Auth, the user already has a real account from
// signUp() — once is_approved flips to true they can just log in with the
// credentials they already chose. Flagged here as a deliberate behavior
// simplification, not an oversight.
//
// Deploy: supabase functions deploy approve-registration
// Requires project secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY

import { createAdminClient } from "../_shared/adminClient.ts";
import { sendEmail, brandedEmailHtml } from "../_shared/resend.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");

  if (!userId) {
    return new Response("<h3>Missing approval parameters.</h3>", {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  const supabase = createAdminClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .update({ is_approved: true, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("username")
    .single();

  if (profileError || !profile) {
    return new Response(`<h3>Could not find a pending scholar for that approval link.</h3>`, {
      status: 404,
      headers: { "Content-Type": "text/html" },
    });
  }

  const { data: userData } = await supabase.auth.admin.getUserById(userId);
  const scholarEmail = userData?.user?.email;

  if (scholarEmail) {
    await sendEmail({
      to: scholarEmail,
      subject: "Your Scholar Workspace Has Been Approved!",
      html: brandedEmailHtml(
        "Scholar Workspace Approved",
        `<p>Hello Scholar,</p><p>Your registration for the <strong>Scholar Agentic</strong> research workspace has been approved. You can now log in with the username and password you registered with.</p>`
      ),
    });
  }

  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Scholar Approved</title></head>
     <body style="font-family: sans-serif; background:#FAF8F5; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0;">
       <div style="max-width:500px; padding:40px; border:1px solid #D1CEC7; border-radius:24px; background:white; text-align:center; color:#1A365D;">
         <h2 style="font-family: Georgia, serif; font-style: italic; color:#C08A3E;">Scholar Approved</h2>
         <p>${profile.username} can now log in to the Scholar Agentic workspace.</p>
       </div>
     </body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
});
