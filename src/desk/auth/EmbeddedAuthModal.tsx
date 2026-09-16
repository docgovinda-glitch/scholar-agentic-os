import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabaseClient } from "../../services/supabaseClient";
import {
  getSavedAccounts,
  saveAccountProfile,
  switchActiveAccount,
  removeSavedAccount,
  type StoredAccountProfile,
} from "../../services/auth/multiAccountService";
import ScholarCoreLogo from "../../components/ScholarCoreLogo";

export interface EmbeddedAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "signin" | "signup" | "switch";
  initialMessage?: string;
  selectedFormatId?: string;
}

export default function EmbeddedAuthModal({
  isOpen,
  onClose,
  initialMode = "signin",
  initialMessage,
  selectedFormatId,
}: EmbeddedAuthModalProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "switch">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<StoredAccountProfile[]>([]);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      setSuccessMsg(null);
      setSavedAccounts(getSavedAccounts());
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();
      if (!supabase?.auth) {
        throw new Error("Authentication backend is not configured.");
      }
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) throw authError;

      if (data.session && data.user) {
        saveAccountProfile({
          userId: data.user.id,
          email: data.user.email || email.trim(),
          name: (data.user.user_metadata?.full_name as string) || fullName.trim(),
          sessionToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        });

        onClose();
        if (selectedFormatId) {
          navigate(`/projects?newFormat=${selectedFormatId}`);
        } else {
          navigate("/projects");
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();
      if (!supabase?.auth) {
        throw new Error("Authentication backend is not configured.");
      }
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim() || email.trim().split("@")[0],
          },
        },
      });

      if (authError) throw authError;

      if (data.session && data.user) {
        saveAccountProfile({
          userId: data.user.id,
          email: data.user.email || email.trim(),
          name: fullName.trim() || email.trim().split("@")[0],
          sessionToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        });
        onClose();
        navigate("/projects");
      } else {
        setSuccessMsg("Check your inbox! We sent you a confirmation email to activate your account.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    try {
      const supabase = getSupabaseClient();
      if (!supabase?.auth) {
        throw new Error("Authentication backend is not configured.");
      }
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/projects`,
        },
      });
      if (authError) throw authError;
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleAccountSwitch(userId: string) {
    setBusy(true);
    setError(null);
    const result = await switchActiveAccount(userId);
    if (!result.success) {
      setError(result.error || "Failed to switch accounts.");
      setBusy(false);
    } else {
      onClose();
      navigate("/projects");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-2xl)] p-7 shadow-2xl overflow-hidden flex flex-col gap-5 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[color:var(--accent)] text-[color:var(--text-inverse)] flex items-center justify-center shadow-xs">
              <ScholarCoreLogo size="md" className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[color:var(--text-primary)]">Scholar Core</h2>
              <p className="text-xs text-[color:var(--text-muted)]">Research Operating System</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {initialMessage && (
          <div className="text-xs text-[color:var(--accent)] bg-[color:var(--accent-subtle)] p-2.5 rounded-[var(--radius-md)] border border-[color:var(--accent-border)] font-medium">
            ✨ {initialMessage}
          </div>
        )}

        {/* Tab Selector */}
        <div className="flex p-1 rounded-[var(--radius-lg)] bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)]">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-[var(--radius-md)] transition-all cursor-pointer ${
              mode === "signin"
                ? "bg-[color:var(--surface-raised)] text-[color:var(--accent)] shadow-xs"
                : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            Sign In
          </button>

          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-[var(--radius-md)] transition-all cursor-pointer ${
              mode === "signup"
                ? "bg-[color:var(--surface-raised)] text-[color:var(--accent)] shadow-xs"
                : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            Create Account
          </button>

          {savedAccounts.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMode("switch");
                setError(null);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-[var(--radius-md)] transition-all cursor-pointer ${
                mode === "switch"
                  ? "bg-[color:var(--surface-raised)] text-[color:var(--accent)] shadow-xs"
                  : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
              }`}
            >
              Switch ({savedAccounts.length})
            </button>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="text-xs text-[color:var(--state-danger)] bg-[color:var(--state-danger-subtle)] p-3 rounded-[var(--radius-md)] border border-[color:var(--state-danger)] leading-relaxed"
          >
            {error}
          </div>
        )}

        {successMsg && (
          <div className="text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 p-3 rounded-[var(--radius-md)] border border-emerald-300 dark:border-emerald-800 leading-relaxed">
            {successMsg}
          </div>
        )}

        {/* MODE: SWITCH ACCOUNT */}
        {mode === "switch" ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-[color:var(--text-secondary)]">
              Choose an active account to switch sessions immediately:
            </p>
            <div className="flex flex-col gap-2 max-h-56 overflow-y-auto">
              {savedAccounts.map((acc) => (
                <div
                  key={acc.userId}
                  className="flex items-center justify-between p-3 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] hover:border-[color:var(--accent-border)] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[color:var(--accent-subtle)] text-[color:var(--accent)] font-bold text-xs flex items-center justify-center shrink-0">
                      {acc.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[color:var(--text-primary)] truncate">{acc.email}</p>
                      <p className="text-[10px] text-[color:var(--text-muted)]">
                        Last active: {new Date(acc.lastActiveAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleAccountSwitch(acc.userId)}
                      className="px-3 py-1 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] text-xs font-bold rounded hover:bg-[color:var(--accent-hover)] transition-colors cursor-pointer"
                    >
                      Switch
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        removeSavedAccount(acc.userId);
                        setSavedAccounts(getSavedAccounts());
                      }}
                      className="text-xs text-[color:var(--text-muted)] hover:text-[color:var(--state-danger)] p-1 cursor-pointer"
                      title="Remove from saved accounts"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setMode("signin")}
              className="mt-2 text-xs font-bold text-[color:var(--accent)] hover:underline text-center cursor-pointer"
            >
              + Add another account
            </button>
          </div>
        ) : (
          /* MODE: SIGN IN / SIGN UP FORM */
          <form onSubmit={mode === "signin" ? handleSignIn : handleSignUp} className="flex flex-col gap-4">
            {mode === "signup" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[color:var(--text-primary)]">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Dr. Alex Thorne"
                  className="w-full px-3.5 py-2.5 text-sm border border-[color:var(--border-default)] rounded-[var(--radius-lg)] bg-[color:var(--surface-input)] text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[color:var(--text-primary)]">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@institution.edu"
                className="w-full px-3.5 py-2.5 text-sm border border-[color:var(--border-default)] rounded-[var(--radius-lg)] bg-[color:var(--surface-input)] text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[color:var(--text-primary)]">Password</label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate("/reset-password");
                    }}
                    className="text-[11px] text-[color:var(--accent)] hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 text-sm border border-[color:var(--border-default)] rounded-[var(--radius-lg)] bg-[color:var(--surface-input)] text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
              />
            </div>

            <button
              type="submit"
              disabled={busy || !email.trim() || !password}
              aria-busy={busy}
              className="mt-1 w-full py-3 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-lg)] text-sm font-bold shadow-md hover:bg-[color:var(--accent-hover)] transition-all disabled:opacity-50 cursor-pointer inline-flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <span>Authenticating…</span>
                </>
              ) : mode === "signin" ? (
                "Sign In to Scholar Core"
              ) : (
                "Create Free Account"
              )}
            </button>

            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px bg-[color:var(--border-subtle)]" />
              <span className="text-[11px] uppercase tracking-wider text-[color:var(--text-muted)] font-semibold">
                OR CONTINUE WITH
              </span>
              <div className="flex-1 h-px bg-[color:var(--border-subtle)]" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full py-2.5 px-4 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] text-[color:var(--text-primary)] text-xs font-bold hover:bg-[color:var(--surface-hover)] transition-all flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          </form>
        )}

        <div className="pt-2 text-center text-[11px] text-[color:var(--text-muted)]">
          {mode === "signin" ? (
            <span>
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="font-bold text-[color:var(--accent)] hover:underline cursor-pointer"
              >
                Create an account
              </button>
            </span>
          ) : (
            <span>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="font-bold text-[color:var(--accent)] hover:underline cursor-pointer"
              >
                Sign In
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
