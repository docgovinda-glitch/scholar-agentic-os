import { describe, it, expect, vi } from "vitest";
import { runHumanizerPipeline } from "../orchestration/humanizerPipeline";
import { renderHumanizerDocument } from "../document/humanizerDocument";
import { validateFinalDocument } from "../review/documentReviewManager";

describe("Phase 14: Final Production Hardening & Security Gate", () => {
  const DENSE_ACADEMIC_SOURCE =
    "Observed a 4.2-fold reduction in translocations ($p < 0.001$, $R^2 = 0.88$) with 98.4% viability (Chen et al., 2024). The doctrine of Rajadharma remained central.";

  describe("1. End-to-End Production Pipeline & Invariant Gate", () => {
    it("successfully refines academic prose while preserving 100% of citations, statistics, LaTeX, and locked terms", async () => {
      const mockCompleter = vi.fn().mockImplementation(async ({ userPrompt }: any) => {
        const sourceMatch = userPrompt.match(/### SOURCE TEXT TO REWRITE\n"""\n([\s\S]*?)\n"""/);
        const sourceText = sourceMatch ? sourceMatch[1] : userPrompt;

        return JSON.stringify({
          rewrittenText: `Scholarly refinement: ${sourceText}`.trim(),
          improvements: ["Elevated scholarly cadence and syntax"],
        });
      });

      const result = await runHumanizerPipeline(DENSE_ACADEMIC_SOURCE, {
        mode: "balanced",
        genre: "Academic Journal",
        completer: mockCompleter,
        lockedTerms: ["Rajadharma"],
      });

      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe(false);
      expect(result.finalText).toContain("(Chen et al., 2024)");
      expect(result.finalText).toContain("$p < 0.001$");
      expect(result.finalText).toContain("$R^2 = 0.88$");
      expect(result.finalText).toContain("98.4%");
      expect(result.finalText).toContain("4.2-fold");
      expect(result.finalText).toContain("Rajadharma");
    });
  });

  describe("2. Claim & Modality Escalation Gate", () => {
    it("rejects candidate when cautious correlational claim is escalated to direct causation", async () => {
      const causalCompleter = vi.fn().mockImplementation(async () => {
        return JSON.stringify({
          rewrittenText: "Preferential trade pacts directly cause and prove complete regional peace.",
          improvements: [],
        });
      });

      const input = "Preferential trade pacts may correlate with reduced border militarization.";
      const result = await runHumanizerPipeline(input, {
        mode: "balanced",
        completer: causalCompleter,
      });

      // Claim escalation must trigger reject and fallback
      expect(result.fallbackUsed).toBe(true);
      expect(result.finalText).toBe(input);
    });
  });

  describe("3. Concurrency & State Isolation", () => {
    it("maintains strict state and terminology isolation across concurrent pipeline runs", async () => {
      const completerA = vi.fn().mockImplementation(async ({ userPrompt }: any) => {
        const sourceMatch = userPrompt.match(/### SOURCE TEXT TO REWRITE\n"""\n([\s\S]*?)\n"""/);
        return JSON.stringify({
          rewrittenText: `Run A: ${sourceMatch ? sourceMatch[1] : userPrompt}`.trim(),
          improvements: [],
        });
      });

      const completerB = vi.fn().mockImplementation(async ({ userPrompt }: any) => {
        const sourceMatch = userPrompt.match(/### SOURCE TEXT TO REWRITE\n"""\n([\s\S]*?)\n"""/);
        return JSON.stringify({
          rewrittenText: `Run B: ${sourceMatch ? sourceMatch[1] : userPrompt}`.trim(),
          improvements: [],
        });
      });

      const textA = "Study on Vedic Trusteeship in economics.";
      const textB = "Study on Quantum Cognition in robotics.";

      const [resA, resB] = await Promise.all([
        runHumanizerPipeline(textA, {
          mode: "conservative",
          completer: completerA,
          lockedTerms: ["Vedic Trusteeship"],
        }),
        runHumanizerPipeline(textB, {
          mode: "balanced",
          completer: completerB,
          lockedTerms: ["Quantum Cognition"],
        }),
      ]);

      expect(resA.finalText).toContain("Vedic Trusteeship");
      expect(resA.finalText).not.toContain("Quantum Cognition");

      expect(resB.finalText).toContain("Quantum Cognition");
      expect(resB.finalText).not.toContain("Vedic Trusteeship");
    });
  });

  describe("4. Error Sanitization & User-Facing Safety", () => {
    it("sanitizes user-facing error messages and never leaks prompt internals or keys", async () => {
      const crashingCompleter = vi.fn().mockRejectedValue(
        new Error("SECRET_API_KEY_EXPOSURE_SIMULATION: Model endpoint crashed with internal stack trace at line 42")
      );

      const result = await runHumanizerPipeline("The method remained robust.", {
        mode: "balanced",
        completer: crashingCompleter,
      });

      expect(result.success).toBe(false);
      expect(result.fallbackUsed).toBe(true);
      expect(result.finalText).toBe("The method remained robust.");
      expect(result.fallbackReason).toBeDefined();
      expect(result.fallbackReason).not.toContain("SECRET_API_KEY_EXPOSURE_SIMULATION");
    });
  });

  describe("5. Export Hygiene & Final Document Validation", () => {
    it("guarantees exported document contains zero placeholder tokens and zero un-restored hashes", () => {
      const sampleText =
        "Empirical findings confirm efficiency (Chen et al., 2024) with $p < 0.001$ in Rajadharma governance.";

      const doc = {
        id: "doc-prod-1",
        rawText: sampleText,
        blocks: [
          {
            id: "b1",
            type: "paragraph" as const,
            sourceText: sampleText,
            processedText: sampleText,
            sentences: [],
            orderIndex: 0,
          },
        ],
        metadata: {
          characterCount: sampleText.length,
          wordCount: 13,
          paragraphCount: 1,
          sentenceCount: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
        },
      };

      const validation = validateFinalDocument(doc);
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);

      const exportedMarkdown = renderHumanizerDocument(doc, "processed");
      expect(exportedMarkdown).not.toMatch(/⟦PROTECTED_[^⟧]+⟧/);
      expect(exportedMarkdown).toContain("(Chen et al., 2024)");
      expect(exportedMarkdown).toContain("$p < 0.001$");
      expect(exportedMarkdown).toContain("Rajadharma");
    });
  });
});
