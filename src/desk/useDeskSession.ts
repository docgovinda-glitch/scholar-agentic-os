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

export function useDeskSession(): SessionState {
  const [state, setState] = useState<SessionState>(() =>
    isSupabaseConfigured() ? { status: "loading" } : { status: "unconfigured" }
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = getSupabaseClient();
    let active = true;

    // Resolve the current session once on mount...
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const user = data.session?.user;
      setState(user ? { status: "signed-in", userId: user.id, email: user.email ?? null } : { status: "signed-out" });
    });

    // ...then follow it. This covers sign-out in another tab, token refresh
    // failure, and expiry — without it, the UI would keep showing a signed-in
    // shell whose every request 401s.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const user = session?.user;
      setState(user ? { status: "signed-in", userId: user.id, email: user.email ?? null } : { status: "signed-out" });
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
