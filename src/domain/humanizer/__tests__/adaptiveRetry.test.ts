import { describe, it, expect } from "vitest";
import {
  mapFindingCodeToInstruction,
  detectFailureOscillation,
  buildRetryPlan,
} from "../orchestration/adaptiveRetry";
import { HumanizerAuditReport } from "../types";

describe("Phase 6: AdaptiveRetry & Targeted Retry Planner", () => {
  describe("Finding Code to Targeted Instruction Mapping", () => {
    it("maps protected token failures to strict placeholder constraints", () => {
      const instruction = mapFindingCodeToInstruction({
        auditor: "integrity_auditor",
        category: "token_integrity",
        severity: "CRITICAL",
        decision: "REJECT",
        code: "INTEGRITY_TOKEN_MISSING",
        message: "Missing token",
      });

      expect(instruction).toContain("CRITICAL PROTECTED TOKEN INTEGRITY");
      expect(instruction).toContain("⟦PROTECTED_...⟧");
    });

    it("maps grammar agreement and boundary failures to targeted syntax constraints", () => {
      const agreeInst = mapFindingCodeToInstruction({
        auditor: "grammar_auditor",
        category: "agreement",
        severity: "CRITICAL",
        decision: "REJECT",
        code: "GRAMMAR_AGREEMENT_ERROR",
        message: "Agreement error",
      });
      expect(agreeInst).toContain("This vitamins");

      const boundaryInst = mapFindingCodeToInstruction({
        auditor: "grammar_auditor",
        category: "sentence_boundary",
        severity: "CRITICAL",
        decision: "REJECT",
        code: "GRAMMAR_RUN_ON_BOUNDARY",
        message: "Run-on boundary",
      });
      expect(boundaryInst).toContain("run-on sentence concatenation");
    });

    it("maps epistemic, causality, and negation failures to propositional constraints", () => {
      const epistemic = mapFindingCodeToInstruction({
        auditor: "claim_auditor",
        category: "epistemic_claims",
        severity: "CRITICAL",
        decision: "REJECT",
        code: "CLAIM_EPISTEMIC_SHIFT",
        message: "Epistemic shift",
      });
      expect(epistemic).toContain("Do NOT strengthen hedged claims");

      const causal = mapFindingCodeToInstruction({
        auditor: "claim_auditor",
        category: "epistemic_claims",
        severity: "CRITICAL",
        decision: "REJECT",
        code: "CLAIM_CAUSALITY_SHIFT",
        message: "Causality shift",
      });
      expect(causal).toContain("correlational vs direct causal");

      const negation = mapFindingCodeToInstruction({
        auditor: "claim_auditor",
        category: "epistemic_claims",
        severity: "CRITICAL",
        decision: "REJECT",
        code: "CLAIM_NEGATION_REVERSAL",
        message: "Negation reversal",
      });
      expect(negation).toContain("CRITICAL NEGATION INVARIANCE");
    });
  });

  describe("Multi-Finding Combination & Deduplication", () => {
    it("combines multiple failing findings into a cohesive RetryPlan", () => {
      const report: HumanizerAuditReport = {
        finalDecision: "REJECT",
        overallSeverity: "CRITICAL",
        candidateState: "REWRITE_REJECTED",
        shortCircuited: false,
        findings: [
          {
            auditor: "integrity_auditor",
            category: "token_integrity",
            severity: "CRITICAL",
            decision: "REJECT",
            code: "INTEGRITY_TOKEN_MISSING",
            message: "Missing token",
            token: "⟦PROTECTED_CITATION_APA_123⟧",
          },
          {
            auditor: "grammar_auditor",
            category: "agreement",
            severity: "CRITICAL",
            decision: "REJECT",
            code: "GRAMMAR_AGREEMENT_ERROR",
            message: "This vitamins error",
          },
          {
            auditor: "claim_auditor",
            category: "epistemic_claims",
            severity: "CRITICAL",
            decision: "REJECT",
            code: "CLAIM_EPISTEMIC_SHIFT",
            message: "Strengthened modality",
          },
        ],
        integrity: { passed: false, missingTokens: ["⟦PROTECTED_CITATION_APA_123⟧"], duplicatedTokens: [], unexpectedTokens: [], malformedTokens: [], exactRestoration: false },
        claims: { passed: false, preservationRate: 0.5, epistemicShiftsCount: 1, negationReversalsCount: 0, causalityShiftsCount: 0, droppedClaimsCount: 0, addedClaimsCount: 0 },
        grammar: { passed: false, errorsCount: 1, issues: [] },
        coherence: { passed: true, score: 0.9, transitionQuality: "strong", issues: [] },
        semantic: { passed: true, similarityScore: 0.7, driftDetected: false, contradictionDetected: false },
        delta: { classification: "REJECT", wordCountDelta: 5, percentageChanged: 30 },
        timestamp: new Date().toISOString(),
      };

      const plan = buildRetryPlan(report, {
        attemptNumber: 1,
        maxAttempts: 3,
        mode: "balanced",
      });

      expect(plan.isRetryable).toBe(true);
      expect(plan.attemptNumber).toBe(2);
      expect(plan.failureCategories).toContain("token_integrity");
      expect(plan.failureCategories).toContain("agreement");
      expect(plan.failureCategories).toContain("epistemic_claims");
      expect(plan.retryInstructions).toHaveLength(3);
      expect(plan.affectedTokens).toContain("⟦PROTECTED_CITATION_APA_123⟧");
    });
  });

  describe("Bounded Retry Budget & Oscillation Detection", () => {
    it("halts retries when maxAttempts is reached", () => {
      const mockReport: any = { findings: [{ decision: "REJECT", severity: "CRITICAL", code: "CLAIM_EPISTEMIC_SHIFT" }] };
      const plan = buildRetryPlan(mockReport, {
        attemptNumber: 3,
        maxAttempts: 3,
        mode: "balanced",
      });

      expect(plan.isRetryable).toBe(false);
      expect(plan.reason).toContain("Maximum retry budget exhausted");
    });

    it("detects failure oscillation (A -> B -> A) and prevents infinite loops", () => {
      const history = [
        { attemptNumber: 1, findingCodes: ["CLAIM_EPISTEMIC_SHIFT"], finalDecision: "REJECT", timestamp: "t1" },
        { attemptNumber: 2, findingCodes: ["GRAMMAR_AGREEMENT_ERROR"], finalDecision: "REJECT", timestamp: "t2" },
        { attemptNumber: 3, findingCodes: ["CLAIM_EPISTEMIC_SHIFT"], finalDecision: "REJECT", timestamp: "t3" },
      ];

      expect(detectFailureOscillation(history)).toBe(true);

      const mockReport: any = { findings: [{ decision: "REJECT", severity: "CRITICAL", code: "CLAIM_EPISTEMIC_SHIFT" }] };
      const plan = buildRetryPlan(mockReport, {
        attemptNumber: 3,
        maxAttempts: 5,
        mode: "balanced",
        history,
      });

      expect(plan.isRetryable).toBe(false);
      expect(plan.reason).toContain("oscillation");
    });
  });
});
