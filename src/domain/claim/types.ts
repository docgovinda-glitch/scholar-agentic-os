/**
 * The Claim–Evidence Graph's data model.
 *
 * Spec: docs/00-foundation/02-GLOSSARY.md ("Claim", "Claim–Evidence
 * Binding", "Evidence Span"), docs/04-architecture/42-MULTI-AGENT-
 * ARCHITECTURE.md §2 (AG-13's manifest — the graph is what that agent
 * reads and writes).
 *
 * SCOPE: this is the pure graph — types, construction, and queries.
 * AG-13's claim *extraction* (finding claims in draft text and proposing
 * bindings) is a model-backed agent that needs app/mesh, which is not
 * built yet (docs 13 §8.3) — see app/claim's absence in that table. This
 * module is what an extraction agent would read from and write to once it
 * exists; nothing here assumes a particular extraction mechanism.
 */

/** A specific, locatable region of an approved source (glossary: "Evidence Span"). */
export interface EvidenceSpan {
  sourceId: string;
  locator: {
    page?: number;
    paragraph?: number;
    startOffset?: number;
    endOffset?: number;
  };
  /** The exact text at that locator — AG-13's "no binding invents a page or locator" QA checkpoint depends on this being a real quote, not a paraphrase. */
  quote: string;
}

/** An assertion in a draft that requires evidentiary support (glossary: "Claim"). */
export interface Claim {
  id: string;
  text: string;
  /** Where in the draft this claim appears, if it has been placed yet. */
  draftSpanId?: string;
  /**
   * Set when a human has explicitly acknowledged this claim has no
   * evidence binding and that is intentional — docs
   * 30-ACADEMIC-WORKFLOW-ARCHITECTURE.md G4 "Exit": "every claim bound or
   * explicitly marked unsupported". This is a DRAFT-STAGE bar only: the
   * compliance Rubric's claim_support evaluator (domain/compliance) still
   * treats such a claim as unsupported — see graph.ts's
   * `claimsNeedingResolution` vs `unsupportedClaims` doc comments for why
   * the two intentionally diverge.
   */
  explicitlyUnsupported?: { reason: string; markedBy: string; at: string };
}

/**
 * How strongly a piece of evidence supports (or contradicts) a claim.
 * AG-13's manifest: "classify the strength of that support."
 */
export type SupportStrength = "strong" | "moderate" | "weak" | "contradicts";

/** The typed link from a Claim to one or more Evidence Spans (glossary: "Claim–Evidence Binding"). */
export interface ClaimEvidenceBinding {
  id: string;
  claimId: string;
  evidence: EvidenceSpan[];
  strength: SupportStrength;
  rationale: string;
}

/**
 * Two or more bindings on the same claim that disagree — at least one
 * supports (`strong`/`moderate`/`weak`) and at least one contradicts.
 * AG-13's manifest: "conflicts surfaced, not resolved unilaterally" — this
 * type exists to be shown to a human, never auto-resolved.
 */
export interface EvidenceConflict {
  claimId: string;
  bindingIds: string[];
  description: string;
}

export interface ClaimEvidenceGraph {
  claims: Claim[];
  bindings: ClaimEvidenceBinding[];
}
