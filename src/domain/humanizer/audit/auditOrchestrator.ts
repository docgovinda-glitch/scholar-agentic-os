/**
 * Audit Pipeline Orchestrator.
 *
 * Coordinates execution across Integrity, Claims, Grammar, Coherence,
 * and Semantic auditors with support for catastrophic short-circuiting.
 */

import {
  HumanizerDocument,
  HumanizerAuditReport,
} from "../types";
import { TokenRegistry } from "../protection/tokenRegistry";
import { auditIntegrity, IntegrityAuditResult } from "./integrityAuditor";
import { auditClaims, ClaimAuditResult } from "./claimAuditor";
import { auditGrammar, GrammarAuditResult } from "./grammarAuditor";
import { auditCoherence, CoherenceAuditResult } from "./coherenceAuditor";
import { auditSemantic, SemanticAuditResult } from "./semanticAuditor";
import { aggregateAuditResults } from "./deltaAuditor";

export interface AuditOrchestratorOptions {
  allowShortCircuitOnIntegrityFailure?: boolean;
}

/**
 * Executes the complete multi-auditor suite on a candidate HumanizerDocument.
 */
export function auditHumanizerCandidate(
  originalDoc: HumanizerDocument,
  candidateDoc: HumanizerDocument,
  registry: TokenRegistry,
  options?: AuditOrchestratorOptions
): { report: HumanizerAuditReport; auditedDoc: HumanizerDocument } {
  const allowShortCircuit = options?.allowShortCircuitOnIntegrityFailure ?? true;

  // 1. Stage 1: Deterministic Integrity Audit
  const integrityResult: IntegrityAuditResult = auditIntegrity(candidateDoc, registry);

  // Short-circuit if catastrophic integrity failure occurred
  if (!integrityResult.passed && allowShortCircuit) {
    const emptyClaimResult: ClaimAuditResult = {
      passed: false,
      decision: "REJECT",
      preservationRate: 0,
      epistemicShiftsCount: 0,
      negationReversalsCount: 0,
      causalityShiftsCount: 0,
      droppedClaimsCount: 0,
      addedClaimsCount: 0,
      findings: [],
    };
    const emptyGrammarResult: GrammarAuditResult = {
      passed: true,
      decision: "SAFE",
      errorsCount: 0,
      issues: [],
      findings: [],
    };
    const emptyCoherenceResult: CoherenceAuditResult = {
      passed: true,
      decision: "SAFE",
      score: 1.0,
      transitionQuality: "strong",
      issues: [],
      findings: [],
    };
    const emptySemanticResult: SemanticAuditResult = {
      passed: true,
      decision: "SAFE",
      similarityScore: 1.0,
      driftDetected: false,
      contradictionDetected: false,
      findings: [],
    };

    const report = aggregateAuditResults({
      originalDoc,
      candidateDoc,
      integrityResult,
      claimResult: emptyClaimResult,
      grammarResult: emptyGrammarResult,
      coherenceResult: emptyCoherenceResult,
      semanticResult: emptySemanticResult,
      registry,
      shortCircuited: true,
    });

    const auditedDoc: HumanizerDocument = {
      ...candidateDoc,
      auditState: {
        overallStatus: "failed",
        auditReport: report,
        integrity: {
          passed: false,
          missingTokens: integrityResult.missingTokens,
          duplicatedTokens: integrityResult.duplicatedTokens,
          corruptedTokens: integrityResult.malformedTokens,
          protectedCount: registry.count(),
          restoredCount: registry.count() - integrityResult.missingTokens.length,
        },
        semantic: { status: "pending", driftDetected: false, findings: [] },
        claims: { status: "pending", droppedClaims: [], alteredCertaintyClaims: [], findings: [] },
        grammar: { status: "pending", detectedErrors: [], findings: [] },
        coherence: { status: "pending", transitionQuality: "strong", findings: [] },
        delta: {
          classification: "REJECT",
          wordCountDelta: report.delta.wordCountDelta,
          sentencesModified: candidateDoc.blocks.length,
          paragraphsModified: candidateDoc.blocks.length,
        },
      },
    };

    return { report, auditedDoc };
  }

  // 2. Stage 2: Propositional Claim & Epistemic Audit
  const claimResult: ClaimAuditResult = auditClaims(originalDoc, candidateDoc);

  // 3. Stage 3: Grammar & Boundary Audit
  const grammarResult: GrammarAuditResult = auditGrammar(candidateDoc);

  // 4. Stage 4: Paragraph Coherence Audit
  const coherenceResult: CoherenceAuditResult = auditCoherence(candidateDoc);

  // 5. Stage 5: Semantic Divergence Audit
  const semanticResult: SemanticAuditResult = auditSemantic(originalDoc, candidateDoc);

  // 6. Stage 6: Final Aggregation & Decision Precedence
  const report = aggregateAuditResults({
    originalDoc,
    candidateDoc,
    integrityResult,
    claimResult,
    grammarResult,
    coherenceResult,
    semanticResult,
    registry,
    shortCircuited: false,
  });

  const overallStatus = report.finalDecision === "REJECT" ? "failed" : report.finalDecision === "WARNING" ? "warning" : "passed";

  const auditedDoc: HumanizerDocument = {
    ...candidateDoc,
    auditState: {
      overallStatus,
      auditReport: report,
      integrity: {
        passed: integrityResult.passed,
        missingTokens: integrityResult.missingTokens,
        duplicatedTokens: integrityResult.duplicatedTokens,
        corruptedTokens: integrityResult.malformedTokens,
        protectedCount: registry.count(),
        restoredCount: registry.count(),
      },
      semantic: {
        status: semanticResult.passed ? "passed" : "failed",
        similarityScore: semanticResult.similarityScore,
        driftDetected: semanticResult.driftDetected,
        findings: [],
      },
      claims: {
        status: claimResult.passed ? "passed" : "failed",
        droppedClaims: [],
        alteredCertaintyClaims: [],
        findings: [],
      },
      grammar: {
        status: grammarResult.passed ? "passed" : "failed",
        detectedErrors: grammarResult.issues,
        findings: [],
      },
      coherence: {
        status: coherenceResult.passed ? "passed" : "failed",
        transitionQuality: coherenceResult.transitionQuality,
        findings: [],
      },
      delta: {
        classification: report.finalDecision,
        wordCountDelta: report.delta.wordCountDelta,
        sentencesModified: candidateDoc.blocks.length,
        paragraphsModified: candidateDoc.blocks.length,
      },
    },
  };

  return { report, auditedDoc };
}
