import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  SignInScreen,
  SignUpScreen,
  ForgotScreen,
  RegisteredScreen,
  ResendVerificationScreen,
} from "./AuthFlow";
import { useDeskSession } from "../useDeskSession";
import {
  getSavedAccounts,
  switchActiveAccount,
  removeSavedAccount,
  type StoredAccountProfile,
} from "../../services/auth/multiAccountService";
import { createEphemeralProject } from "../ephemeralProjectStore";

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
  const location = useLocation();
  const session = useDeskSession();
  const [screen, setScreen] = useState<"signin" | "signup" | "forgot" | "registered" | "resend" | "switch">(initialMode);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [savedAccounts, setSavedAccounts] = useState<StoredAccountProfile[]>([]);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setScreen(initialMode);
      setSwitchError(null);
      setSavedAccounts(getSavedAccounts());
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // When session flips to signed-in, auto-close the modal and handle redirects/format booting
  useEffect(() => {
    if (isOpen && session.status === "signed-in") {
      onClose();
      const params = new URLSearchParams(location.search);
      const redirect = params.get("redirect");
      if (redirect) {
        navigate(decodeURIComponent(redirect), { replace: true });
      } else if (selectedFormatId) {
        navigate(`/projects?newFormat=${selectedFormatId}`, { replace: true });
      }
    }
  }, [session.status, isOpen, onClose, selectedFormatId, navigate, location.search]);

  if (!isOpen) return null;

  async function handleSwitchAccount(userId: string) {
    setSwitching(true);
    setSwitchError(null);
    const res = await switchActiveAccount(userId);
    if (!res.success) {
      setSwitchError(res.error || "Failed to switch accounts");
      setSwitching(false);
    }
  }

  function handleRemoveAccount(userId: string) {
    removeSavedAccount(userId);
    setSavedAccounts(getSavedAccounts());
  }

  const isWide = screen === "signup";
  const modalWidth = isWide ? "max-w-[560px]" : "max-w-[440px]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-ink-950/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className={`relative w-full ${modalWidth} max-h-[94dvh] overflow-hidden bg-white dark:bg-ink-800 border border-neutral-200/90 dark:border-white/10 rounded-2xl shadow-2xl flex flex-col transition-all duration-200`}
        role="dialog"
        aria-modal="true"
        aria-label={screen === "signup" ? "Create account" : "Sign in"}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar: Mode Switcher + Dedicated Close Button (Zero Overlap) */}
        <div className="flex items-center justify-between gap-2.5 px-4 pt-3.5 pb-3 sm:px-6 sm:pt-4 sm:pb-3.5 border-b border-neutral-200/70 dark:border-white/10 bg-white dark:bg-ink-800 shrink-0 z-20">
          {(screen === "signin" || screen === "signup") ? (
            <div className="flex flex-1 p-1 bg-neutral-100 dark:bg-ink-900 rounded-md border border-neutral-200/70 dark:border-white/10">
              <button
                type="button"
                data-compact="true"
                onClick={() => setScreen("signin")}
                className={`flex-1 py-1.5 px-3 text-xs rounded-sm transition-all duration-150 cursor-pointer ${
                  screen === "signin"
                    ? "bg-white dark:bg-ink-750 text-neutral-900 dark:text-white shadow-2xs font-semibold"
                    : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 font-medium"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                data-compact="true"
                onClick={() => setScreen("signup")}
                className={`flex-1 py-1.5 px-3 text-xs rounded-sm transition-all duration-150 cursor-pointer ${
                  screen === "signup"
                    ? "bg-white dark:bg-ink-750 text-neutral-900 dark:text-white shadow-2xs font-semibold"
                    : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 font-medium"
                }`}
              >
                Create Account
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-compact="true"
                onClick={() => setScreen("signin")}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span>Back to Sign In</span>
              </button>
            </div>
          )}

          <button
            type="button"
            data-compact="true"
            onClick={onClose}
            className="w-8 h-8 rounded-md bg-neutral-100 hover:bg-neutral-200/80 dark:bg-ink-750 dark:hover:bg-ink-700 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Container */}
        <div className="overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5 scholar-scrollbar relative z-10">
          {/* Contextual Notice (e.g. from clicking a format card) */}
          {initialMessage && (
            <div className="mb-3.5 p-2.5 rounded-md bg-neutral-100 dark:bg-ink-750 border border-neutral-200 dark:border-white/10 text-xs text-neutral-700 dark:text-neutral-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
              <span className="font-medium">{initialMessage}</span>
            </div>
          )}

          {/* Guest Quick-Access for testing without compulsory login */}
          <div className="mb-3.5 px-3 py-2 rounded-md bg-neutral-50 dark:bg-ink-750/90 border border-neutral-200/90 dark:border-white/10 flex items-center justify-between gap-2">
            <div className="flex flex-col text-left min-w-0">
              <span className="text-[11.5px] font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
                <span className="sm:hidden">Local mode — sign-in optional</span>
                <span className="hidden sm:inline">Testing locally? Sign-in is optional</span>
              </span>
              <span className="hidden sm:block text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                Open {selectedFormatId === "OT-22" ? "Slides & Keynotes" : "workspace"} immediately as guest
              </span>
            </div>
            <button
              type="button"
              data-compact="true"
              onClick={() => {
                const draft = createEphemeralProject(selectedFormatId || "OT-22", "Academic Presentation Deck");
                onClose();
                navigate(`/projects/${draft.projectId}`);
              }}
              className="px-2.5 py-1.5 rounded-sm bg-white hover:bg-neutral-100 dark:bg-ink-700 dark:hover:bg-ink-650 border border-neutral-300 dark:border-white/15 active:scale-[0.99] text-neutral-900 dark:text-white font-semibold text-[11.5px] transition-all shadow-2xs shrink-0 cursor-pointer whitespace-nowrap"
            >
              Try as Guest →
            </button>
          </div>

          {/* Embedded Auth Screens */}
          {screen === "signin" && (
            <SignInScreen
              embedded
              onRegister={() => setScreen("signup")}
              onForgot={() => setScreen("forgot")}
            />
          )}

          {screen === "signup" && (
            <SignUpScreen
              embedded
              onDone={(email) => {
                setRegisteredEmail(email);
                setScreen("registered");
              }}
              onBack={() => setScreen("signin")}
            />
          )}

          {screen === "forgot" && (
            <ForgotScreen
              embedded
              onBack={() => setScreen("signin")}
            />
          )}

          {screen === "registered" && (
            <RegisteredScreen
              embedded
              email={registeredEmail}
              onBack={() => setScreen("signin")}
              onResend={() => setScreen("resend")}
            />
          )}

          {screen === "resend" && (
            <ResendVerificationScreen
              embedded
              email={registeredEmail}
              onBack={() => setScreen("registered")}
            />
          )}

          {screen === "switch" && (
            <div className="w-full">
              <div className="mb-6">
                <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Switch Researcher Account
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">
                  Toggle between your research profiles and institutions.
                </p>
              </div>

              {switchError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs font-medium text-rose-600 dark:text-rose-400">
                  {switchError}
                </div>
              )}

              <div className="space-y-2 mb-6">
                {savedAccounts.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-neutral-400 py-6 text-center">
                    No other saved accounts on this device.
                  </p>
                ) : (
                  savedAccounts.map((account) => (
                    <div
                      key={account.userId}
                      className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 hover:border-slate-400 dark:hover:border-neutral-600 hover:shadow-xs transition-all"
                    >
                      <div
                        className="min-w-0 flex-1 cursor-pointer"
                        onClick={() => handleSwitchAccount(account.userId)}
                      >
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {account.name || account.email}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-neutral-400 truncate mt-0.5">
                          {account.email} {account.institution ? `• ${account.institution}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAccount(account.userId)}
                        className="ml-2 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="Remove from device"
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>

              <button
                type="button"
                disabled={switching}
                onClick={() => setScreen("signin")}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-sm font-semibold text-slate-900 dark:text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                + Add Another Account
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
