import { describe, it, expect } from "vitest";
import { emptyLedger } from "../types";
import {
  discoverSource,
  extractEvidence,
  verifyEvidence,
  proposeEvidence,
  approveEvidence,
  rejectEvidence,
  confirmSourceCitation,
  EvidenceStateError,
} from "../stateMachine";
import type { DiscoveredSource } from "../types";

function source(id: string, citationStatus: "missing" | "needs_user_review" | "confirmed" = "confirmed"): DiscoveredSource {
  return {
    id,
    title: "A Test Paper",
    authors: ["A. Author"],
    url: "https://example.org/paper",
    sourceType: "scholarly",
    authorityTier: "B",
    discoveredVia: "arxiv",
    discoveredAt: new Date().toISOString(),
    citationStatus,
  };
}

describe("domain/evidence: discoverSource", () => {
  it("adds a source without creating any evidence item", () => {
    const ledger = discoverSource(emptyLedger(), source("s1"));
    expect(ledger.sources).toHaveLength(1);
    expect(ledger.items).toHaveLength(0);
  });

  it("refuses to discover the same source id twice", () => {
    const ledger = discoverSource(emptyLedger(), source("s1"));
    expect(() => discoverSource(ledger, source("s1"))).toThrow(EvidenceStateError);
  });
});

describe("domain/evidence: extractEvidence", () => {
  it("refuses to extract from a source that was never discovered", () => {
    expect(() => extractEvidence(emptyLedger(), { id: "e1", sourceId: "s1", quote: "text" })).toThrow(/discover it first|Unknown source/);
  });

  it("creates an item already in state 'extracted', with 'discovered' recorded in its history", () => {
    let ledger = discoverSource(emptyLedger(), source("s1"));
    ledger = extractEvidence(ledger, { id: "e1", sourceId: "s1", quote: "The cohort comprised 240 participants." });
    const item = ledger.items[0];
    expect(item.state).toBe("extracted");
    expect(item.history.map((h) => h.state)).toEqual(["discovered", "extracted"]);
  });

  it("refuses an empty quote — nothing was actually extracted", () => {
    const ledger = discoverSource(emptyLedger(), source("s1"));
    expect(() => extractEvidence(ledger, { id: "e1", sourceId: "s1", quote: "   " })).toThrow(EvidenceStateError);
  });
});

function extracted(id = "e1") {
  return extractEvidence(discoverSource(emptyLedger(), source("s1")), { id, sourceId: "s1", quote: "A valid quote." });
}

describe("domain/evidence: verifyEvidence", () => {
  it("moves an extracted item to verified", () => {
    const ledger = verifyEvidence(extracted(), "e1", "human-1");
    const item = ledger.items[0];
    expect(item.state).toBe("verified");
    expect(item.history.map((h) => h.state)).toEqual(["discovered", "extracted", "verified"]);
    expect(item.history.at(-1)!.by).toBe("human-1");
  });

  it("refuses to verify an item that hasn't been extracted first (this test uses one already past verified)", () => {
    const alreadyVerified = verifyEvidence(extracted(), "e1");
    expect(() => verifyEvidence(alreadyVerified, "e1")).toThrow(EvidenceStateError);
  });
});

function verified(id = "e1") {
  return verifyEvidence(extracted(id), id);
}

describe("domain/evidence: proposeEvidence", () => {
  it("moves a verified item to proposed and records the target claim", () => {
    const ledger = proposeEvidence(verified(), "e1", "claim-42", "agent-1");
    const item = ledger.items[0];
    expect(item.state).toBe("proposed");
    expect(item.proposedClaimId).toBe("claim-42");
    expect(item.history.map((h) => h.state)).toEqual(["discovered", "extracted", "verified", "proposed"]);
    expect(item.history.at(-1)!.by).toBe("agent-1");
  });

  it("refuses to propose an item still stuck at 'extracted'", () => {
    expect(() => proposeEvidence(extracted(), "e1", "claim-1")).toThrow(EvidenceStateError);
  });

  it("refuses a proposal with no target claim", () => {
    expect(() => proposeEvidence(verified(), "e1", "")).toThrow(EvidenceStateError);
  });
});

function proposed(id = "e1", sourceCitationStatus: "missing" | "needs_user_review" | "confirmed" = "confirmed") {
  const discovered = discoverSource(emptyLedger(), source("s1", sourceCitationStatus));
  const ex = extractEvidence(discovered, { id, sourceId: "s1", quote: "A valid quote." });
  const ver = verifyEvidence(ex, id);
  return proposeEvidence(ver, id, "claim-1", "ai");
}

describe("domain/evidence: approveEvidence & Citation Readiness Guard", () => {
  it("moves a proposed item straight to citable when source citation is confirmed", () => {
    const ledger = approveEvidence(proposed("e1", "confirmed"), "e1", "human-1");
    const item = ledger.items[0];
    expect(item.state).toBe("citable");
    expect(item.history.map((h) => h.state)).toEqual(["discovered", "extracted", "verified", "proposed", "user_approved", "citable"]);
    expect(item.history.at(-1)!.by).toBe("human-1");
  });

  it("moves proposed item to user_approved (NOT citable) when source citation is unconfirmed", () => {
    const ledger = approveEvidence(proposed("e1", "missing"), "e1", "human-1");
    const item = ledger.items[0];
    expect(item.state).toBe("user_approved");
    expect(item.history.map((h) => h.state)).toEqual(["discovered", "extracted", "verified", "proposed", "user_approved"]);
  });

  it("promotes user_approved items to citable when source citation is confirmed later", () => {
    const ledgerUnconfirmed = approveEvidence(proposed("e1", "needs_user_review"), "e1", "human-1");
    expect(ledgerUnconfirmed.items[0].state).toBe("user_approved");

    const ledgerConfirmed = confirmSourceCitation(ledgerUnconfirmed, "s1", undefined, "human-1");
    expect(ledgerConfirmed.sources[0].citationStatus).toBe("confirmed");
    expect(ledgerConfirmed.items[0].state).toBe("citable");
  });

  it("refuses approval with no actor — an unattributed approval is not a real one", () => {
    expect(() => approveEvidence(proposed(), "e1", "")).toThrow(EvidenceStateError);
  });

  it("refuses to approve an item that was never proposed", () => {
    expect(() => approveEvidence(verified(), "e1", "human-1")).toThrow(EvidenceStateError);
  });
});

describe("domain/evidence: rejectEvidence", () => {
  it("returns a proposed item to verified, clearing the proposed claim, so it can be re-proposed", () => {
    const ledger = rejectEvidence(proposed(), "e1", "human-1", "Doesn't actually support this claim.");
    const item = ledger.items[0];
    expect(item.state).toBe("verified");
    expect(item.proposedClaimId).toBeUndefined();
  });

  it("refuses a rejection with no reason", () => {
    expect(() => rejectEvidence(proposed(), "e1", "human-1", "")).toThrow(EvidenceStateError);
  });

  it("refuses to reject an item that was never proposed", () => {
    expect(() => rejectEvidence(verified(), "e1", "human-1", "reason")).toThrow(EvidenceStateError);
  });
});
