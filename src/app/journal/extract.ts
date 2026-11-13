/**
 * AI-assisted extraction of a JournalRequirements proposal from pasted
 * author-guidelines text.
 *
 * Mirrors src/app/studio/studio.ts's refine(): a plain pipeline function
 * that takes provider/apiKey/model as opaque input and knows nothing about
 * BYOK vs. Premium — that decision belongs to the route calling this
 * (server/routes/project.ts's journal-requirements/extract handler), same
 * split Studio uses between itself and server/routes/studio.ts.
 *
 * The result is always a JournalRequirementsProposal
 * (src/domain/journal/types.ts), never a JournalRequirements — nothing this
 * function returns is saved anywhere. It becomes real only once a human has
 * reviewed it and PUT .../journal-requirements themselves, the same
 * "no user approval, no citation"-style gate the spec applies to evidence.
 */

import type { Completer } from "../../platform/completion";
import { countWords, MIN_GUIDELINES_WORDS, type JournalRequirementsProposal } from "../../domain/journal/types";


export interface ExtractJournalRequirementsInput {
  guidelinesText: string;
  /** Runs the model; see src/platform/completion.ts. */
  complete: Completer;
}

export interface JournalExtractionUsage {
  provider: string;
  model: string;
  inputTokensEstimate: number;
  outputTokensEstimate: number;
}

export interface ExtractJournalRequirementsResult {
  proposal: JournalRequirementsProposal;
  usage: JournalExtractionUsage;
}

/** The extraction instructions, shared by every route that runs the extraction. */
export function journalExtractionPrompt(): string {
  return [
    "You extract structural submission requirements from a journal's own author guidelines text.",
    "Report ONLY what the supplied text explicitly states. Never infer, assume, or fill in a typical or default academic-journal convention for anything the text does not say.",
    "If the text does not state a value for a field, omit that field entirely (or use an empty array for list fields) and list its name in unresolvedFields instead of guessing.",
    'requiredDeclarations must list only declaration types the text explicitly asks authors to include (e.g. a named conflict-of-interest, funding, ethics-approval, data-availability, or author-contributions statement) — never a general academic norm the text itself does not state.',
    "structureOverride, if present, must list section names in the order the text specifies, using the text's own wording, not a generic IMRaD assumption.",
    "Respond with ONLY a single JSON object, no markdown fences, of the exact shape:\n" +
      '{"journalName": "<string, omit if not stated>", "wordLimit": {"min": <number, omit if not stated>, "max": <number, omit if not stated>}, ' +
      '"structureOverride": ["<section name>", ...], "citationStyle": "<string, omit if not stated>", "requiredDeclarations": ["<declaration type>", ...], ' +
      '"articleType": "<string, omit if not stated>", "notes": "<string, omit if nothing worth noting>", "unresolvedFields": ["<field name>", ...]}',
  ].join("\n");
}

export function tryParseProposal(raw: string): JournalRequirementsProposal | undefined {
  const trimmed = raw.trim();
  // Tolerate a model wrapping the JSON in a markdown fence despite instructions.
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fenceMatch ? fenceMatch[1] : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const p = parsed as Record<string, unknown>;

  if (!Array.isArray(p.requiredDeclarations) || !p.requiredDeclarations.every((d) => typeof d === "string")) return undefined;
  if (!Array.isArray(p.unresolvedFields) || !p.unresolvedFields.every((f) => typeof f === "string")) return undefined;

  const proposal: JournalRequirementsProposal = {
    requiredDeclarations: p.requiredDeclarations as string[],
    unresolvedFields: p.unresolvedFields as string[],
  };
  if (typeof p.journalName === "string" && p.journalName.trim()) proposal.journalName = p.journalName.trim();
  if (typeof p.citationStyle === "string" && p.citationStyle.trim()) proposal.citationStyle = p.citationStyle.trim();
  if (typeof p.articleType === "string" && p.articleType.trim()) proposal.articleType = p.articleType.trim();
  if (typeof p.notes === "string" && p.notes.trim()) proposal.notes = p.notes.trim();
  if (Array.isArray(p.structureOverride) && p.structureOverride.length > 0 && p.structureOverride.every((s) => typeof s === "string")) {
    proposal.structureOverride = p.structureOverride as string[];
  }
  if (typeof p.wordLimit === "object" && p.wordLimit !== null) {
    const w = p.wordLimit as Record<string, unknown>;
    const min = typeof w.min === "number" ? w.min : undefined;
    const max = typeof w.max === "number" ? w.max : undefined;
    if (min !== undefined || max !== undefined) proposal.wordLimit = { min, max };
  }
  return proposal;
}

export async function extractJournalRequirements(
  input: ExtractJournalRequirementsInput
): Promise<ExtractJournalRequirementsResult> {
  if (countWords(input.guidelinesText) < MIN_GUIDELINES_WORDS) {
    throw new Error(
      `Paste at least ${MIN_GUIDELINES_WORDS} words of the journal's own author guidelines — too little text to extract from reliably.`
    );
  }

  const result = await input.complete(
    {
      taskClass: "rule_extraction",
      systemPrompt: journalExtractionPrompt(),
      userPrompt: input.guidelinesText,
      responseFormat: "json",
    }
  );

  const proposal = tryParseProposal(result.text);
  if (!proposal) {
    // Never fall back to a heuristic/partial proposal here (unlike Studio's
    // diff parsing) — a guessed proposal is exactly the fabrication the
    // "never invent requirements" rule forbids. A real, visible failure the
    // user can retry is the only acceptable outcome of a bad parse.
    throw new Error(
      "The model's response could not be parsed as journal requirements. Try again, or enter requirements manually."
    );
  }

  return {
    proposal,
    usage: {
      provider: result.provider,
      model: result.model,
      inputTokensEstimate: result.inputTokensEstimate,
      outputTokensEstimate: result.outputTokensEstimate,
    },
  };
}
