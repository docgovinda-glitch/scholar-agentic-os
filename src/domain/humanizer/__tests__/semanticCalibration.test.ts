import { describe, it, expect } from "vitest";
import {
  calibrateSemanticProvider,
  GOLD_CALIBRATION_SET,
} from "../evaluation/semanticCalibration";
import { DefaultHeuristicSemanticProvider } from "../benchmark/benchmarkRunner";

describe("Phase 10: Semantic Calibration & Gold-Standard Evaluation", () => {
  it("evaluates heuristic semantic provider against human gold calibration set", async () => {
    const provider = new DefaultHeuristicSemanticProvider();
    const metrics = await calibrateSemanticProvider(provider, GOLD_CALIBRATION_SET);

    expect(metrics.totalCases).toBe(GOLD_CALIBRATION_SET.length);
    expect(metrics.evaluatedCases).toBe(GOLD_CALIBRATION_SET.length);

    // Verify fine-grained relation classification breakdown
    expect(metrics.relationBreakdown.PRESERVED.total).toBeGreaterThan(0);
    expect(metrics.relationBreakdown.STRENGTHENED.total).toBeGreaterThan(0);
    expect(metrics.relationBreakdown.CONTRADICTED.total).toBeGreaterThan(0);
    expect(metrics.relationBreakdown.ADDED.total).toBeGreaterThan(0);
    expect(metrics.relationBreakdown.DROPPED.total).toBeGreaterThan(0);

    // True negatives should identify severe drift / contradictions
    expect(metrics.trueNegatives).toBeGreaterThan(0);
  });
});
