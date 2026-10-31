import { describe, it, expect } from "vitest";
import { assignBadges, curateModels, parseModelId, tierOf, type LiveModel } from "../modelCuration";

// Fictional IDs on purpose: these tests check the rules, not any provider's line-up.
const NOW = Date.UTC(2026, 9, 31);
const day = 86_400_000;
const live: LiveModel[] = [
  { id: "acme-pro-6.1", contextWindow: 400_000, createdAt: NOW - 20 * day },
  { id: "acme-pro-6.1-2026-10-01", createdAt: NOW - 30 * day },
  { id: "acme-pro-5.5", contextWindow: 200_000, createdAt: NOW - 200 * day },
  { id: "acme-6.1", contextWindow: 256_000 },
  { id: "acme-mini-6.1", contextWindow: 128_000 },
  { id: "acme-mini-5", contextWindow: 128_000 },
  { id: "acme-pro-7-preview", createdAt: NOW - 10 * day },
  { id: "acme-ultra-6-preview", createdAt: NOW - 120 * day },
  { id: "acme-legacy-4", deprecated: true },
  { id: "text-embedding-large-3" },
  { id: "acme-tts-2" },
];

describe("model curation", () => {
  it("parses family and version", () => {
    expect(parseModelId("acme-pro-6.1")).toEqual({ family: "acme-pro", version: [6, 1] });
    expect(parseModelId("models/acme-flash-3.8")).toMatchObject({ version: [3, 8] });
    expect(tierOf("acme-mini-6.1")).toBe("fast");
    expect(tierOf("acme-pro-6.1")).toBe("flagship");
    expect(tierOf("acme-6.1")).toBe("balanced");
  });

  it("keeps only current text models: no snapshots, deprecated, stale previews, embeddings or audio", () => {
    const ids = curateModels("acme", live, { now: NOW }).map((m) => m.id);
    expect(ids).toContain("acme-6.1");
    expect(ids).toContain("acme-mini-6.1");
    expect(ids).toContain("acme-pro-7-preview"); // fresh preview, newest generation
    for (const gone of ["acme-pro-6.1-2026-10-01", "acme-pro-5.5", "acme-mini-5", "acme-ultra-6-preview", "acme-legacy-4", "text-embedding-large-3", "acme-tts-2"]) {
      expect(ids).not.toContain(gone);
    }
  });

  it("orders flagship, balanced, fast and caps the list", () => {
    const tiers = curateModels("acme", live, { now: NOW }).map((m) => m.tier);
    expect(tiers).toEqual([...tiers].sort((a, b) => ["flagship", "balanced", "fast"].indexOf(a) - ["flagship", "balanced", "fast"].indexOf(b)));
    expect(curateModels("acme", live, { now: NOW, maxPerProvider: 2 })).toHaveLength(2);
  });

  it("respects an admin denylist", () => {
    expect(curateModels("acme", live, { now: NOW, deny: new Set(["acme-6.1"]) }).map((m) => m.id)).not.toContain("acme-6.1");
  });

  it("gives badges only with evidence", () => {
    const curated = curateModels("acme", live, { now: NOW });
    const noData = assignBadges(curated);
    expect(noData.flatMap((m) => m.badges.map((b) => b.id))).not.toContain("fastest");
    expect(noData.flatMap((m) => m.badges.map((b) => b.id))).not.toContain("best_coding");

    const withData = assignBadges(curated,
      [{ modelKey: "acme:acme-mini-6.1", p50TokensPerSecond: 210, samples: 40 }, { modelKey: "acme:acme-6.1", p50TokensPerSecond: 90, samples: 5 }],
      [{ modelKey: "acme:acme-6.1", badge: "best_coding", source: "Example benchmark v2", measuredOn: "2026-10-20" }]);
    const mini = withData.find((m) => m.id === "acme-mini-6.1")!;
    expect(mini.badges.find((b) => b.id === "fastest")?.evidence).toMatch(/210 tokens\/s over 40/);
    expect(withData.find((m) => m.id === "acme-6.1")!.badges.map((b) => b.id)).toContain("best_coding");
  });
});
