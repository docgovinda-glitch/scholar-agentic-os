/**
 * Manuscript Writer Agent
 *
 * Generates complete academic manuscripts from CRPM (identity, keywords,
 * reference IDs). Task 1 (2026-07-24 follow-up session): CRPM's `artifacts`
 * only ever carried opaque *Id string references (see AgentOutputs in
 * core/project/projectTypes.ts) with no ID -> content store anywhere in this
 * codebase to resolve them — so real section drafting also needs
 * ManuscriptWriterInput.researchContext, real resolved text the
 * PaperProject -> CanonicalResearchProject adapter
 * (src/services/manuscriptWriterAdapter.ts) supplies alongside the CRPM
 * object. See ManuscriptResearchContext's comment in interfaces.ts.
 */

import type { Agent, AgentContext, AgentResult, ExecutionMode, AgentMetadata } from "../types";
import type { SkillResult } from "../../skills/types";
import type { ManuscriptDraft, ManuscriptWriterInput } from "./interfaces";

// ============================================================================
// Manuscript Writer Agent
// ============================================================================

export class ManuscriptWriterAgent implements Agent<ManuscriptWriterInput, ManuscriptDraft> {
  metadata: AgentMetadata = {
    id: "manuscript-writer",
    name: "Manuscript Writer Agent",
    description: "Generates complete academic manuscripts from CRPM",
    version: "1.0.0",
    category: "Knowledge",
    author: "System",
    offlineCapable: true,
    aiEnhanced: true,
    supportedModes: ["deterministic", "ai", "web", "hybrid"],
    defaultMode: "hybrid",
  };

  async execute(
    input: ManuscriptWriterInput,
    context: AgentContext
  ): Promise<AgentResult<ManuscriptDraft>> {
    const startTime = Date.now();

    if (!context.runSkill) {
      return {
        ok: false,
        error: {
          type: "EXECUTION_ERROR",
          message: "AgentContext.runSkill is not available — cannot reach the manuscript-writing skill",
        },
        diagnostics: {
          modeUsed: input.executionMode ?? "deterministic",
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    const result: SkillResult<ManuscriptDraft> = await context.runSkill<ManuscriptDraft>("manuscript-writing", input);
    const executionTimeMs = Date.now() - startTime;

    if (result.ok === false) {
      return {
        ok: false,
        error: result.error,
        diagnostics: { modeUsed: input.executionMode ?? "deterministic", executionTimeMs },
      };
    }

    return {
      ok: true,
      data: result.data,
      diagnostics: {
        modeUsed: input.executionMode ?? "deterministic",
        executionTimeMs,
        confidence: 0.9,
      },
    };
  }
}
