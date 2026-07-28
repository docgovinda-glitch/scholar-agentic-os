// AI modes redesign, Step 1 — config-shape tests for the single source of
// truth both AISetupWizard.tsx and AIControlCenter.tsx will consume.

import { describe, it, expect } from "vitest";
import { AI_MODES, getAIMode, getModeForProvider, AIModeId } from "../aiModes";
import { AI_PROVIDERS } from "../../services/aiGateway";

const EXPECTED_IDS: AIModeId[] = ["omniroute", "cloud", "local", "byok", "partner"];

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

  it("Smart Gateway (OmniRoute) states plainly that it needs a real install and that processing happens in the cloud, not locally — the exact honesty gap that got the old Smart AI removed", () => {
    const omniroute = getAIMode("omniroute")!;
    expect(omniroute.limitations.some((l) => /requires installing/i.test(l))).toBe(true);
    const allText = [omniroute.description, omniroute.badge, ...omniroute.howItWorks, ...omniroute.limitations].join(" ");
    expect(allText).toMatch(/cloud/i);
    // Must not carry over the old Option 1's "zero setup" framing — that's
    // exactly the fabrication this mode was introduced to correct.
    expect(allText).not.toMatch(/\binstant\b/i);
    expect(allText).not.toMatch(/no install/i);
    expect(allText).not.toMatch(/no setup/i);
  });

  it("every available mode's user-facing copy avoids internal jargon (numbered Tier references, backend, endpoint, bare 'router')", () => {
    // "free tier" / "paid tier" are legitimate, honest, industry-standard
    // terms providers themselves use for their own pricing plans — not
    // banned. What's actually banned is OUR internal tiering language
    // ("Tier 1", "Tier 2", ai-gateway.md's engineering framing leaking into
    // user-facing copy) plus backend/endpoint/router jargon.
    //
    // Follow-up correction (2026-07-28): "inference" is no longer banned.
    // The old Smart AI mode was removed specifically for implying private/
    // local processing that wasn't true; OmniRoute (its replacement) is
    // REQUIRED to state plainly that "inference happens in the cloud" — an
    // honest disclosure needs the accurate word, not a euphemism. Banning
    // it here would have re-introduced the exact vagueness this correction
    // exists to fix.
    const bannedWords = /\btier\s*\d\b|\bbackend\b|\bendpoint\b|\brouter\b/i;
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

  it("OmniRoute (now its own top-level mode, not a Local AI backend) has real, specific install guidance and a working install link", () => {
    const omnirouteMode = getAIMode("omniroute")!;
    const omniroute = omnirouteMode.providers.find((p) => p.label === "OmniRoute")!;
    expect(omniroute.installGuidance).toMatch(/npm install -g omniroute/);
    expect(omniroute.installUrl).toMatch(/^https:\/\//);
    expect(omniroute.defaultEndpoint).toBe("http://localhost:20128/v1");
  });

  it("OmniRoute is no longer listed under Local AI (it doesn't do local/private inference, only local routing)", () => {
    const local = getAIMode("local")!;
    expect(local.providers.some((p) => p.label === "OmniRoute")).toBe(false);
  });

  it("every Local AI backend has non-generic install guidance distinct from the others", () => {
    const local = getAIMode("local")!;
    const guidances = local.providers.map((p) => p.installGuidance);
    expect(new Set(guidances).size).toBe(guidances.length);
    for (const g of guidances) expect(g).toBeTruthy();
  });
});

describe("getModeForProvider — reverse lookup for the settings 'Current AI Mode' card (Step 4)", () => {
  it("resolves each real provider id to its correct user-facing mode", () => {
    expect(getModeForProvider("omniroute")).toBe("omniroute");
    expect(getModeForProvider("gemini")).toBe("cloud");
    expect(getModeForProvider("openrouter")).toBe("cloud");
    expect(getModeForProvider("groq")).toBe("cloud");
    expect(getModeForProvider("deepseek")).toBe("cloud");
    expect(getModeForProvider("together")).toBe("cloud");
    expect(getModeForProvider("ollama")).toBe("local");
    expect(getModeForProvider("custom")).toBe("local");
    expect(getModeForProvider("openai")).toBe("byok");
    expect(getModeForProvider("claude")).toBe("byok");
    expect(getModeForProvider("cohere")).toBe("byok");
    expect(getModeForProvider("qwen")).toBe("byok");
  });

  it("returns undefined for internal routing providers and unknown ids, rather than fabricating a mode", () => {
    expect(getModeForProvider("auto")).toBeUndefined();
    expect(getModeForProvider("server")).toBeUndefined();
    expect(getModeForProvider(undefined)).toBeUndefined();
    expect(getModeForProvider("not-a-real-provider")).toBeUndefined();
  });
});
