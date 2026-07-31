// Visited by the admin clicking the link in send-approval-email's message.
//
// Security fix (2026-07-31): this used to approve the account immediately
// on a bare GET request. Confirmed live in production that this is unsafe —
// an automated mail-security link scanner (which prefetches/follows links
// in incoming email to check for phishing, before a human ever opens the
// message) silently triggered real approvals with zero human involvement,
// completely bypassing the admin-review gate this function exists to
// enforce. GET is now read-only: it renders a confirmation page showing the
// scholar's details and a button. Only a POST (submitted by that button,
// which an automated link-scanner won't do) actually flips `is_approved`.
// This is the standard fix for "unsafe GET" — a state-changing action must
// never be a side-effect-free-looking idempotent GET.
//
// Deploy: supabase functions deploy approve-registration
// Requires project secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY (RESEND_FROM_EMAIL optional)

import { createAdminClient } from "../_shared/adminClient.ts";
import { sendEmail, brandedEmailHtml } from "../_shared/resend.ts";

function htmlPage(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
     <body style="font-family: sans-serif; background:#FAF8F5; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0;">
       <div style="max-width:500px; padding:40px; border:1px solid #D1CEC7; border-radius:24px; background:white; text-align:center; color:#1A365D;">
         ${bodyHtml}
       </div>
     </body></html>`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");

  if (!userId) {
    return new Response(htmlPage("Missing parameters", "<h3>Missing approval parameters.</h3>"), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  const supabase = createAdminClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("username, is_approved")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return new Response(htmlPage("Not found", "<h3>Could not find a pending scholar for that approval link.</h3>"), {
      status: 404,
      headers: { "Content-Type": "text/html" },
    });
  }

  if (profile.is_approved) {
    return new Response(
      htmlPage(
        "Already approved",
        `<h2 style="font-family: Georgia, serif; font-style: italic; color:#C08A3E;">Already Approved</h2>
         <p>${profile.username} was already approved — no action needed.</p>`
      ),
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  }

  if (req.method === "GET") {
    return new Response(
      htmlPage(
        "Confirm Scholar Approval",
        `<h2 style="font-family: Georgia, serif; font-style: italic; color:#C08A3E;">Confirm Approval</h2>
         <p>Approve <strong>${profile.username}</strong> for the Scholar Agentic research workspace?</p>
         <form method="POST" action="${url.toString()}">
           <button type="submit" style="background-color:#C08A3E; color:white; padding:12px 24px; border:none; border-radius:8px; font-weight:bold; font-size:16px; cursor:pointer;">Approve Scholar</button>
         </form>`
      ),
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  }

  if (req.method !== "POST") {
    return new Response(htmlPage("Method not allowed", "<h3>Method not allowed.</h3>"), {
      status: 405,
      headers: { "Content-Type": "text/html" },
    });
  }

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({ is_approved: true, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("username")
    .single();

  if (updateError || !updated) {
    return new Response(htmlPage("Error", "<h3>Could not approve that scholar. Please try again.</h3>"), {
      status: 500,
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
    htmlPage(
      "Scholar Approved",
      `<h2 style="font-family: Georgia, serif; font-style: italic; color:#C08A3E;">Scholar Approved</h2>
       <p>${updated.username} can now log in to the Scholar Agentic workspace.</p>`
    ),
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
});
