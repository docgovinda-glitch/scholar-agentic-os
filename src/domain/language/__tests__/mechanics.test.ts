import { describe, it, expect, beforeEach } from "vitest";
import { runMechanicsEngine, __resetMechanicsIdsForTests } from "../mechanics";

describe("domain/language: mechanics engine (Level 1 — Proofread)", () => {
  beforeEach(() => __resetMechanicsIdsForTests());

  it("collapses double spaces", () => {
    const changes = runMechanicsEngine("The  results were significant.");
    expect(changes).toHaveLength(1);
    expect(changes[0].replacementText).toBe(" ");
    expect(changes[0].category).toBe("language");
  });

  it("removes an immediately repeated word", () => {
    const changes = runMechanicsEngine("This is the the main finding.");
    expect(changes.some((c) => c.originalText.toLowerCase().includes("the the"))).toBe(true);
    expect(changes.find((c) => c.originalText.toLowerCase().includes("the the"))!.replacementText).toBe("the");
  });

  it("inserts a missing space after a full stop before a new sentence", () => {
    const changes = runMechanicsEngine("Participants completed the survey.Analysis began the next day.");
    const hit = changes.find((c) => c.reason.includes("space after"));
    expect(hit).toBeDefined();
    expect(hit!.replacementText).toContain(". A");
  });

  it("capitalises the first letter after a sentence boundary", () => {
    const changes = runMechanicsEngine("The trial concluded. the results were reviewed.");
    const hit = changes.find((c) => c.reason.includes("capital"));
    expect(hit).toBeDefined();
    expect(hit!.replacementText).toBe("T");
  });

  it('corrects "a" to "an" before a vowel-sound word', () => {
    const changes = runMechanicsEngine("This is a error in the analysis.");
    const hit = changes.find((c) => c.originalText === "a");
    expect(hit).toBeDefined();
    expect(hit!.replacementText).toBe("an");
  });

  it('corrects "an" to "a" before a consonant-sound word', () => {
    const changes = runMechanicsEngine("They reported an unique finding.");
    const hit = changes.find((c) => c.originalText === "an");
    expect(hit).toBeDefined();
    expect(hit!.replacementText).toBe("a");
  });

  it("handles the documented exception: 'an hour' stays 'an' despite the consonant letter", () => {
    const changes = runMechanicsEngine("This took an hour to complete.");
    expect(changes.some((c) => c.originalText.toLowerCase() === "an")).toBe(false);
  });

  it("corrects plural-subject singular-verb agreement for a known pattern", () => {
    const changes = runMechanicsEngine("The results was significant for all three groups.");
    const hit = changes.find((c) => c.reason.includes("agree"));
    expect(hit).toBeDefined();
    expect(hit!.originalText).toBe("was");
    expect(hit!.replacementText).toBe("were");
  });

  it("does not change word choice, sentence structure, or length — only mechanics", () => {
    const original = "The participants was recruited from three sites, which is a common approach.";
    const changes = runMechanicsEngine(original);
    // every hunk must be a small in-place correction, never a restructure
    for (const c of changes) {
      expect(c.originalEnd - c.originalStart).toBeLessThanOrEqual(original.length / 2);
    }
  });

  it("never changes a word that is not itself in error — a clean sentence produces zero changes", () => {
    const changes = runMechanicsEngine("The participants were recruited from three sites in the region.");
    expect(changes).toHaveLength(0);
  });

  it("assigns a specific, non-empty reason to every change", () => {
    const changes = runMechanicsEngine("The results was  significant. the analysis followed.");
    expect(changes.length).toBeGreaterThan(0);
    for (const c of changes) {
      expect(c.reason.length).toBeGreaterThan(0);
    }
  });
});
