import { describe, it, expect, beforeEach } from "vitest";
import { detectMeaningShift, applyMeaningGuard } from "../meaningGuard";
import { buildDiff, __resetDiffIdsForTests } from "../diff";

describe("domain/language: meaning guard", () => {
  beforeEach(() => __resetDiffIdsForTests());

  it("flags the docs' worked example: suggest -> demonstrate strengthens the claim", () => {
    const changes = buildDiff(
      "the results suggest a relationship",
      "the results demonstrate a relationship",
      () => "clarity improvement"
    );
    const shift = detectMeaningShift(changes[0]);
    expect(shift).toBeDefined();
    expect(shift!.meaningNote).toContain("strengthens");
  });

  it("flags a weakening change in the other direction", () => {
    const changes = buildDiff("the data proves the hypothesis", "the data suggests the hypothesis", () => "x");
    const shift = detectMeaningShift(changes[0]);
    expect(shift).toBeDefined();
    expect(shift!.meaningNote).toContain("weakens");
  });

  it("does not flag a pure language change with no strength word involved", () => {
    const changes = buildDiff("the sample comprised 240 participants", "the cohort comprised 240 participants", () => "x");
    expect(detectMeaningShift(changes[0])).toBeUndefined();
  });

  it("flags an added negation", () => {
    const changes = buildDiff("the effect was significant", "the effect was not significant", () => "x");
    const hunk = changes.find((c) => c.replacementText.includes("not"));
    expect(hunk).toBeDefined();
    const shift = detectMeaningShift(hunk!);
    expect(shift).toBeDefined();
    expect(shift!.meaningNote).toContain("negation");
  });

  it("flags a changed number and asks the user to verify it", () => {
    const changes = buildDiff("the sample comprised 240 participants", "the sample comprised 220 participants", () => "x");
    const hunk = changes.find((c) => /\d/.test(c.originalText) || /\d/.test(c.replacementText));
    expect(hunk).toBeDefined();
    const shift = detectMeaningShift(hunk!);
    expect(shift).toBeDefined();
    expect(shift!.meaningNote.toLowerCase()).toContain("verify");
  });

  it("applyMeaningGuard reclassifies shifted hunks to category 'content' and sorts them first", () => {
    const changes = buildDiff(
      "The old  sample suggest a relationship.",
      "The new sample demonstrate a relationship.",
      () => "generic reason"
    );
    const guarded = applyMeaningGuard(changes);
    expect(guarded[0].category).toBe("content");
    expect(guarded[0].meaningNote).toBeDefined();
  });

  it("leaves ordinary language hunks as category 'language' with no meaningNote", () => {
    const changes = buildDiff("the sample comprised 240 participants", "the cohort comprised 240 participants", () => "x");
    const guarded = applyMeaningGuard(changes);
    expect(guarded[0].category).toBe("language");
    expect(guarded[0].meaningNote).toBeUndefined();
  });
});
