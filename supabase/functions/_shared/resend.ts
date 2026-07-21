// Shared Resend-email helper for the Edge Functions below — mirrors the
// inline fetch("https://api.resend.com/emails", ...) calls previously
// duplicated across server.ts's /api/register, /api/approve,
// /api/request-password-reset, /api/approve-reset.

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(input: SendEmailInput): Promise<{ sent: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return { sent: false, error: "RESEND_API_KEY not configured on this Supabase project (set via `supabase secrets set`)." };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "Scholar Agentic <onboarding@resend.dev>",
        to: input.to,
        subject: input.subject,
        html: input.html,
      }),
    });
    if (!response.ok) {
      return { sent: false, error: await response.text() };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Same brand colors as server.ts's inline email HTML (#1A365D navy, #C08A3E gold, #FAF8F5 background). */
export function brandedEmailHtml(title: string, bodyHtml: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #D1CEC7; border-radius: 12px; background-color: #FAF8F5; color: #1A365D;">
      <h2 style="font-family: serif; font-style: italic; color: #1A365D; border-bottom: 1px solid #D1CEC7; padding-bottom: 10px;">${title}</h2>
      ${bodyHtml}
    </div>
  `;
}
