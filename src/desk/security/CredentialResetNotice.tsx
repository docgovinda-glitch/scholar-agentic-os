import { useEffect, useState } from "react";
import { getSupabaseClient, isSupabaseConfigured } from "../../services/supabaseClient";

export const CREDENTIAL_PURGE_NOTICE_MESSAGE =
  "Your saved API keys / Drive connection were removed for security. Please reconnect.";

/**
 * Displays an in-app security notice ONLY to users whose legacy plaintext rows
 * in `public.api_credentials` or `public.user_cloud_integrations` were removed
 * by `20261028010000_purge_plaintext_credentials.sql` (`F-11`).
 */
export default function CredentialResetNotice({ className = "" }: { className?: string }) {
  const [visible, setVisible] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function checkNotice() {
      if (!isSupabaseConfigured()) return;
      try {
        const supabase = getSupabaseClient();
        if (typeof supabase.auth?.getUser !== "function") return;
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (!uid || !active) return;

        const query = supabase
          .from("security_credential_reset_notices")
          .select("user_id, had_api_credentials, had_cloud_integrations, dismissed_at")
          .eq("user_id", uid)
          .is("dismissed_at", null);

        const maybeSingle = (query as unknown as { maybeSingle?: () => Promise<{ data: unknown; error: unknown }> })
          .maybeSingle;
        if (typeof maybeSingle !== "function") return;

        const { data, error } = await maybeSingle.call(query);
        if (!active || error || !data) return;
        setUserId(uid);
        setVisible(true);
      } catch {
        // Table may not exist before migration 20261028010000 runs; fail closed silently.
      }
    }
    void checkNotice();
    return () => {
      active = false;
    };
  }, []);

  async function handleDismiss() {
    setVisible(false);
    if (!userId || !isSupabaseConfigured()) return;
    try {
      const supabase = getSupabaseClient();
      await supabase
        .from("security_credential_reset_notices")
        .update({ dismissed_at: new Date().toISOString() })
        .eq("user_id", userId);
    } catch {}
  }

  if (!visible) return null;

  return (
    <div
      role="status"
      data-testid="credential-reset-security-notice"
      className={`flex items-center justify-between gap-3 rounded-xl border border-[color:var(--state-warning)] bg-[color:var(--state-warning-subtle)] px-4 py-3 text-xs text-[color:var(--state-warning)] ${className}`.trim()}
    >
      <span className="font-medium leading-relaxed">{CREDENTIAL_PURGE_NOTICE_MESSAGE}</span>
      <button
        type="button"
        onClick={() => void handleDismiss()}
        className="shrink-0 rounded-lg border border-[color:var(--state-warning)] px-2.5 py-1 text-[11px] font-semibold hover:bg-[color:var(--state-warning)] hover:text-white transition-colors cursor-pointer"
      >
        Dismiss
      </button>
    </div>
  );
}
