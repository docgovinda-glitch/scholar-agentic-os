/**
 * The venue-specific requirements a Journal Article manuscript must satisfy
 * — the pre-draft counterpart to src/domain/submission/types.ts's
 * SubmissionRecord (which tracks what happened *after* a manuscript was
 * sent somewhere). Gates G1 (Requirements) on whether this exists at all;
 * later phases (word-budget allocation, the compliance rubric's
 * currently-uncompiled citation_style_exact/abstract_limit/
 * declarations_present gates) read the values captured here rather than
 * inventing them.
 *
 * `source` distinguishes how this was captured: "manual" is this phase's
 * only path (a user typed it in); "ai_extracted" is reserved for a later
 * phase that parses pasted/linked author guidelines — even then, an
 * AI-extracted proposal is never saved here until the user confirms it, so
 * this object always represents something a human has actually approved.
 */

export interface JournalRequirements {
  journalName: string;
  source: "manual" | "ai_extracted";
  wordLimit?: { min?: number; max?: number };
  /** Section keys, overriding the catalog's default structure when the venue's own structure differs. Undefined means "use the output type's default". */
  structureOverride?: string[];
  /** Overrides the output type's default citation style when the venue mandates something else. */
  citationStyle?: string;
  requiredDeclarations: string[];
  articleType?: string;
  /** Anything not yet worth a structured field of its own — not a dumping ground for content that should become one later. */
  notes?: string;
  capturedAt: string;
  capturedBy: string;
}

/**
 * Minimum length of pasted author-guidelines text before AI extraction is
 * even attempted. Asking a model to extract facts from too little text just
 * invites it to fall back on generic academic-journal conventions instead
 * of what this venue actually says — the "never invent requirements" rule
 * has to hold at the input boundary, not just in the output.
 */
export const MIN_GUIDELINES_WORDS = 40;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * What AI extraction proposes from pasted/linked author-guidelines text —
 * never saved directly as JournalRequirements (see that interface's own
 * comment on `source`). Every field is either lifted from something the
 * source text actually states or left absent; `unresolvedFields` names
 * anything the extraction looked for but the text never stated, so the
 * review UI can point out exactly what still needs the user's own judgement
 * rather than silently leaving a gap they might not notice.
 */
export interface JournalRequirementsProposal {
  journalName?: string;
  wordLimit?: { min?: number; max?: number };
  structureOverride?: string[];
  citationStyle?: string;
  requiredDeclarations: string[];
  articleType?: string;
  notes?: string;
  unresolvedFields: string[];
}
