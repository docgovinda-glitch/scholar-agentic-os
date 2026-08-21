import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../localRunnerProbe", () => ({
  probeRunner: vi.fn(async () => ({ reachable: false, reason: "unreachable" })),
}));

import {
  resolveClientCandidates,
  getUserAiPreferences,
  setUserAiPreferences,
  DEFAULT_USER_AI_PREFERENCES,
} from "../clientRouter";
import { storeProviderKey } from "../userAiSettings";

describe("ClientRouter - Policy-Driven Candidate Evaluation", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns an error decision when no providers or local runners are configured", async () => {
    const decision = await resolveClientCandidates("reasoning");
    expect(decision.ok).toBe(false);
    expect(decision.choice).toBeUndefined();
    expect(decision.reasoning).toContain("No AI providers are configured");
  });

  it("ranks configured BYOK keys based on task reasoning intensity", async () => {
    await storeProviderKey("gemini", "gemini-test-key");
    await storeProviderKey("together", "together-test-key");

    const decision = await resolveClientCandidates("reasoning");
    expect(decision.ok).toBe(true);
    expect(decision.choice).toBeDefined();
    // Gemini has high reasoning score bonus
    expect(decision.choice?.provider).toBe("gemini");
    expect(decision.fallbacks.length).toBeGreaterThan(0);
  });

  it("respects local-only privacy mode and strictly excludes cloud keys", async () => {
    await storeProviderKey("gemini", "gemini-test-key");
    setUserAiPreferences({ privacyMode: "local-only" });

    const decision = await resolveClientCandidates("reasoning");
    // Since no local runner was mocked reachable, local-only excludes gemini and returns ok: false
    expect(decision.ok).toBe(false);
    expect(decision.reasoning).toContain("No local AI runtimes (Ollama/LM Studio) are reachable");
  });

  it("prioritizes preferred provider configured in user AI preferences", async () => {
    await storeProviderKey("gemini", "gemini-test-key");
    await storeProviderKey("cerebras", "cerebras-test-key");

    setUserAiPreferences({
      privacyMode: "balanced",
      preferredProviderId: "cerebras",
    });

    const decision = await resolveClientCandidates("reasoning");
    expect(decision.ok).toBe(true);
    expect(decision.choice?.provider).toBe("cerebras");
    expect(decision.choice?.reasoning).toContain("Preferred provider");
  });

  it("prioritizes active manual model override over all other rankings", async () => {
    await storeProviderKey("gemini", "gemini-test-key");
    await storeProviderKey("cerebras", "cerebras-test-key");

    const decision = await resolveClientCandidates("reasoning", {
      manualOverride: { providerId: "gemini", modelId: "gemini-2.5-flash" },
    });

    expect(decision.ok).toBe(true);
    expect(decision.choice?.provider).toBe("gemini");
    expect(decision.choice?.model).toBe("gemini-2.5-flash");
    expect(decision.choice?.reasoning).toContain("Manual");
  });
});
