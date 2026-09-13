import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { useDeskSession } from "./useDeskSession";
import { getProfile } from "../services/supabaseAuthService";

/**
 * Route guards for Desk's authentication boundary.
 *
 * Previously a single component (DeskAuthGate) that decided *whether* to
 * render its children at all, swapping in <AuthFlow/> for every
 * unauthenticated case regardless of what the user actually wanted to do —
 * which is exactly why the "Get Started" bug existed: AuthFlow's own screens
 * were plain React state with no URL of their own, so Back skipped past all
 * of them in one step. This file now exports route-level guards instead:
 * RequireAuth protects the authenticated app's routes, PublicOnly protects
 * the unauthenticated auth routes (redirecting a signed-in visitor away
 * rather than showing them a stale sign-in form), each real screen gets its
 * own URL, and ordinary browser history does the rest.
 */

/** Exported for VerifyEmailRoute (AuthFlow.tsx), which needs the same loading/unconfigured treatment while it does its own status-specific guarding. */
export function SessionBoundaryFallback({ status }: { status: "loading" | "unconfigured" }) {
  if (status === "loading") {
    return (
      <Centered>
        {/* Not a spinner: this resolves in milliseconds from local storage in
            the common case, and a spinner that flashes for one frame reads as
            a glitch. */}
        <p className="text-sm text-[color:var(--text-muted)]">Checking your session…</p>
      </Centered>
    );
  }
  return (
    <Centered>
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold text-[color:var(--text-primary)]">Sign-in is not configured</h1>
        <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
          This deployment is missing <code className="font-mono text-xs">VITE_SUPABASE_URL</code> and{" "}
          <code className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code>. Until they are set, no one can sign in
          and your work cannot be saved.
        </p>
        {/* UX7: say what happened, what it means, and what to do. */}
        <p className="mt-3 text-xs text-[color:var(--text-muted)]">
          See <code className="font-mono">.env.example</code> for both values.
        </p>
      </div>
    </Centered>
  );
}

/**
 * Only allowed off-site-redirect guard this app needs: the `redirect` query
 * param on /signin comes from the URL (attacker-controllable), so it must
 * never be followed unless it's an internal, absolute path — otherwise
 * `?redirect=https://evil.example` or `?redirect=//evil.example` would turn
 * a successful sign-in into an open redirect off the site.
 */
function safeInternalRedirect(target: string | null): string | null {
  if (!target) return null;
  if (!target.startsWith("/") || target.startsWith("//")) return null;
  return target;
}

/**
 * Layout route guarding every authenticated Desk route (server-side, the
 * real enforcement is requireAuth on /api/projects and /api/studio — this is
 * the client half, same split DeskAuthGate always drew).
 *
 * Re-evaluates on every render because useDeskSession() is itself live
 * subscribed to Supabase's onAuthStateChange — so pressing Back to a
 * protected route after signing out redirects immediately; React Router
 * re-runs this tree rather than caching what it rendered last time.
 */
export function RequireAuth() {
  const session = useDeskSession();
  const location = useLocation();

  if (session.status === "loading") return <SessionBoundaryFallback status="loading" />;
  if (session.status === "unconfigured") return <SessionBoundaryFallback status="unconfigured" />;
  if (session.status === "signed-out") {
    if (location.pathname === "/projects") {
      return <Outlet />;
    }
    if (location.pathname === "/" || !location.pathname) {
      return <Navigate to="/" replace />;
    }
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/signin?redirect=${redirect}`} replace />;
  }
  // Sent straight to the set-new-password route: see useDeskSession's
  // "recovery" status doc comment for why the URL alone can't be trusted to
  // rediscover this reliably on its own.
  if (session.status === "recovery") return <Navigate to="/reset-password/confirm" replace />;
  // Email verification link was followed: show the success screen before
  // allowing the user into the rest of the authenticated app.
  if (session.status === "email-verified") return <Navigate to="/verify-email" replace />;

  return <Outlet />;
}

/**
 * Wraps every unauthenticated auth screen (landing, sign-in, sign-up, ...).
 * A signed-in visitor landing here — by typing the URL, or by pressing Back
 * to a point in history before they signed in — gets redirected into the
 * app rather than shown a stale auth form. Also where a successful sign-in
 * actually lands the user: RequireAuth sent them to
 * /signin?redirect=<original path>, and once useDeskSession flips to
 * "signed-in" this same check fires and follows that param — no separate
 * post-login navigation needed anywhere else.
 */
export function PublicOnly({ children }: { children: ReactNode }) {
  const session = useDeskSession();
  const [searchParams] = useSearchParams();

  if (session.status === "loading") return <SessionBoundaryFallback status="loading" />;
  if (session.status === "unconfigured") return <SessionBoundaryFallback status="unconfigured" />;
  if (session.status === "signed-in") {
    const redirect = safeInternalRedirect(searchParams.get("redirect"));
    return <Navigate to={redirect ?? "/projects"} replace />;
  }
  if (session.status === "recovery") return <Navigate to="/reset-password/confirm" replace />;
  if (session.status === "email-verified") return <Navigate to="/verify-email" replace />;

  return <>{children}</>;
}

/** Guards /reset-password/confirm — only meaningful mid password-recovery. */
export function RequireRecovery({ children }: { children: ReactNode }) {
  const session = useDeskSession();

  if (session.status === "loading") return <SessionBoundaryFallback status="loading" />;
  if (session.status === "unconfigured") return <SessionBoundaryFallback status="unconfigured" />;
  if (session.status !== "recovery") {
    return <Navigate to={session.status === "signed-in" ? "/projects" : "/signin"} replace />;
  }
  return <>{children}</>;
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[color:var(--surface-canvas)] px-4 py-10">
      {children}
    </div>
  );
}

/**
 * Ensures the authenticated user has completed their profile (i.e. onboarding).
 * If essential fields are missing (e.g. from a fresh Google OAuth signup),
 * they are redirected to /onboarding.
 */
export function RequireOnboarding() {
  const [status, setStatus] = useState<"loading" | "complete" | "incomplete">("loading");
  const session = useDeskSession();

  useEffect(() => {
    // Only check if we are actually signed in
    if (session.status !== "signed-in") return;

    let active = true;
    getProfile().then((res) => {
      if (!active) return;
      if (!res.success) {
        // If we can't fetch it, we might be signed out or offline. 
        // We'll let RequireAuth handle the signed-out case.
        setStatus("complete"); 
        return;
      }
      
      const { userType, educationLevel } = res.profile;
      // These are the core fields that regular sign-up collects but Google does not.
      if (!userType || !educationLevel) {
        setStatus("incomplete");
      } else {
        setStatus("complete");
      }
    });

    return () => {
      active = false;
    };
  }, [session.status]);

  if (session.status !== "signed-in") {
    // Let RequireAuth handle the redirect
    return <Outlet />;
  }

  if (status === "loading") {
    return <SessionBoundaryFallback status="loading" />;
  }

  if (status === "incomplete") {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}

