/**
 * Proposed redactions for a double-blind submission (docs
 * 33-EXPORT-ARCHITECTURE.md §7.1: "an automated pass removes or replaces:
 * author names and affiliations, acknowledgements, funding statements
 * naming the team, self-citations phrased as 'our previous work', and
 * document metadata").
 *
 * This module models the PROPOSAL only. Docs 33 §7.1: "Every change is
 * shown for review before the anonymised file is produced. Automated
 * anonymisation that silently misses something is worse than none, because
 * the author stops checking" — so nothing here is ever auto-applied; a
 * human accepts or rejects each proposal (src/app/anonymization's apply
 * step only ever acts on the accepted subset).
 */
export type RedactionCategory = "author_identity" | "acknowledgement" | "funding_statement" | "self_citation" | "metadata";

export interface RedactionProposal {
  /** The CanonicalDocument block this redaction applies to. */
  blockId: string;
  category: RedactionCategory;
  /** Verbatim substring of the block's own text — the apply step matches on this exactly, never a fuzzy match. */
  originalText: string;
  replacementText: string;
  reason: string;
}

export interface AnonymizationReport {
  proposals: RedactionProposal[];
  checkedAt: string;
}
