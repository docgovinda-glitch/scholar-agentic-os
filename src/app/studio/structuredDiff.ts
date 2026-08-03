/**
 * Parsing and fallback logic for model responses.
 *
 * The Studio asks the model for structured JSON (revised text plus a list of
 * changes, each with its own reason) so that per-change reasons are genuinely
 * specific rather than one generic label repeated across every hunk (docs
 * 32-LANGUAGE-AND-VOICE-ARCHITECTURE.md §7 requires "a diff with a reason
 * per edit"). Not every model reliably returns valid JSON, so this module
 * falls back to a heuristic, locally-computed diff with heuristic reasons
 * when parsing fails — the feature degrades gracefully rather than breaking.
 */

import { buildDiff } from "../../domain/language/diff";
import type { ChangeCategory, DiffChange, InterventionLevel } from "../../domain/language/types";

export interface StructuredModelChange {
  original: string;
  replacement: string;
  reason: string;
}

export interface StructuredModelResponse {
  revised: string;
  changes: StructuredModelChange[];
}

export function structuredResponseInstruction(): string {
  return (
    "Respond with ONLY a single JSON object, no markdown fences, of the exact shape:\n" +
    '{"revised": "<the full revised passage>", "changes": [{"original": "<exact original snippet>", ' +
    '"replacement": "<what it becomes>", "reason": "<one short sentence explaining this specific change>"}]}\n' +
    "List every change you made, however small, each as its own entry with its own reason. " +
    'The "original" snippet for each change must appear verbatim in the input passage.'
  );
}

export function tryParseStructuredResponse(raw: string): StructuredModelResponse | undefined {
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

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as StructuredModelResponse).revised !== "string" ||
    !Array.isArray((parsed as StructuredModelResponse).changes)
  ) {
    return undefined;
  }

  const changes = (parsed as StructuredModelResponse).changes.filter(
    (c): c is StructuredModelChange =>
      typeof c === "object" &&
      c !== null &&
      typeof (c as StructuredModelChange).original === "string" &&
      typeof (c as StructuredModelChange).replacement === "string" &&
      typeof (c as StructuredModelChange).reason === "string"
  );

  return { revised: (parsed as StructuredModelResponse).revised, changes };
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `structured-${counter}`;
}
export function __resetStructuredIdsForTests(): void {
  counter = 0;
}

/**
 * Build DiffChange hunks from a structured response by locating each
 * `original` snippet in the source passage, in order, without reusing a
 * span already consumed by an earlier match. Snippets that cannot be located
 * (the model paraphrased its own diff rather than quoting verbatim) are
 * silently dropped from the structured path — the fallback below covers
 * them so no change is lost, just its custom reason.
 */
export function structuredChangesToDiff(
  originalText: string,
  response: StructuredModelResponse,
  category: ChangeCategory = "language"
): DiffChange[] {
  const changes: DiffChange[] = [];
  let searchFrom = 0;
  for (const c of response.changes) {
    if (!c.original) continue;
    const idx = originalText.indexOf(c.original, searchFrom);
    if (idx === -1) continue; // dropped — see fallback in refine()
    changes.push({
      id: nextId(),
      category,
      originalStart: idx,
      originalEnd: idx + c.original.length,
      originalText: c.original,
      replacementText: c.replacement,
      reason: c.reason,
    });
    searchFrom = idx + c.original.length;
  }
  return changes;
}

/** Heuristic per-hunk reason, used only when structured parsing fails entirely. */
export function heuristicReason(level: InterventionLevel, originalText: string, replacementText: string): string {
  const orig = originalText.trim();
  const repl = replacementText.trim();
  const transitions = ["however", "moreover", "therefore", "additionally", "furthermore", "consequently"];
  if (transitions.some((t) => repl.toLowerCase().includes(t) && !orig.toLowerCase().includes(t))) {
    return "Transition added for flow.";
  }
  if (orig === "" && repl !== "") return "Text added.";
  if (orig !== "" && repl === "") return "Text removed.";
  if (/^[.,;:!?\s]+$/.test(orig) || /^[.,;:!?\s]+$/.test(repl)) return "Punctuation adjusted.";
  if (orig.split(/\s+/).length <= 2 && repl.split(/\s+/).length <= 2) {
    return "Word choice adjusted.";
  }
  const byLevel: Record<InterventionLevel, string> = {
    proofread: "Mechanical correction.",
    clarity: "Reworded for clarity.",
    flow: "Adjusted for flow.",
    register: "Adjusted for academic register.",
    rewrite: "Rewritten for concision and force.",
  };
  return byLevel[level];
}

/** The full fallback path: diff the whole passage and assign heuristic reasons. */
export function fallbackDiff(
  level: InterventionLevel,
  originalText: string,
  revisedText: string,
  category: ChangeCategory = "language"
): DiffChange[] {
  return buildDiff(originalText, revisedText, (o, r) => heuristicReason(level, o, r), category);
}
