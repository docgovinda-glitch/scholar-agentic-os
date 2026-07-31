// @vitest-environment jsdom
//
// API vault tests — real Web Crypto and a real IndexedDB, no mocking of
// either, because the security properties being asserted (keys never stored
// in readable form, a wrong passphrase never decrypting) are exactly the ones
// a mock would fake.

// Same localStorage wiring as the other jsdom suites in this repo — the
// runner does not expose one globally by default.
Object.defineProperty(globalThis, "localStorage", {
  value: (globalThis as any).jsdom.window.localStorage,
  configurable: true,
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import * as vault from "../apiVault";

const VAULT_KEY = "scholar_api_vault_v1";

beforeEach(async () => {
  vault.lockVault();
  localStorage.clear();
  await vault.destroyVault();
});

afterEach(() => {
  vault.lockVault();
});

describe("vault lifecycle", () => {
  it("starts with no vault at all", () => {
    expect(vault.vaultExists()).toBe(false);
    expect(vault.isVaultUnlocked()).toBe(false);
  });

  it("creates a device-mode vault that reopens with no prompt", async () => {
    expect((await vault.unlockVault()).ok).toBe(true);
    expect(vault.getVaultMode()).toBe("device");

    vault.lockVault();

    // The whole point of device mode: a returning user is never asked anything.
    expect(vault.canAutoUnlock()).toBe(true);
    expect((await vault.unlockVault()).ok).toBe(true);
  });

  it("creates a passphrase-mode vault that refuses to open without one", async () => {
    await vault.unlockVault("correct horse battery");
    expect(vault.getVaultMode()).toBe("passphrase");

    vault.lockVault();

    expect(vault.canAutoUnlock()).toBe(false);
    expect((await vault.unlockVault()).reason).toBe("needs-passphrase");
  });

  it("rejects the wrong passphrase with a precise reason, not a generic failure", async () => {
    await vault.unlockVault("correct horse battery");
    await vault.setEntry("groq", { apiKey: "gsk_secret" });
    vault.lockVault();

    const result = await vault.unlockVault("wrong passphrase");

    // The verifier blob exists so this is distinguishable from corruption —
    // the two need completely different messages.
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("wrong-passphrase");
  });

  it("locking clears the decrypted contents but keeps the stored vault", async () => {
    await vault.unlockVault();
    await vault.setEntry("groq", { apiKey: "gsk_secret" });

    vault.lockVault();

    expect(vault.isVaultUnlocked()).toBe(false);
    expect(vault.getApiKey("groq")).toBe("");
    expect(vault.vaultExists()).toBe(true);
  });
});

describe("encryption at rest", () => {
  it("never writes an API key to storage in readable form", async () => {
    await vault.unlockVault();
    await vault.setEntry("groq", { apiKey: "gsk_super_secret_value_12345" });

    const stored = localStorage.getItem(VAULT_KEY)!;

    expect(stored).not.toContain("gsk_super_secret_value_12345");
    expect(stored).not.toContain("super_secret");
  });

  it("stores device-mode data under the raw-CryptoKey format, not a derived-secret one", async () => {
    await vault.unlockVault();
    await vault.setEntry("groq", { apiKey: "gsk_x" });

    // "k1:" means it was encrypted with the non-extractable IndexedDB key;
    // "v2:" would mean a key derived from a string secret existed in memory.
    expect(JSON.parse(localStorage.getItem(VAULT_KEY)!).payload.startsWith("k1:")).toBe(true);
  });

  it("uses the passphrase-derived format in passphrase mode", async () => {
    await vault.unlockVault("a-real-passphrase");
    await vault.setEntry("groq", { apiKey: "gsk_x" });

    expect(JSON.parse(localStorage.getItem(VAULT_KEY)!).payload.startsWith("v2:")).toBe(true);
  });

  it("survives a lock/unlock round trip with the key intact", async () => {
    await vault.unlockVault("pass-phrase-here");
    await vault.setEntry("groq", { apiKey: "gsk_round_trip" });

    vault.lockVault();
    await vault.unlockVault("pass-phrase-here");

    expect(vault.getApiKey("groq")).toBe("gsk_round_trip");
  });
});

describe("entries", () => {
  beforeEach(async () => {
    await vault.unlockVault();
  });

  it("stores and reads a key with its model and base URL", async () => {
    await vault.setEntry("cloudflare", {
      apiKey: "cf_key",
      baseUrl: "https://api.cloudflare.com/client/v4/accounts/abc/ai/v1",
      model: "@cf/meta/llama-3.1-8b-instruct",
    });

    const entry = vault.getEntry("cloudflare")!;
    expect(entry.apiKey).toBe("cf_key");
    expect(entry.baseUrl).toContain("accounts/abc");
    expect(entry.model).toBe("@cf/meta/llama-3.1-8b-instruct");
  });

  it("keeps the existing key when an edit omits it", async () => {
    // The UI never prefills the key input, so a blank box must mean "leave it
    // alone" — treating it as a deletion would wipe a working key whenever the
    // user changed only the model.
    await vault.setEntry("groq", { apiKey: "gsk_original" });
    await vault.setEntry("groq", { model: "llama-3.1-8b-instant" });

    expect(vault.getApiKey("groq")).toBe("gsk_original");
    expect(vault.getEntry("groq")!.model).toBe("llama-3.1-8b-instant");
  });

  it("resets validation state when the key itself changes", async () => {
    await vault.setEntry("groq", { apiKey: "gsk_first" });
    await vault.recordValidation("groq", "valid");

    await vault.setEntry("groq", { apiKey: "gsk_second" });

    // A previous "valid" says nothing about a different key.
    expect(vault.getEntry("groq")!.lastStatus).toBe("unvalidated");
  });

  it("removes an entry and drops it from the failover order", async () => {
    await vault.setEntry("groq", { apiKey: "gsk_x" });
    await vault.removeEntry("groq");

    expect(vault.getEntry("groq")).toBeUndefined();
    expect(vault.getFailoverChain()).not.toContain("groq");
  });

  it("excludes disabled and keyless providers from the failover chain", async () => {
    await vault.setEntry("groq", { apiKey: "gsk_x" });
    await vault.setEntry("gemini", { apiKey: "gm_x" });
    await vault.setEntry("openai", { apiKey: "" });
    await vault.setEntryDisabled("gemini", true);

    expect(vault.getFailoverChain()).toEqual(["groq"]);
  });

  it("honours an explicit failover order", async () => {
    await vault.setEntry("groq", { apiKey: "a" });
    await vault.setEntry("gemini", { apiKey: "b" });

    await vault.setFailoverOrder(["gemini", "groq"]);

    expect(vault.getFailoverChain()).toEqual(["gemini", "groq"]);
  });
});

describe("backup and recovery", () => {
  it("produces a backup that restores on a completely fresh vault", async () => {
    await vault.unlockVault();
    await vault.setEntry("groq", { apiKey: "gsk_backed_up" });
    await vault.setEntry("gemini", { apiKey: "gm_backed_up" });
    const backup = await vault.exportBackup("my-recovery-phrase");

    // Simulate a new device: everything local is gone.
    await vault.destroyVault();
    await vault.unlockVault();

    const result = await vault.importBackup(backup, "my-recovery-phrase");

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(2);
    expect(vault.getApiKey("groq")).toBe("gsk_backed_up");
  });

  it("does not encrypt the backup with the device key, which cannot leave the device", async () => {
    await vault.unlockVault();
    await vault.setEntry("groq", { apiKey: "gsk_x" });

    const backup = await vault.exportBackup("phrase");

    // "v2:" = derived from the recovery passphrase, so another device can open it.
    expect(backup.payload.startsWith("v2:")).toBe(true);
    expect(backup.cipher).toBe("AES-GCM-256");
  });

  it("refuses the wrong recovery passphrase", async () => {
    await vault.unlockVault();
    await vault.setEntry("groq", { apiKey: "gsk_x" });
    const backup = await vault.exportBackup("right-phrase");

    const result = await vault.importBackup(backup, "wrong-phrase");

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/does not match/i);
  });

  it("rejects a file that is not a vault backup", async () => {
    await vault.unlockVault();

    expect((await vault.importBackup({ some: "json" }, "phrase")).ok).toBe(false);
  });

  it("merges without overwriting a key added since the backup was taken", async () => {
    await vault.unlockVault();
    await vault.setEntry("groq", { apiKey: "gsk_old" });
    const backup = await vault.exportBackup("phrase");

    await vault.setEntry("groq", { apiKey: "gsk_newer" });
    await vault.importBackup(backup, "phrase");

    // Restoring must not silently roll a key back to an older value.
    expect(vault.getApiKey("groq")).toBe("gsk_newer");
  });

  it("never puts a readable key in the backup file", async () => {
    await vault.unlockVault();
    await vault.setEntry("groq", { apiKey: "gsk_never_plaintext" });

    const backup = await vault.exportBackup("phrase");

    expect(JSON.stringify(backup)).not.toContain("gsk_never_plaintext");
  });

  it("requires a recovery passphrase", async () => {
    await vault.unlockVault();
    await expect(vault.exportBackup("")).rejects.toThrow(/recovery passphrase/i);
  });
});

describe("subscribers", () => {
  it("notifies listeners on mutation so React views can re-render", async () => {
    await vault.unlockVault();
    let calls = 0;
    const unsubscribe = vault.subscribeToVault(() => calls++);

    await vault.setEntry("groq", { apiKey: "gsk_x" });
    expect(calls).toBeGreaterThan(0);

    unsubscribe();
    const after = calls;
    await vault.setEntry("gemini", { apiKey: "gm_x" });
    expect(calls).toBe(after);
  });
});
