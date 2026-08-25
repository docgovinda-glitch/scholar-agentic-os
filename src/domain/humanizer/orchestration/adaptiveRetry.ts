/**
 * Failure-Specific Adaptive Retry Planner & Loop Detector.
 *
 * Translates structured HumanizerAuditReport findings into targeted,
 * actionable retry instructions for the prompt builder, tracking
 * retry budgets, non-retryable failures, and oscillation patterns.
 */

import {
  HumanizerAuditReport,
  HumanizerAuditFinding,
} from "../types";
import { RewriteMode } from "../rewrite/promptBuilder";

export interface RetryHistoryEntry {
  attemptNumber: number;
  findingCodes: string[];
  finalDecision: string;
  timestamp: string;
}

export interface RetryPlan {
  attemptNumber: number;
  maxAttempts: number;
  failureCategories: string[];
  retryInstructions: string[];
  affectedFindingCodes: string[];
  affectedBlockIds: string[];
  affectedTokens: string[];
  mode: RewriteMode;
  reason: string;
  isRetryable: boolean;
}

/** Maps a specific finding code to an actionable, targeted retry instruction */
export function mapFindingCodeToInstruction(finding: HumanizerAuditFinding): string {
  switch (finding.code) {
    case "INTEGRITY_TOKEN_MISSING":
    case "INTEGRITY_TOKEN_DUPLICATED":
    case "INTEGRITY_TOKEN_UNEXPECTED":
    case "INTEGRITY_TOKEN_MALFORMED":
    case "INTEGRITY_RESTORATION_INCOMPLETE":
      return "CRITICAL PROTECTED TOKEN INTEGRITY: You omitted or corrupted mandatory protected placeholders. Every placeholder (e.g. ⟦PROTECTED_...⟧) MUST appear in your rewrite with exact spelling and brackets without alteration, duplication, or omission.";

    case "GRAMMAR_AGREEMENT_ERROR":
      return "CRITICAL GRAMMAR: Ensure strict subject-verb and determiner-noun agreement (e.g., avoid 'This vitamins', ensure singular/plural consistency).";

    case "GRAMMAR_RUN_ON_BOUNDARY":
      return "CRITICAL SENTENCE BOUNDARY: Strictly punctuate sentence boundaries and prevent accidental run-on sentence concatenation (e.g., where lowercase words are followed directly by capitalized sentence starters without punctuation).";

    case "GRAMMAR_FRAGMENT_ERROR":
      return "CRITICAL STRUCTURAL SYNTAX: Avoid broken sentence fragments starting with conjunctions without a complete subject and predicate.";

    case "GRAMMAR_PUNCTUATION_ERROR":
    case "GRAMMAR_REPEATED_WORD":
      return "CRITICAL MECHANICAL INTEGRITY: Eliminate duplicate words and malformed punctuation.";

    case "CLAIM_EPISTEMIC_SHIFT":
      return "CRITICAL EPISTEMIC FIDELITY: Maintain the author's original epistemic stance. Do NOT strengthen hedged claims ('suggests', 'may', 'indicates', 'could') into asserted certainties ('proves', 'causes', 'confirms').";

    case "CLAIM_CAUSALITY_SHIFT":
      return "CRITICAL CAUSALITY FIDELITY: Preserve correlational vs direct causal relationships. Do NOT convert an associational finding ('is associated with', 'correlated with') into direct causation ('causes', 'leads to').";

    case "CLAIM_NEGATION_REVERSAL":
      return "CRITICAL NEGATION INVARIANCE: Preserve the exact logical polarity of the source proposition (e.g. 'does not increase' must NOT become 'increases').";

    case "CLAIM_QUANTITATIVE_SHIFT":
      return "CRITICAL QUANTITATIVE INTEGRITY: Retain all numbers, percentages, sample sizes, and empirical metrics in exact alignment with their propositions.";

    case "CLAIM_DROPPED":
      return "CRITICAL CLAIM PRESERVATION: Do not omit or drop any factual propositions present in the source text.";

    case "CLAIM_UNGROUNDED_ADDITION":
      return "CRITICAL GROUNDING: Do not introduce unsupported empirical assertions or findings not present in the source text.";

    case "SEMANTIC_CONTENT_DRIFT":
    case "SEMANTIC_SEVERE_TRUNCATION":
      return "CRITICAL SEMANTIC ANCHORING: Ground your rewrite strictly in the concepts, scope, and technical vocabulary of the source paragraph.";

    case "COHERENCE_DANGLING_TRANSITION":
      return "CRITICAL COHERENCE: Do not leave dangling transition markers (e.g. 'However,') at the end of paragraphs.";

    default:
      return `CRITICAL CORRECTION: Address audit finding: ${finding.message}`;
  }
}

/** Detects if the retry history shows failure oscillation or unrecoverable looping */
export function detectFailureOscillation(history: RetryHistoryEntry[]): boolean {
  if (history.length < 3) return false;

  const last3 = history.slice(-3);
  const codes0 = last3[0].findingCodes.sort().join(",");
  const codes1 = last3[1].findingCodes.sort().join(",");
  const codes2 = last3[2].findingCodes.sort().join(",");

  // Pattern 1: Exact same failure 3 times in a row
  if (codes0 === codes1 && codes1 === codes2 && codes0.length > 0) {
    return true;
  }

  // Pattern 2: Oscillation between state A and state B (A -> B -> A)
  if (codes0 === codes2 && codes0 !== codes1 && codes0.length > 0) {
    return true;
  }

  return false;
}

/**
 * Builds a structured, failure-specific RetryPlan from an audit report.
 */
export function buildRetryPlan(
  report: HumanizerAuditReport,
  options: {
    attemptNumber: number;
    maxAttempts: number;
    mode: RewriteMode;
    history?: RetryHistoryEntry[];
  }
): RetryPlan {
  const { attemptNumber, maxAttempts, mode, history = [] } = options;

  // If already at or beyond max attempts, mark not retryable
  if (attemptNumber >= maxAttempts) {
    return {
      attemptNumber,
      maxAttempts,
      failureCategories: [],
      retryInstructions: [],
      affectedFindingCodes: [],
      affectedBlockIds: [],
      affectedTokens: [],
      mode,
      reason: `Maximum retry budget exhausted (${attemptNumber}/${maxAttempts} attempts).`,
      isRetryable: false,
    };
  }

  // Check for failure oscillation
  if (detectFailureOscillation(history)) {
    return {
      attemptNumber,
      maxAttempts,
      failureCategories: [],
      retryInstructions: [],
      affectedFindingCodes: [],
      affectedBlockIds: [],
      affectedTokens: [],
      mode,
      reason: "Detected failure oscillation or persistent unrecoverable error pattern.",
      isRetryable: false,
    };
  }

  const failingFindings = report.findings.filter(
    (f) => f.decision === "REJECT" || (f.decision === "WARNING" && f.severity === "ERROR")
  );

  if (failingFindings.length === 0) {
    return {
      attemptNumber,
      maxAttempts,
      failureCategories: [],
      retryInstructions: [],
      affectedFindingCodes: [],
      affectedBlockIds: [],
      affectedTokens: [],
      mode,
      reason: "No actionable reject findings detected.",
      isRetryable: false,
    };
  }

  const failureCategories = Array.from(new Set(failingFindings.map((f) => f.category)));
  const affectedFindingCodes = Array.from(new Set(failingFindings.map((f) => f.code)));
  const affectedBlockIds = Array.from(
    new Set(failingFindings.map((f) => f.blockId).filter((b): b is string => Boolean(b)))
  );
  const affectedTokens = Array.from(
    new Set(failingFindings.map((f) => f.token).filter((t): t is string => Boolean(t)))
  );

  const rawInstructions = failingFindings.map((f) => mapFindingCodeToInstruction(f));
  const retryInstructions = Array.from(new Set(rawInstructions));

  return {
    attemptNumber: attemptNumber + 1,
    maxAttempts,
    failureCategories,
    retryInstructions,
    affectedFindingCodes,
    affectedBlockIds,
    affectedTokens,
    mode,
    reason: `Targeted retry for audit failure(s): ${affectedFindingCodes.join(", ")}.`,
    isRetryable: true,
  };
}
