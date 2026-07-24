/**
 * Task 3 (agent-UI adapter follow-up session, 2026-07-24) — BYOK vault passphrase.
 *
 * Real vulnerability this fixes: provider API keys were encrypted (aiGateway.ts,
 * AISetupWizard.tsx, AIControlCenter.tsx) using the user's login `passcodeHash`
 * as the secret. But `passcodeHash` is not actually hashed — UserProfileGate.tsx
 * stores the raw login password directly under that field name — and it lives
 * in the SAME localStorage blob (`phd_profile_state_<user>`) as the encrypted
 * keys themselves. Anyone with localStorage access (devtools, XSS) could read
 * `passcodeHash` and decrypt every stored provider key instantly — the
 * "encryption" was providing almost no real at-rest protection.
 *
 * This module is the fix: a separate vault passphrase, held ONLY in this
 * module-scope variable, cleared on reload, and NEVER written to localStorage,
 * sessionStorage, or project/profile state — confirmed nowhere in this file
 * touches any persistence API. Losing it (closing the tab, reloading) means
 * re-entering it before any provider key can be decrypted for a real request —
 * that in-memory-only lifecycle is the entire point, not an oversight.
 *
 * Callers needing the actual encryption secret should use getEncryptionSecret(),
 * not getVaultPassphrase() directly, so "no passphrase set" consistently means
 * "no secret available" (empty string) to every existing decryptData() call
 * site, matching aiGateway.ts's pre-existing "no hardcoded fallback" behavior
 * for an unauthenticated/locked state.
 */

let activePassphrase: string | null = null;

/** Sets the in-memory vault passphrase for this session. Never persisted. */
export function setVaultPassphrase(passphrase: string): void {
  activePassphrase = passphrase || null;
}

/** Returns the raw in-memory passphrase, or null if the vault is locked. */
export function getVaultPassphrase(): string | null {
  return activePassphrase;
}

/** The actual secret to feed into encryptData/decryptData — "" when locked,
 *  so existing call sites' empty-secret handling (throw/return "") is reused
 *  as-is rather than needing new locked-state branching everywhere. */
export function getEncryptionSecret(): string {
  return activePassphrase ?? "";
}

export function isVaultUnlocked(): boolean {
  return activePassphrase !== null;
}

/** Locks the vault again — call on logout. */
export function clearVaultPassphrase(): void {
  activePassphrase = null;
}
