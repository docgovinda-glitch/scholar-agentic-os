import { describe, it, expect, vi } from "vitest";
import {
  runAcademicValidationSuite,
  STRATIFIED_ACADEMIC_CORPUS,
} from "../evaluation/academicValidationSuite";

describe("Phase 11: Real-World Academic Validation & Disciplinary Stratification", () => {
  it("evaluates stratified academic corpus with 100% invariant survival and zero false acceptances", async () => {
    const mockCompleter = vi.fn().mockImplementation(async ({ userPrompt }: any) => {
      const sourceMatch = userPrompt.match(/### SOURCE TEXT TO REWRITE\n"""\n([\s\S]*?)\n"""/);
      const sourceText = sourceMatch ? sourceMatch[1] : userPrompt;

      return JSON.stringify({
        rewrittenText: `Scholarly phrasing: ${sourceText}`.trim(),
        improvements: ["Refined scholarly register"],
      });
    });

    const result = await runAcademicValidationSuite(mockCompleter);

    expect(result.totalCases).toBe(STRATIFIED_ACADEMIC_CORPUS.length);
    expect(result.metrics.protectedElementSurvivalRate).toBe(1.0); // 100%
    expect(result.metrics.lockedTerminologyPreservationRate).toBe(1.0); // 100%
    expect(result.metrics.falseAcceptances).toBe(0); // 0 False Acceptances

    // Verify all disciplines represented
    expect(result.disciplineBreakdown.natural_sciences).toBeGreaterThan(0);
    expect(result.disciplineBreakdown.social_sciences).toBeGreaterThan(0);
    expect(result.disciplineBreakdown.humanities).toBeGreaterThan(0);
    expect(result.disciplineBreakdown.political_science).toBeGreaterThan(0);
    expect(result.disciplineBreakdown.business_management).toBeGreaterThan(0);
    expect(result.disciplineBreakdown.computer_science_engineering).toBeGreaterThan(0);
    expect(result.disciplineBreakdown.dissertation_multiparagraph).toBeGreaterThan(0);

    // Naturalness and agreement scores verified
    expect(result.metrics.averageNaturalnessScore).toBeGreaterThanOrEqual(4.5);
    expect(result.metrics.averageInterRaterAgreement).toBeGreaterThanOrEqual(0.9);
  });

  it("identifies and classifies failures according to standardized failure taxonomy", async () => {
    // Completer that deliberately strips citations
    const faultyCompleter = vi.fn().mockImplementation(async ({ userPrompt }: any) => {
      return JSON.stringify({
        rewrittenText: "This is a rewrite with citations completely removed.",
        improvements: [],
      });
    });

    const singleCase = STRATIFIED_ACADEMIC_CORPUS.slice(0, 1);
    const result = await runAcademicValidationSuite(faultyCompleter, { corpus: singleCase });

    // Should catch the failure and classify it
    expect(result.failures.length).toBeGreaterThan(0);
    expect(["CITATION_FAILURE", "PROTECTED_ELEMENT_FAILURE"]).toContain(
      result.failures[0].taxonomyCode
    );
  });
});
