/**
 * Anonymization proposal generation (docs
 * 33-EXPORT-ARCHITECTURE.md §7.1). This produces PROPOSALS only — see
 * domain/anonymization/types.ts's module comment for why nothing here is
 * ever auto-applied. src/app/anonymization/applyAnonymization.ts is the
 * separate, deterministic step that turns an accepted subset of proposals
 * into an actual redacted document, once a human has reviewed them.
 *
 * taskClass is "verification" — this only analyses existing manuscript
 * text for identity-revealing passages, the same non-content-bearing
 * classification app/coherence and app/review use (platform/warden/
 * classify.ts), not "drafting" (which generates new prose).
 */

import type { Completer } from "../../platform/completion";
import type { CanonicalDocument } from "../../domain/document/model";
import type { AnonymizationReport, RedactionCategory, RedactionProposal } from "../../domain/anonymization/types";


const CATEGORIES: RedactionCategory[] = ["author_identity", "acknowledgement", "funding_statement", "self_citation", "metadata"];

export interface ProposeAnonymizationInput {
  document: CanonicalDocument;
  /** Runs the model; see src/platform/completion.ts. */
  complete: Completer;
}

function systemPrompt(): string {
  return [
    "You are preparing a manuscript for double-blind peer review. Identify every place identity-revealing content appears, so it can be proposed for redaction. You are NOT rewriting the document — only proposing changes for a human to review and accept or reject.",
    "Look for: author names and affiliations, acknowledgements naming people or institutions, funding statements naming the research team or grant recipients, and self-citations phrased as \"our previous work\" / \"we previously showed\" that would reveal authorship.",
    "Each replacementText must read naturally once substituted for originalText in place (e.g. \"our previous work [12]\" -> \"prior work [12]\"; a named author's affiliation -> \"[affiliation removed for review]\").",
    "Only report a REAL identity-revealing passage — never invent one for the sake of having something to report. An empty proposals list is a valid, good outcome for an already-anonymous section.",
    'Respond with ONLY a single JSON object, no markdown fences, of the exact shape:\n{"proposals": [{"blockId": "<the section label given below>", "category": "author_identity" | "acknowledgement" | "funding_statement" | "self_citation" | "metadata", "originalText": "<verbatim text to replace>", "replacementText": "<proposed neutral replacement>", "reason": "<why this reveals identity>"}]}',
    '"originalText" must be an exact, verbatim substring of that block\'s own text — never paraphrased or truncated.',
  ].join("\n");
}

function tryParseProposals(raw: string): RedactionProposal[] | undefined {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fenceMatch ? fenceMatch[1] : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { proposals?: unknown }).proposals)) return undefined;

  const proposals = (parsed as { proposals: unknown[] }).proposals;
  const result: RedactionProposal[] = [];
  for (const item of proposals) {
    if (typeof item !== "object" || item === null) return undefined;
    const p = item as Record<string, unknown>;
    if (typeof p.blockId !== "string" || p.blockId.trim().length === 0) return undefined;
    if (typeof p.category !== "string" || !CATEGORIES.includes(p.category as RedactionCategory)) return undefined;
    if (typeof p.originalText !== "string" || p.originalText.length === 0) return undefined;
    if (typeof p.replacementText !== "string") return undefined;
    if (typeof p.reason !== "string" || p.reason.trim().length === 0) return undefined;
    result.push({
      blockId: p.blockId,
      category: p.category as RedactionCategory,
      originalText: p.originalText,
      replacementText: p.replacementText,
      reason: p.reason,
    });
  }
  return result;
}

export async function proposeAnonymization(input: ProposeAnonymizationInput): Promise<AnonymizationReport> {

  const result = await input.complete(
    {
      taskClass: "verification",
      systemPrompt: systemPrompt(),
      userPrompt: "Identify every identity-revealing passage in the manuscript below and propose a neutral replacement for each.",
      responseFormat: "json",
    }
  );

  const parsed = tryParseProposals(result.text);
  if (!parsed) {
    throw new Error("The model's response for anonymization proposals could not be parsed. Try again.");
  }

  // Never trust a proposal referencing a block that doesn't exist, or
  // originalText that isn't actually present in that block's text — same
  // "verify, don't just trust the model's self-report" discipline as
  // app/manuscript/generate.ts's citation-id stripping.
  const blockText = new Map(input.document.blocks.map((b) => [b.id, b.text]));
  const proposals = parsed.filter((p) => blockText.get(p.blockId)?.includes(p.originalText) ?? false);

  return { proposals, checkedAt: new Date().toISOString() };
}
