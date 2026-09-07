import { describe, it, expect } from "vitest";
import { createHumanizerDocument } from "../document/humanizerDocument";
import { shieldDocument } from "../protection/protectedElementExtractor";
import { auditIntegrity } from "../audit/integrityAuditor";
import { auditClaims } from "../audit/claimAuditor";
import { auditGrammar } from "../audit/grammarAuditor";
import { auditCoherence } from "../audit/coherenceAuditor";
import { auditSemantic, normalizeProtectedPlaceholders } from "../audit/semanticAuditor";
import { auditHumanizerCandidate } from "../audit/auditOrchestrator";
import { getPrimaryFailureReason } from "../audit/deltaAuditor";

describe("Phase 5: Multi-Auditor Suite", () => {
  const COW_ORIGINAL = `The cow is one of the most useful domestic animals in the world (Wilson et al., 2022). It has been closely associated with human civilization for thousands of years. People keep cows for milk, farming, and other useful products. In many countries, especially in South Asia, cows are an important part of rural life.

A cow is a herbivorous animal that mainly eats grass, hay, and other plant-based food. It has four legs, two horns, two ears, and a long tail. Empirical studies show that milk production efficiency improves significantly with targeted forage nutrition with $p < 0.001$ and $R^2 = 0.88$ [4, 7]. Milk is one of the most important products obtained from cows. It is rich in nutrients such as protein, calcium, and vitamins and is used to make products such as curd, butter, cheese, ghee, and yogurt. Cow dung is also useful because it can be used as organic manure for agriculture and, in some places, as a source of biogas.`;

  describe("1. Deterministic Integrity Auditor", () => {
    it("approves candidate when all protected tokens survive exactly once", () => {
      const origDoc = createHumanizerDocument(COW_ORIGINAL);
      const { shieldedDoc, registry } = shieldDocument(origDoc);

      const result = auditIntegrity(shieldedDoc, registry);

      // In shieldedDoc, all tokens are present
      expect(result.passed).toBe(true);
      expect(result.decision).toBe("SAFE");
      expect(result.findings).toHaveLength(0);
    });

    it("REJECTS with CRITICAL severity if a citation or equation token is omitted", () => {
      const origDoc = createHumanizerDocument(COW_ORIGINAL);
      const { registry } = shieldDocument(origDoc);

      // Candidate that dropped the citation token
      const corruptedText = "Domesticated cows remain important for rural subsistence. They produce milk.";
      const result = auditIntegrity(corruptedText, registry);

      expect(result.passed).toBe(false);
      expect(result.decision).toBe("REJECT");
      expect(result.missingTokens.length).toBeGreaterThan(0);
      expect(result.findings.some((f) => f.code === "INTEGRITY_TOKEN_MISSING" && f.severity === "CRITICAL")).toBe(true);
    });

    it("REJECTS if a token is duplicated", () => {
      const origDoc = createHumanizerDocument("Study confirmed findings (Wilson et al., 2022).");
      const { shieldedDoc, registry } = shieldDocument(origDoc);
      const token = registry.getAll()[0].token;

      const duplicatedText = `First sentence ${token} and duplicate ${token}.`;
      const result = auditIntegrity(duplicatedText, registry);

      expect(result.passed).toBe(false);
      expect(result.decision).toBe("REJECT");
      expect(result.duplicatedTokens).toContain(token);
    });
  });

  describe("2. Propositional Claim Auditor", () => {
    it("approves semantically faithful rewrite with hedged modality", () => {
      const origDoc = createHumanizerDocument("Evidence suggests that dietary fiber may reduce cholesterol.");
      const candDoc = createHumanizerDocument("Findings indicate that fiber intake could help lower cholesterol levels.");

      const result = auditClaims(origDoc, candDoc);
      expect(result.passed).toBe(true);
      expect(result.decision).toBe("SAFE");
    });

    it("REJECTS candidate when 'suggests / may' is strengthened to 'proves / causes'", () => {
      const origDoc = createHumanizerDocument("Evidence suggests that compound X may reduce inflammation.");
      const candDoc = createHumanizerDocument("Evidence proves that compound X causes a reduction in inflammation.");

      const result = auditClaims(origDoc, candDoc);
      expect(result.passed).toBe(false);
      expect(result.decision).toBe("REJECT");
      expect(result.epistemicShiftsCount + result.causalityShiftsCount).toBeGreaterThan(0);
      expect(result.findings.some((f) => f.severity === "CRITICAL")).toBe(true);
    });

    it("REJECTS candidate when negation is reversed", () => {
      const origDoc = createHumanizerDocument("The treatment does not increase blood glucose.");
      const candDoc = createHumanizerDocument("The treatment increases blood glucose.");

      const result = auditClaims(origDoc, candDoc);
      expect(result.passed).toBe(false);
      expect(result.decision).toBe("REJECT");
      expect(result.negationReversalsCount).toBe(1);
    });
  });

  describe("3. Grammar & Mechanics Auditor (Permanent Cow Regression)", () => {
    it("flags and REJECTS the original failure sentence with boundary and agreement errors", () => {
      const badCowText =
        "It is rich in nutrients such as protein, calcium. This vitamins and is used to make products such as curd, butter, cheese, ghee Cow dung is also useful because it can be used as organic manure.";

      const result = auditGrammar(badCowText);
      expect(result.passed).toBe(false);
      expect(result.decision).toBe("REJECT");
      expect(result.issues.length).toBeGreaterThanOrEqual(2);

      // Verify detection of "This vitamins" agreement mismatch
      expect(result.findings.some((f) => f.code === "GRAMMAR_AGREEMENT_ERROR")).toBe(true);
      // Verify detection of run-on concatenation "ghee Cow dung"
      expect(result.findings.some((f) => f.code === "GRAMMAR_RUN_ON_BOUNDARY")).toBe(true);
    });

    it("approves clean, grammatically sound academic text", () => {
      const cleanText =
        "It is rich in nutrients such as protein, calcium, and vitamins, and is used to produce dairy goods including curd, butter, cheese, ghee, and yogurt. Furthermore, cow dung serves as organic manure for agriculture.";

      const result = auditGrammar(cleanText);
      expect(result.passed).toBe(true);
      expect(result.decision).toBe("SAFE");
    });
  });

  describe("4. Coherence Auditor", () => {
    it("REJECTS paragraphs with dangling transitions at the end", () => {
      const danglingText = "Agricultural production increased across all trial regions. However,";
      const result = auditCoherence(danglingText);

      expect(result.passed).toBe(false);
      expect(result.decision).toBe("REJECT");
      expect(result.findings.some((f) => f.code === "COHERENCE_DANGLING_TRANSITION")).toBe(true);
    });
  });

  describe("5. Semantic Auditor", () => {
    it("normalizes protected tokens into semantic markers without polluting text metrics", () => {
      const tokenized = "Study ⟦PROTECTED_CITATION_APA_abc123⟧ showed $p < 0.001$ in ⟦PROTECTED_PERCENTAGE_def456⟧ of cases.";
      const normalized = normalizeProtectedPlaceholders(tokenized);

      expect(normalized).toBe("Study [CITATION] showed $p < 0.001$ in [QUANTITY] of cases.");
      expect(normalized).not.toContain("⟦PROTECTED_");
    });

    it("flags severe semantic drift when candidate strays completely off topic", () => {
      const orig = "Dairy cows require structured forage nutrition, clean water, and regular veterinary care.";
      const offTopic = "Quantum computing relies on superconducting qubits operating at cryogenic temperatures.";

      const result = auditSemantic(orig, offTopic);
      expect(result.passed).toBe(false);
      expect(result.decision).toBe("REJECT");
      expect(result.driftDetected).toBe(true);
    });
  });

  describe("6. Audit Orchestrator End-to-End Execution", () => {
    it("runs complete multi-auditor suite on valid candidate and outputs REWRITE_VALIDATED", () => {
      const origDoc = createHumanizerDocument(
        "The cow is one of the most useful domestic animals in the world (Wilson et al., 2022)."
      );
      const { shieldedDoc, registry } = shieldDocument(origDoc);

      const token = registry.getAll()[0].token;
      const validCandidateDoc = {
        ...shieldedDoc,
        blocks: [
          {
            ...shieldedDoc.blocks[0],
            processedText: `Domesticated across millennia, cows remain foundational to agrarian subsistence ${token}.`,
          },
        ],
      };

      const { report, auditedDoc } = auditHumanizerCandidate(origDoc, validCandidateDoc, registry);

      expect(report.finalDecision).toBe("SAFE");
      expect(report.candidateState).toBe("REWRITE_VALIDATED");
      expect(report.shortCircuited).toBe(false);
      expect(auditedDoc.auditState?.overallStatus).toBe("passed");
    });

    it("short-circuits on catastrophic integrity failure and outputs REWRITE_REJECTED", () => {
      const origDoc = createHumanizerDocument(
        "The cow is one of the most useful domestic animals in the world (Wilson et al., 2022)."
      );
      const { shieldedDoc, registry } = shieldDocument(origDoc);

      // Dropped token
      const corruptedCandidateDoc = {
        ...shieldedDoc,
        blocks: [
          {
            ...shieldedDoc.blocks[0],
            processedText: "Domesticated across millennia, cows remain foundational to agrarian subsistence.",
          },
        ],
      };

      const { report, auditedDoc } = auditHumanizerCandidate(origDoc, corruptedCandidateDoc, registry);

      expect(report.finalDecision).toBe("REJECT");
      expect(report.candidateState).toBe("REWRITE_REJECTED");
      expect(report.shortCircuited).toBe(true);
      expect(auditedDoc.auditState?.overallStatus).toBe("failed");
    });
  });

  describe("8. getPrimaryFailureReason", () => {
    it("returns default message when report is undefined or has no findings", () => {
      expect(getPrimaryFailureReason(undefined, "fallback")).toBe("fallback");
      expect(
        getPrimaryFailureReason(
          {
            finalDecision: "SAFE",
            overallSeverity: "INFO",
            candidateState: "REWRITE_VALIDATED",
            shortCircuited: false,
            findings: [],
            integrity: { passed: true, missingTokens: [], duplicatedTokens: [], unexpectedTokens: [], malformedTokens: [], exactRestoration: true },
            claims: { passed: true, preservationRate: 1, epistemicShiftsCount: 0, negationReversalsCount: 0, causalityShiftsCount: 0, droppedClaimsCount: 0, addedClaimsCount: 0 },
            grammar: { passed: true, errorsCount: 0, issues: [] },
            coherence: { passed: true, score: 100, transitionQuality: "high", issues: [] },
            semantic: { passed: true, similarityScore: 1, driftDetected: false, contradictionDetected: false },
            delta: { classification: "SAFE", wordCountDelta: 0, percentageChanged: 0 },
            timestamp: new Date().toISOString(),
          },
          "fallback"
        )
      ).toBe("fallback");
    });

    it("skips passing/preserved claims and extracts the real failure reason", () => {
      const mockReport: any = {
        finalDecision: "REJECT",
        overallSeverity: "ERROR",
        findings: [
          {
            auditor: "claim_auditor",
            category: "epistemic_claims",
            severity: "INFO",
            decision: "SAFE",
            code: "CLAIM_PRESERVED",
            message: "Propositional meaning, epistemic certainty, and quantitative constraints are faithfully preserved.",
          },
          {
            auditor: "claim_auditor",
            category: "epistemic_claims",
            severity: "ERROR",
            decision: "REJECT",
            code: "CLAIM_EPISTEMIC_SHIFT",
            message: "Epistemic stance shifted from cautious hedging to definitive assertion.",
          },
        ],
      };

      const reason = getPrimaryFailureReason(mockReport);
      expect(reason).toBe("Epistemic stance shifted from cautious hedging to definitive assertion.");
      expect(reason).not.toContain("faithfully preserved");
    });

    it("prioritizes REJECT decisions over WARNING decisions", () => {
      const mockReport: any = {
        finalDecision: "REJECT",
        overallSeverity: "CRITICAL",
        findings: [
          {
            auditor: "coherence_auditor",
            category: "coherence_flow",
            severity: "WARNING",
            decision: "WARNING",
            code: "TRANSITION_GAP",
            message: "Transition flow between paragraphs is weak.",
          },
          {
            auditor: "integrity_auditor",
            category: "token_integrity",
            severity: "CRITICAL",
            decision: "REJECT",
            code: "INTEGRITY_TOKEN_MISSING",
            message: "Protected citation was omitted.",
          },
        ],
      };

      const reason = getPrimaryFailureReason(mockReport);
      expect(reason).toBe("Protected citation was omitted.");
    });
  });
});
