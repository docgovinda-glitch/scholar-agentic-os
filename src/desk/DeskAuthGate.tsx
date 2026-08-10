import type { ReactNode } from "react";
import AuthFlow from "./auth/AuthFlow";
import { useDeskSession } from "./useDeskSession";

/**
 * Authentication gate for Desk.
 *
 * Desk previously rendered with no authentication at all — `main.tsx` mounted
 * it outside the AuthProvider, and every endpoint it called was open. This is
 * the client half of closing that; the server half is `requireAuth` on
 * `/api/projects` and `/api/studio`, which is what actually enforces it.
 * A client-side gate alone would be decoration.
 *
 * The gate itself only decides *whether* to show the app. Which unauthenticated
 * screen to show — sign in, register, reset, recover, awaiting approval — is
 * `auth/AuthFlow.tsx`'s job, so this file stays a single readable decision.
 */
export default function DeskAuthGate({ children }: { children: ReactNode }) {
  const session = useDeskSession();

  if (session.status === "loading") {
    return (
      <Centered>
        {/* Not a spinner: this resolves in milliseconds from local storage in
            the common case, and a spinner that flashes for one frame reads as
            a glitch. */}
        <p className="text-sm text-[color:var(--text-muted)]">Checking your session…</p>
      </Centered>
    );
  }

  if (session.status === "unconfigured") {
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

  if (session.status === "signed-out") return <AuthFlow />;
  // Sent straight to the set-new-password screen: see useDeskSession's
  // "recovery" status doc comment for why AuthFlow can't be trusted to
  // rediscover this on its own.
  if (session.status === "recovery") return <AuthFlow initialScreen="recover" />;

  return <>{children}</>;
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[color:var(--surface-canvas)] px-4 py-10">
      {children}
    </div>
  );
}
