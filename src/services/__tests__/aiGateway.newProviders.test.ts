// AI modes redesign, Step 1 — characterization tests for the new adapters
// added to support the 5-mode redesign: Groq and Together AI ("Cloud AI
// Providers", routed through the existing /api/generate server proxy like
// every other BYOK cloud provider).
//
// Follow-up correction (2026-07-28): Pollinations-backed "Smart AI" was
// confirmed to only simulate success in some paths rather than reliably
// deliver, and has been removed entirely (adapter, config, UI, tests).
// OmniRoute replaces it as the new Option 1 — see the dedicated describe
// block below, converted from the old Pollinations characterization rather
// than just deleted, per the standing "convert, don't silently drop
// coverage" discipline.
//
// Network is mocked here (unlike the reconciliation doc's live verification)
// to keep the suite hermetic and fast.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AIGateway, { AI_PROVIDERS } from "../aiGateway";
import { encryptDataAsync } from "../../utils/crypto";
import { setVaultPassphrase, clearVaultPassphrase } from "../vaultPassphrase";
import type { AISettings } from "../../types";

describe("AI_PROVIDERS registry — new entries", () => {
  it("includes omniroute, groq, together, and openrouter with correct metadata", () => {
    const omniroute = AI_PROVIDERS.find((p) => p.id === "omniroute");
    const groq = AI_PROVIDERS.find((p) => p.id === "groq");
    const together = AI_PROVIDERS.find((p) => p.id === "together");
    const openrouter = AI_PROVIDERS.find((p) => p.id === "openrouter");

    expect(omniroute).toMatchObject({ requiresApiKey: false, pricingTier: "free", type: "local" });
    expect(groq).toMatchObject({ requiresApiKey: true, type: "cloud" });
    expect(together).toMatchObject({ requiresApiKey: true, type: "cloud" });
    expect(openrouter).toMatchObject({ requiresApiKey: true, type: "cloud" });
  });

  it("no longer includes the removed pollinations provider", () => {
    expect(AI_PROVIDERS.find((p) => p.id === "pollinations")).toBeUndefined();
  });
});

describe("OpenRouter adapter — BYOK, vault-gated, proxy-routed (Step 3)", () => {
  beforeEach(() => {
    clearVaultPassphrase();
  });

  it("is unavailable until a real key is decryptable (vault unlocked, correct passphrase)", async () => {
    const cipher = await encryptDataAsync("sk-or-real-key", "correct-pass");
    const locked: AISettings = { provider: "openrouter", openrouterApiKey: cipher };
    expect((await AIGateway.getAvailableProviders(locked)).some((p) => p.id === "openrouter")).toBe(false);

    setVaultPassphrase("correct-pass");
    const unlocked: AISettings = { provider: "openrouter", openrouterApiKey: cipher };
    expect((await AIGateway.getAvailableProviders(unlocked)).some((p) => p.id === "openrouter")).toBe(true);
  });
});

describe("OmniRoute adapter — self-hosted local router, no key, real endpoint checks (replaces the removed Smart AI)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("is treated as available with no API key and no vault interaction (it's a local endpoint, not a cloud key)", async () => {
    clearVaultPassphrase();
    const settings: AISettings = { provider: "omniroute" };
    const providers = await AIGateway.getAvailableProviders(settings);
    expect(providers.some((p) => p.id === "omniroute")).toBe(true);
  });

  it("calls the real configured local endpoint (default localhost:20128/v1), never a hosted URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "OK." } }] })
    });
    global.fetch = fetchMock as any;

    await AIGateway.getAdapter("omniroute")!.generate(
      { systemInstruction: "sys", prompt: "hello", temperature: 0.5, taskType: "test" },
      { provider: "omniroute" }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:20128/v1/chat/completions",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("respects a custom omnirouteEndpoint setting instead of the default", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "OK." } }] }) });
    global.fetch = fetchMock as any;

    await AIGateway.getAdapter("omniroute")!.generate(
      { systemInstruction: "sys", prompt: "hello", temperature: 0.5, taskType: "test" },
      { provider: "omniroute", omnirouteEndpoint: "http://localhost:9999/v1" }
    );

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:9999/v1/chat/completions", expect.anything());
  });

  it("healthCheck reports real offline status (never optimistic success) when the local endpoint is unreachable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("fetch failed")) as any;

    const result = await AIGateway.getAdapter("omniroute")!.healthCheck({ provider: "omniroute" });

    expect(result.status).toBe("offline");
    expect(result.provider).toBe("omniroute");
  });

  it("healthCheck reports real online status with available models when the local endpoint responds", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "gpt-4o-mini" }, { id: "claude-3-5-sonnet" }] })
    }) as any;

    const result = await AIGateway.getAdapter("omniroute")!.healthCheck({ provider: "omniroute" });

    expect(result.status).toBe("online");
    expect(result.availableModels).toEqual(["gpt-4o-mini", "claude-3-5-sonnet"]);
  });
});

describe("Groq / Together adapters — BYOK, vault-gated, proxy-routed", () => {
  beforeEach(() => {
    clearVaultPassphrase();
  });

  it("Groq is unavailable until a real key is decryptable (vault unlocked, correct passphrase)", async () => {
    const cipher = await encryptDataAsync("gsk-real-key", "correct-pass");
    const locked: AISettings = { provider: "groq", groqApiKey: cipher };
    expect((await AIGateway.getAvailableProviders(locked)).some((p) => p.id === "groq")).toBe(false);

    setVaultPassphrase("correct-pass");
    const unlocked: AISettings = { provider: "groq", groqApiKey: cipher };
    expect((await AIGateway.getAvailableProviders(unlocked)).some((p) => p.id === "groq")).toBe(true);
  });

  it("Together AI is unavailable until a real key is decryptable (vault unlocked, correct passphrase)", async () => {
    const cipher = await encryptDataAsync("together-real-key", "correct-pass");
    const locked: AISettings = { provider: "together", togetherApiKey: cipher };
    expect((await AIGateway.getAvailableProviders(locked)).some((p) => p.id === "together")).toBe(false);

    setVaultPassphrase("correct-pass");
    const unlocked: AISettings = { provider: "together", togetherApiKey: cipher };
    expect((await AIGateway.getAvailableProviders(unlocked)).some((p) => p.id === "together")).toBe(true);
  });
});
