import { describe, expect, it } from "vitest";
import { deckDigest, qaOptions } from "../presentationQa";

const deck = {
  slides: [
    { actionHeadline: "Sleep loss slows reaction time", summary: "Eight studies agree.", blocks: [{ type: "bullet-list", items: ["n = 240 nurses", "Night shifts only"] }] },
    { actionHeadline: "Training reduces errors", blocks: [{ type: "metric", value: "12%", label: "fewer errors" }] },
    { actionHeadline: "", blocks: [] },
  ],
};

describe("deckDigest", () => {
  it("lists each slide's headline and the points on it, numbered", () => {
    const d = deckDigest(deck);
    expect(d.slideCount).toBe(3);
    expect(d.text).toContain("1. Sleep loss slows reaction time — Eight studies agree.; n = 240 nurses; Night shifts only");
    expect(d.text).toContain("2. Training reduces errors — 12%; fewer errors");
    expect(d.text).toContain("3. (untitled)");
  });
  it("stays within its size limits", () => {
    const big = { slides: Array.from({ length: 40 }, (_, i) => ({ actionHeadline: `Slide ${i} ${"x".repeat(300)}`, blocks: [] })) };
    const d = deckDigest(big, { maxSlides: 15, maxChars: 800 });
    expect(d.text.length).toBeLessThanOrEqual(800);
    expect(d.text.split("\n").length).toBeLessThanOrEqual(15);
    expect(d.slideCount).toBe(40);
  });
  it("copes with anything that is not a deck", () => {
    expect(deckDigest(undefined)).toEqual({ slideCount: 0, text: "" });
    expect(deckDigest({ slides: "no" })).toEqual({ slideCount: 0, text: "" });
  });
});

describe("qaOptions", () => {
  it("accepts the presenter's choices", () => {
    expect(qaOptions({ difficulty: "adversarial", targetSlideNumber: 2, questionCount: 4 }, 5)).toEqual({ difficulty: "adversarial", targetSlide: 2, count: 4 });
  });
  it("ignores a difficulty or slide that does not exist, and caps the count", () => {
    expect(qaOptions({ difficulty: "easy", targetSlideNumber: 9, questionCount: 50 }, 5)).toEqual({ difficulty: null, targetSlide: null, count: 6 });
    expect(qaOptions({}, 0)).toEqual({ difficulty: null, targetSlide: null, count: 3 });
  });
});
