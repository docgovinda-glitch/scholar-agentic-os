/**
 * Document Intelligence Skill Contract (Cycle 1)
 *
 * This defines a Skills Framework integration point for the Document Intelligence Engine.
 * Cycle 1 does NOT implement actual PDF/DOCX parsing; it orchestrates injected pipeline stages.
 */

import type { Skill, SkillConfig, SkillContext, SkillResult } from "../../skills/types";
import type {
  DocumentIntelligenceInput,
  DocumentIntelligencePipelineResult,
  DocumentIntelligencePipelineFailure,
} from "../pipeline/types";
import { DocumentIntelligencePipeline } from "../pipeline/pipeline";
import type { DocumentIntelligenceStage } from "../pipeline/types";
import type { DocumentIntelligencePartialModel, Document } from "../model/types";

export interface DocumentIntelligenceSkillInput {
  pipelineInput: DocumentIntelligenceInput;
}

export interface DocumentIntelligenceSkillOutput {
  document: Document;
  diagnostics?: DocumentIntelligencePipelineResult extends infer R
    ? R extends { ok: true; diagnostics?: infer D }
      ? D
      : never
    : never;
}

/**
 * Runtime dependencies injected for determinism/testing:
 * - pipeline stages (mockable)
 */
export interface DocumentIntelligenceSkillDeps {
  stages: DocumentIntelligenceStage[];
}

function createPipeline(deps: DocumentIntelligenceSkillDeps): DocumentIntelligencePipeline {
  return new DocumentIntelligencePipeline({ stages: deps.stages });
}

function isPipelineFailure(
  result: DocumentIntelligencePipelineResult
): result is DocumentIntelligencePipelineFailure {
  return result.ok === false;
}

export function createDocumentIntelligenceSkill(deps: DocumentIntelligenceSkillDeps): Skill<DocumentIntelligenceSkillInput, DocumentIntelligenceSkillOutput> {
  const pipeline = createPipeline(deps);

  const skill: Skill<DocumentIntelligenceSkillInput, DocumentIntelligenceSkillOutput> = {
    metadata: {
      id: "document-intelligence.engine",
      name: "Document Intelligence Engine",
      description:
        "Deterministically converts academic documents into a canonical Document Model and index-ready artifacts. Cycle 1 defines model/pipeline only; parsing stages are injected.",
      version: "1.0.0",
      category: "Document",
      author: "blackboxai",
      offlineCapable: true,
      aiEnhanced: false,
      requiredPermissions: [],
      dependencies: [],
      tags: ["document-intelligence", "cdm", "pipeline"],
      performance: { estimatedTimeMs: 0, cpuIntensive: false, ioIntensive: true },
    },

    async execute(input: DocumentIntelligenceSkillInput, context: SkillContext): Promise<SkillResult<DocumentIntelligenceSkillOutput>> {
      const result = await pipeline.run(input.pipelineInput);

      if (isPipelineFailure(result)) {
        const err = result.error;
        return {
          ok: false,
          error: {
            type: "EXECUTION_ERROR",
            message: err.message,
            code: err.code,
            cause: err.cause,
          },
          diagnostics: { warnings: result.diagnostics?.warnings },
        };
      }

      return {
        ok: true,
        data: {
          document: result.document,
          diagnostics: result.diagnostics,
        },
      };
    },
  };

  return skill;
}
