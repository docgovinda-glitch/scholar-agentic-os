// AI modes redesign, Step 1 — characterization tests for the three new
// adapters added to support the 5-mode redesign: Pollinations ("Smart AI",
// genuinely keyless per docs/planning/ai-modes-reconciliation.md §1 — a
// real live curl/browser-preflight check, not an assumption), Groq and
// Together AI ("Cloud AI Providers", routed through the existing
// /api/generate server proxy like every other BYOK cloud provider).
//
// Network is mocked here (unlike the reconciliation doc's live verification)
// to keep the suite hermetic and fast — the real-network check already
// happened once, live, and is recorded in the reconciliation doc.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AIGateway, { AI_PROVIDERS } from "../aiGateway";
import { encryptDataAsync } from "../../utils/crypto";
import { setVaultPassphrase, clearVaultPassphrase } from "../vaultPassphrase";
import type { AISettings } from "../../types";

describe("AI_PROVIDERS registry — new entries", () => {
  it("includes pollinations, groq, and together with correct metadata", () => {
    const pollinations = AI_PROVIDERS.find((p) => p.id === "pollinations");
    const groq = AI_PROVIDERS.find((p) => p.id === "groq");
    const together = AI_PROVIDERS.find((p) => p.id === "together");

    expect(pollinations).toMatchObject({ requiresApiKey: false, pricingTier: "free", type: "cloud" });
    expect(groq).toMatchObject({ requiresApiKey: true, type: "cloud" });
    expect(together).toMatchObject({ requiresApiKey: true, type: "cloud" });
  });
});

describe("Pollinations adapter — genuinely keyless, direct-from-browser", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("is treated as available with no API key and no vault interaction", async () => {
    clearVaultPassphrase();
    const settings: AISettings = { provider: "pollinations" };
    const providers = await AIGateway.getAvailableProviders(settings);
    expect(providers.some((p) => p.id === "pollinations")).toBe(true);
  });

  it("calls text.pollinations.ai directly, with no Authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "OK." } }] })
    });
    global.fetch = fetchMock as any;

    await AIGateway.getAdapter("pollinations")!.generate(
      { systemInstruction: "sys", prompt: "hello", temperature: 0.5, taskType: "test" },
      { provider: "pollinations" }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://text.pollinations.ai/openai",
      expect.objectContaining({ method: "POST" })
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("surfaces a plain-language rate-limit message on a 429, not a generic error", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "" }) as any;

    await expect(
      AIGateway.getAdapter("pollinations")!.generate(
        { systemInstruction: "sys", prompt: "hello", temperature: 0.5, taskType: "test" },
        { provider: "pollinations" }
      )
    ).rejects.toThrow(/rate-limited/i);
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
