import { useState, useEffect, useRef } from "react";
import { getSupabaseClient } from "../../services/supabaseClient";
import { getProfile } from "../../services/supabaseAuthService";
import {
  getSavedAccounts,
  switchActiveAccount,
  removeSavedAccount,
  type StoredAccountProfile,
} from "../../services/auth/multiAccountService";
import EmbeddedAuthModal from "../auth/EmbeddedAuthModal";

export interface UserAccountMenuProps {
  userEmail?: string | null;
  userFullName?: string | null;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
  onOpenHelp?: () => void;
  onOpenAuth?: (mode: "signin" | "signup") => void;
  dropUp?: boolean;
  variant?: "bar" | "sidebar";
}

export default function UserAccountMenu({
  userEmail,
  userFullName,
  onOpenAccountSettings,
  onOpenVault,
  onOpenAiAccess,
  onOpenHelp,
  onOpenAuth,
  dropUp = false,
  variant = "bar",
}: UserAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<StoredAccountProfile[]>([]);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(userFullName || null);
  const [username, setUsername] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    if (userFullName) {
      setFullName(userFullName);
    }
    getProfile()
      .then((res) => {
        if (!active) return;
        if (res.success && res.profile) {
          if (res.profile.fullName) setFullName(res.profile.fullName);
          if (res.profile.username) setUsername(res.profile.username);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [userFullName, userEmail]);

  useEffect(() => {
    setSavedAccounts(getSavedAccounts());
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  async function handleSwitch(userId: string) {
    setSwitching(true);
    setError(null);
    const res = await switchActiveAccount(userId);
    if (!res.success) {
      setError(res.error || "Failed to switch accounts");
      setSwitching(false);
    } else {
      setOpen(false);
    }
  }

  async function handleSignOut() {
    const confirmed = window.confirm("Sign out of Scholar Core and return to Home?");
    if (!confirmed) return;
    try {
      const supabase = getSupabaseClient();
      await supabase?.auth?.signOut?.();
    } catch {}
    window.location.href = "/";
  }

  const otherAccounts = savedAccounts.filter((a) => a.email !== userEmail);
  const displayName = fullName || (username ? `@${username}` : (userEmail ? userEmail.split("@")[0] : "Researcher"));
  const secondaryIdentifier = userEmail || (username ? `@${username}` : "Scholar Profile");
  const initial = (fullName ? fullName.charAt(0) : (userEmail ? userEmail.charAt(0) : "U")).toUpperCase();

  if (!userEmail) {
    return (
      <div className="relative w-full">
        <button
          type="button"
          onClick={() => onOpenAuth?.("signin")}
          aria-label="Sign in"
          className="w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl border border-slate-200/80 dark:border-neutral-800 bg-white dark:bg-[#18181A] hover:bg-slate-50 dark:hover:bg-neutral-800 text-[var(--text-primary)] transition-all cursor-pointer text-left shadow-2xs group font-sans"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-2xs">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </span>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold tracking-tight text-[var(--text-primary)] truncate leading-tight">
                Guest Researcher
              </span>
              <span className="text-[10px] text-slate-500 dark:text-neutral-400 leading-none mt-0.5 font-medium truncate">
                Sign In / Register →
              </span>
            </div>
          </div>
          <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full" ref={menuRef}>
      {/* Trigger Button */}
      {variant === "sidebar" ? (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl border border-[var(--theme-fg)]/15 bg-[var(--theme-bg)] hover:bg-[var(--theme-fg)]/5 text-[var(--theme-fg)] transition-all cursor-pointer text-left shadow-2xs group"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-[var(--theme-fg)] text-[var(--theme-bg)] flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-2xs">
              {initial}
            </span>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold tracking-tight text-[var(--theme-fg)] truncate leading-tight">
                {displayName}
              </span>
              <span className="text-[10px] text-[var(--theme-fg)]/60 leading-none mt-0.5 font-normal truncate">
                {secondaryIdentifier}
              </span>
            </div>
          </div>
          <svg
            className={`w-3.5 h-3.5 text-[var(--theme-fg)]/60 transition-transform duration-200 flex-shrink-0 ${
              open ? (dropUp ? "rotate-0" : "rotate-180") : (dropUp ? "rotate-180" : "")
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--theme-bg)] border border-[var(--theme-fg)]/15 text-xs font-semibold tracking-tight text-[var(--theme-fg)] hover:bg-[var(--theme-fg)]/5 transition-all cursor-pointer shadow-2xs"
        >
          <span className="w-5 h-5 rounded-full bg-[var(--theme-fg)] text-[var(--theme-bg)] flex items-center justify-center font-bold text-[11px] shadow-2xs">
            {initial}
          </span>
          <div className="flex flex-col text-left max-w-[150px] hidden sm:flex leading-tight">
            <span className="truncate font-semibold tracking-tight text-[var(--theme-fg)] text-xs">
              {displayName}
            </span>
            <span className="truncate text-[9px] text-[var(--theme-fg)]/60 font-normal">
              {secondaryIdentifier}
            </span>
          </div>
          <svg
            className={`w-3.5 h-3.5 text-[var(--theme-fg)]/60 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* Dropdown Menu */}
      {open && (
        <div
          className={`absolute ${
            dropUp ? "bottom-full left-0 mb-2 w-full" : "right-0 mt-2 w-72"
          } rounded-2xl bg-[var(--theme-bg)] border border-[var(--theme-fg)]/15 shadow-xl p-2 z-50 text-xs animate-in fade-in duration-150`}
        >
          {error && (
            <div className="mb-2 p-2 bg-red-50/80 border border-red-200 text-red-700 text-xs rounded-xl">
              {error}
            </div>
          )}

          {/* Categorized Users / Switch Accounts Section */}
          <div className="pt-1 pb-1">
            <div className="flex items-center justify-between px-3 py-1 text-[11px] font-semibold tracking-tight text-[var(--theme-fg)]/60 uppercase">
              <span>Switch Accounts</span>
              {otherAccounts.length > 0 && <span className="text-[10px] text-[var(--theme-fg)]/40 font-normal">{otherAccounts.length} saved</span>}
            </div>

            {otherAccounts.length > 0 && (
              <div className="flex flex-col gap-1 my-1 max-h-32 overflow-y-auto scholar-scrollbar">
                {otherAccounts.map((acc) => (
                  <div
                    key={acc.userId}
                    className="flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-[var(--theme-fg)]/5 transition-colors"
                  >
                    <button
                      type="button"
                      disabled={switching}
                      onClick={() => handleSwitch(acc.userId)}
                      className="flex items-center gap-2 min-w-0 text-left cursor-pointer flex-1"
                    >
                      <span className="w-5 h-5 rounded-full bg-[var(--theme-fg)]/10 border border-[var(--theme-fg)]/15 flex items-center justify-center font-semibold text-[10px] text-[var(--theme-fg)]">
                        {acc.email.charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate text-xs text-[var(--theme-fg)]/80 font-semibold tracking-tight max-w-[140px]">
                        {acc.email}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSavedAccount(acc.userId);
                        setSavedAccounts(getSavedAccounts());
                      }}
                      className="text-[var(--theme-fg)]/40 hover:text-red-500 p-1 rounded-full transition-colors cursor-pointer"
                      title="Remove account"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setAddAccountOpen(true);
              }}
              className="w-full text-left px-3 py-1.5 rounded-xl text-[var(--theme-fg)]/80 hover:bg-[var(--theme-fg)]/5 font-semibold tracking-tight text-xs transition-colors cursor-pointer flex items-center gap-2"
            >
              <span>+ Add another account</span>
            </button>
          </div>

          {/* Sign Out Button */}
          <div className="my-1 border-t border-[var(--theme-fg)]/10 pt-1" />
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full text-left px-3 py-2 rounded-xl text-[var(--theme-fg)]/80 hover:bg-red-500/10 hover:text-red-500 font-semibold tracking-tight transition-colors cursor-pointer flex items-center justify-between"
          >
            <span>Sign Out</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      )}

      {/* Embedded Auth Modal for Adding Another Account */}
      {addAccountOpen && (
        <EmbeddedAuthModal
          isOpen={addAccountOpen}
          onClose={() => setAddAccountOpen(false)}
          initialMode="signin"
          initialMessage="Sign into your second account to link it to the switcher."
        />
      )}
    </div>
  );
}
