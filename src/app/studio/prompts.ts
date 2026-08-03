/**
 * Prompt construction for model-backed intervention levels (2–5).
 * Spec: docs/03-workflow/32-LANGUAGE-AND-VOICE-ARCHITECTURE.md §4.
 */

import { describeL1ForPrompt } from "../../domain/language/l1Patterns";
import { describeProfileForPrompt } from "../../domain/language/voiceProfile";
import { describeRegisterForPrompt, registerFor } from "../../domain/language/register";
import type { InterventionLevel, L1Profile, VoiceProfile } from "../../domain/language/types";

const LEVEL_INSTRUCTIONS: Record<Exclude<InterventionLevel, "proofread">, string> = {
  clarity:
    "Resolve ambiguous references, untangle nested clauses, remove redundancy, and make vague quantifiers precise " +
    "where the surrounding text supports it. Do NOT change the argument, the order of ideas, or the register.",
  flow:
    "Vary sentence length, improve transitions between sentences and paragraphs, and remove repetitive sentence " +
    "openings. Do NOT change the argument or the evidence.",
  register:
    "Calibrate academic register for the stated discipline: adjust hedging to field norms, balance nominalisation, " +
    "set active/passive voice to convention, and remove informality. Do NOT change claims or their strength.",
  rewrite:
    "You may substantially restructure sentences and paragraphs, and reorder within a paragraph for argumentative " +
    "force. Do NOT change the claims, the evidence, the citations, or the meaning of any statement.",
};

export interface PromptInput {
  level: Exclude<InterventionLevel, "proofread">;
  text: string;
  discipline?: string;
  l1?: L1Profile;
  voiceProfile?: VoiceProfile;
}

export function buildSystemPrompt(input: PromptInput): string {
  const lines: string[] = [
    "You are an academic language editor. Improve the writer's prose while preserving their intent exactly.",
    "Return ONLY the revised passage text, with no preamble, no explanation, and no markdown formatting.",
    "Never invent facts, citations, or claims. Never alter the strength of a claim (e.g. do not change " +
      '"suggests" to "demonstrates") — if the passage seems to overclaim or underclaim, leave it as written; a ' +
      "separate verification stage handles that.",
    "Never alter text that appears inside quotation marks.",
    LEVEL_INSTRUCTIONS[input.level],
  ];

  if (input.discipline) {
    lines.push(`Discipline register: ${describeRegisterForPrompt(registerFor(input.discipline))}.`);
  }
  if (input.l1) {
    lines.push(describeL1ForPrompt(input.l1));
  }
  if (input.voiceProfile) {
    lines.push(
      `Match the author's own voice: ${describeProfileForPrompt(input.voiceProfile)}. ` +
        "Prefer their habitual patterns over generic elegance, as long as doing so does not reintroduce an error."
    );
  }

  return lines.join("\n");
}
