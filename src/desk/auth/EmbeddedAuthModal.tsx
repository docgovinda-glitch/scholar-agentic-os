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
  const modalWidth = isWide ? "max-w-2xl" : "max-w-md";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/50 dark:bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`relative w-full ${modalWidth} max-h-[92vh] overflow-hidden bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl border border-slate-200/90 dark:border-neutral-800 rounded-3xl shadow-2xl shadow-slate-950/20 flex flex-col transition-all duration-200`}
        role="dialog"
        aria-modal="true"
      >
        {/* Subtle luminous ambient background aura at the top of the modal */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-amber-500/10 via-orange-500/5 to-transparent pointer-events-none z-0" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100/80 hover:bg-slate-200 dark:bg-neutral-800/80 dark:hover:bg-neutral-700 text-slate-500 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer z-30"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Scrollable Container */}
        <div className="overflow-y-auto p-6 sm:p-8 scholar-scrollbar relative z-10">
          {/* Quick Segmented Mode Switcher */}
          {(screen === "signin" || screen === "signup") && (
            <div className="flex p-1 bg-slate-100/90 dark:bg-neutral-800/90 rounded-2xl mb-5 border border-slate-200/70 dark:border-neutral-700/70 shadow-2xs">
              <button
                type="button"
                onClick={() => setScreen("signin")}
                className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-xl transition-all duration-150 cursor-pointer ${
                  screen === "signin"
                    ? "bg-white dark:bg-neutral-900 text-slate-900 dark:text-white shadow-xs font-bold"
                    : "text-slate-500 hover:text-slate-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setScreen("signup")}
                className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-xl transition-all duration-150 cursor-pointer ${
                  screen === "signup"
                    ? "bg-white dark:bg-neutral-900 text-slate-900 dark:text-white shadow-xs font-bold"
                    : "text-slate-500 hover:text-slate-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {/* Contextual Notice (e.g. from clicking a format card) */}
          {initialMessage && (
            <div className="mb-4 p-3 rounded-xl bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
              <span className="font-medium">{initialMessage}</span>
            </div>
          )}

          {/* Guest Quick-Access for testing without compulsory login */}
          <div className="mb-5 p-3.5 rounded-2xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/30 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex flex-col text-left">
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <span>⚡</span> Testing locally? Sign-in is optional
              </span>
              <span className="text-[11px] text-slate-600 dark:text-neutral-400 mt-0.5">
                Open {selectedFormatId === "OT-22" ? "Presentation Studio" : "workspace"} immediately as guest
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                const draft = createEphemeralProject(selectedFormatId || "OT-22", "Academic Presentation Deck");
                onClose();
                navigate(`/projects/${draft.projectId}`);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-xs transition-all shadow-sm shrink-0 cursor-pointer"
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
