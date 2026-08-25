import { describe, it, expect, vi } from "vitest";
import { runHumanizerPipeline } from "../orchestration/humanizerPipeline";

describe("Phase 6: HumanizerPipeline & Fail-Safe Fallback", () => {
  const SAMPLE_INPUT = `The cow is a domestic animal in South Asia (Wilson et al., 2022). It provides dairy nutrition.`;

  describe("1. First-Attempt Success", () => {
    it("accepts valid candidate on first attempt without triggering retries", async () => {
      const mockCompleter = vi.fn().mockImplementation(async ({ userPrompt }: any) => {
        const tokenMatch = userPrompt.match(/⟦PROTECTED_CITATION_APA_[a-zA-Z0-9]+⟧/);
        const token = tokenMatch ? tokenMatch[0] : "(Wilson et al., 2022)";
        return JSON.stringify({
          rewrittenText: `Domesticated across centuries, cows remain vital to agrarian life ${token}. They supply essential dairy nourishment.`,
          improvements: ["Refined cadence", "Academic vocabulary"],
        });
      });

      const result = await runHumanizerPipeline(SAMPLE_INPUT, {
        mode: "balanced",
        completer: mockCompleter,
      });

      expect(result.success).toBe(true);
      expect(result.attemptsCount).toBe(1);
      expect(result.fallbackUsed).toBe(false);
      expect(result.candidateState).toBe("REWRITE_VALIDATED");
      expect(result.finalText).toContain("(Wilson et al., 2022)");
      expect(result.finalText).not.toContain("⟦PROTECTED_");
    });
  });

  describe("2. Failure-Specific Adaptive Retries", () => {
    it("retries and fixes grammar agreement error on second attempt", async () => {
      let callCount = 0;
      const mockCompleter = vi.fn().mockImplementation(async ({ userPrompt }: any) => {
        callCount++;
        const tokenMatch = userPrompt.match(/⟦PROTECTED_CITATION_APA_[a-zA-Z0-9]+⟧/);
        const token = tokenMatch ? tokenMatch[0] : "(Wilson et al., 2022)";

        if (callCount === 1) {
          // Bad Candidate 1: contains "This vitamins"
          return JSON.stringify({
            rewrittenText: `Cows provide essential milk. This vitamins and is used for butter ${token}.`,
            improvements: ["Initial draft"],
          });
        }
        // Corrected Candidate 2: fixed grammar
        expect(userPrompt).toContain("CRITICAL GRAMMAR");
        return JSON.stringify({
          rewrittenText: `Domesticated across centuries, cows remain vital to agrarian life ${token}. They supply essential dairy nourishment.`,
          improvements: ["Corrected grammatical agreement"],
        });
      });

      const result = await runHumanizerPipeline(SAMPLE_INPUT, {
        mode: "balanced",
        completer: mockCompleter,
        maxRetries: 2,
      });

      expect(result.success).toBe(true);
      expect(result.attemptsCount).toBe(2);
      expect(result.fallbackUsed).toBe(false);
      expect(result.finalText).toContain("(Wilson et al., 2022)");
    });

    it("retries and fixes epistemic modal shift on second attempt", async () => {
      const input = "Evidence suggests that dietary fiber may reduce cholesterol levels.";
      let callCount = 0;

      const mockCompleter = vi.fn().mockImplementation(async ({ userPrompt }: any) => {
        callCount++;
        if (callCount === 1) {
          // Bad Candidate 1: strengthens "suggests ... may reduce" to "proves ... reduces"
          return JSON.stringify({
            rewrittenText: "Evidence proves that dietary fiber reduces cholesterol levels.",
            improvements: ["Direct wording"],
          });
        }
        // Corrected Candidate 2: respects epistemic hedging
        expect(userPrompt).toContain("CRITICAL EPISTEMIC FIDELITY");
        return JSON.stringify({
          rewrittenText: "Findings indicate that dietary fiber intake may reduce cholesterol levels.",
          improvements: ["Preserved epistemic hedging"],
        });
      });

      const result = await runHumanizerPipeline(input, {
        mode: "balanced",
        completer: mockCompleter,
        maxRetries: 2,
      });

      expect(result.success).toBe(true);
      expect(result.attemptsCount).toBe(2);
      expect(result.fallbackUsed).toBe(false);
    });

    it("retries and restores dropped protected token on second attempt", async () => {
      let callCount = 0;
      const mockCompleter = vi.fn().mockImplementation(async ({ userPrompt }: any) => {
        callCount++;
        if (callCount === 1) {
          // Bad Candidate 1: dropped the citation token
          return JSON.stringify({
            rewrittenText: "Domesticated across centuries, cows remain vital to agrarian life. They supply nourishment.",
            improvements: ["Initial draft without token"],
          });
        }
        // Corrected Candidate 2: includes token
        const tokenMatch = userPrompt.match(/⟦PROTECTED_CITATION_APA_[a-zA-Z0-9]+⟧/);
        const token = tokenMatch ? tokenMatch[0] : "(Wilson et al., 2022)";
        expect(userPrompt).toContain("CRITICAL PROTECTED TOKEN INTEGRITY");

        return JSON.stringify({
          rewrittenText: `Domesticated across centuries, cows remain vital to agrarian life ${token}. They supply nourishment.`,
          improvements: ["Preserved protected placeholder"],
        });
      });

      const result = await runHumanizerPipeline(SAMPLE_INPUT, {
        mode: "balanced",
        completer: mockCompleter,
        maxRetries: 2,
      });

      expect(result.success).toBe(true);
      expect(result.attemptsCount).toBe(2);
      expect(result.finalText).toContain("(Wilson et al., 2022)");
    });
  });

  describe("3. Fail-Safe Fallback & Budget Exhaustion", () => {
    it("safely falls back to the exact ORIGINAL text when all retries are exhausted", async () => {
      // Completer that persistently violates epistemic fidelity
      const mockCompleter = vi.fn().mockImplementation(async () => {
        return JSON.stringify({
          rewrittenText: "Evidence proves that compound X causes absolute recovery.",
          improvements: ["Definitive assertions"],
        });
      });

      const input = "Evidence suggests that compound X may support recovery.";
      const result = await runHumanizerPipeline(input, {
        mode: "balanced",
        completer: mockCompleter,
        maxRetries: 2,
      });

      expect(result.success).toBe(false);
      expect(result.fallbackUsed).toBe(true);
      expect(result.candidateState).toBe("REWRITE_REJECTED");
      // MUST return exact original, NOT the corrupt candidate
      expect(result.finalText).toBe(input);
      expect(result.attemptsCount).toBe(3); // Attempt 1 + 2 retries
    });

    it("safely falls back to original text upon provider failure", async () => {
      const failingCompleter = vi.fn().mockRejectedValue(new Error("Provider Timeout 504"));

      const result = await runHumanizerPipeline(SAMPLE_INPUT, {
        mode: "balanced",
        completer: failingCompleter,
        maxRetries: 1,
      });

      expect(result.success).toBe(false);
      expect(result.fallbackUsed).toBe(true);
      expect(result.candidateState).toBe("REWRITE_REJECTED");
      expect(result.finalText).toBe(SAMPLE_INPUT);
    });
  });

  describe("4. No-Rewrite Needed Path", () => {
    it("bypasses rewriting for empty or code-only documents without calling completer", async () => {
      const mockCompleter = vi.fn();
      const codeOnly = "```python\nprint('hello')\n```";

      const result = await runHumanizerPipeline(codeOnly, {
        completer: mockCompleter,
        noRewriteCheck: true,
      });

      expect(result.candidateState).toBe("NO_REWRITE_NEEDED");
      expect(result.fallbackUsed).toBe(false);
      expect(result.attemptsCount).toBe(0);
      expect(mockCompleter).not.toHaveBeenCalled();
    });
  });
});
