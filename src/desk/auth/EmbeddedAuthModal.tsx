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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[color:var(--surface-canvas)] dark:bg-[#18181b] border border-slate-200/80 dark:border-neutral-800 rounded-2xl shadow-2xl p-6 sm:p-8"
        role="dialog"
        aria-modal="true"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer z-20"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Contextual Notice (e.g. from clicking a format card) */}
        {initialMessage && (
          <div className="mb-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
            <span>{initialMessage}</span>
          </div>
        )}

        {/* Directly wires the previously engineered screens */}
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
              <h2 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">
                Switch Researcher Account
              </h2>
              <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
                Toggle between your research profiles and institutions.
              </p>
            </div>

            {switchError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-600 dark:text-red-400">
                {switchError}
              </div>
            )}

            <div className="space-y-2 mb-6">
              {savedAccounts.length === 0 ? (
                <p className="text-xs text-[color:var(--text-secondary)] py-4 text-center">
                  No other saved accounts on this device.
                </p>
              ) : (
                savedAccounts.map((account) => (
                  <div
                    key={account.userId}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 hover:border-blue-500/50 transition-colors"
                  >
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => handleSwitchAccount(account.userId)}
                    >
                      <p className="text-sm font-semibold text-[color:var(--text-primary)] truncate">
                        {account.name || account.email}
                      </p>
                      <p className="text-xs text-[color:var(--text-secondary)] truncate">
                        {account.email} {account.institution ? `• ${account.institution}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAccount(account.userId)}
                      className="ml-2 text-xs text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
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
              className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-sm font-semibold text-[color:var(--text-primary)] transition-colors cursor-pointer disabled:opacity-50"
            >
              + Add Another Account
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
