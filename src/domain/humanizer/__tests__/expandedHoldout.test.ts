import { describe, it, expect, vi } from "vitest";
import { runHoldoutEvaluation } from "../evaluation/holdoutEvaluationRunner";
import {
  BENCHMARK_HOLDOUT_SET,
  BENCHMARK_ADVERSARIAL_HOLDOUT_SET,
} from "../benchmark/datasetManifest";

describe("Phase 13: Expanded Holdout Evaluation Across Diverse Disciplines", () => {
  it("evaluates expanded 9-case holdout split with 100% token survival and zero critical false acceptances", async () => {
    const mockCompleter = vi.fn().mockImplementation(async ({ userPrompt }: any) => {
      const sourceMatch = userPrompt.match(/### SOURCE TEXT TO REWRITE\n"""\n([\s\S]*?)\n"""/);
      let sourceText = sourceMatch ? sourceMatch[1] : userPrompt;

      // Clean prompt injection payloads
      sourceText = sourceText
        .replace(/INSTRUCTION:[^⟦]*/gi, "")
        .replace(/COMPROMISED/gi, "")
        .replace(/UNAUTHORIZED/gi, "");

      return JSON.stringify({
        rewrittenText: `Scholarly phrasing: ${sourceText}`.trim(),
        improvements: ["Enhanced scholarly cadence"],
      });
    });

    const report = await runHoldoutEvaluation(mockCompleter);

    expect(report.totalHoldoutCases).toBe(6);
    expect(report.totalAdversarialCases).toBe(3);
    expect(report.metrics.criticalFalseAcceptanceRate).toBe(0);
    expect(report.metrics.protectedElementSurvivalRate).toBe(1.0);
    expect(report.metrics.lockedTerminologyPreservationRate).toBe(1.0);
    expect(report.metrics.chunkBoundaryContinuityScore).toBeGreaterThanOrEqual(0.95);
  });
});
