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
import { probeRunner } from "../localRunnerProbe";
import { LOCAL_RUNNERS } from "../../config/localRunnerCatalog";
import * as deviceClass from "../../hooks/useDeviceClass";

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

  describe("looking for local runtimes", () => {
    const device = (canRunLocalAI: boolean) =>
      vi.spyOn(deviceClass, "getDeviceClass").mockReturnValue({
        deviceClass: canRunLocalAI ? "desktop" : "mobile",
        isMobile: !canRunLocalAI,
        isTablet: false,
        isDesktop: canRunLocalAI,
        isTouchPrimary: !canRunLocalAI,
        canRunLocalAI,
      });

    beforeEach(() => {
      vi.mocked(probeRunner).mockClear();
    });

    it("does not probe localhost on a phone in the default mode", async () => {
      device(false);
      await storeProviderKey("gemini", "gemini-test-key");
      const decision = await resolveClientCandidates("simple");
      expect(probeRunner).not.toHaveBeenCalled();
      expect(decision.ok).toBe(true);
    });

    it("does not probe at all in cloud-allowed mode", async () => {
      device(true);
      await storeProviderKey("gemini", "gemini-test-key");
      await resolveClientCandidates("simple", { privacyPreferenceOverride: "cloud-allowed" });
      expect(probeRunner).not.toHaveBeenCalled();
    });

    it("probes every runner on a desktop, at once rather than one after another", async () => {
      device(true);
      let inFlight = 0;
      let maxInFlight = 0;
      vi.mocked(probeRunner).mockImplementation(async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { reachable: false, reason: "unreachable" } as never;
      });
      await storeProviderKey("gemini", "gemini-test-key");
      await resolveClientCandidates("simple");
      expect(probeRunner).toHaveBeenCalledTimes(LOCAL_RUNNERS.length);
      expect(maxInFlight).toBe(LOCAL_RUNNERS.length);
    });

    it("still tries local runners on a phone when the person chose local-only", async () => {
      device(false);
      setUserAiPreferences({ privacyMode: "local-only" });
      await resolveClientCandidates("simple");
      expect(probeRunner).toHaveBeenCalled();
    });
  });
});
