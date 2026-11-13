/**
 * The global coherence pass. Mirrors src/app/manuscript/generate.ts's shape
 * (plain provider/apiKey/model params, BYOK-vs-Premium left to the route
 * layer) but runs MULTIPLE bounded calls, one per
 * domain/coherence/types.ts's CoherenceDimension, rather than a single call
 * asked to judge the whole manuscript's consistency at once — "multi-pass,
 * not single-call" is the entire point of this module existing separately
 * from generate.ts.
 *
 * A failed pass never aborts the others: checkCoherence() always returns
 * whatever passes succeeded, with the failed dimension's error recorded in
 * passErrors rather than the whole report vanishing — a partial coherence
 * report is still real information, and "the check itself broke" is not the
 * same fact as "no issues were found."
 */

import { CompletionInterrupted, type Completer } from "../../platform/completion";
import { COHERENCE_DIMENSIONS } from "../../domain/coherence/types";
import type { CoherenceDimension, CoherenceIssue, CoherenceReport, CoherenceSeverity } from "../../domain/coherence/types";
import type { GeneratedSection } from "../../domain/manuscript/types";


export interface CheckCoherenceInput {
  sections: GeneratedSection[];
  /** Runs the model; see src/platform/completion.ts. */
  complete: Completer;
  /** Defaults to every dimension; a caller may re-run just one failed pass. */
  dimensions?: CoherenceDimension[];
}

const DIMENSION_PROMPT: Record<CoherenceDimension, string> = {
  terminology:
    "Check for TERMINOLOGY inconsistency across these sections: the same concept referred to by different, inconsistent terms (e.g. 'the sample' vs 'the cohort' vs 'participants' used interchangeably without explanation), or the same term used with different meanings in different sections.",
  argument_continuity:
    "Check for ARGUMENT CONTINUITY across these sections: does a later section actually address the gap or question an earlier section raised? Does anything assert a claim that contradicts an earlier section, or that was never set up? Is the argument's thread genuinely continuous section to section?",
  methodology:
    "Check for METHODOLOGY CONSISTENCY across these sections: does what Results/Discussion report match what Methods actually described (sample size, procedure, measures)? Is any method referenced that was never described, or a stated number that changes between sections?",
};

const SEVERITIES: CoherenceSeverity[] = ["minor", "moderate", "major"];

interface ParsedIssue {
  description: string;
  sectionKeys: string[];
  severity: CoherenceSeverity;
}

function tryParseIssues(raw: string): ParsedIssue[] | undefined {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fenceMatch ? fenceMatch[1] : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { issues?: unknown }).issues)) return undefined;

  const issues = (parsed as { issues: unknown[] }).issues;
  const result: ParsedIssue[] = [];
  for (const item of issues) {
    if (typeof item !== "object" || item === null) return undefined;
    const i = item as Record<string, unknown>;
    if (typeof i.description !== "string" || i.description.trim().length === 0) return undefined;
    if (!Array.isArray(i.sectionKeys) || !i.sectionKeys.every((k) => typeof k === "string") || i.sectionKeys.length === 0) return undefined;
    if (typeof i.severity !== "string" || !SEVERITIES.includes(i.severity as CoherenceSeverity)) return undefined;
    result.push({ description: i.description, sectionKeys: i.sectionKeys as string[], severity: i.severity as CoherenceSeverity });
  }
  return result;
}

async function runPass(dimension: CoherenceDimension, sections: GeneratedSection[], input: CheckCoherenceInput): Promise<CoherenceIssue[]> {

  const systemPrompt = [
    "You are reviewing a complete academic manuscript draft, section by section, for ONE specific kind of cross-section consistency problem.",
    DIMENSION_PROMPT[dimension],
    "Only report REAL cross-section issues — never invent one for the sake of having something to report. An empty issues list is a valid, good outcome.",
    'Respond with ONLY a single JSON object, no markdown fences, of the exact shape:\n{"issues": [{"description": "<what the inconsistency is, in one or two sentences>", "sectionKeys": ["<section key>", ...], "severity": "minor" | "moderate" | "major"}]}',
    '"sectionKeys" must list every section key (given as each segment\'s label below) genuinely involved in the issue.',
  ].join("\n");

  const result = await input.complete(
    {
      taskClass: "verification",
      systemPrompt,
      userPrompt: `Review the manuscript below for ${dimension.replace("_", " ")} issues.`,
      responseFormat: "json",
    }
  );

  const parsed = tryParseIssues(result.text);
  if (!parsed) {
    throw new Error(`The model's response for the "${dimension}" coherence pass could not be parsed.`);
  }
  return parsed.map((p) => ({ dimension, description: p.description, sectionKeys: p.sectionKeys, severity: p.severity }));
}

export async function checkCoherence(input: CheckCoherenceInput): Promise<CoherenceReport> {
  if (input.sections.length < 2) {
    // Coherence is a cross-section concept by definition — nothing to check yet with fewer than two sections.
    return { issues: [], passesRun: [], passErrors: {}, checkedAt: new Date().toISOString() };
  }

  const dimensions = input.dimensions ?? COHERENCE_DIMENSIONS;
  const issues: CoherenceIssue[] = [];
  const passesRun: CoherenceDimension[] = [];
  const passErrors: Partial<Record<CoherenceDimension, string>> = {};

  for (const dimension of dimensions) {
    try {
      const passIssues = await runPass(dimension, input.sections, input);
      issues.push(...passIssues);
      passesRun.push(dimension);
    } catch (err) {
      if (err instanceof CompletionInterrupted) throw err;
      passErrors[dimension] = err instanceof Error ? err.message : "Unknown error";
    }
  }

  return { issues, passesRun, passErrors, checkedAt: new Date().toISOString() };
}
