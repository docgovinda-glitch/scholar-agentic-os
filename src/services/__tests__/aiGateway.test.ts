// Task 2 (AES-GCM upgrade, 2026-07-24 follow-up session) — getApiKey is now
// async across all 8 provider adapters, using decryptDataAsync (Web Crypto
// AES-GCM, "v2:"-prefixed ciphertext) in place of the legacy synchronous XOR
// cipher (decryptData). These tests exercise real crypto (no mocking of
// src/utils/crypto.ts) through AIGateway.getAvailableProviders, the one
// exported, network-free entry point that calls every adapter's getApiKey.
import { describe, it, expect, beforeEach } from "vitest";
import AIGateway from "../aiGateway";
import { encryptData, encryptDataAsync } from "../../utils/crypto";
import { setVaultPassphrase, clearVaultPassphrase } from "../vaultPassphrase";
import type { AISettings } from "../../types";

beforeEach(() => {
  clearVaultPassphrase();
});

describe("AIGateway getApiKey (via getAvailableProviders) — real AES-GCM crypto, no mocks", () => {
  it("recognizes a real AES-GCM-encrypted key as available when the vault is unlocked with the right passphrase", async () => {
    setVaultPassphrase("correct-vault-passphrase");
    const cipher = await encryptDataAsync("sk-real-key-123", "correct-vault-passphrase");
    const settings: AISettings = { provider: "gemini", geminiApiKey: cipher };

    const providers = await AIGateway.getAvailableProviders(settings);

    expect(providers.some((p) => p.id === "gemini")).toBe(true);
  });

  it("does not recognize the key as available when the vault is locked (no passphrase set)", async () => {
    const cipher = await encryptDataAsync("sk-real-key-123", "correct-vault-passphrase");
    const settings: AISettings = { provider: "gemini", geminiApiKey: cipher };

    const providers = await AIGateway.getAvailableProviders(settings);

    expect(providers.some((p) => p.id === "gemini")).toBe(false);
  });

  it("does not recognize the key as available with the wrong vault passphrase (AES-GCM auth tag fails)", async () => {
    const cipher = await encryptDataAsync("sk-real-key-123", "correct-vault-passphrase");
    setVaultPassphrase("wrong-passphrase");
    const settings: AISettings = { provider: "gemini", geminiApiKey: cipher };

    const providers = await AIGateway.getAvailableProviders(settings);

    expect(providers.some((p) => p.id === "gemini")).toBe(false);
  });

  it("gracefully treats old, pre-AES-GCM ciphertext (legacy XOR, no 'v2:' prefix) as unset rather than throwing", async () => {
    setVaultPassphrase("correct-vault-passphrase");
    const legacyCipher = encryptData("sk-real-key-123", "correct-vault-passphrase");
    const settings: AISettings = { provider: "gemini", geminiApiKey: legacyCipher };

    const providers = await AIGateway.getAvailableProviders(settings);

    expect(providers.some((p) => p.id === "gemini")).toBe(false);
  });

  it("still shows local providers (no API key required) as available regardless of vault state", async () => {
    const settings: AISettings = { provider: "auto" };

    const providers = await AIGateway.getAvailableProviders(settings);

    expect(providers.some((p) => p.id === "ollama")).toBe(true);
    expect(providers.some((p) => p.id === "custom")).toBe(true);
  });
});
