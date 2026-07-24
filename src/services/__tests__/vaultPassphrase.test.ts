// Task 3 (agent-UI adapter follow-up session, 2026-07-24) — BYOK vault passphrase.
// The core guarantee under test: the passphrase lives ONLY in a module-scope
// variable, is never written to any persistence API, and getEncryptionSecret()
// returns "" (not throwing, not undefined) when the vault is locked, matching
// every existing decryptData()/encryptData() call site's empty-secret handling.
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  setVaultPassphrase,
  getVaultPassphrase,
  getEncryptionSecret,
  isVaultUnlocked,
  clearVaultPassphrase,
} from "../vaultPassphrase";

beforeEach(() => {
  clearVaultPassphrase();
});

describe("vaultPassphrase — in-memory-only lifecycle", () => {
  it("starts locked (no passphrase set)", () => {
    expect(isVaultUnlocked()).toBe(false);
    expect(getVaultPassphrase()).toBeNull();
    expect(getEncryptionSecret()).toBe("");
  });

  it("unlocks after setVaultPassphrase and returns the exact value set", () => {
    setVaultPassphrase("my-secret-passphrase");

    expect(isVaultUnlocked()).toBe(true);
    expect(getVaultPassphrase()).toBe("my-secret-passphrase");
    expect(getEncryptionSecret()).toBe("my-secret-passphrase");
  });

  it("locks again after clearVaultPassphrase", () => {
    setVaultPassphrase("my-secret-passphrase");
    clearVaultPassphrase();

    expect(isVaultUnlocked()).toBe(false);
    expect(getVaultPassphrase()).toBeNull();
    expect(getEncryptionSecret()).toBe("");
  });

  it("treats an empty string passphrase as locked, not unlocked", () => {
    setVaultPassphrase("");

    expect(isVaultUnlocked()).toBe(false);
    expect(getEncryptionSecret()).toBe("");
  });

  it("never writes the passphrase to localStorage or sessionStorage", () => {
    const lsSetSpy = vi.fn();
    const ssSetSpy = vi.fn();
    const originalLS = (globalThis as any).localStorage;
    const originalSS = (globalThis as any).sessionStorage;
    (globalThis as any).localStorage = { setItem: lsSetSpy, getItem: () => null };
    (globalThis as any).sessionStorage = { setItem: ssSetSpy, getItem: () => null };

    setVaultPassphrase("super-secret-vault-passphrase-12345");
    getVaultPassphrase();
    getEncryptionSecret();
    isVaultUnlocked();

    expect(lsSetSpy).not.toHaveBeenCalled();
    expect(ssSetSpy).not.toHaveBeenCalled();

    (globalThis as any).localStorage = originalLS;
    (globalThis as any).sessionStorage = originalSS;
  });
});
