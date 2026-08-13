/**
 * Model catalog integrity.
 *
 * Same rationale as providerCatalog.test.ts: this file is now the single
 * source of truth for what appears in the AI Access model dropdown, so a
 * typo or a dangling providerId breaks a provider's picker silently. These
 * tests assert structure and internal consistency, not exact catalog
 * contents, so a genuine future model addition/removal is never treated as
 * a regression by itself.
 */

import { describe, it, expect } from "vitest";
import { isCloudProvider } from "../providerCatalog";
import {
  MODEL_CATALOG,
  getModelsForProvider,
  getDefaultModelId,
  selectModelsByCapabilities,
  type ModelSpec,
} from "../modelCatalog";

describe("MODEL_CATALOG integrity", () => {
  it("has a healthy floor of entries — grows over time, never silently shrinks", () => {
    expect(MODEL_CATALOG.length).toBeGreaterThanOrEqual(80);
  });

  it("has no duplicate ids", () => {
    const ids = MODEL_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every id follows the providerId:modelId convention", () => {
    for (const m of MODEL_CATALOG) {
      expect(m.id).toBe(`${m.providerId}:${m.modelId}`);
    }
  });

  it("every providerId resolves to a real cloud provider", () => {
    for (const m of MODEL_CATALOG) {
      expect(isCloudProvider(m.providerId), `${m.id} references an unknown provider`).toBe(true);
    }
  });

  it("every entry has at least one access mode, and never claims premium (that's DB-driven, not static)", () => {
    for (const m of MODEL_CATALOG) {
      expect(m.accessModes.length).toBeGreaterThan(0);
      expect(m.accessModes).not.toContain("premium");
      expect(m.accessModes).not.toContain("local");
    }
  });

  it("every entry has a non-empty displayName and modelId", () => {
    for (const m of MODEL_CATALOG) {
      expect(m.modelId.length).toBeGreaterThan(0);
      expect(m.displayName.length).toBeGreaterThan(0);
    }
  });

  it("an unverified entry never claims a capability it wasn't confirmed to have", () => {
    // Not a hard product rule (an unverified entry COULD have capabilities:[]
    // for an honest "we don't know" reason), but every entry this pass
    // actually produced with verified:false has capabilities:[] — this
    // catches a future edit that adds a carried-forward entry with guessed
    // capabilities instead of using the model()/carried() helpers correctly.
    for (const m of MODEL_CATALOG) {
      if (!m.verified) {
        expect(m.capabilities).toEqual([]);
        expect(m.lastVerified).toBeNull();
      }
    }
  });

  it("a deprecated entry still carries a note explaining why, so a dropdown label isn't a mystery", () => {
    for (const m of MODEL_CATALOG) {
      if (m.status === "deprecated") {
        expect(m.notes, `${m.id} is deprecated with no explanatory note`).toBeTruthy();
      }
    }
  });

  it("the 14 deep-researched providers each have at least one verified, current entry", () => {
    const researched = [
      "openai", "claude", "gemini", "groq", "mistral", "cohere", "deepseek",
      "xai", "perplexity", "together", "openrouter", "qwen", "cerebras", "nvidia",
    ];
    for (const providerId of researched) {
      const models = getModelsForProvider(providerId);
      expect(models.some((m) => m.verified && m.status === "current"), `${providerId} has no verified current entry`).toBe(true);
    }
  });
});

describe("getModelsForProvider", () => {
  it("returns only entries for the requested provider", () => {
    const models = getModelsForProvider("groq");
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.providerId === "groq")).toBe(true);
  });

  it("returns an empty array for an unknown provider rather than throwing", () => {
    expect(getModelsForProvider("not-a-real-provider")).toEqual([]);
  });

  it("filters by access mode when given", () => {
    // openai is freeTier "paid" — never eligible under "free".
    const openaiFree = getModelsForProvider("openai", "free");
    expect(openaiFree).toEqual([]);
    const openaiByok = getModelsForProvider("openai", "byok");
    expect(openaiByok.length).toBeGreaterThan(0);

    // gemini is freeTier "freemium" — eligible under both.
    const geminiFree = getModelsForProvider("gemini", "free");
    expect(geminiFree.length).toBeGreaterThan(0);
  });
});

describe("getDefaultModelId", () => {
  it("prefers a current (non-deprecated, non-preview) entry", () => {
    const id = getDefaultModelId("claude");
    const models = getModelsForProvider("claude");
    const chosen = models.find((m) => m.modelId === id);
    expect(chosen?.status).toBe("current");
  });

  it("returns an empty-safe fallback for a provider the catalog has never heard of", () => {
    expect(getDefaultModelId("not-a-real-provider")).toBe("");
  });
});

describe("selectModelsByCapabilities", () => {
  const fixtures: ModelSpec[] = [
    {
      id: "p:a", providerId: "p", modelId: "a", displayName: "A", status: "current",
      accessModes: ["byok"], capabilities: ["reasoning", "vision"], contextWindow: 200_000,
      inputModalities: ["text"], outputModalities: ["text"], relativeQuality: "flagship",
      relativeSpeed: "moderate", pricing: null, lastVerified: "2026-08-13", verified: true,
    },
    {
      id: "p:b", providerId: "p", modelId: "b", displayName: "B", status: "current",
      accessModes: ["free", "byok"], capabilities: ["fastGeneration"], contextWindow: 8_000,
      inputModalities: ["text"], outputModalities: ["text"], relativeQuality: "fast",
      relativeSpeed: "fast", pricing: null, lastVerified: "2026-08-13", verified: true,
    },
    {
      id: "p:c", providerId: "p", modelId: "c", displayName: "C (unverified)", status: "current",
      accessModes: ["byok"], capabilities: [], contextWindow: null,
      inputModalities: ["text"], outputModalities: ["text"], relativeQuality: "balanced",
      relativeSpeed: "moderate", pricing: null, lastVerified: null, verified: false,
    },
    {
      id: "p:d", providerId: "p", modelId: "d", displayName: "D (deprecated)", status: "deprecated",
      accessModes: ["byok"], capabilities: ["reasoning", "vision"], contextWindow: 200_000,
      inputModalities: ["text"], outputModalities: ["text"], relativeQuality: "flagship",
      relativeSpeed: "moderate", pricing: null, lastVerified: "2026-08-13", verified: true,
    },
  ];

  it("filters out deprecated models unconditionally", () => {
    const result = selectModelsByCapabilities(fixtures, {});
    expect(result.some((m) => m.id === "p:d")).toBe(false);
  });

  it("requires ALL requested capabilities to be present", () => {
    const result = selectModelsByCapabilities(fixtures, { capabilities: ["reasoning", "vision"] });
    expect(result.map((m) => m.id)).toEqual(["p:a"]);
  });

  it("never matches an unverified entry against a capability requirement, even though capabilities:[] could vacuously pass an empty filter", () => {
    const result = selectModelsByCapabilities(fixtures, { capabilities: ["reasoning"] });
    expect(result.some((m) => m.id === "p:c")).toBe(false);
  });

  it("still includes unverified entries when no capability is requested", () => {
    const result = selectModelsByCapabilities(fixtures, {});
    expect(result.some((m) => m.id === "p:c")).toBe(true);
  });

  it("filters by minimum context window", () => {
    const result = selectModelsByCapabilities(fixtures, { minContextWindow: 100_000 });
    expect(result.map((m) => m.id)).toEqual(["p:a"]);
  });

  it("filters by access mode", () => {
    const result = selectModelsByCapabilities(fixtures, { accessMode: "free" });
    expect(result.map((m) => m.id)).toEqual(["p:b"]);
  });

  it("sorts a preferred quality tier first without dropping the rest", () => {
    const result = selectModelsByCapabilities(fixtures, { preferQuality: "fast" });
    expect(result[0].id).toBe("p:b");
    expect(result.length).toBe(3); // a, b, c — d stays excluded (deprecated)
  });
});
