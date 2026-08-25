import { describe, it, expect, vi } from "vitest";
import { runHoldoutEvaluation } from "../evaluation/holdoutEvaluationRunner";
import {
  BENCHMARK_CALIBRATION_SET,
  BENCHMARK_HOLDOUT_SET,
  BENCHMARK_ADVERSARIAL_HOLDOUT_SET,
} from "../benchmark/datasetManifest";

describe("Phase 12: Controlled Beta Validation & Unseen Holdout Evaluation", () => {
  describe("1. Dataset Separation & Manifest Validation", () => {
    it("strictly separates calibration, validation, holdout, and adversarial datasets", () => {
      expect(BENCHMARK_CALIBRATION_SET.length).toBeGreaterThan(0);
      expect(BENCHMARK_HOLDOUT_SET.length).toBeGreaterThan(0);
      expect(BENCHMARK_ADVERSARIAL_HOLDOUT_SET.length).toBeGreaterThan(0);

      // Verify no overlapping case IDs across splits
      const calibIds = new Set(BENCHMARK_CALIBRATION_SET.map((c) => c.caseId));
      const holdoutIds = new Set(BENCHMARK_HOLDOUT_SET.map((c) => c.caseId));
      const advIds = new Set(BENCHMARK_ADVERSARIAL_HOLDOUT_SET.map((c) => c.caseId));

      for (const id of holdoutIds) {
        expect(calibIds.has(id)).toBe(false);
      }
      for (const id of advIds) {
        expect(calibIds.has(id)).toBe(false);
        expect(holdoutIds.has(id)).toBe(false);
      }
    });
  });

  describe("2. Unseen Holdout Execution & Safety Invariants", () => {
    it("executes holdout evaluation with 100% token survival and 0 critical false acceptances", async () => {
      const mockCompleter = vi.fn().mockImplementation(async ({ userPrompt }: any) => {
        const sourceMatch = userPrompt.match(/### SOURCE TEXT TO REWRITE\n"""\n([\s\S]*?)\n"""/);
        let sourceText = sourceMatch ? sourceMatch[1] : userPrompt;

        // Clean any adversarial injection payloads
        sourceText = sourceText.replace(/INSTRUCTION:[^⟦]*/gi, "").replace(/COMPROMISED/gi, "");

        return JSON.stringify({
          rewrittenText: `Scholarly phrasing: ${sourceText}`.trim(),
          improvements: ["Enhanced scholarly cadence"],
        });
      });

      const report = await runHoldoutEvaluation(mockCompleter);

      expect(report.totalHoldoutCases).toBe(BENCHMARK_HOLDOUT_SET.length);
      expect(report.totalAdversarialCases).toBe(BENCHMARK_ADVERSARIAL_HOLDOUT_SET.length);
      expect(report.metrics.criticalFalseAcceptanceRate).toBe(0);
      expect(report.metrics.protectedElementSurvivalRate).toBe(1.0);
      expect(report.metrics.lockedTerminologyPreservationRate).toBe(1.0);
      expect(report.metrics.chunkBoundaryContinuityScore).toBeGreaterThanOrEqual(0.95);
    });
  });
});
