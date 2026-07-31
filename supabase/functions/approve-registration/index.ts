// Visited by the admin clicking the link in send-approval-email's message.
//
// Security fix (2026-07-31): this used to approve the account immediately
// on a bare GET request. Confirmed live in production that this is unsafe —
// an automated mail-security link scanner (which prefetches/follows links
// in incoming email to check for phishing, before a human ever opens the
// message) silently triggered real approvals with zero human involvement,
// completely bypassing the admin-review gate this function exists to
// enforce. GET is now read-only; only a POST (submitted by a real button
// click, which an automated link-scanner won't do) actually flips
// `is_approved`. This is the standard fix for "unsafe GET" — a
// state-changing action must never be a side-effect-free-looking
// idempotent GET.
//
// Second fix, same day: this originally rendered the confirmation page's
// HTML inline. Confirmed live that Supabase's Edge Function gateway forces
// every response to `Content-Type: text/plain` plus a locked-down
// sandboxed CSP, regardless of what Content-Type the function code sets —
// so the "page" displayed as inert raw markup with no actual clickable
// button, and nothing ever submitted. The confirmation UI now lives at
// `/admin/approve-scholar` on the main app (server.ts), which has no such
// restriction; this function redirects there for every human-facing state
// and keeps only the privileged is_approved write + the two emails.
//
// Deploy: supabase functions deploy approve-registration
// Requires project secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY (RESEND_FROM_EMAIL optional)

import { createAdminClient } from "../_shared/adminClient.ts";
import { sendEmail, brandedEmailHtml } from "../_shared/resend.ts";

// Single-tenant deployment — hardcoded rather than adding yet another
// secret just for this. Update here if the production domain ever changes.
const APP_URL = "https://scholar.gkshah.com.np";

function redirectTo(path: string, params: Record<string, string>): Response {
  const url = new URL(`${APP_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return Response.redirect(url.toString(), 302);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");

  if (!userId) {
    return redirectTo("/admin/approve-scholar", { notfound: "1" });
  }

  const supabase = createAdminClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("username, is_approved")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return redirectTo("/admin/approve-scholar", { notfound: "1" });
  }

  if (profile.is_approved) {
    return redirectTo("/admin/approve-scholar", { already: "1", username: profile.username });
  }

  if (req.method === "GET") {
    return redirectTo("/admin/approve-scholar", { userId, username: profile.username });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({ is_approved: true, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("username")
    .single();

  if (updateError || !updated) {
    return redirectTo("/admin/approve-scholar", { error: "1" });
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

  return redirectTo("/admin/approve-scholar", { approved: "1", username: updated.username });
});
