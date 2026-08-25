/**
 * Delta & Decision Aggregation Auditor.
 *
 * Combines findings from Integrity, Claims, Grammar, Coherence, and Semantic
 * auditors, enforcing strict decision precedence (REJECT > WARNING > SAFE).
 */

import {
  HumanizerDocument,
  HumanizerAuditFinding,
  HumanizerAuditReport,
  AuditDecision,
  AuditSeverity,
  CandidateState,
} from "../types";
import { IntegrityAuditResult } from "./integrityAuditor";
import { ClaimAuditResult } from "./claimAuditor";
import { GrammarAuditResult } from "./grammarAuditor";
import { CoherenceAuditResult } from "./coherenceAuditor";
import { SemanticAuditResult } from "./semanticAuditor";
import { renderHumanizerDocument } from "../document/humanizerDocument";

export interface AggregateAuditorInputs {
  originalDoc: HumanizerDocument;
  candidateDoc: HumanizerDocument;
  integrityResult: IntegrityAuditResult;
  claimResult: ClaimAuditResult;
  grammarResult: GrammarAuditResult;
  coherenceResult: CoherenceAuditResult;
  semanticResult: SemanticAuditResult;
  shortCircuited?: boolean;
}

const SEVERITY_RANK: Record<AuditSeverity, number> = {
  CRITICAL: 4,
  ERROR: 3,
  WARNING: 2,
  INFO: 1,
};

const DECISION_RANK: Record<AuditDecision, number> = {
  REJECT: 3,
  WARNING: 2,
  SAFE: 1,
};

/**
 * Aggregates all auditor outputs into a canonical HumanizerAuditReport.
 */
export function aggregateAuditResults(inputs: AggregateAuditorInputs): HumanizerAuditReport {
  const {
    originalDoc,
    candidateDoc,
    integrityResult,
    claimResult,
    grammarResult,
    coherenceResult,
    semanticResult,
    shortCircuited = false,
  } = inputs;

  const allFindings: HumanizerAuditFinding[] = [
    ...integrityResult.findings,
    ...claimResult.findings,
    ...grammarResult.findings,
    ...coherenceResult.findings,
    ...semanticResult.findings,
  ];

  // Determine highest severity
  let highestSeverity: AuditSeverity = "INFO";
  let maxSevRank = 1;
  for (const f of allFindings) {
    const rank = SEVERITY_RANK[f.severity] || 1;
    if (rank > maxSevRank) {
      maxSevRank = rank;
      highestSeverity = f.severity;
    }
  }

  // Determine final decision using precedence (REJECT > WARNING > SAFE)
  let finalDecision: AuditDecision = "SAFE";
  let maxDecRank = 1;
  for (const f of allFindings) {
    const rank = DECISION_RANK[f.decision] || 1;
    if (rank > maxDecRank) {
      maxDecRank = rank;
      finalDecision = f.decision;
    }
  }

  // Calculate text change metrics
  const origText = renderHumanizerDocument(originalDoc, "source");
  const candText = renderHumanizerDocument(candidateDoc, "processed");

  const origWords = origText.split(/\s+/).filter(Boolean);
  const candWords = candText.split(/\s+/).filter(Boolean);
  const wordCountDelta = candWords.length - origWords.length;

  let differingWords = 0;
  const maxLen = Math.max(origWords.length, candWords.length, 1);
  for (let i = 0; i < maxLen; i++) {
    if (origWords[i] !== candWords[i]) differingWords++;
  }
  const percentageChanged = Math.round((differingWords / maxLen) * 100);

  const candidateState: CandidateState =
    finalDecision === "REJECT" ? "REWRITE_REJECTED" : "REWRITE_VALIDATED";

  return {
    finalDecision,
    overallSeverity: highestSeverity,
    candidateState,
    shortCircuited,
    findings: allFindings,
    integrity: {
      passed: integrityResult.passed,
      missingTokens: integrityResult.missingTokens,
      duplicatedTokens: integrityResult.duplicatedTokens,
      unexpectedTokens: integrityResult.unexpectedTokens,
      malformedTokens: integrityResult.malformedTokens,
      exactRestoration: integrityResult.exactRestoration,
    },
    claims: {
      passed: claimResult.passed,
      preservationRate: claimResult.preservationRate,
      epistemicShiftsCount: claimResult.epistemicShiftsCount,
      negationReversalsCount: claimResult.negationReversalsCount,
      causalityShiftsCount: claimResult.causalityShiftsCount,
      droppedClaimsCount: claimResult.droppedClaimsCount,
      addedClaimsCount: claimResult.addedClaimsCount,
    },
    grammar: {
      passed: grammarResult.passed,
      errorsCount: grammarResult.errorsCount,
      issues: grammarResult.issues,
    },
    coherence: {
      passed: coherenceResult.passed,
      score: coherenceResult.score,
      transitionQuality: coherenceResult.transitionQuality,
      issues: coherenceResult.issues,
    },
    semantic: {
      passed: semanticResult.passed,
      similarityScore: semanticResult.similarityScore,
      driftDetected: semanticResult.driftDetected,
      contradictionDetected: semanticResult.contradictionDetected,
    },
    delta: {
      classification: finalDecision,
      wordCountDelta,
      percentageChanged,
    },
    timestamp: new Date().toISOString(),
  };
}
