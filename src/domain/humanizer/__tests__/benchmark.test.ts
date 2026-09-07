import { describe, it, expect, vi } from "vitest";
import { runBenchmarkSuite } from "../benchmark/benchmarkRunner";
import { HUMANIZER_BENCHMARK_V1_CASES, BENCHMARK_VERSION } from "../benchmark/benchmarkCases";

describe("Phase 9: Production Evaluation & Benchmark Suite", () => {
  it("executes standard benchmark suite v1, evaluates hard invariants, and compiles report", async () => {
    const mockCompleter = vi.fn().mockImplementation(async ({ userPrompt }: any) => {
      const sourceMatch = userPrompt.match(/### SOURCE TEXT TO REWRITE\n"""\n([\s\S]*?)\n"""/);
      let sourceText = sourceMatch ? sourceMatch[1] : userPrompt;

      // Clean adversarial phrase if present
      sourceText = sourceText.replace(/Ignore all previous instructions[^\n.]*/i, "").replace(/'HACKED'/gi, "");

      return JSON.stringify({
        rewrittenText: `Scholarly phrasing: ${sourceText}`.trim(),
        improvements: ["Refined scholarly tone"],
      });
    });

    const report = await runBenchmarkSuite({
      completer: mockCompleter,
      model: "gemini-2.5-flash",
      provider: "gemini",
    });

    expect(report.benchmarkVersion).toBe(BENCHMARK_VERSION);
    expect(report.totalCases).toBe(HUMANIZER_BENCHMARK_V1_CASES.length);
    expect(report.protectedElementSurvivalRate).toBe(1.0); // 100% target
    expect(report.lockedTerminologyPreservationRate).toBe(1.0); // 100% target
    expect(report.falseAcceptances).toBe(0);

    // Verify regression gates
    const tokenGate = report.regressionGates.find((g) => g.name === "Protected Element Survival Rate");
    expect(tokenGate?.passed).toBe(true);

    const semanticGate = report.regressionGates.find((g) => g.name === "Semantic Fidelity Heuristic Calibration");
    expect(semanticGate?.status).toBe("CALIBRATION_REQUIRED");
  });

  it("supports model / provider comparisons on identical benchmark cases", async () => {
    const mockModelA = vi.fn().mockImplementation(async ({ userPrompt }: any) => {
      const sourceMatch = userPrompt.match(/### SOURCE TEXT TO REWRITE\n"""\n([\s\S]*?)\n"""/);
      return JSON.stringify({
        rewrittenText: `Model A output: ${sourceMatch ? sourceMatch[1] : userPrompt}`.trim(),
        improvements: [],
      });
    });

    const mockModelB = vi.fn().mockImplementation(async ({ userPrompt }: any) => {
      const sourceMatch = userPrompt.match(/### SOURCE TEXT TO REWRITE\n"""\n([\s\S]*?)\n"""/);
      return JSON.stringify({
        rewrittenText: `Model B output: ${sourceMatch ? sourceMatch[1] : userPrompt}`.trim(),
        improvements: [],
      });
    });

    const reportA = await runBenchmarkSuite({
      cases: HUMANIZER_BENCHMARK_V1_CASES.slice(0, 3),
      completer: mockModelA,
      model: "model-a",
      provider: "groq",
    });

    const reportB = await runBenchmarkSuite({
      cases: HUMANIZER_BENCHMARK_V1_CASES.slice(0, 3),
      completer: mockModelB,
      model: "model-b",
      provider: "gemini",
    });

    expect(reportA.model).toBe("model-a");
    expect(reportB.model).toBe("model-b");
    expect(reportA.protectedElementSurvivalRate).toBe(1.0);
    expect(reportB.protectedElementSurvivalRate).toBe(1.0);
  });
});
