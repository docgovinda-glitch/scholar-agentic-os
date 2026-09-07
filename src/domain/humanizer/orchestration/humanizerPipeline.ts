/**
 * Production-Grade Humanizer Pipeline Orchestrator.
 *
 * Coordinates Parse → Shield → Extract Claims → Rewrite → Audit → Adaptive Retry → Restore.
 * Enforces bounded retries, original immutability, and fail-safe fallback.
 */

import {
  HumanizerDocument,
  CandidateState,
  HumanizerAuditReport,
  HumanizerStyleProfile,
} from "../types";
import {
  createHumanizerDocument,
  renderHumanizerDocument,
  addLockedTerm,
} from "../document/humanizerDocument";
import {
  shieldDocument,
  restoreDocument,
} from "../protection/protectedElementExtractor";
import { extractClaimsFromDocument } from "../claims/claimExtractor";
import { rewriteDocument, LLMCompleter } from "../rewrite/rewriteEngine";
import { RewriteMode, DisciplineProfile, HedgingLevel } from "../rewrite/promptBuilder";
import { auditHumanizerCandidate } from "../audit/auditOrchestrator";
import {
  buildRetryPlan,
  RetryHistoryEntry,
  RetryPlan,
} from "./adaptiveRetry";
import { getPrimaryFailureReason } from "../audit/deltaAuditor";

export interface HumanizerPipelineOptions {
  mode?: RewriteMode;
  genre?: string;
  discipline?: DisciplineProfile;
  hedgingLevel?: HedgingLevel;
  completer: LLMCompleter;
  maxRetries?: number;
  styleProfile?: HumanizerStyleProfile;
  lockedTerms?: string[];
  allowShortCircuitOnIntegrityFailure?: boolean;
  warningPolicy?: "accept" | "retry" | "reject";
  noRewriteCheck?: boolean;
}

export interface HumanizerPipelineResult {
  success: boolean;
  finalText: string;
  candidateText?: string;
  candidateDocument?: HumanizerDocument;
  candidateState: CandidateState;
  document: HumanizerDocument;
  attemptsCount: number;
  fallbackUsed: boolean;
  fallbackReason?: string;
  improvements: string[];
  auditReport?: HumanizerAuditReport;
  retryHistory: RetryHistoryEntry[];
}

/**
 * Executes the complete AI Text Humanizer pipeline with adaptive retry and fail-safe fallback.
 */
export async function runHumanizerPipeline(
  rawInput: string | HumanizerDocument,
  options: HumanizerPipelineOptions
): Promise<HumanizerPipelineResult> {
  const mode = options.mode || "balanced";
  const genre = options.genre || "Academic Journal";
  const maxRetries = options.maxRetries ?? 2;
  const warningPolicy = options.warningPolicy || "accept";
  const noRewriteCheck = options.noRewriteCheck ?? true;
  const allowShortCircuit = options.allowShortCircuitOnIntegrityFailure ?? true;

  // 1. Step 1: Parse into HumanizerDocument
  let initialDoc: HumanizerDocument =
    typeof rawInput === "string" ? createHumanizerDocument(rawInput) : rawInput;

  if (options.lockedTerms && options.lockedTerms.length > 0) {
    for (const term of options.lockedTerms) {
      initialDoc = addLockedTerm(initialDoc, term);
    }
  }

  if (options.styleProfile) {
    initialDoc = { ...initialDoc, styleProfile: options.styleProfile };
  }

  const originalSourceText = renderHumanizerDocument(initialDoc, "source");

  // 2. Step 2: Protection & Shielding
  const { shieldedDoc, registry } = shieldDocument(initialDoc);

  // 3. Step 3: Extract Claims from Original Document
  const immutableOriginalDoc = extractClaimsFromDocument(shieldedDoc);

  // 4. Step 4: No-Rewrite Heuristic Check
  if (noRewriteCheck && (!originalSourceText.trim() || initialDoc.blocks.every((b) => b.type === "code_block"))) {
    return {
      success: true,
      finalText: originalSourceText,
      candidateState: "NO_REWRITE_NEEDED",
      document: initialDoc,
      attemptsCount: 0,
      fallbackUsed: false,
      improvements: [],
      retryHistory: [],
    };
  }

  const retryHistory: RetryHistoryEntry[] = [];
  let attemptNumber = 0;
  let currentRetryPlan: RetryPlan | undefined = undefined;
  let lastReport: HumanizerAuditReport | undefined = undefined;
  let lastCandidateDoc: HumanizerDocument | undefined = undefined;
  let lastCandidateText: string | undefined = undefined;
  let lastImprovements: string[] = [];

  // 5. Step 5: Bounded Iterative Rewrite & Audit Loop
  // (Every retry ALWAYS begins from immutableOriginalDoc, never from a rejected candidate)
  while (attemptNumber <= maxRetries) {
    attemptNumber++;

    let rewriteResult;
    try {
      rewriteResult = await rewriteDocument(immutableOriginalDoc, {
        mode,
        genre,
        discipline: options.discipline,
        hedgingLevel: options.hedgingLevel,
        completer: options.completer,
        registry,
        retryInstructions: currentRetryPlan?.retryInstructions,
      });
    } catch (err: any) {
      // Provider failure / timeout / rate limit: do not burn retry budget on dead provider
      retryHistory.push({
        attemptNumber,
        findingCodes: ["PROVIDER_EXECUTION_FAILURE"],
        finalDecision: "REJECT",
        timestamp: new Date().toISOString(),
      });

      break;
    }

    // Audit the generated candidate
    const { report, auditedDoc } = auditHumanizerCandidate(
      immutableOriginalDoc,
      rewriteResult.candidateDoc,
      registry,
      { allowShortCircuitOnIntegrityFailure: allowShortCircuit }
    );

    lastReport = report;

    retryHistory.push({
      attemptNumber,
      findingCodes: report.findings.map((f) => f.code),
      finalDecision: report.finalDecision,
      timestamp: new Date().toISOString(),
    });

    const restoredCandidateDoc = restoreDocument(auditedDoc, registry);
    const restoredCandidateText = renderHumanizerDocument(restoredCandidateDoc, "processed");
    lastCandidateDoc = restoredCandidateDoc;
    lastCandidateText = restoredCandidateText;
    lastImprovements = rewriteResult.improvements || [];

    const isAccepted =
      report.finalDecision === "SAFE" ||
      (report.finalDecision === "WARNING" && warningPolicy === "accept");

    const isIdentical =
      originalSourceText.trim().length > 0 &&
      restoredCandidateText.trim() === originalSourceText.trim();

    if (isAccepted && !isIdentical) {
      // Step 6: Final Deterministic Restoration
      // Verify that no un-restored protected tokens remain
      if (!restoredCandidateText.includes("⟦PROTECTED_")) {
        return {
          success: true,
          finalText: restoredCandidateText,
          candidateText: restoredCandidateText,
          candidateDocument: restoredCandidateDoc,
          candidateState: "REWRITE_VALIDATED",
          document: restoredCandidateDoc,
          attemptsCount: attemptNumber,
          fallbackUsed: false,
          improvements: rewriteResult.improvements,
          auditReport: report,
          retryHistory,
        };
      }
    }

    // If candidate was REJECTED (or WARNING under retry policy), plan targeted retry
    if (attemptNumber <= maxRetries) {
      currentRetryPlan = buildRetryPlan(report, {
        attemptNumber,
        maxAttempts: maxRetries + 1,
        mode,
        history: retryHistory,
      });

      if (!currentRetryPlan.isRetryable) {
        break; // Unrecoverable oscillation or non-retryable error
      }
    }
  }

  // 6. Step 7: Fail-Safe Fallback (NEVER return a rejected candidate)
  return {
    success: false,
    finalText: originalSourceText,
    candidateText: lastCandidateText,
    candidateDocument: lastCandidateDoc,
    candidateState: "REWRITE_REJECTED",
    document: initialDoc,
    attemptsCount: attemptNumber,
    fallbackUsed: true,
    fallbackReason: getPrimaryFailureReason(
      lastReport,
      "A safe rewrite could not be produced within the retry budget; original text has been preserved."
    ),
    improvements: lastImprovements,
    auditReport: lastReport,
    retryHistory,
  };
}
