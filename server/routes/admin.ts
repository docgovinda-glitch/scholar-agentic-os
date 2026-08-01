import express from "express";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function adminApprovalPage(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
     <body style="font-family: sans-serif; background:#FAF8F5; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0;">
       <div style="max-width:500px; padding:40px; border:1px solid #D1CEC7; border-radius:24px; background:white; text-align:center; color:#1A365D;">
         ${bodyHtml}
       </div>
     </body></html>`;
}

export function registerAdminRoutes(app: express.Express): void {
  // Admin scholar-approval confirmation page (2026-07-31).
  //
  // Moved here from the `approve-registration` Supabase Edge Function after
  // confirming live that Edge Functions cannot serve a genuinely renderable,
  // clickable HTML page: Supabase's gateway forces every Edge Function
  // response to `Content-Type: text/plain` plus a locked-down sandboxed CSP
  // (`default-src 'none'; sandbox`), overriding whatever Content-Type the
  // function code sets. A real admin clicking "Approve Scholar" in
  // production got the raw HTML markup displayed as inert text — there was
  // no actual clickable button, so nothing ever submitted. server.ts has no
  // such restriction, so the confirmation UI lives here instead; the
  // Edge Function still does the actual privileged is_approved write (it
  // has the service-role key, this route doesn't) and redirects back here
  // afterward. The <form> POSTs directly to the Edge Function's URL — a
  // real HTML form submission, not fetch/XHR, so it isn't subject to CORS.
  app.get("/admin/approve-scholar", (req, res) => {
    const userId = typeof req.query.userId === "string" ? req.query.userId : "";
    const username = typeof req.query.username === "string" ? req.query.username : "";
    res.set("Content-Type", "text/html");

    if (req.query.notfound === "1") {
      return res.status(404).send(
        adminApprovalPage("Not found", "<h3>Could not find a pending scholar for that approval link.</h3>")
      );
    }
    if (req.query.error === "1") {
      return res.status(500).send(
        adminApprovalPage("Error", "<h3>Could not approve that scholar. Please try again.</h3>")
      );
    }
    if (req.query.approved === "1") {
      return res.send(
        adminApprovalPage(
          "Scholar Approved",
          `<h2 style="font-family: Georgia, serif; font-style: italic; color:#C08A3E;">Scholar Approved</h2>
           <p>${escapeHtml(username)} can now log in to the Scholar Agentic workspace.</p>`
        )
      );
    }
    if (req.query.already === "1") {
      return res.send(
        adminApprovalPage(
          "Already approved",
          `<h2 style="font-family: Georgia, serif; font-style: italic; color:#C08A3E;">Already Approved</h2>
           <p>${escapeHtml(username)} was already approved — no action needed.</p>`
        )
      );
    }
    if (!userId) {
      return res.status(400).send(adminApprovalPage("Missing parameters", "<h3>Missing approval parameters.</h3>"));
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      return res.status(500).send(adminApprovalPage("Not configured", "<h3>Supabase is not configured on this server.</h3>"));
    }
    const approveEdgeFunctionUrl = `${supabaseUrl}/functions/v1/approve-registration?userId=${encodeURIComponent(userId)}`;

    res.send(
      adminApprovalPage(
        "Confirm Scholar Approval",
        `<h2 style="font-family: Georgia, serif; font-style: italic; color:#C08A3E;">Confirm Approval</h2>
         <p>Approve <strong>${escapeHtml(username)}</strong> for the Scholar Agentic research workspace?</p>
         <form method="POST" action="${approveEdgeFunctionUrl}">
           <button type="submit" style="background-color:#C08A3E; color:white; padding:12px 24px; border:none; border-radius:8px; font-weight:bold; font-size:16px; cursor:pointer;">Approve Scholar</button>
         </form>`
      )
    );
  });
}
