import { describe, it, expect } from "vitest";
import { createHumanizerDocument } from "../document/humanizerDocument";
import { generateReviewUnits } from "../review/sentenceMapper";
import {
  applyReviewUnitDecision,
  applyAllReviewUnits,
  validateFinalDocument,
} from "../review/documentReviewManager";

describe("Phase 8: Fine-Grained Sentence Review & Sentence Mapping", () => {
  describe("1. Sentence Mapping Classifications", () => {
    it("maps 1:1 sentences when sentence counts match", () => {
      const orig = createHumanizerDocument("Sentence one. Sentence two.");
      const cand = createHumanizerDocument("Revised sentence one. Revised sentence two.");

      const units = generateReviewUnits(orig, cand);

      expect(units).toHaveLength(2);
      expect(units[0].mappingType).toBe("ONE_TO_ONE");
      expect(units[0].sourceText).toBe("Sentence one.");
      expect(units[0].candidateText).toBe("Revised sentence one.");
      expect(units[0].status).toBe("MODIFIED");

      expect(units[1].mappingType).toBe("ONE_TO_ONE");
      expect(units[1].sourceText).toBe("Sentence two.");
      expect(units[1].candidateText).toBe("Revised sentence two.");
    });

    it("identifies 1:N sentence split (ONE_TO_MANY)", () => {
      const orig = createHumanizerDocument("A single long sentence that discusses two related concepts.");
      const cand = createHumanizerDocument("A single sentence was created. It discusses two related concepts.");

      const units = generateReviewUnits(orig, cand);

      expect(units).toHaveLength(1);
      expect(units[0].mappingType).toBe("ONE_TO_MANY");
      expect(units[0].status).toBe("RESTRUCTURED");
      expect(units[0].explanation).toContain("restructured into 2 sentences");
    });

    it("identifies N:1 sentence merge (MANY_TO_ONE)", () => {
      const orig = createHumanizerDocument("First short sentence. Second short sentence.");
      const cand = createHumanizerDocument("First short sentence combined with the second short sentence.");

      const units = generateReviewUnits(orig, cand);

      expect(units).toHaveLength(1);
      expect(units[0].mappingType).toBe("MANY_TO_ONE");
      expect(units[0].status).toBe("RESTRUCTURED");
      expect(units[0].explanation).toContain("combined into 1 sentence");
    });

    it("identifies N:M complex restructuring (MANY_TO_MANY)", () => {
      const orig = createHumanizerDocument("Sentence A. Sentence B. Sentence C.");
      const cand = createHumanizerDocument("Sentence A and B merged. Sentence C revised.");

      const units = generateReviewUnits(orig, cand);

      expect(units).toHaveLength(1);
      expect(units[0].mappingType).toBe("MANY_TO_MANY");
      expect(units[0].status).toBe("RESTRUCTURED");
    });
  });

  describe("2. Sentence-Level Acceptance & Rejection", () => {
    it("reverts only the rejected sentence when user rejects sentence 2 in a 1:1 block", () => {
      const orig = createHumanizerDocument("Cows provide milk. They eat fresh grass.");
      const cand = createHumanizerDocument("Cows produce rich dairy milk. They consume nutritious forage.");

      const units = generateReviewUnits(orig, cand);
      const docWithUnits = { ...cand, reviewUnits: units };

      // User accepts sentence 1 (Keep Humanized)
      const res1 = applyReviewUnitDecision(docWithUnits, units[0].unitId, "ACCEPTED");
      expect(res1.success).toBe(true);

      // User rejects sentence 2 (Keep Original)
      const res2 = applyReviewUnitDecision(res1.updatedDoc, units[1].unitId, "REJECTED");
      expect(res2.success).toBe(true);

      // Verify final text: Sentence 1 is humanized, Sentence 2 is original
      const finalBlockText = res2.updatedDoc.blocks[0].processedText;
      expect(finalBlockText).toContain("Cows produce rich dairy milk");
      expect(finalBlockText).toContain("They eat fresh grass");
      expect(finalBlockText).not.toContain("They consume nutritious forage");
    });

    it("reverts entire restructured block when user rejects a merged/split ReviewUnit", () => {
      const orig = createHumanizerDocument("Sentence one. Sentence two.");
      const cand = createHumanizerDocument("Sentence one and two combined into a single clause.");

      const units = generateReviewUnits(orig, cand);
      const docWithUnits = { ...cand, reviewUnits: units };

      const res = applyReviewUnitDecision(docWithUnits, units[0].unitId, "REJECTED");
      expect(res.success).toBe(true);

      const finalBlockText = res.updatedDoc.blocks[0].processedText;
      expect(finalBlockText).toBe("Sentence one. Sentence two.");
    });
  });

  describe("3. Document Validation & Safety Invariants", () => {
    it("validates that final document contains no un-restored protected tokens", () => {
      const validDoc = createHumanizerDocument("Study findings (Wilson et al., 2022) are confirmed.");
      expect(validateFinalDocument(validDoc).valid).toBe(true);

      const corruptedDoc = {
        ...validDoc,
        blocks: [
          {
            ...validDoc.blocks[0],
            processedText: "Study findings ⟦PROTECTED_CITATION_APA_123⟧ are confirmed.",
          },
        ],
      };

      const result = validateFinalDocument(corruptedDoc);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("unrestored protected token");
    });

    it("verifies locked terminology preservation in final document", () => {
      const doc = createHumanizerDocument("The concept of Rajadharma guides righteous leadership.");
      doc.terminologyMemory.lockedTerms = ["Rajadharma"];

      expect(validateFinalDocument(doc).valid).toBe(true);

      // Corrupted without locked term
      const missingTermDoc = {
        ...doc,
        blocks: [
          {
            ...doc.blocks[0],
            processedText: "The concept of royal duty guides leadership.",
          },
        ],
      };

      const result = validateFinalDocument(missingTermDoc);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('locked terminology: "Rajadharma"');
    });
  });
});
