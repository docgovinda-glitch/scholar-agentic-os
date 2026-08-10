import { describe, it, expect } from "vitest";
import { selectProvider, type RoutingCandidate, type RoutingContext } from "../omniRouter";

const ANY: RoutingContext = { taskType: "simple", privacyPreference: "any", premiumQuotaRemaining: null };

describe("selectProvider — single source (Section 29: 'Omni Router with one provider')", () => {
  it("works with exactly one eligible, healthy candidate", () => {
    const candidates: RoutingCandidate[] = [{ tier: "byok", providerId: "openai", eligible: true, health: "healthy" }];
    const result = selectProvider(candidates, ANY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.choice.providerId).toBe("openai");
      expect(result.fallbacks).toEqual([]);
    }
  });
});

describe("selectProvider — multiple sources", () => {
  it("prefers local over free over byok over premium for a simple task", () => {
    const candidates: RoutingCandidate[] = [
      { tier: "premium", providerId: "scholar-pool", eligible: true, health: "healthy" },
      { tier: "byok", providerId: "openai", eligible: true, health: "healthy" },
      { tier: "free", providerId: "gemini", eligible: true, health: "healthy" },
      { tier: "local", providerId: "ollama", eligible: true, health: "healthy" },
    ];
    const result = selectProvider(candidates, { ...ANY, taskType: "simple", premiumQuotaRemaining: 100 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.choice.tier).toBe("local");
      expect(result.fallbacks.map((f) => f.tier)).toEqual(["free", "byok", "premium"]);
    }
  });

  it("prefers free/byok/premium over local for a multimodal task, even when local is eligible", () => {
    const candidates: RoutingCandidate[] = [
      { tier: "local", providerId: "ollama", eligible: true, health: "healthy" },
      { tier: "free", providerId: "gemini", eligible: true, health: "healthy" },
    ];
    const result = selectProvider(candidates, { ...ANY, taskType: "multimodal" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.choice.tier).toBe("free");
  });
});

describe("selectProvider — fallback (Section 29: 'fallback')", () => {
  it("skips a down provider and falls back to the next eligible one", () => {
    const candidates: RoutingCandidate[] = [
      { tier: "free", providerId: "gemini", eligible: true, health: "down" },
      { tier: "free", providerId: "groq", eligible: true, health: "healthy" },
    ];
    const result = selectProvider(candidates, ANY);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.choice.providerId).toBe("groq");
  });

  it("ranks a degraded provider behind a healthy one in the same tier", () => {
    const candidates: RoutingCandidate[] = [
      { tier: "free", providerId: "gemini", eligible: true, health: "degraded" },
      { tier: "free", providerId: "groq", eligible: true, health: "healthy" },
    ];
    const result = selectProvider(candidates, ANY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.choice.providerId).toBe("groq");
      expect(result.fallbacks[0].providerId).toBe("gemini");
    }
  });

  it("excludes a candidate the user never connected, even if listed", () => {
    const candidates: RoutingCandidate[] = [
      { tier: "byok", providerId: "openai", eligible: false, health: "healthy" },
      { tier: "free", providerId: "gemini", eligible: true, health: "healthy" },
    ];
    const result = selectProvider(candidates, ANY);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.choice.providerId).toBe("gemini");
  });
});

describe("selectProvider — Premium quota (Section 14)", () => {
  it("never selects Premium when there is no entitlement (premiumQuotaRemaining is null)", () => {
    const candidates: RoutingCandidate[] = [{ tier: "premium", providerId: "scholar-pool", eligible: true, health: "healthy" }];
    const result = selectProvider(candidates, { ...ANY, premiumQuotaRemaining: null });
    expect(result.ok).toBe(false);
  });

  it("never selects Premium when quota is exhausted (0 remaining)", () => {
    const candidates: RoutingCandidate[] = [
      { tier: "free", providerId: "gemini", eligible: false, health: "healthy" },
      { tier: "premium", providerId: "scholar-pool", eligible: true, health: "healthy" },
    ];
    const result = selectProvider(candidates, { ...ANY, premiumQuotaRemaining: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasoning).toMatch(/Premium quota.*exhausted/i);
  });

  it("falls back to a connected Free source when Premium quota is exhausted (Section 14: 'may use that source if policy allows')", () => {
    const candidates: RoutingCandidate[] = [
      { tier: "free", providerId: "gemini", eligible: true, health: "healthy" },
      { tier: "premium", providerId: "scholar-pool", eligible: true, health: "healthy" },
    ];
    const result = selectProvider(candidates, { ...ANY, premiumQuotaRemaining: 0 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.choice.tier).toBe("free");
  });

  it("selects Premium when entitled with remaining quota and it is the best-ranked option", () => {
    const candidates: RoutingCandidate[] = [{ tier: "premium", providerId: "scholar-pool", eligible: true, health: "healthy" }];
    const result = selectProvider(candidates, { ...ANY, taskType: "reasoning", premiumQuotaRemaining: 500 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.choice.tier).toBe("premium");
  });
});

describe("selectProvider — privacy preference", () => {
  it("restricts to local only, and works when local is the user's only source", () => {
    const candidates: RoutingCandidate[] = [
      { tier: "free", providerId: "gemini", eligible: true, health: "healthy" },
      { tier: "local", providerId: "ollama", eligible: true, health: "healthy" },
    ];
    const result = selectProvider(candidates, { ...ANY, privacyPreference: "no-cloud" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.choice.tier).toBe("local");
      expect(result.fallbacks).toEqual([]);
    }
  });

  it("explains clearly when no-cloud is set and no local source is connected", () => {
    const candidates: RoutingCandidate[] = [{ tier: "free", providerId: "gemini", eligible: true, health: "healthy" }];
    const result = selectProvider(candidates, { ...ANY, privacyPreference: "no-cloud" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasoning).toMatch(/local/i);
  });
});

describe("selectProvider — no sources at all", () => {
  it("returns a clear, actionable explanation rather than an empty/silent failure", () => {
    const result = selectProvider([], ANY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasoning.length).toBeGreaterThan(0);
  });
});
