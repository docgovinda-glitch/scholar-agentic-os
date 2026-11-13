import { useEffect, useState, type FormEvent } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { getSupabaseClient, isSupabaseConfigured } from "../services/supabaseClient";
import { signIn, signInWithGoogle } from "../services/supabaseAuthService";
import { getAdminWhoAmI, type AdminWhoAmI } from "../desk/aiAccess/aiAccessApi";
import AdminPanel, { isAdminTab, type AdminIdentity } from "../desk/admin/AdminPanel";
import { GoogleSignInButton, AuthDivider } from "../desk/auth/AuthLayout";

type Status = "loading" | "login" | "not-found" | "authorized";

/**
 * The dedicated /admin entry point — a real, separate page, not a button
 * inside AI Access. This is the isolation boundary: an ordinary user is
 * never shown a link to this URL and never sees anything admin-shaped if
 * they land on it anyway — a non-admin (including one just not signed in
 * yet gone wrong, or signed in but lacking admin_users) gets the same
 * generic "not found" a mistyped URL would, never an "access denied" that
 * confirms an admin system exists here.
 *
 * Reuses the SAME Supabase auth session as the main Desk app (one
 * localStorage-backed client, same origin) — an admin already signed in
 * elsewhere in this browser skips straight to the server's /whoami check;
 * one who isn't gets a plain sign-in form (the same username+password
 * flow every other Scholar account uses, since an admin's admin-ness is a
 * property of their normal account, not a separate credential).
 *
 * The actual authorization decision is never made here — src/desk/admin/
 * AdminPanel.tsx's own comment says it plainly: it's server/routes/
 * admin.ts's requireAdmin/requireScope checks that matter, not this
 * component being reachable.
 *
 * Mounted at /admin/* (see main.tsx), so every path below is written
 * relative to that — matching what the panel's own 10 tabs need
 * (/admin/:tab) and what a signed-out visitor needs (/admin/login), each
 * directly linkable/refreshable rather than a plain state swap. Navigate
 * targets are still written as fully absolute "/admin/..." strings, since
 * a leading "/" there means the site root, not "relative to here".
 */
export default function AdminApp() {
  const [status, setStatus] = useState<Status>("loading");
  const [who, setWho] = useState<AdminWhoAmI | null>(null);

  async function checkAdmin() {
    if (!isSupabaseConfigured()) {
      setStatus("not-found");
      return;
    }
    const { data } = await getSupabaseClient().auth.getSession();
    if (!data.session) {
      setStatus("login");
      return;
    }
    const info = await getAdminWhoAmI();
    setWho(info);
    setStatus(info.isAdmin ? "authorized" : "not-found");
  }

  useEffect(() => {
    void checkAdmin();
  }, []);

  async function handleSignOut() {
    await getSupabaseClient().auth.signOut();
    setWho(null);
    setStatus("login");
  }

  if (status === "loading") {
    return <div className="min-h-screen bg-[color:var(--surface-canvas)]" />;
  }

  if (status === "not-found") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)]">
        <p className="text-sm text-[color:var(--text-secondary)]">404 — page not found.</p>
      </div>
    );
  }

  if (status === "authorized" && who) {
    const identity: AdminIdentity = { isMainAdmin: who.isMainAdmin, scopes: who.scopes };
    return (
      <Routes>
        <Route path="/:tab" element={<AdminPanelRoute onClose={handleSignOut} identity={identity} />} />
        <Route path="*" element={<Navigate to="/admin/opportunities" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<AdminLoginScreen onSignedIn={checkAdmin} />} />
      <Route path="*" element={<Navigate to="/admin/login" replace />} />
    </Routes>
  );
}

function AdminPanelRoute({ onClose, identity }: { onClose: () => void; identity: AdminIdentity }) {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab: string }>();
  if (!isAdminTab(tab)) return <Navigate to="/admin/opportunities" replace />;

  return (
    <AdminPanel
      onClose={onClose}
      closeLabel="Sign out"
      identity={identity}
      tab={tab}
      onTabChange={(next) => navigate(`/admin/${next}`)}
    />
  );
}

function AdminLoginScreen({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function handleGoogleSignIn() {
    setGoogleBusy(true);
    setError(null);
    try {
      const result = await signInWithGoogle("/admin");
      if (!result.success) {
        setError(result.error ?? "Could not sign in with Google.");
        setGoogleBusy(false);
      }
    } catch (e) {
      setError((e as Error).message);
      setGoogleBusy(false);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signIn({ username, password });
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? "Sign-in failed.");
      return;
    }
    await onSignedIn();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--surface-canvas)] px-4">
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-3 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-6">
        <h1 className="text-base font-semibold text-[color:var(--text-primary)]">Sign in</h1>
        {error && (
          <p role="alert" className="rounded-[var(--radius-sm)] border border-[color:var(--accent-border)] bg-[color:var(--state-danger-subtle)] px-3 py-2 text-sm text-[color:var(--state-danger)]">
            {error}
          </p>
        )}
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoComplete="username"
          className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          autoComplete="current-password"
          className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !username || !password || googleBusy}
          className="w-full rounded-[var(--radius-sm)] bg-[color:var(--accent-solid)] px-3 py-1.5 text-sm font-medium text-[color:var(--text-inverse)] disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div className="pt-2">
          <AuthDivider />
        </div>
        <div className="pt-2">
          <GoogleSignInButton onClick={handleGoogleSignIn} busy={googleBusy} />
        </div>
      </form>
    </div>
  );
}
