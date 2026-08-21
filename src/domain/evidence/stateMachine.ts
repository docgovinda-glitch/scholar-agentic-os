/**
 * Pure transitions over the Evidence Ledger. See types.ts for the state
 * machine's shape and the reasoning behind it.
 */

import type { DiscoveredSource, EvidenceItem, EvidenceLedger, EvidenceLocator, EvidenceState } from "./types";

import { validateCitationCompleteness } from "../../citation_compliance/validation";

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
 * The ONLY function in this module that can approve evidence bindings.
 * If the parent source citation is "confirmed", the item transitions to "citable".
 * If the parent source citation is unconfirmed ("missing" or "needs_user_review"),
 * the item transitions to "user_approved", requiring citation confirmation before
 * it can be cited in a manuscript.
 */
export function approveEvidence(ledger: EvidenceLedger, evidenceId: string, actor: string): EvidenceLedger {
  if (!actor) throw new EvidenceStateError("Approval requires an actor.");
  const item = getItem(ledger, evidenceId);
  requireState(item, "proposed");
  const source = getSource(ledger, item.sourceId);
  const now = new Date().toISOString();

  const isCitable = source.citationStatus === "confirmed";
  const nextState: EvidenceState = isCitable ? "citable" : "user_approved";

  const updated: EvidenceItem = {
    ...item,
    state: nextState,
    history: [
      ...item.history,
      { state: "user_approved", at: now, by: actor },
      ...(isCitable ? [{ state: "citable" as EvidenceState, at: now, by: actor }] : []),
    ],
  };
  return replaceItem(ledger, updated);
}

/**
 * Confirms canonical citation metadata on a source and promotes any
 * "user_approved" evidence items for that source to "citable".
 */
export function confirmSourceCitation(
  ledger: EvidenceLedger,
  sourceId: string,
  canonicalReference?: any,
  actor?: string
): EvidenceLedger {
  const source = getSource(ledger, sourceId);
  const updatedCanonical = canonicalReference || source.canonicalReference;

  if (!updatedCanonical) {
    throw new EvidenceStateError("Cannot confirm citation without a canonical reference.");
  }
  
  // Enforce validation before confirming
  const validation = validateCitationCompleteness(updatedCanonical);
  if (!validation.isValid) {
    throw new EvidenceStateError(`Cannot confirm citation: missing ${validation.missingFields.join(", ")}`);
  }

  const updatedSource: DiscoveredSource = {
    ...source,
    citationStatus: "confirmed",
    canonicalReference: updatedCanonical,
  };

  const now = new Date().toISOString();
  const updatedSources = ledger.sources.map((s) => (s.id === sourceId ? updatedSource : s));
  const updatedItems = ledger.items.map((item) => {
    if (item.sourceId === sourceId && item.state === "user_approved") {
      return {
        ...item,
        state: "citable" as EvidenceState,
        history: [
          ...item.history,
          { state: "citable" as EvidenceState, at: now, by: actor },
        ],
      };
    }
    return item;
  });

  return { sources: updatedSources, items: updatedItems };
}

/**
 * Revokes confirmed citation status and demotes any "citable" evidence
 * items back to "user_approved". Must be called if a confirmed citation
 * is edited or deleted.
 */
export function revokeSourceCitation(
  ledger: EvidenceLedger,
  sourceId: string,
  actor?: string
): EvidenceLedger {
  const source = getSource(ledger, sourceId);
  const updatedSource: DiscoveredSource = {
    ...source,
    citationStatus: "needs_user_review", // editing or revoking drops it to review status
  };

  const now = new Date().toISOString();
  const updatedSources = ledger.sources.map((s) => (s.id === sourceId ? updatedSource : s));
  const updatedItems = ledger.items.map((item) => {
    // If the source is no longer confirmed, its evidence can't be citable
    if (item.sourceId === sourceId && item.state === "citable") {
      return {
        ...item,
        state: "user_approved" as EvidenceState,
        history: [
          ...item.history,
          { state: "user_approved" as EvidenceState, at: now, by: actor },
        ],
      };
    }
    return item;
  });

  return { sources: updatedSources, items: updatedItems };
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
