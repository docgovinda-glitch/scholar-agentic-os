import { describe, it, expect } from "vitest";
import { analyzeReadability } from "../readability";

describe("domain/language: readability", () => {
  it("returns zeroed metrics and no findings for empty text", () => {
    const report = analyzeReadability("");
    expect(report.metrics.wordCount).toBe(0);
    expect(report.metrics.sentenceCount).toBe(0);
    expect(report.metrics.fleschReadingEase).toBe(0);
    expect(report.findings).toEqual([]);
  });

  it("scores simple, short-sentence text as easier to read than dense, long-sentence text", () => {
    const simple = analyzeReadability("The cat sat on the mat. The dog ran. It was a good day.");
    const dense = analyzeReadability(
      "The multidisciplinary epistemological ramifications of postmodern deconstructionist methodology necessitate an extraordinarily comprehensive reconceptualization of institutionalized pedagogical frameworks."
    );
    expect(simple.metrics.fleschReadingEase).toBeGreaterThan(dense.metrics.fleschReadingEase);
    expect(simple.metrics.fleschKincaidGradeLevel).toBeLessThan(dense.metrics.fleschKincaidGradeLevel);
  });

  it("computes sentence count and average sentence length correctly", () => {
    const report = analyzeReadability("One two three. Four five six seven eight.");
    expect(report.metrics.sentenceCount).toBe(2);
    expect(report.metrics.wordCount).toBe(8);
    expect(report.metrics.averageSentenceLength).toBe(4);
  });

  it("detects passive voice via the shared textStats heuristic", () => {
    const passive = analyzeReadability("The ball was kicked by the boy.");
    const active = analyzeReadability("The boy kicked the ball.");
    expect(passive.metrics.passiveVoiceRatio).toBeGreaterThan(active.metrics.passiveVoiceRatio);
  });

  it("computes jargon density as the fraction of 3+ syllable words", () => {
    const report = analyzeReadability("A cat sat on a mat.");
    expect(report.metrics.jargonDensity).toBe(0);
    const dense = analyzeReadability("Extraordinary multidisciplinary reconceptualization");
    expect(dense.metrics.jargonDensity).toBeGreaterThan(0.5);
  });

  it("raises a finding when grade level exceeds the audience's threshold", () => {
    const denseText =
      "The multidisciplinary epistemological ramifications of postmodern deconstructionist methodology necessitate comprehensive reconceptualization.";
    const report = analyzeReadability(denseText, "general");
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings[0].metric).toBe("fleschKincaidGradeLevel");
  });

  it("does not raise a finding when no audience is given", () => {
    const denseText =
      "The multidisciplinary epistemological ramifications of postmodern deconstructionist methodology necessitate comprehensive reconceptualization.";
    const report = analyzeReadability(denseText);
    expect(report.findings).toEqual([]);
  });

  it("an academic audience tolerates a higher grade level than a general one before flagging", () => {
    const moderatelyDenseText =
      "Researchers examined participant responses across multiple experimental conditions using standardized questionnaires and statistical analysis.";
    const general = analyzeReadability(moderatelyDenseText, "general");
    const academic = analyzeReadability(moderatelyDenseText, "academic");
    expect(general.findings.length).toBeGreaterThanOrEqual(academic.findings.length);
  });

  it("never returns NaN or Infinity metrics for realistic text", () => {
    const report = analyzeReadability("Short. Text here. Testing edge cases with punctuation!! And questions?");
    for (const value of Object.values(report.metrics)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
