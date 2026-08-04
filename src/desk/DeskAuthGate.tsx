import { useState, type FormEvent, type ReactNode } from "react";
import { signIn } from "../services/supabaseAuthService";
import { useDeskSession } from "./useDeskSession";

/**
 * Sign-in gate for Desk.
 *
 * Desk previously rendered with no authentication at all — `main.tsx` mounted
 * it outside the AuthProvider, and every endpoint it called was open. This is
 * the client half of closing that; the server half is `requireAuth` on
 * `/api/projects` and `/api/studio`, which is what actually enforces it.
 * A client-side gate alone would be decoration.
 *
 * Rendered in the design system from
 * docs/06-decisions/60-DESIGN-DIRECTION.md: one accent, real labels, no
 * decorative motion.
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

  if (session.status === "signed-out") return <SignInScreen />;

  return <>{children}</>;
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[color:var(--surface-canvas)] px-4 py-10">
      {children}
    </div>
  );
}

function SignInScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signIn({ username: username.trim(), password });
      // No navigation on success: useDeskSession is subscribed to Supabase's
      // auth state and will re-render the gate's children on its own. Pushing
      // a route here would race that subscription.
      if (!result.success) setError(result.error ?? "Could not sign you in.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Centered>
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">Scholar</h1>
        <p className="mt-1.5 text-sm text-[color:var(--text-secondary)]">Sign in to reach your work.</p>

        <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            {/* Real <label> elements bound by htmlFor — a placeholder is not a
                label; it disappears on focus and is not reliably announced. */}
            <label htmlFor="desk-username" className="text-sm font-medium text-[color:var(--text-primary)]">
              Username
            </label>
            <input
              id="desk-username"
              name="username"
              type="text"
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="desk-password" className="text-sm font-medium text-[color:var(--text-primary)]">
              Password
            </label>
            <input
              id="desk-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm"
            />
          </div>

          {error && (
            // role="alert" so the failure is announced rather than only seen.
            <p
              role="alert"
              className="rounded-[var(--radius-md)] border border-[color:var(--accent-border)] bg-[color:var(--state-danger-subtle)] px-3 py-2 text-sm text-[color:var(--state-danger)]"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || username.trim() === "" || password === ""}
            className="mt-1 w-full rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </Centered>
  );
}
