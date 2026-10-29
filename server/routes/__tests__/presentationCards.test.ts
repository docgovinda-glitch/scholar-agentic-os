import { describe, it, expect } from "vitest";
import { figureIsGrounded, parseGammaCard } from "../project/presentationCards.ts";

describe("presentation card validation", () => {
  const corpus = "Remote work explains 60% of US house price growth. City rents fell 10% while suburban rents rose 7%. 1,000 listings.";

  it("accepts figures present in the source material", () => {
    expect(figureIsGrounded("60%", corpus)).toBe(true);
    expect(figureIsGrounded("1000", corpus)).toBe(true);
    expect(figureIsGrounded("Phase I", corpus)).toBe(true);
  });

  it("rejects figures the model invented", () => {
    expect(figureIsGrounded("99.8%", corpus)).toBe(false);
    expect(figureIsGrounded("4.2x", corpus)).toBe(false);
  });

  it("drops ungrounded stats and falls back to a points card", () => {
    const card = parseGammaCard(
      {
        layout: "stats",
        stats: [
          { value: "99.8%", label: "Precision", detail: "Double-blind trials" },
          { value: "4.2x", label: "Faster synthesis" },
        ],
        items: [],
      },
      corpus,
    );
    expect(card?.stats).toEqual([]);
    expect(card?.layout).toBe("list");
    expect(card?.items.map((i) => i.title)).toEqual(["Precision", "Faster synthesis"]);
  });

  it("keeps grounded stats and trims oversized payloads", () => {
    const card = parseGammaCard(
      {
        layout: "stats",
        eyebrow: "Evidence",
        stats: [{ value: "60%", label: "of price growth", detail: null }],
        items: Array.from({ length: 10 }, (_, i) => ({ title: `Point ${i}` })),
        columns: [{ title: "Only one", points: ["x"] }],
      },
      corpus,
    );
    expect(card?.layout).toBe("stats");
    expect(card?.stats).toHaveLength(1);
    expect(card?.items).toHaveLength(6);
    expect(card?.columns).toBeUndefined();
  });

  it("ignores unknown layouts instead of failing", () => {
    const card = parseGammaCard({ layout: "hologram", items: [{ title: "A" }] }, corpus);
    expect(card?.layout).toBeUndefined();
    expect(card?.items).toHaveLength(1);
  });
});
