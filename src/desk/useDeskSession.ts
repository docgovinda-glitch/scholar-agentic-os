import { useEffect, useState } from "react";
import { getSupabaseClient, isSupabaseConfigured } from "../services/supabaseClient";

/**
 * Desk's view of the Supabase session.
 *
 * The session here is the same thing `src/desk/api.ts` reads to build its
 * Authorization header, so what the UI believes about sign-in and what the
 * server will accept cannot drift apart.
 */

export type SessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; userId: string; email: string | null }
  /** Supabase env vars are absent — the app cannot authenticate anyone. */
  | { status: "unconfigured" };

/**
 * True while the current page load is a password-recovery link arriving,
 * checked directly against the URL rather than waiting on Supabase's
 * PASSWORD_RECOVERY event — same reasoning and same check as
 * `supabaseAuthService.onPasswordRecovery`: the event and `getSession()`'s
 * promise can resolve in either order, but the URL is available synchronously
 * before either does.
 */
function isPasswordRecoveryUrl(): boolean {
  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  return (url.searchParams.get("type") || hashParams.get("type")) === "recovery";
}

export function useDeskSession(): SessionState {
  const [state, setState] = useState<SessionState>(() =>
    isSupabaseConfigured() ? { status: "loading" } : { status: "unconfigured" }
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = getSupabaseClient();
    let active = true;
    // A recovery link makes Supabase establish a real session client-side —
    // that's how AuthFlow's RecoverScreen is able to call updateUser() — but
    // it is not a sign-in. Left unguarded, this gate saw a session with a
    // user on it and swapped straight to the authenticated app, so the
    // set-new-password screen never rendered and the visitor landed back in
    // Desk with their old password still active. Held true from mount until
    // the password is actually changed (USER_UPDATED) or the visitor signs
    // out, so it survives whichever of getSession()/PASSWORD_RECOVERY
    // resolves first.
    let recovering = isPasswordRecoveryUrl();

    function resolve(session: { user?: { id: string; email?: string | null } | null } | null | undefined) {
      if (!active) return;
      const user = session?.user;
      if (!user || recovering) return setState({ status: "signed-out" });
      setState({ status: "signed-in", userId: user.id, email: user.email ?? null });
    }

    // Resolve the current session once on mount...
    supabase.auth.getSession().then(({ data }) => resolve(data.session));

    // ...then follow it. This covers sign-out in another tab, token refresh
    // failure, and expiry — without it, the UI would keep showing a signed-in
    // shell whose every request 401s.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") recovering = true;
      else if (event === "USER_UPDATED" || event === "SIGNED_OUT") recovering = false;
      resolve(session);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
