import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildPromptForBlock,
  getDecodingParamsForMode,
} from "../rewrite/promptBuilder";
import { createHumanizerDocument } from "../document/humanizerDocument";
import { extractProtectedElements } from "../protection/protectedElementExtractor";
import { extractClaimFromSentence } from "../claims/claimExtractor";

describe("Phase 4: PromptBuilder & Mode Calibration", () => {
  describe("Decoding Parameters Calibration", () => {
    it("assigns appropriate temperature and penalties for each mode", () => {
      const cons = getDecodingParamsForMode("conservative");
      expect(cons.temperature).toBe(0.2);
      expect(cons.presencePenalty).toBe(0.0);

      const bal = getDecodingParamsForMode("balanced");
      expect(bal.temperature).toBe(0.6);
      expect(bal.presencePenalty).toBe(0.1);

      const deep = getDecodingParamsForMode("deep_restructure");
      expect(deep.temperature).toBe(0.75);
      expect(deep.presencePenalty).toBe(0.2);
    });
  });

  describe("System Prompt Invariants", () => {
    it("includes mandatory invariant instructions for protected tokens, epistemic fidelity, and negation", () => {
      const sysPrompt = buildSystemPrompt("balanced", "Empirical Natural Sciences");

      expect(sysPrompt).toContain("PROTECTED TOKENS");
      expect(sysPrompt).toContain("⟦PROTECTED_<TYPE>_<HASH>⟧");
      expect(sysPrompt).toContain("EPISTEMIC FIDELITY");
      expect(sysPrompt).toContain("NEGATION INVARIANCE");
      expect(sysPrompt).toContain("LOCKED TERMINOLOGY");
      expect(sysPrompt).toContain("Empirical Natural Sciences");
      expect(sysPrompt).toContain("rewrittenText");
    });
  });

  describe("User Prompt Construction", () => {
    it("structures document context, tokens, locked terms, and claims cleanly", () => {
      const doc = createHumanizerDocument(
        "Cows contribute significantly to rural economies (Wilson et al., 2022)."
      );
      const block = doc.blocks[0];

      const { elements } = extractProtectedElements(block.sourceText);
      const claim = extractClaimFromSentence(block.sourceText);

      const userPrompt = buildUserPrompt({
        mode: "balanced",
        genre: "Academic Journal",
        block,
        previousBlockText: "Introductory context about agricultural history.",
        nextBlockText: "Following context about livestock welfare.",
        protectedElementsInBlock: elements,
        claimsInBlock: [claim],
        lockedTerms: ["Rajadharma"],
      });

      expect(userPrompt).toContain("### DOCUMENT CONTEXT");
      expect(userPrompt).toContain("PREVIOUS PARAGRAPH:\n\"\"\"\nIntroductory context about agricultural history.\n\"\"\"");
      expect(userPrompt).toContain("NEXT PARAGRAPH:\n\"\"\"\nFollowing context about livestock welfare.\n\"\"\"");
      expect(userPrompt).toContain("### MANDATORY PROTECTED TOKENS");
      expect(userPrompt).toContain("### LOCKED TERMS");
      expect(userPrompt).toContain("Rajadharma");
      expect(userPrompt).toContain("### FACTUAL CLAIMS & EPISTEMIC CONSTRAINTS");
      expect(userPrompt).toContain("### SOURCE TEXT TO REWRITE");
    });
  });

  describe("End-to-End BuiltPrompt", () => {
    it("constructs a complete BuiltPrompt package ready for gateway completion", () => {
      const doc = createHumanizerDocument("Simple paragraph to rewrite.");
      const built = buildPromptForBlock({
        mode: "deep_restructure",
        block: doc.blocks[0],
        protectedElementsInBlock: [],
        claimsInBlock: [],
      });

      expect(built.mode).toBe("deep_restructure");
      expect(built.decodingParams.temperature).toBe(0.75);
      expect(built.systemPrompt).toContain("DEEP RESTRUCTURE MODE");
      expect(built.userPrompt).toContain("Simple paragraph to rewrite.");
    });
  });
});
