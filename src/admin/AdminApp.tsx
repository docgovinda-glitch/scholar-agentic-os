import { useEffect, useState } from "react";
import { getSupabaseClient, isSupabaseConfigured } from "../services/supabaseClient";
import { signIn } from "../services/supabaseAuthService";
import { getAdminWhoAmI, type AdminWhoAmI } from "../desk/aiAccess/aiAccessApi";
import AdminPanel from "../desk/admin/AdminPanel";

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
 */
export default function AdminApp() {
  const [status, setStatus] = useState<Status>("loading");
  const [who, setWho] = useState<AdminWhoAmI | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signIn({ username, password });
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? "Sign-in failed.");
      return;
    }
    await checkAdmin();
  }

  async function handleSignOut() {
    await getSupabaseClient().auth.signOut();
    setUsername("");
    setPassword("");
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
    return <AdminPanel onClose={handleSignOut} closeLabel="Sign out" identity={{ isMainAdmin: who.isMainAdmin, scopes: who.scopes }} />;
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
          disabled={busy || !username || !password}
          className="w-full rounded-[var(--radius-sm)] bg-[color:var(--accent-solid)] px-3 py-1.5 text-sm font-medium text-[color:var(--text-inverse)] disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
