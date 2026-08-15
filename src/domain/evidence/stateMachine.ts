/**
 * Pure transitions over the Evidence Ledger. See types.ts for the state
 * machine's shape and the reasoning behind it.
 */

import type { DiscoveredSource, EvidenceItem, EvidenceLedger, EvidenceLocator, EvidenceState } from "./types";

export class EvidenceStateError extends Error {}

function getSource(ledger: EvidenceLedger, sourceId: string): DiscoveredSource {
  const source = ledger.sources.find((s) => s.id === sourceId);
  if (!source) throw new EvidenceStateError(`Unknown source "${sourceId}" — discover it before extracting evidence from it.`);
  return source;
}

function getItem(ledger: EvidenceLedger, evidenceId: string): EvidenceItem {
  const item = ledger.items.find((i) => i.id === evidenceId);
  if (!item) throw new EvidenceStateError(`Unknown evidence item "${evidenceId}".`);
  return item;
}

function replaceItem(ledger: EvidenceLedger, item: EvidenceItem): EvidenceLedger {
  return { ...ledger, items: ledger.items.map((i) => (i.id === item.id ? item : i)) };
}

function requireState(item: EvidenceItem, expected: EvidenceState): void {
  if (item.state !== expected) {
    throw new EvidenceStateError(`Evidence "${item.id}" is "${item.state}", not "${expected}" — cannot transition.`);
  }
}

/** Add a newly-found source to the ledger. Discovery is cheap and automatic — this alone never creates an EvidenceItem or claims anything is usable yet. */
export function discoverSource(ledger: EvidenceLedger, source: DiscoveredSource): EvidenceLedger {
  if (ledger.sources.some((s) => s.id === source.id)) {
    throw new EvidenceStateError(`Source "${source.id}" is already in the ledger.`);
  }
  return { ...ledger, sources: [...ledger.sources, source] };
}

/**
 * Pull a specific, located quote from an already-discovered source, creating
 * a new EvidenceItem. Its history is seeded with "discovered" (inherited
 * from the source's own discoveredAt) followed immediately by "extracted" —
 * the state a caller can only reach by actually supplying the quote, never
 * by asserting it exists.
 */
export function extractEvidence(
  ledger: EvidenceLedger,
  input: { id: string; sourceId: string; quote: string; locator?: EvidenceLocator }
): EvidenceLedger {
  const source = getSource(ledger, input.sourceId);
  if (ledger.items.some((i) => i.id === input.id)) {
    throw new EvidenceStateError(`Evidence "${input.id}" already exists.`);
  }
  if (!input.quote.trim()) {
    throw new EvidenceStateError(`Evidence "${input.id}" has no quote — nothing was actually extracted.`);
  }
  const now = new Date().toISOString();
  const item: EvidenceItem = {
    id: input.id,
    sourceId: input.sourceId,
    state: "extracted",
    quote: input.quote,
    locator: input.locator,
    history: [
      { state: "discovered", at: source.discoveredAt },
      { state: "extracted", at: now },
    ],
  };
  return { ...ledger, items: [...ledger.items, item] };
}

/** Attest that the quote has been checked against the actual source. */
export function verifyEvidence(ledger: EvidenceLedger, evidenceId: string, actor?: string): EvidenceLedger {
  const item = getItem(ledger, evidenceId);
  requireState(item, "extracted");
  const updated: EvidenceItem = {
    ...item,
    state: "verified",
    history: [...item.history, { state: "verified", at: new Date().toISOString(), by: actor }],
  };
  return replaceItem(ledger, updated);
}

/** Propose binding this evidence to a specific claim — AI or a human may propose; neither can approve their own proposal via this function alone (see approveEvidence). */
export function proposeEvidence(ledger: EvidenceLedger, evidenceId: string, claimId: string, actor?: string): EvidenceLedger {
  const item = getItem(ledger, evidenceId);
  requireState(item, "verified");
  if (!claimId) throw new EvidenceStateError("A proposal requires a target claim id.");
  const updated: EvidenceItem = {
    ...item,
    state: "proposed",
    proposedClaimId: claimId,
    history: [...item.history, { state: "proposed", at: new Date().toISOString(), by: actor }],
  };
  return replaceItem(ledger, updated);
}

/**
 * The ONLY function in this module that can produce state "citable" — the
 * structural enforcement of "no user approval, no citation". `actor` is
 * required, not optional: an approval with no recorded approver is not a
 * real approval. Callers (server/routes/project.ts) pair this with the
 * existing domain/claim graph's bindEvidence() in the same request, so
 * "citable" and "actually bound into the graph the compliance rubric and
 * citation engine read from" happen atomically from the user's perspective.
 */
export function approveEvidence(ledger: EvidenceLedger, evidenceId: string, actor: string): EvidenceLedger {
  if (!actor) throw new EvidenceStateError("Approval requires an actor.");
  const item = getItem(ledger, evidenceId);
  requireState(item, "proposed");
  const now = new Date().toISOString();
  const updated: EvidenceItem = {
    ...item,
    state: "citable",
    history: [
      ...item.history,
      { state: "user_approved", at: now, by: actor },
      { state: "citable", at: now, by: actor },
    ],
  };
  return replaceItem(ledger, updated);
}

/**
 * A proposal a human looked at and declined — returns the item to
 * "verified" rather than dead-ending it, since a rejected proposal means
 * "not this claim", not "this source is worthless"; it can be re-proposed
 * against a different claim.
 */
export function rejectEvidence(ledger: EvidenceLedger, evidenceId: string, actor: string, reason: string): EvidenceLedger {
  if (!reason.trim()) throw new EvidenceStateError("Rejecting a proposal requires a reason.");
  const item = getItem(ledger, evidenceId);
  requireState(item, "proposed");
  const updated: EvidenceItem = {
    ...item,
    state: "verified",
    proposedClaimId: undefined,
    history: [...item.history, { state: "verified", at: new Date().toISOString(), by: actor }],
  };
  return replaceItem(ledger, updated);
}
