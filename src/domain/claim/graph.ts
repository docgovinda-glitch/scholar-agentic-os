/**
 * Pure operations over the Claim–Evidence Graph. See types.ts for the
 * scope note on what this module does and does not cover.
 */

import type { Claim, ClaimEvidenceBinding, ClaimEvidenceGraph, EvidenceConflict } from "./types";

export function emptyGraph(): ClaimEvidenceGraph {
  return { claims: [], bindings: [] };
}

export class ClaimGraphError extends Error {}

/** Add a claim. Throws if its id is already used — claims are add-once, not upserted. */
export function addClaim(graph: ClaimEvidenceGraph, claim: Claim): ClaimEvidenceGraph {
  if (graph.claims.some((c) => c.id === claim.id)) {
    throw new ClaimGraphError(`Claim "${claim.id}" already exists in the graph.`);
  }
  return { ...graph, claims: [...graph.claims, claim] };
}

/**
 * Bind evidence to a claim. Throws if the claim doesn't exist, the
 * binding id is already used, or the binding has no evidence — a binding
 * asserting support (or contradiction) without a single evidence span is
 * exactly the "invents a locator" failure AG-13's QA checkpoints forbid.
 */
export function bindEvidence(graph: ClaimEvidenceGraph, binding: ClaimEvidenceBinding): ClaimEvidenceGraph {
  if (!graph.claims.some((c) => c.id === binding.claimId)) {
    throw new ClaimGraphError(`Cannot bind evidence to unknown claim "${binding.claimId}".`);
  }
  if (graph.bindings.some((b) => b.id === binding.id)) {
    throw new ClaimGraphError(`Binding "${binding.id}" already exists in the graph.`);
  }
  if (binding.evidence.length === 0) {
    throw new ClaimGraphError(`Binding "${binding.id}" has no evidence spans.`);
  }
  return { ...graph, bindings: [...graph.bindings, binding] };
}

/**
 * Remove a source from the graph: every binding loses any evidence spans
 * pointing at it, and any binding left with zero evidence is dropped
 * entirely (a binding can never exist with no evidence — see
 * bindEvidence). Mirrors the real workflow event of a source being
 * un-approved or retracted after claims were already bound to it.
 */
export function removeSource(graph: ClaimEvidenceGraph, sourceId: string): ClaimEvidenceGraph {
  const bindings = graph.bindings
    .map((b) => ({ ...b, evidence: b.evidence.filter((e) => e.sourceId !== sourceId) }))
    .filter((b) => b.evidence.length > 0);
  return { ...graph, bindings };
}

/** Claims with zero bindings — AG-13's `unsupported` output. */
export function unsupportedClaims(graph: ClaimEvidenceGraph): Claim[] {
  const boundClaimIds = new Set(graph.bindings.map((b) => b.claimId));
  return graph.claims.filter((c) => !boundClaimIds.has(c.id));
}

/** Every claim that has at least one binding citing evidence from `sourceId` — "which claims depend on source X" (docs 13). */
export function claimsDependingOnSource(graph: ClaimEvidenceGraph, sourceId: string): Claim[] {
  const claimIds = new Set(
    graph.bindings.filter((b) => b.evidence.some((e) => e.sourceId === sourceId)).map((b) => b.claimId)
  );
  return graph.claims.filter((c) => claimIds.has(c.id));
}

const SUPPORTING: ReadonlySet<string> = new Set(["strong", "moderate", "weak"]);

/**
 * Claims with both a supporting and a contradicting binding — surfaced for
 * a human to resolve, never auto-resolved (AG-13's QA checkpoint).
 */
export function findConflicts(graph: ClaimEvidenceGraph): EvidenceConflict[] {
  const conflicts: EvidenceConflict[] = [];
  for (const claim of graph.claims) {
    const claimBindings = graph.bindings.filter((b) => b.claimId === claim.id);
    const hasSupport = claimBindings.some((b) => SUPPORTING.has(b.strength));
    const hasContradiction = claimBindings.some((b) => b.strength === "contradicts");
    if (hasSupport && hasContradiction) {
      conflicts.push({
        claimId: claim.id,
        bindingIds: claimBindings.map((b) => b.id),
        description: `Claim "${claim.id}" has both supporting and contradicting evidence.`,
      });
    }
  }
  return conflicts;
}
