/**
 * Multi-lens adversarial peer review. Mirrors src/app/coherence/
 * checkCoherence.ts's shape almost exactly (plain provider/apiKey/model
 * params, multi-pass — one bounded call per REVIEW_LENSES entry — a failed
 * lens recorded in lensErrors rather than aborting the round), because the
 * two are the same kind of operation: several independent, bounded
 * judgements over the same manuscript, never one call asked to render every
 * verdict at once.
 *
 * Genuinely critical, not praise-optimized: every lens prompt below
 * explicitly instructs the model to find real problems, and each
 * LensReview requires a substantive overallAssessment even when findings is
 * empty, so "nothing wrong" has to be an earned, stated judgement rather
 * than a lens that had nothing to say.
 */

import { CompletionInterrupted, type Completer } from "../../platform/completion";
import { REVIEW_LENSES } from "../../domain/review/types";
import type { FindingSeverity, LensReview, ReviewFinding, ReviewLens, ReviewRound } from "../../domain/review/types";
import type { GeneratedSection } from "../../domain/manuscript/types";


export interface RunPeerReviewInput {
  sections: GeneratedSection[];
  roundNumber: number;
  journalRequirements?: { journalName: string };
  /** Runs the model; see src/platform/completion.ts. */
  complete: Completer;
  /** Defaults to every lens; a caller may re-run just one failed lens. */
  lenses?: ReviewLens[];
}

const LENS_PROMPT: Record<ReviewLens, string> = {
  contribution:
    "Assess this manuscript's CONTRIBUTION critically: is the claimed novelty actually novel, or overstated? Is the contribution significant enough to be worth publishing? Would a skeptical expert reviewer find it convincing, or is it thin/incremental dressed up as more than it is?",
  literature:
    "Assess the manuscript's engagement with LITERATURE critically: are there obvious, important omissions? Does it engage with counter-evidence or competing accounts, or cherry-pick only supportive sources? Is prior work characterized fairly and accurately?",
  methodology:
    "Assess the METHODOLOGY critically: are there confounds, threats to validity, or design weaknesses the manuscript doesn't acknowledge? Would the described method actually produce the claimed result? Is anything underspecified enough to block replication?",
  evidence:
    "Assess the EVIDENCE critically: does every load-bearing claim actually have support in the text? Is any claim asserted more strongly than its evidence warrants? Are effect sizes, statistics, and generalizations appropriately caveated?",
  argument:
    "Assess the ARGUMENT critically: does the logic actually hold together end to end? Are there non-sequiturs, unstated assumptions, or conclusions that don't follow from what precedes them?",
  citation:
    "Assess CITATION discipline critically, working only from the drafted text (no reference list is provided): does any claim that clearly needs a citation go unsupported in the text? Is anything stated as settled fact that should be attributed to a source instead?",
  journal_fit:
    "Assess FIT FOR THE TARGET JOURNAL critically, given its name/scope if provided: does this manuscript's topic, framing, and scope genuinely match what that journal publishes, or would an editor likely desk-reject it as out of scope?",
};

const SEVERITIES: FindingSeverity[] = ["minor", "moderate", "major", "critical"];

interface ParsedLensReview {
  findings: ReviewFinding[];
  overallAssessment: string;
}

function tryParseLensReview(raw: string): ParsedLensReview | undefined {
  const trimmed = raw.trim();
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
  if (typeof p.overallAssessment !== "string" || p.overallAssessment.trim().length === 0) return undefined;
  if (!Array.isArray(p.findings)) return undefined;

  const findings: ReviewFinding[] = [];
  for (const item of p.findings) {
    if (typeof item !== "object" || item === null) return undefined;
    const f = item as Record<string, unknown>;
    if (typeof f.summary !== "string" || f.summary.trim().length === 0) return undefined;
    if (typeof f.detail !== "string" || f.detail.trim().length === 0) return undefined;
    if (typeof f.severity !== "string" || !SEVERITIES.includes(f.severity as FindingSeverity)) return undefined;
    if (!Array.isArray(f.sectionKeys) || !f.sectionKeys.every((k) => typeof k === "string") || f.sectionKeys.length === 0) return undefined;
    findings.push({ summary: f.summary, detail: f.detail, severity: f.severity as FindingSeverity, sectionKeys: f.sectionKeys as string[] });
  }
  return { findings, overallAssessment: p.overallAssessment };
}

async function runLens(lens: ReviewLens, input: RunPeerReviewInput): Promise<LensReview> {

  const systemPrompt = [
    "You are an adversarial peer reviewer for an academic journal, reviewing ONE specific dimension of a complete manuscript draft.",
    "Be genuinely critical. Your job is to find real problems, not to be encouraging — a reviewer who only praises is not doing the job.",
    LENS_PROMPT[lens],
    input.journalRequirements ? `Target journal: ${input.journalRequirements.journalName}.` : "",
    "Only report findings you actually believe are real — never invent one for the sake of having something to report.",
    'Respond with ONLY a single JSON object, no markdown fences, of the exact shape:\n' +
      '{"findings": [{"summary": "<one sentence>", "detail": "<the full critique, specific and substantive>", "severity": "minor" | "moderate" | "major" | "critical", "sectionKeys": ["<section key>", ...]}], "overallAssessment": "<a critical paragraph judging this dimension as a whole, required even if findings is empty>"}',
  ]
    .filter(Boolean)
    .join("\n");

  const result = await input.complete(
    {
      taskClass: "verification",
      systemPrompt,
      userPrompt: `Review this manuscript for ${lens.replace("_", " ")} issues.`,
      responseFormat: "json",
    }
  );

  const parsed = tryParseLensReview(result.text);
  if (!parsed) {
    throw new Error(`The model's response for the "${lens}" review lens could not be parsed.`);
  }
  return { lens, findings: parsed.findings, overallAssessment: parsed.overallAssessment };
}

export async function runPeerReview(input: RunPeerReviewInput): Promise<ReviewRound> {
  const lenses = input.lenses ?? REVIEW_LENSES;
  const lensReviews: LensReview[] = [];
  const lensesRun: ReviewLens[] = [];
  const lensErrors: Partial<Record<ReviewLens, string>> = {};

  for (const lens of lenses) {
    try {
      lensReviews.push(await runLens(lens, input));
      lensesRun.push(lens);
    } catch (err) {
      if (err instanceof CompletionInterrupted) throw err;
      lensErrors[lens] = err instanceof Error ? err.message : "Unknown error";
    }
  }

  return { roundNumber: input.roundNumber, lensReviews, lensesRun, lensErrors, createdAt: new Date().toISOString() };
}
