import { useState, useEffect, useRef } from "react";
import { getSupabaseClient } from "../../services/supabaseClient";
import {
  getSavedAccounts,
  switchActiveAccount,
  removeSavedAccount,
  type StoredAccountProfile,
} from "../../services/auth/multiAccountService";
import EmbeddedAuthModal from "../auth/EmbeddedAuthModal";

export interface UserAccountMenuProps {
  userEmail: string | null;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
}

export default function UserAccountMenu({
  userEmail,
  onOpenAccountSettings,
  onOpenVault,
  onOpenAiAccess,
}: UserAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<StoredAccountProfile[]>([]);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
  const initial = userEmail ? userEmail.charAt(0).toUpperCase() : "U";

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:border-[color:var(--border-default)] transition-all cursor-pointer shadow-xs"
      >
        <span className="w-6 h-6 rounded-full bg-[color:var(--accent-subtle)] text-[color:var(--accent)] flex items-center justify-center font-bold text-xs">
          {initial}
        </span>
        <span className="max-w-[130px] truncate hidden sm:inline font-medium">
          {userEmail || "Researcher"}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-[color:var(--text-muted)] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] shadow-2xl p-2.5 z-50 animate-in fade-in zoom-in-95 duration-150 text-xs">
          {/* Active Account Info */}
          <div className="px-3 py-2.5 bg-[color:var(--surface-inset)] rounded-xl border border-[color:var(--border-subtle)] mb-2">
            <span className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider block">
              SIGNED IN AS
            </span>
            <span className="font-bold text-sm text-[color:var(--text-primary)] truncate block mt-0.5">
              {userEmail || "Researcher Account"}
            </span>
          </div>

          {error && (
            <div className="mb-2 p-2 bg-[color:var(--state-danger-subtle)] border border-[color:var(--state-danger)] text-[color:var(--state-danger)] text-[11px] rounded-lg">
              {error}
            </div>
          )}

          {/* Standard Navigation Links */}
          <div className="flex flex-col gap-0.5 mb-2">
            {onOpenAccountSettings && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenAccountSettings();
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-[color:var(--surface-hover)] font-medium text-[color:var(--text-primary)] transition-colors cursor-pointer flex items-center gap-2.5"
              >
                <svg className="w-4 h-4 text-[color:var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Account Settings
              </button>
            )}

            {onOpenVault && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenVault();
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-[color:var(--surface-hover)] font-medium text-[color:var(--text-primary)] transition-colors cursor-pointer flex items-center gap-2.5"
              >
                <svg className="w-4 h-4 text-[color:var(--state-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Private Knowledge Vault
              </button>
            )}

            {onOpenAiAccess && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenAiAccess();
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-[color:var(--surface-hover)] font-medium text-[color:var(--text-primary)] transition-colors cursor-pointer flex items-center gap-2.5"
              >
                <svg className="w-4 h-4 text-[color:var(--state-info)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                AI Access & BYOK
              </button>
            )}
          </div>

          {/* Other Linked Accounts (Switch Accounts Section) */}
          <div className="border-t border-[color:var(--border-subtle)] pt-2 pb-1">
            <div className="flex items-center justify-between px-3 py-1 text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider">
              <span>Switch Accounts</span>
              {otherAccounts.length > 0 && <span>{otherAccounts.length} saved</span>}
            </div>

            {otherAccounts.length > 0 ? (
              <div className="flex flex-col gap-1 my-1 max-h-32 overflow-y-auto">
                {otherAccounts.map((acc) => (
                  <div
                    key={acc.userId}
                    className="flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-[color:var(--surface-hover)] transition-colors"
                  >
                    <button
                      type="button"
                      disabled={switching}
                      onClick={() => handleSwitch(acc.userId)}
                      className="flex items-center gap-2 min-w-0 text-left cursor-pointer flex-1"
                    >
                      <span className="w-5 h-5 rounded-full bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] flex items-center justify-center font-bold text-[10px] text-[color:var(--text-secondary)]">
                        {acc.email.charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate text-xs text-[color:var(--text-primary)] font-medium max-w-[140px]">
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
                      className="text-[10px] text-[color:var(--text-muted)] hover:text-[color:var(--state-danger)] p-1"
                      title="Remove account"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-3 py-1 text-[11px] text-[color:var(--text-muted)] italic">
                No other accounts linked yet.
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setAddAccountOpen(true);
              }}
              className="w-full text-left px-3 py-1.5 rounded-lg text-[color:var(--accent)] hover:bg-[color:var(--accent-subtle)] font-bold text-xs transition-colors cursor-pointer flex items-center gap-2 mt-1"
            >
              <span>+ Add another account</span>
            </button>
          </div>

          {/* Sign Out Button */}
          <div className="my-1 border-t border-[color:var(--border-subtle)] pt-1" />
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full text-left px-3 py-2 rounded-lg text-[color:var(--state-danger)] hover:bg-[color:var(--state-danger-subtle)] font-semibold transition-colors cursor-pointer flex items-center justify-between"
          >
            <span>Sign Out</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
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
