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
        className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/80 border border-neutral-200 text-xs font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-all cursor-pointer shadow-2xs"
      >
        <span className="w-5 h-5 rounded-full bg-neutral-900 text-white flex items-center justify-center font-semibold text-[11px] shadow-2xs">
          {initial}
        </span>
        <span className="max-w-[130px] truncate hidden sm:inline font-medium text-neutral-700">
          {userEmail || "Researcher"}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-neutral-500 transition-transform duration-200 ${
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

      {/* Dropdown Menu */}
      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white border border-neutral-200/90 shadow-xl p-3 z-50 text-xs animate-in fade-in duration-150">
          {/* Active Account Info */}
          <div className="px-3.5 py-2.5 bg-neutral-50 rounded-xl border border-neutral-100 mb-2.5">
            <span className="text-[11px] font-medium text-neutral-500 block">
              Signed in as
            </span>
            <span className="font-semibold text-xs text-neutral-900 truncate block mt-0.5">
              {userEmail || "Researcher Account"}
            </span>
          </div>

          {error && (
            <div className="mb-2 p-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
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
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-100 font-medium text-neutral-700 hover:text-neutral-900 transition-colors cursor-pointer flex items-center gap-2.5"
              >
                <svg className="w-4 h-4 flex-shrink-0 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-100 font-medium text-neutral-700 hover:text-neutral-900 transition-colors cursor-pointer flex items-center gap-2.5"
              >
                <svg className="w-4 h-4 flex-shrink-0 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
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
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-100 font-medium text-neutral-700 hover:text-neutral-900 transition-colors cursor-pointer flex items-center gap-2.5"
              >
                <svg className="w-4 h-4 flex-shrink-0 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                AI Access & BYOK
              </button>
            )}
          </div>

          {/* Other Linked Accounts (Switch Accounts Section) */}
          <div className="border-t border-neutral-100 pt-2 pb-1">
            <div className="flex items-center justify-between px-3 py-1 text-xs font-medium text-neutral-500">
              <span>Switch Accounts</span>
              {otherAccounts.length > 0 && <span className="text-[11px] text-neutral-400">{otherAccounts.length} saved</span>}
            </div>

            {otherAccounts.length > 0 ? (
              <div className="flex flex-col gap-1 my-1 max-h-32 overflow-y-auto">
                {otherAccounts.map((acc) => (
                  <div
                    key={acc.userId}
                    className="flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-neutral-100 transition-colors"
                  >
                    <button
                      type="button"
                      disabled={switching}
                      onClick={() => handleSwitch(acc.userId)}
                      className="flex items-center gap-2 min-w-0 text-left cursor-pointer flex-1"
                    >
                      <span className="w-5 h-5 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center font-semibold text-[10px] text-neutral-700">
                        {acc.email.charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate text-xs text-neutral-700 font-medium max-w-[140px]">
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
                      className="text-neutral-400 hover:text-red-600 p-1 rounded-full transition-colors cursor-pointer"
                      title="Remove account"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-3 py-1 text-xs text-neutral-400 font-normal">
                No other accounts linked yet.
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setAddAccountOpen(true);
              }}
              className="w-full text-left px-3 py-2 rounded-xl text-neutral-700 hover:bg-neutral-100 font-medium text-xs transition-colors cursor-pointer flex items-center gap-2 mt-1"
            >
              <span>+ Add another account</span>
            </button>
          </div>

          {/* Sign Out Button */}
          <div className="my-1 border-t border-neutral-100 pt-1" />
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full text-left px-3 py-2 rounded-xl text-neutral-700 hover:bg-red-50 hover:text-red-600 font-medium transition-colors cursor-pointer flex items-center justify-between"
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
