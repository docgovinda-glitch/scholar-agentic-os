import { describe, it, expect } from "vitest";
import { compareClaims, compareSingleClaimPair } from "../claims/claimComparison";
import { extractClaimFromSentence } from "../claims/claimExtractor";

describe("Phase 3: ClaimComparison & Semantic Integrity", () => {
  describe("Faithful Preservation", () => {
    it("reports PRESERVED when proposition is naturally rewritten without epistemic shift", () => {
      const orig = extractClaimFromSentence("The empirical data suggest that early intervention may improve outcomes.");
      const cand = extractClaimFromSentence("Evidence indicates that early therapeutic action could lead to better patient results.");

      const finding = compareSingleClaimPair(orig, cand);
      expect(finding.status).toBe("PRESERVED");
      expect(finding.severity).toBe("none");
    });
  });

  describe("Epistemic Modality Shifts", () => {
    it("flags critical error when 'suggests' is strengthened to 'proves'", () => {
      const orig = extractClaimFromSentence("The study suggests that the mechanism is active in neural tissue.");
      const cand = extractClaimFromSentence("The study proves that the mechanism is active in neural tissue.");

      const finding = compareSingleClaimPair(orig, cand);
      expect(finding.status).toBe("EPISTEMIC_SHIFT");
      expect(finding.severity).toBe("error");
      expect(finding.reason).toContain("strengthens a hedged proposition");
    });

    it("flags critical error when 'is associated with' becomes 'definitely causes'", () => {
      const orig = extractClaimFromSentence("Elevated cortisol is associated with sleep disturbance.");
      const cand = extractClaimFromSentence("Elevated cortisol definitely causes sleep disturbance.");

      const finding = compareSingleClaimPair(orig, cand);
      expect(["EPISTEMIC_SHIFT", "CAUSALITY_SHIFT"]).toContain(finding.status);
      expect(finding.severity).toBe("error");
    });
  });

  describe("Negation Reversal Detection", () => {
    it("detects when negation is erroneously removed", () => {
      const orig = extractClaimFromSentence("The drug does not increase resting heart rate.");
      const cand = extractClaimFromSentence("The drug increases resting heart rate.");

      const finding = compareSingleClaimPair(orig, cand);
      expect(finding.status).toBe("NEGATION_REVERSAL");
      expect(finding.severity).toBe("error");
    });

    it("detects when negative observation is turned into positive assertion", () => {
      const orig = extractClaimFromSentence("No significant relationship was observed between the two cohorts.");
      const cand = extractClaimFromSentence("A significant relationship was observed between the two cohorts.");

      const finding = compareSingleClaimPair(orig, cand);
      expect(finding.status).toBe("NEGATION_REVERSAL");
      expect(finding.severity).toBe("error");
    });
  });

  describe("Causality Escalation", () => {
    it("flags error when correlational association is converted into direct causation", () => {
      const orig = extractClaimFromSentence("Physical exercise is correlated with reduced anxiety.");
      const cand = extractClaimFromSentence("Physical exercise directly causes anxiety reduction.");

      const finding = compareSingleClaimPair(orig, cand);
      expect(finding.status).toBe("CAUSALITY_SHIFT");
      expect(finding.severity).toBe("error");
      expect(finding.reason).toContain("correlational");
    });
  });

  describe("Quantitative Constraint Shifts", () => {
    it("flags error when quantitative metric is dropped from rewritten proposition", () => {
      const orig = extractClaimFromSentence("The treatment reduced symptoms by 25% in clinical trials.");
      const cand = extractClaimFromSentence("The treatment reduced symptoms in clinical trials.");

      const finding = compareSingleClaimPair(orig, cand);
      expect(finding.status).toBe("QUANTITATIVE_SHIFT");
      expect(finding.severity).toBe("error");
      expect(finding.reason).toContain("25%");
    });
  });

  describe("Full Document Claim Comparison Report", () => {
    it("generates a comprehensive report detecting dropped, shifted, and valid claims", () => {
      const origClaims = [
        extractClaimFromSentence("Dietary fiber may decrease cholesterol levels by 15%."),
        extractClaimFromSentence("Regular exercise is associated with cardiovascular longevity."),
      ];

      const candClaims = [
        extractClaimFromSentence("Dietary fiber proves a reduction in cholesterol levels."), // Shifted & missing 15%
        // Second claim dropped!
      ];

      const report = compareClaims(origClaims, candClaims);
      expect(report.valid).toBe(false);
      expect(report.hasEpistemicShift).toBe(true);
      expect(report.hasDroppedClaims).toBe(true);
      expect(report.findings.some((f) => f.status === "DROPPED")).toBe(true);
    });
  });
});
