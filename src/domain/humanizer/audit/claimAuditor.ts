/**
 * Claim & Epistemic Stance Auditor.
 *
 * Integrates Phase 3 claim extraction and propositional comparison
 * to detect unauthorized certainty escalation, causal distortion,
 * negation reversals, and dropped empirical claims.
 */

import {
  HumanizerDocument,
  HumanizerAuditFinding,
  AuditDecision,
  AuditSeverity,
} from "../types";
import { extractClaimsFromDocument } from "../claims/claimExtractor";
import { compareClaims } from "../claims/claimComparison";

export interface ClaimAuditResult {
  passed: boolean;
  decision: AuditDecision;
  preservationRate: number;
  epistemicShiftsCount: number;
  negationReversalsCount: number;
  causalityShiftsCount: number;
  droppedClaimsCount: number;
  addedClaimsCount: number;
  findings: HumanizerAuditFinding[];
}

/**
 * Audits the candidate document's propositions against the original document's claims.
 */
export function auditClaims(
  originalDoc: HumanizerDocument,
  candidateDoc: HumanizerDocument
): ClaimAuditResult {
  // Ensure both original and candidate have extracted claims
  const originalClaims =
    originalDoc.claims && originalDoc.claims.length > 0
      ? originalDoc.claims
      : extractClaimsFromDocument(originalDoc).claims;

  const candidateDocWithClaims = extractClaimsFromDocument(candidateDoc);
  const candidateClaims = candidateDocWithClaims.claims || [];

  const comparisonReport = compareClaims(originalClaims, candidateClaims);
  const findings: HumanizerAuditFinding[] = [];

  let epistemicShiftsCount = 0;
  let negationReversalsCount = 0;
  let causalityShiftsCount = 0;
  let droppedClaimsCount = 0;
  let addedClaimsCount = 0;

  for (const item of comparisonReport.findings) {
    let severity: AuditSeverity = "INFO";
    let decision: AuditDecision = "SAFE";
    let code = "CLAIM_PRESERVED";

    switch (item.status) {
      case "EPISTEMIC_SHIFT":
        severity = item.severity === "error" ? "CRITICAL" : "WARNING";
        decision = item.severity === "error" ? "REJECT" : "WARNING";
        code = "CLAIM_EPISTEMIC_SHIFT";
        epistemicShiftsCount++;
        break;

      case "NEGATION_REVERSAL":
        severity = "CRITICAL";
        decision = "REJECT";
        code = "CLAIM_NEGATION_REVERSAL";
        negationReversalsCount++;
        break;

      case "CAUSALITY_SHIFT":
        severity = item.severity === "error" ? "CRITICAL" : "WARNING";
        decision = item.severity === "error" ? "REJECT" : "WARNING";
        code = "CLAIM_CAUSALITY_SHIFT";
        causalityShiftsCount++;
        break;

      case "QUANTITATIVE_SHIFT":
        severity = "CRITICAL";
        decision = "REJECT";
        code = "CLAIM_QUANTITATIVE_SHIFT";
        break;

      case "DROPPED":
        severity = "ERROR";
        decision = "REJECT";
        code = "CLAIM_DROPPED";
        droppedClaimsCount++;
        break;

      case "ADDED":
        severity = "WARNING";
        decision = "WARNING";
        code = "CLAIM_UNGROUNDED_ADDITION";
        addedClaimsCount++;
        break;

      case "PRESERVED":
      default:
        severity = "INFO";
        decision = "SAFE";
        code = "CLAIM_PRESERVED";
        break;
    }

    findings.push({
      auditor: "claim_auditor",
      category: "epistemic_claims",
      severity,
      decision,
      code,
      message: item.reason,
      claimId: item.claimId,
      originalValue: item.originalProposition,
      candidateValue: item.candidateProposition,
      metadata: {
        originalModality: item.originalModality,
        candidateModality: item.candidateModality,
        originalCertainty: item.originalCertainty,
        candidateCertainty: item.candidateCertainty,
      },
    });
  }

  const hasCriticalReject = findings.some((f) => f.decision === "REJECT");
  const hasWarning = findings.some((f) => f.decision === "WARNING");

  const overallDecision: AuditDecision = hasCriticalReject
    ? "REJECT"
    : hasWarning
    ? "WARNING"
    : "SAFE";

  return {
    passed: !hasCriticalReject,
    decision: overallDecision,
    preservationRate: comparisonReport.preservationRate,
    epistemicShiftsCount,
    negationReversalsCount,
    causalityShiftsCount,
    droppedClaimsCount,
    addedClaimsCount,
    findings,
  };
}
