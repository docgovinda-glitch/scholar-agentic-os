/**
 * Document Intelligence Engine - Pipeline Orchestrator
 *
 * Cycle 1:
 * - Provides deterministic orchestration across pipeline stages.
 * - Does NOT implement real parsing/extraction.
 * - Stage implementations are injected for testability.
 */

import type {
  CanonicalEntityId,
  DocumentIntelligencePartialModel,
} from "../model/types";
import type {
  DocumentIntelligenceInput,
  DocumentIntelligencePipelineResult,
  DocumentIntelligencePipelineFailure,
  DocumentIntelligencePipelineOutput,
  DocumentIntelligenceStage,
  PipelineStageContext,
  PipelineStageResult,
  PipelineStageId,
} from "./types";

export interface DocumentIntelligencePipelineDependencies {
  stages: DocumentIntelligenceStage[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultPartial(documentId: CanonicalEntityId): DocumentIntelligencePartialModel {
  return { documentId, diagnostics: undefined };
}

export class DocumentIntelligencePipeline {
  private stagesByOrder: DocumentIntelligenceStage[];

  constructor(private deps: DocumentIntelligencePipelineDependencies) {
    this.stagesByOrder = deps.stages;
  }

  async run(input: DocumentIntelligenceInput): Promise<DocumentIntelligencePipelineResult> {
    const startedAt = nowIso();
    const warnings: string[] = [];
    const stageResults: PipelineStageResult[] = [];

    const documentId: CanonicalEntityId =
      input.documentId ??
      // Deterministic placeholder until fingerprinting is implemented in later cycle:
      `doc_${input.source.uploadId ?? "unknown"}_${input.source.filename ?? "unnamed"}`;

    const partial: DocumentIntelligencePartialModel = defaultPartial(documentId);

    try {
      const contextCommon = {
        documentId,
        partial,
        signal: input.signal,
        onProgress: input.onProgress,
      } satisfies Omit<PipelineStageContext, "stageId" | "warnings">;

      for (let idx = 0; idx < this.stagesByOrder.length; idx++) {
        const stage = this.stagesByOrder[idx];
        const stageId = stage.stageId;

        if (input.signal?.aborted) {
          throw new Error("Operation cancelled");
        }

        const stageWarnings: string[] = [];
        const stageContext: PipelineStageContext = {
          ...contextCommon,
          stageId,
          warnings: stageWarnings,
        };

        input.onProgress?.({
          stageId,
          progress: (idx / Math.max(1, this.stagesByOrder.length)) * 100,
          message: `Starting stage ${stageId}`,
        });

        const stagePartialBefore = partial;

        const stagePartial = await stage.execute(input, stageContext);

        // Merge strategy for Cycle 1:
        // - Stage can return a partial that includes updated arrays/fields.
        // - We shallow-merge, preferring returned values when defined.
        const merged: DocumentIntelligencePartialModel = {
          ...stagePartialBefore,
          ...stagePartial,
          metadata: {
            ...(stagePartialBefore.metadata ?? {}),
            ...(stagePartial.metadata ?? {}),
          },
          searchable: {
            ...(stagePartialBefore.searchable ?? {}),
            ...(stagePartial.searchable ?? {}),
          },
        };

        // Mutate in place to preserve reference for downstream tests
        Object.assign(partial, merged);

        stageResults.push({
          stageId,
          ok: true,
          warnings: stageWarnings.length ? stageWarnings : undefined,
        });

        warnings.push(...stageWarnings);
        input.onProgress?.({
          stageId,
          progress: ((idx + 1) / Math.max(1, this.stagesByOrder.length)) * 100,
          message: `Completed stage ${stageId}`,
        });
      }

      // In Cycle 1, we cannot “finalize” without a ModelGenerator implementation.
      // Callers can inject a “generate_model” stage that sets searchable/fullText etc.
      const partialAny = partial as any;
      if (!partialAny.documentFinalized && (partialAny.searchable?.fullText ?? "") === "") {
        // Not a hard error in Cycle 1; treat as partial.
        warnings.push("Pipeline finished without finalized searchable content (expected in Cycle 1).");
      }

      // Expect caller-provided stage “generate_model” to finalize Document.
      // If not present, surface failure as INTERNAL_ERROR to avoid returning invalid model.
      if (!("pages" in partial) || partialAny.sections === undefined) {
        // Still return a deterministic failure so tests know what to implement next.
        const failure: DocumentIntelligencePipelineFailure = {
          ok: false,
          error: {
            type: "INTERNAL_ERROR",
            message:
              "Document model generation stage not completed. In Cycle 1, inject a generate_model stage for tests.",
          },
          diagnostics: { stages: stageResults, warnings: warnings.length ? warnings : undefined },
        };
        return failure;
      }

      const output: DocumentIntelligencePipelineOutput = {
        ok: true,
        document: partialAny as any, // stage should return a fully formed Document
        diagnostics: {
          stages: stageResults,
          warnings: warnings.length ? warnings : undefined,
          startedAt,
          finishedAt: nowIso(),
        },
      };

      return output;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const failure: DocumentIntelligencePipelineFailure = {
        ok: false,
        error: {
          type: errMsg.includes("cancelled") ? "TIMEOUT" : "INTERNAL_ERROR",
          message: errMsg,
          cause: e,
        },
        diagnostics: { stages: stageResults, warnings: warnings.length ? warnings : undefined },
      };
      return failure;
    }
  }
}
