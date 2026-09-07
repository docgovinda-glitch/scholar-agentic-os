import { describe, it, expect, vi } from "vitest";
import {
  parseLlmRewriteOutput,
  isRewriteCandidate,
  rewriteBlock,
  rewriteDocument,
} from "../rewrite/rewriteEngine";
import { createHumanizerDocument } from "../document/humanizerDocument";
import { shieldDocument } from "../protection/protectedElementExtractor";

describe("Phase 4: RewriteEngine & Hierarchical Document Processing", () => {
  describe("LLM Output Parsing", () => {
    it("parses valid JSON response with rewrittenText and improvements", () => {
      const raw = JSON.stringify({
        rewrittenText: "Domesticated bovines remain foundational to agricultural economies.",
        improvements: ["Varied clause structure", "Eliminated robotic transition"],
      });

      const parsed = parseLlmRewriteOutput(raw);
      expect(parsed.rewrittenText).toBe("Domesticated bovines remain foundational to agricultural economies.");
      expect(parsed.improvements).toHaveLength(2);
    });

    it("parses markdown code-fenced JSON responses", () => {
      const raw = "```json\n" + JSON.stringify({
        rewrittenText: "Rewritten scholarly prose.",
        improvements: ["Enhanced academic cadence"],
      }) + "\n```";

      const parsed = parseLlmRewriteOutput(raw);
      expect(parsed.rewrittenText).toBe("Rewritten scholarly prose.");
    });

    it("parses alternative JSON keys (humanizedText and text)", () => {
      const raw1 = JSON.stringify({
        humanizedText: "Rewritten text using humanizedText key.",
        improvements: ["Improved clarity"],
      });
      expect(parseLlmRewriteOutput(raw1).rewrittenText).toBe("Rewritten text using humanizedText key.");

      const raw2 = JSON.stringify({
        text: "Rewritten text using text key.",
      });
      expect(parseLlmRewriteOutput(raw2).rewrittenText).toBe("Rewritten text using text key.");
    });

    it("gracefully falls back on clean plain prose when model omits JSON formatting", () => {
      const plain = "Domesticated across millennia, cows remain foundational to agricultural economies.";
      const parsed = parseLlmRewriteOutput(plain);
      expect(parsed.rewrittenText).toBe("Domesticated across millennia, cows remain foundational to agricultural economies.");
      expect(parsed.improvements.length).toBeGreaterThan(0);
    });
  });

  describe("Candidate Filtering", () => {
    it("skips code blocks and empty text from rewriting", () => {
      const doc = createHumanizerDocument("```js\nconsole.log(1);\n```\n\nRegular text paragraph.");
      expect(isRewriteCandidate(doc.blocks[0])).toBe(false); // code block
      expect(isRewriteCandidate(doc.blocks[1])).toBe(true);  // paragraph
    });
  });

  describe("Hierarchical Document Rewriting", () => {
    it("rewrites document block-by-block and updates sentences and version info", async () => {
      const rawText = `The cow is a domestic animal (Wilson et al., 2022). People keep cows for milk.

Empirical studies show milk efficiency improves with $p < 0.001$.`;

      const doc = createHumanizerDocument(rawText);
      const { shieldedDoc, registry } = shieldDocument(doc);

      // Mock completer that preserves protected tokens in rewritten output
      const mockCompleter = vi.fn().mockImplementation(async ({ userPrompt }: any) => {
        const sourceTextSection = userPrompt.split("### SOURCE TEXT TO REWRITE")[1] || "";
        if (sourceTextSection.includes("domestic animal") || sourceTextSection.includes("⟦PROTECTED_CITATION")) {
          // Extract token from user prompt
          const tokenMatch = userPrompt.match(/⟦PROTECTED_CITATION_APA_[a-zA-Z0-9]+⟧/);
          const token = tokenMatch ? tokenMatch[0] : "(Wilson et al., 2022)";
          return JSON.stringify({
            rewrittenText: `Domesticated across millennia, cows remain integral to agrarian subsistence ${token}. Dairy production represents a primary economic motivation.`,
            improvements: ["Rebalanced sentence openings", "Elevated disciplinary vocabulary"],
          });
        }
        // Second block
        const mathMatch = userPrompt.match(/⟦PROTECTED_LATEX_INLINE_[a-zA-Z0-9]+⟧/);
        const mathToken = mathMatch ? mathMatch[0] : "$p < 0.001$";
        return JSON.stringify({
          rewrittenText: `Quantitative assessments confirm that targeted nutrition yields significant gains in lactation efficiency (${mathToken}).`,
          improvements: ["Syntactic restructuring"],
        });
      });

      const result = await rewriteDocument(shieldedDoc, {
        mode: "balanced",
        genre: "Empirical Natural Sciences",
        completer: mockCompleter,
        registry,
      });

      expect(result.blocksRewritten).toBe(2);
      expect(result.candidateDoc.blocks).toHaveLength(2);
      expect(result.candidateDoc.blocks[0].processedText).toContain("Domesticated across millennia");
      expect(result.candidateDoc.blocks[1].processedText).toContain("Quantitative assessments confirm");
      expect(result.candidateDoc.versionInfo.decodingProfile).toBe("balanced");
      expect(result.improvements.length).toBeGreaterThan(0);
    });

    it("normalizes square bracket protected tokens and auto re-shields restored citations", async () => {
      const rawText = "The cow is an animal (Wilson et al., 2022).";
      const doc = createHumanizerDocument(rawText);
      const { shieldedDoc, registry } = shieldDocument(doc);
      const token = registry.getAll()[0].token;

      // Completer returning square brackets [PROTECTED_...]
      const squareBracketCompleter = vi.fn().mockResolvedValue(
        JSON.stringify({
          rewrittenText: `Domesticated bovines represent an agrarian asset ${token.replace("⟦", "[").replace("⟧", "]")}.`,
          improvements: ["Enhanced register"],
        })
      );

      const res1 = await rewriteBlock(shieldedDoc.blocks[0], {
        mode: "balanced",
        genre: "Empirical Natural Sciences",
        completer: squareBracketCompleter,
        registry,
        doc: shieldedDoc,
      });

      expect(res1.rewrittenBlock.processedText).toContain(token);
      expect(res1.rewrittenBlock.processedText).not.toContain("[PROTECTED_");

      // Completer returning original citation text directly instead of token
      const originalCitationCompleter = vi.fn().mockResolvedValue(
        JSON.stringify({
          rewrittenText: "Domesticated bovines represent an agrarian asset (Wilson et al., 2022).",
          improvements: ["Enhanced register"],
        })
      );

      const res2 = await rewriteBlock(shieldedDoc.blocks[0], {
        mode: "balanced",
        genre: "Empirical Natural Sciences",
        completer: originalCitationCompleter,
        registry,
        doc: shieldedDoc,
      });

      // Completer returning outer brackets around double-bracket tokens [⟦PROTECTED_...⟧]
      const redundantOuterBracketCompleter = vi.fn().mockResolvedValue(
        JSON.stringify({
          rewrittenText: `Domesticated bovines represent an agrarian asset [${token}].`,
          improvements: ["Enhanced register"],
        })
      );

      const res3 = await rewriteBlock(shieldedDoc.blocks[0], {
        mode: "balanced",
        genre: "Empirical Natural Sciences",
        completer: redundantOuterBracketCompleter,
        registry,
        doc: shieldedDoc,
      });

      expect(res3.rewrittenBlock.processedText).toBe(`Domesticated bovines represent an agrarian asset ${token}.`);
      expect(res3.rewrittenBlock.processedText).not.toContain(`[${token}]`);
    });
  });
});
