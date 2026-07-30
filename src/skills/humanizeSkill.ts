/**
 * Humanize Skill (Stage 9, target-workflow.md).
 *
 * A prose-quality post-processing pass for drafted academic text — reduces
 * the small set of formulaic patterns catalogued at
 * Wikipedia:Signs_of_AI_writing (already referenced in target-workflow.md):
 * stock transition-word overuse, hollow topic sentences, passive-voice
 * overuse, unnaturally uniform sentence length, and hedging-phrase stacking.
 *
 * This is explicitly NOT a detection-evasion tool. It never references
 * detectors, "sounding human," or bypassing anything in its instructions to
 * the model — only sentence-level prose-quality edits. draftSectionBasedOnQCStream's
 * system prompt in aiService.ts previously contained real detection-evasion
 * language ("bypass common AI detectors (GPTZero, Turnitin-AI)") but that
 * was fixed in a later session (see aiService.draftSectionBasedOnQCStream.test.ts's
 * regression test) — this skill never reused or extended that framing.
 */

import type { Skill, SkillContext, SkillMetadata, SkillResult, SkillValidationResult } from "./types";
import AIGateway from "../services/aiGateway";
import type { AISettings } from "../types";
import { getExecutor } from "./executor";

export interface HumanizeInput {
  text: string;
  aiSettings?: AISettings;
}

export interface HumanizeOutput {
  humanizedText: string;
}

const HUMANIZE_SYSTEM_INSTRUCTION = `You are a prose-quality editor revising academic writing so it reads the way an experienced human scholar writes. This is a writing-quality pass only.

Revise the text to fix these specific patterns, without changing anything else:
1. Overuse of stock transition words ("Furthermore", "Moreover", "Additionally") — vary or remove them.
2. Hollow topic sentences that restate the obvious without adding information.
3. Overuse of passive voice — prefer active voice where it reads naturally.
4. Unnaturally uniform sentence length — vary sentence length and rhythm.
5. Hedging-phrase stacking ("It is worth noting that...", "It should be noted that...") — cut or replace with direct statements.

Preserve every fact, citation, argument, and technical claim exactly as given — do not add, remove, or alter any content, only its sentence-level phrasing and rhythm. Return only the revised text: no commentary, no preamble, no markdown fences.`;

export class HumanizeSkill implements Skill<HumanizeInput, HumanizeOutput> {
  readonly metadata: SkillMetadata = {
    id: "humanize-prose",
    name: "Humanize Prose",
    description:
      "Post-processing pass that revises drafted academic text to reduce formulaic AI-writing patterns (stock transitions, hollow topic sentences, passive-voice overuse, uniform sentence length, hedging-phrase stacking) — a prose-quality pass, not detection evasion.",
    version: "1.0.0",
    category: "Document",
    author: "System",
    offlineCapable: false,
    aiEnhanced: true,
  };

  validate(input: HumanizeInput): SkillValidationResult {
    if (!input.text || !input.text.trim()) {
      return { valid: false, errors: ["No text provided to humanize."] };
    }
    return { valid: true, errors: [] };
  }

  async execute(input: HumanizeInput, context: SkillContext): Promise<SkillResult<HumanizeOutput>> {
    context.logger.debug("Humanizing drafted text", { length: input.text.length });

    try {
      const response = await AIGateway.generate(
        {
          systemInstruction: HUMANIZE_SYSTEM_INSTRUCTION,
          prompt: input.text,
          temperature: 0.5,
          taskType: "humanize",
        },
        input.aiSettings || ({ provider: "auto" } as AISettings)
      );

      return { ok: true, data: { humanizedText: response.text } };
    } catch (error) {
      return {
        ok: false,
        error: {
          type: "EXECUTION_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}

/** Convenience wrapper: runs the skill through the shared executor and returns the humanized text, or throws. */
export async function humanizeText(text: string, aiSettings?: AISettings): Promise<string> {
  const result = await getExecutor().execute(new HumanizeSkill(), { text, aiSettings });
  if (result.ok === false) {
    throw new Error(result.error.message);
  }
  return result.data.humanizedText;
}
