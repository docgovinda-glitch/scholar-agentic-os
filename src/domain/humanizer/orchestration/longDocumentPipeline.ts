/**
 * Production Long-Document Humanization Orchestrator.
 *
 * Coordinates hierarchical chunking, bounded concurrency, cancellation,
 * resumable chunk execution, isolated failure fallback, and final document validation.
 */

import {
  HumanizerDocument,
  DocumentChunk,
  LongDocumentPipelineProgress,
  LongDocumentPipelineResult,
  ChunkingPolicy,
  HumanizerStyleProfile,
} from "../types";
import {
  createHumanizerDocument,
  addLockedTerm,
} from "../document/humanizerDocument";
import {
  shieldDocument,
  restoreDocument,
} from "../protection/protectedElementExtractor";
import { TokenRegistry } from "../protection/tokenRegistry";
import { extractClaimsFromDocument } from "../claims/claimExtractor";
import { rewriteDocument, LLMCompleter } from "../rewrite/rewriteEngine";
import { RewriteMode, DisciplineProfile, HedgingLevel } from "../rewrite/promptBuilder";
import { createDocumentChunks } from "../chunking/longDocumentChunker";
import { auditHumanizerCandidate } from "../audit/auditOrchestrator";
import { buildRetryPlan } from "./adaptiveRetry";
import { generateReviewUnits } from "../review/sentenceMapper";
import { validateFinalDocument } from "../review/documentReviewManager";
import { getPrimaryFailureReason } from "../audit/deltaAuditor";

export interface LongDocumentPipelineOptions {
  mode?: RewriteMode;
  genre?: string;
  discipline?: DisciplineProfile;
  hedgingLevel?: HedgingLevel;
  completer: LLMCompleter;
  maxRetries?: number;
  maxConcurrentChunks?: number;
  chunkingPolicy?: ChunkingPolicy;
  lockedTerms?: string[];
  styleProfile?: HumanizerStyleProfile;
  abortSignal?: AbortSignal;
  onProgress?: (progress: LongDocumentPipelineProgress) => void;
  existingChunks?: DocumentChunk[]; // for resuming
}

/**
 * Runs the long-document pipeline with hierarchical chunking and isolated failure safety.
 */
export async function runLongDocumentPipeline(
  input: string | HumanizerDocument,
  options: LongDocumentPipelineOptions
): Promise<LongDocumentPipelineResult> {
  const mode = options.mode || "balanced";
  const genre = options.genre || "Academic Journal";
  const maxRetries = options.maxRetries ?? 2;
  const abortSignal = options.abortSignal;

  // 1. Parse into canonical document
  let doc: HumanizerDocument =
    typeof input === "string" ? createHumanizerDocument(input) : input;

  if (options.lockedTerms && options.lockedTerms.length > 0) {
    for (const term of options.lockedTerms) {
      doc = addLockedTerm(doc, term);
    }
  }

  if (options.styleProfile) {
    doc = { ...doc, styleProfile: options.styleProfile };
  }

  // 2. Shield & Extract Claims Document-wide
  const { shieldedDoc, registry } = shieldDocument(doc);
  const immutableOriginalDoc = extractClaimsFromDocument(shieldedDoc);

  // 3. Create or reuse Chunks
  const chunks: DocumentChunk[] =
    options.existingChunks && options.existingChunks.length > 0
      ? options.existingChunks
      : createDocumentChunks(immutableOriginalDoc, options.chunkingPolicy);

  let completedChunks = chunks.filter((c) => c.status === "VALIDATED").length;
  let failedChunks = chunks.filter((c) => c.status === "FAILED").length;
  let reviewRequiredChunks = chunks.filter((c) => c.status === "REVIEW_REQUIRED").length;

  let workingDoc: HumanizerDocument = {
    ...immutableOriginalDoc,
    blocks: [...immutableOriginalDoc.blocks],
  };

  const updateProgress = (activeChunkIdx?: number, isCancelled = false) => {
    const activeChunk = activeChunkIdx !== undefined ? chunks[activeChunkIdx] : undefined;
    const percent = chunks.length > 0 ? Math.round((completedChunks / chunks.length) * 100) : 100;

    const progress: LongDocumentPipelineProgress = {
      totalChunks: chunks.length,
      completedChunks,
      failedChunks,
      reviewRequiredChunks,
      activeChunkIndex: activeChunkIdx,
      activeChunkId: activeChunk?.chunkId,
      activeSectionTitle: activeChunk?.title,
      percentComplete: percent,
      isCancelled,
    };

    if (options.onProgress) {
      options.onProgress(progress);
    }
  };

  // 4. Sequential / Bounded Execution Loop
  for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
    const chunk = chunks[cIdx];

    // Check cancellation
    if (abortSignal?.aborted) {
      chunk.status = "CANCELLED";
      updateProgress(cIdx, true);
      break;
    }

    // Skip already validated chunks (resumable)
    if (chunk.status === "VALIDATED") {
      continue;
    }

    chunk.status = "PROCESSING";
    updateProgress(cIdx);

    // Filter target blocks for this chunk
    const targetBlocks = workingDoc.blocks.filter((b) => chunk.blockIds.includes(b.id));

    // Build scoped TokenRegistry containing only tokens present in this chunk's target blocks
    const chunkTokens = new Set<string>();
    for (const b of targetBlocks) {
      const matches = (b.processedText || b.sourceText).match(/⟦PROTECTED_[^⟧]+⟧/g) || [];
      for (const m of matches) chunkTokens.add(m);
    }
    const chunkElements = registry.getAll().filter((el) => chunkTokens.has(el.token));
    const chunkRegistry = new TokenRegistry(chunkElements);

    // Filter claims relevant to this chunk
    const chunkClaims = (immutableOriginalDoc.claims || []).filter(
      (c) => !c.sourceBlockId || chunk.blockIds.includes(c.sourceBlockId)
    );

    // Construct chunk sub-document for rewrite
    const chunkDoc: HumanizerDocument = {
      ...workingDoc,
      blocks: targetBlocks,
      protectedElements: chunkElements,
      claims: chunkClaims,
    };

    let attempt = 0;
    let chunkSuccess = false;
    let currentRetryPlan = undefined;
    let lastReport = undefined;

    while (attempt <= maxRetries && !chunkSuccess) {
      attempt++;

      if (abortSignal?.aborted) {
        chunk.status = "CANCELLED";
        break;
      }

      let rewriteResult;
      try {
        rewriteResult = await rewriteDocument(chunkDoc, {
          mode,
          genre,
          discipline: options.discipline,
          hedgingLevel: options.hedgingLevel,
          completer: options.completer,
          registry: chunkRegistry,
          retryInstructions: currentRetryPlan?.retryInstructions,
        });
      } catch (err: any) {
        // Provider execution failure: do not repeat dead request
        break;
      }

      // Audit candidate chunk with scoped registry
      const { report, auditedDoc } = auditHumanizerCandidate(
        chunkDoc,
        rewriteResult.candidateDoc,
        chunkRegistry,
        { allowShortCircuitOnIntegrityFailure: true }
      );

      lastReport = report;

      // Restore chunk blocks
      const restoredDoc = restoreDocument(auditedDoc, chunkRegistry);
      const chunkOriginal = targetBlocks.map((b) => b.sourceText).join(" ").trim();
      const chunkRestored = restoredDoc.blocks.map((b) => b.processedText || b.sourceText).join(" ").trim();
      const isIdentical = chunkOriginal.length > 0 && chunkOriginal === chunkRestored;

      if ((report.finalDecision === "SAFE" || report.finalDecision === "WARNING") && !isIdentical) {
        // Update workingDoc blocks
        workingDoc = {
          ...workingDoc,
          blocks: workingDoc.blocks.map((b) => {
            const match = restoredDoc.blocks.find((rb) => rb.id === b.id);
            return match || b;
          }),
        };

        chunk.status = report.finalDecision === "WARNING" ? "REVIEW_REQUIRED" : "VALIDATED";
        chunk.attemptsCount = attempt;
        chunk.fallbackUsed = false;
        chunk.auditReport = report;
        chunk.processedWordCount = restoredDoc.blocks.reduce(
          (sum, b) => sum + (b.processedText?.split(/\s+/).filter(Boolean).length || 0),
          0
        );

        chunkSuccess = true;
        if (chunk.status === "VALIDATED") completedChunks++;
        else reviewRequiredChunks++;
      } else {
        // If rejected, plan targeted retry
        if (attempt <= maxRetries) {
          currentRetryPlan = buildRetryPlan(report, {
            attemptNumber: attempt,
            maxAttempts: maxRetries + 1,
            mode,
          });

          if (!currentRetryPlan.isRetryable) {
            break;
          }
        }
      }
    }

    // If chunk failed all retries or threw: isolated fail-safe fallback for this chunk
    if (!chunkSuccess && chunk.status !== "CANCELLED") {
      chunk.status = "FAILED";
      chunk.attemptsCount = attempt;
      chunk.fallbackUsed = true;
      chunk.fallbackReason = getPrimaryFailureReason(
        lastReport,
        "Chunk failed safety checks; original source preserved."
      );
      chunk.auditReport = lastReport;
      failedChunks++;

      // Ensure target blocks in workingDoc strictly retain original unshielded source text
      workingDoc = {
        ...workingDoc,
        blocks: workingDoc.blocks.map((b) => {
          if (chunk.blockIds.includes(b.id)) {
            const rawBlock = doc.blocks.find((rb) => rb.id === b.id);
            return { ...b, processedText: rawBlock?.sourceText || b.sourceText };
          }
          return b;
        }),
      };
    }

    updateProgress(cIdx);
  }

  // 5. Generate Review Units using original unshielded doc
  const reviewUnits = generateReviewUnits(doc, workingDoc);
  workingDoc = {
    ...workingDoc,
    reviewUnits,
    chunks,
  };

  // 6. Final Document Integrity Validation
  const finalValidation = validateFinalDocument(workingDoc, registry);

  const totalWords = workingDoc.blocks.reduce(
    (sum, b) => sum + (b.processedText || b.sourceText).split(/\s+/).filter(Boolean).length,
    0
  );

  const overallSuccess =
    !abortSignal?.aborted && completedChunks > 0 && finalValidation.valid;

  return {
    success: overallSuccess,
    document: workingDoc,
    chunks,
    reviewUnits,
    progress: {
      totalChunks: chunks.length,
      completedChunks,
      failedChunks,
      reviewRequiredChunks,
      percentComplete: chunks.length > 0 ? Math.round((completedChunks / chunks.length) * 100) : 100,
      isCancelled: Boolean(abortSignal?.aborted),
    },
    totalWordsProcessed: totalWords,
    fallbackChunksCount: failedChunks,
    finalValidationPassed: finalValidation.valid,
    validationIssues: finalValidation.errors.length > 0 ? finalValidation.errors : undefined,
  };
}
