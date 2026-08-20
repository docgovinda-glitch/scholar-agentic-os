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

export function updateClaim(graph: ClaimEvidenceGraph, claimId: string, updates: Partial<Omit<Claim, "id">>): ClaimEvidenceGraph {
  if (!graph.claims.some((c) => c.id === claimId)) {
    throw new ClaimGraphError(`Claim "${claimId}" does not exist in the graph.`);
  }
  return {
    ...graph,
    claims: graph.claims.map((c) => (c.id === claimId ? { ...c, ...updates } : c)),
  };
}

export function updateBinding(graph: ClaimEvidenceGraph, bindingId: string, updates: Partial<Omit<ClaimEvidenceBinding, "id">>): ClaimEvidenceGraph {
  if (!graph.bindings.some((b) => b.id === bindingId)) {
    throw new ClaimGraphError(`Binding "${bindingId}" does not exist in the graph.`);
  }
  return {
    ...graph,
    bindings: graph.bindings.map((b) => (b.id === bindingId ? { ...b, ...updates } : b)),
  };
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

/**
 * Mark a claim as explicitly, deliberately unsupported (docs 30 §3 G4
 * "Exit"'s "or explicitly marked unsupported" escape hatch) — e.g. a
 * definitional statement the author has decided needs no citation. Throws
 * if the claim doesn't exist. Does not clear any existing binding; a claim
 * can carry both a binding and this flag (the flag is simply moot once
 * bound, same as a Rubric waiver being moot once its rule passes).
 */
export function markClaimUnsupported(graph: ClaimEvidenceGraph, claimId: string, reason: string, markedBy: string): ClaimEvidenceGraph {
  if (!graph.claims.some((c) => c.id === claimId)) {
    throw new ClaimGraphError(`Cannot mark unknown claim "${claimId}" as explicitly unsupported.`);
  }
  const at = new Date().toISOString();
  return {
    ...graph,
    claims: graph.claims.map((c) => (c.id === claimId ? { ...c, explicitlyUnsupported: { reason, markedBy, at } } : c)),
  };
}

/**
 * Claims with zero bindings — AG-13's `unsupported` output. This is the
 * COMPLIANCE-grade check (domain/compliance's claim_support evaluator uses
 * it directly): a claim explicitly marked unsupported (see
 * markClaimUnsupported) still counts as unsupported here, on purpose — a
 * blocking journal-quality gate is not something an author's own
 * draft-stage acknowledgement can satisfy. See claimsNeedingResolution
 * below for G4's genuinely looser draft-stage bar.
 */
export function unsupportedClaims(graph: ClaimEvidenceGraph): Claim[] {
  const boundClaimIds = new Set(graph.bindings.map((b) => b.claimId));
  return graph.claims.filter((c) => !boundClaimIds.has(c.id));
}

/**
 * Claims neither bound NOR explicitly marked unsupported — docs 30 §3 G4
 * "Exit": "every claim bound or explicitly marked unsupported", a looser
 * bar than unsupportedClaims() above on purpose (see that function's own
 * comment for why the two must not be conflated).
 */
export function claimsNeedingResolution(graph: ClaimEvidenceGraph): Claim[] {
  const boundClaimIds = new Set(graph.bindings.map((b) => b.claimId));
  return graph.claims.filter((c) => !boundClaimIds.has(c.id) && !c.explicitlyUnsupported);
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
