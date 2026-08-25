import { describe, it, expect } from "vitest";
import {
  detectModality,
  detectCertainty,
  detectNegation,
  detectCausality,
  extractQuantitativeConstraints,
  extractEvidenceRefs,
  extractClaimFromSentence,
  extractClaimsFromDocument,
} from "../claims/claimExtractor";
import { createHumanizerDocument } from "../document/humanizerDocument";

describe("Phase 3: ClaimExtractor & Epistemic Modality", () => {
  describe("Modality & Certainty Detection", () => {
    it("detects possible modality and low certainty for hedged claims", () => {
      const text1 = "The findings suggest that sleep deprivation may contribute to cognitive decline.";
      const mod1 = detectModality(text1);
      const cert1 = detectCertainty(text1, mod1);

      expect(mod1).toBe("possible");
      expect(cert1).toBe("low");

      const text2 = "Preliminary evidence might indicate an alternative metabolic pathway.";
      const mod2 = detectModality(text2);
      const cert2 = detectCertainty(text2, mod2);

      expect(mod2).toBe("possible");
      expect(cert2).toBe("low");
    });

    it("detects probable modality and medium certainty", () => {
      const text = "The intervention likely improves glycemic control in adult patients.";
      const mod = detectModality(text);
      const cert = detectCertainty(text, mod);

      expect(mod).toBe("probable");
      expect(cert).toBe("medium");
    });

    it("detects certain modality and high certainty for definitive assertions", () => {
      const text = "Empirical results prove that forage nutrition causes a significant yield increase.";
      const mod = detectModality(text);
      const cert = detectCertainty(text, mod);

      expect(mod).toBe("certain");
      expect(cert).toBe("high");
    });
  });

  describe("Negation Detection", () => {
    it("identifies direct and complex grammatical negations", () => {
      expect(detectNegation("The drug does not increase arterial pressure.")).toBe(true);
      expect(detectNegation("No significant relationship was observed between the variables.")).toBe(true);
      expect(detectNegation("The model fails to converge under noisy parameters.")).toBe(true);
      expect(detectNegation("The treatment was administered without adverse effects.")).toBe(true);
      expect(detectNegation("The drug increases arterial pressure.")).toBe(false);
    });
  });

  describe("Causality Classification", () => {
    it("distinguishes direct, correlational, possible causal, and non-causal relations", () => {
      expect(detectCausality("Smoking causes respiratory degradation.")).toBe("direct");
      expect(detectCausality("Dietary sodium is associated with hypertension.")).toBe("correlational");
      expect(detectCausality("Microbiome imbalance may contribute to chronic inflammation.")).toBe("possible_causal");
      expect(detectCausality("The cow has four legs and two horns.")).toBe("none");
    });
  });

  describe("Quantitative Constraints & Evidence Extraction", () => {
    it("extracts numbers, p-values, percentages, and citations", () => {
      const sentence = "Treatment reduced symptom severity by 25% with $p < 0.001$ for n = 120 subjects (Wilson et al., 2022).";
      const claim = extractClaimFromSentence(sentence);

      expect(claim.quantitativeConstraints).toContain("25%");
      expect(claim.quantitativeConstraints?.some((q) => q.includes("p < 0.001"))).toBe(true);
      expect(claim.quantitativeConstraints).toContain("n = 120");
      expect(claim.evidenceRefs).toContain("(Wilson et al., 2022)");
    });
  });

  describe("Document-Level Claim Extraction", () => {
    it("extracts structured claims across all blocks of a HumanizerDocument", () => {
      const doc = createHumanizerDocument(
        "Cows provide essential dairy nutrients. Milk production efficiency improves significantly with targeted nutrition."
      );
      const docWithClaims = extractClaimsFromDocument(doc);

      expect(docWithClaims.claims.length).toBe(2);
      expect(docWithClaims.claims[0].claimId).toBe("claim_001");
      expect(docWithClaims.claims[0].sourceBlockId).toBe("p_001");
      expect(docWithClaims.blocks[0].sentences[0].claimIds).toContain("claim_001");
    });
  });
});
