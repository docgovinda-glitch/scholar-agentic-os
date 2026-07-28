// AI modes redesign, Step 1 — config-shape tests for the single source of
// truth both AISetupWizard.tsx and AIControlCenter.tsx will consume.

import { describe, it, expect } from "vitest";
import { AI_MODES, getAIMode, AIModeId } from "../aiModes";
import { AI_PROVIDERS } from "../../services/aiGateway";

const EXPECTED_IDS: AIModeId[] = ["smart", "cloud", "local", "byok", "partner"];

describe("AI_MODES config", () => {
  it("has exactly the 5 expected modes, in order", () => {
    expect(AI_MODES.map((m) => m.id)).toEqual(EXPECTED_IDS);
  });

  it("every mode has all required display fields non-empty", () => {
    for (const mode of AI_MODES) {
      expect(mode.title).toBeTruthy();
      expect(mode.badge).toBeTruthy();
      expect(mode.description).toBeTruthy();
      expect(mode.difficulty).toBeTruthy();
      expect(mode.setupTime).toBeTruthy();
      expect(mode.bestFor).toBeTruthy();
      expect(mode.ctaLabel).toBeTruthy();
      expect(Array.isArray(mode.howItWorks)).toBe(true);
      expect(Array.isArray(mode.requirements)).toBe(true);
      expect(Array.isArray(mode.providers)).toBe(true);
    }
  });

  it("every provider referenced by a non-coming-soon mode exists in the real AI_PROVIDERS registry", () => {
    const realIds = new Set(AI_PROVIDERS.map((p) => p.id));
    for (const mode of AI_MODES) {
      if (mode.availability === "coming-soon") continue;
      for (const provider of mode.providers) {
        expect(realIds.has(provider.id)).toBe(true);
      }
    }
  });

  it("the coming-soon mode (Partner Subscription) names no real partner and has a coming-soon note", () => {
    const partner = getAIMode("partner")!;
    expect(partner.availability).toBe("coming-soon");
    expect(partner.comingSoonNote).toBeTruthy();
    expect(partner.providers).toHaveLength(0);
  });

  it("Smart AI states its real rate limit in its limitations, not hidden", () => {
    const smart = getAIMode("smart")!;
    expect(smart.limitations.some((l) => /15 second/i.test(l))).toBe(true);
  });

  it("every available mode's user-facing copy avoids internal jargon (numbered Tier references, backend, endpoint, router, inference)", () => {
    // "free tier" / "paid tier" are legitimate, honest, industry-standard
    // terms providers themselves use for their own pricing plans — not
    // banned. What's actually banned is OUR internal tiering language
    // ("Tier 1", "Tier 2", ai-gateway.md's engineering framing leaking into
    // user-facing copy) plus backend/endpoint/router/inference jargon.
    const bannedWords = /\btier\s*\d\b|\bbackend\b|\bendpoint\b|\brouter\b|\binference\b/i;
    for (const mode of AI_MODES) {
      const userFacingText = [
        mode.title,
        mode.badge,
        mode.description,
        mode.bestFor,
        mode.ctaLabel,
        ...mode.features,
        ...mode.limitations,
        ...mode.howItWorks,
        ...mode.requirements,
        ...mode.providers.map((p) => `${p.label} ${p.description}`)
      ].join(" ");
      expect(userFacingText).not.toMatch(bannedWords);
    }
  });

  it("getAIMode resolves a known id and returns undefined for an unknown one", () => {
    expect(getAIMode("local")?.title).toBe("Local AI");
    expect(getAIMode("nonexistent" as AIModeId)).toBeUndefined();
  });

  it("every Cloud AI Providers / Bring Your Own AI provider has a real https getKeyUrl", () => {
    for (const modeId of ["cloud", "byok"] as const) {
      const mode = getAIMode(modeId)!;
      for (const provider of mode.providers) {
        expect(provider.getKeyUrl, `${modeId}/${provider.id} missing getKeyUrl`).toMatch(/^https:\/\//);
      }
    }
  });

  it("Cloud AI Providers lists exactly OpenRouter, Google Gemini, Groq, DeepSeek, Together AI (Step 3 spec)", () => {
    const cloud = getAIMode("cloud")!;
    expect(cloud.providers.map((p) => p.label)).toEqual([
      "OpenRouter", "Google Gemini", "Groq", "DeepSeek", "Together AI"
    ]);
  });

  it("OmniRoute has real, specific install guidance (not a generic placeholder) and a working install link", () => {
    const local = getAIMode("local")!;
    const omniroute = local.providers.find((p) => p.label === "OmniRoute")!;
    expect(omniroute.installGuidance).toMatch(/npm install -g omniroute/);
    expect(omniroute.installUrl).toMatch(/^https:\/\//);
    expect(omniroute.defaultEndpoint).toBe("http://localhost:20128/v1");
  });

  it("every Local AI backend has non-generic install guidance distinct from the others", () => {
    const local = getAIMode("local")!;
    const guidances = local.providers.map((p) => p.installGuidance);
    expect(new Set(guidances).size).toBe(guidances.length);
    for (const g of guidances) expect(g).toBeTruthy();
  });
});
