/**
 * The Evidence Ledger — source discovery and the evidence provenance state
 * machine that sits upstream of src/domain/claim's Claim–Evidence Graph.
 *
 * The graph (domain/claim) has always modeled "is this evidence bound to a
 * claim" as binary — a binding either exists or doesn't, created directly
 * from a free-text sourceId + a quote the caller supplies. That's still
 * exactly right for what a binding IS (the final, cited fact). What it never
 * modeled is how a piece of evidence gets there: found, then a quote pulled
 * from it, then checked against the source, then proposed against a
 * specific claim, then a human decides. This module is that upstream
 * lifecycle. It never replaces bindEvidence() — approving an EvidenceItem
 * (see stateMachine.ts) is what calls it.
 *
 * States mirror the spec's DISCOVERED → EXTRACTED → VERIFIED → PROPOSED →
 * USER APPROVED → CITABLE pipeline exactly. "discovered" is recorded as the
 * first history entry of every EvidenceItem (inherited from its source's own
 * discoveredAt) rather than a separate placeholder item with nothing in it —
 * an EvidenceItem always represents an actual candidate quote, never an
 * empty stand-in for "we found a source". "user_approved" and "citable" are
 * reached together, in the same action (stateMachine.ts's approveEvidence):
 * there is no meaningful gap between a human approving a binding and it
 * becoming eligible to cite — but both are still recorded as distinct
 * history entries, so "was this ever approved by a person" stays a
 * queryable fact even after "citable" is reached.
 */

export type SourceType = "scholarly" | "official" | "web" | "media" | "user_provided" | "vault";

/** A (never-invented) authority tier: A = primary/official/peer-reviewed, D = unverified/low-authority. Assigned from what discovery actually observed (a .gov domain, a preprint host, etc.), never guessed for a source discovery can't classify. */
export type AuthorityTier = "A" | "B" | "C" | "D";

export type DiscoveryMethod = "arxiv" | "web_search" | "openalex" | "user_upload" | "vault" | "manual";

export interface DiscoveredSource {
  id: string;
  title: string;
  authors: string[];
  url?: string;
  doi?: string;
  venue?: string;
  year?: number;
  sourceType: SourceType;
  authorityTier: AuthorityTier;
  discoveredVia: DiscoveryMethod;
  discoveredAt: string;
  /** The Knowledge Vault item this source was pulled from, present only when discoveredVia is "vault" — traceability back to the researcher's own saved item, never resolved server-side (the Vault's contents are client-side encrypted; the server never sees them). */
  vaultItemId?: string;
}

export type EvidenceState = "discovered" | "extracted" | "verified" | "proposed" | "user_approved" | "citable";

export interface EvidenceHistoryEntry {
  state: EvidenceState;
  at: string;
  by?: string;
}

export interface EvidenceLocator {
  page?: number;
  paragraph?: number;
  startOffset?: number;
  endOffset?: number;
}

export interface EvidenceItem {
  id: string;
  sourceId: string;
  state: EvidenceState;
  /** The exact text pulled from the source — present from "extracted" onward, never a paraphrase (same "no invented locator" rule domain/claim's EvidenceSpan already enforces). */
  quote?: string;
  locator?: EvidenceLocator;
  /** The claim this evidence is proposed against — present from "proposed" onward. */
  proposedClaimId?: string;
  history: EvidenceHistoryEntry[];
}

export interface EvidenceLedger {
  sources: DiscoveredSource[];
  items: EvidenceItem[];
}

export function emptyLedger(): EvidenceLedger {
  return { sources: [], items: [] };
}
