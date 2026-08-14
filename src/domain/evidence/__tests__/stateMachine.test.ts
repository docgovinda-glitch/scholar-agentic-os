import { describe, it, expect } from "vitest";
import { emptyLedger } from "../types";
import {
  discoverSource,
  extractEvidence,
  verifyEvidence,
  proposeEvidence,
  approveEvidence,
  rejectEvidence,
  EvidenceStateError,
} from "../stateMachine";
import type { DiscoveredSource } from "../types";

function source(id: string): DiscoveredSource {
  return {
    id,
    title: "A Test Paper",
    authors: ["A. Author"],
    url: "https://example.org/paper",
    sourceType: "scholarly",
    authorityTier: "B",
    discoveredVia: "arxiv",
    discoveredAt: new Date().toISOString(),
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
  let ledger = discoverSource(emptyLedger(), source("s1"));
  ledger = extractEvidence(ledger, { id, sourceId: "s1", quote: "The cohort comprised 240 participants." });
  return ledger;
}

describe("domain/evidence: verifyEvidence", () => {
  it("moves an extracted item to verified", () => {
    const ledger = verifyEvidence(extracted(), "e1", "u1");
    expect(ledger.items[0].state).toBe("verified");
  });

  it("refuses to verify an item that hasn't been extracted first (this test uses one already past verified)", () => {
    let ledger = verifyEvidence(extracted(), "e1", "u1");
    expect(() => verifyEvidence(ledger, "e1", "u1")).toThrow(EvidenceStateError);
  });
});

function verified(id = "e1") {
  return verifyEvidence(extracted(id), id, "u1");
}

describe("domain/evidence: proposeEvidence", () => {
  it("moves a verified item to proposed and records the target claim", () => {
    const ledger = proposeEvidence(verified(), "e1", "claim-1", "ai");
    expect(ledger.items[0].state).toBe("proposed");
    expect(ledger.items[0].proposedClaimId).toBe("claim-1");
  });

  it("refuses to propose an item still stuck at 'extracted'", () => {
    expect(() => proposeEvidence(extracted(), "e1", "claim-1")).toThrow(EvidenceStateError);
  });

  it("refuses a proposal with no target claim", () => {
    expect(() => proposeEvidence(verified(), "e1", "")).toThrow(EvidenceStateError);
  });
});

function proposed(id = "e1") {
  return proposeEvidence(verified(id), id, "claim-1", "ai");
}

describe("domain/evidence: approveEvidence — the only path to 'citable'", () => {
  it("moves a proposed item straight to citable, recording user_approved in its history", () => {
    const ledger = approveEvidence(proposed(), "e1", "human-1");
    const item = ledger.items[0];
    expect(item.state).toBe("citable");
    expect(item.history.map((h) => h.state)).toEqual(["discovered", "extracted", "verified", "proposed", "user_approved", "citable"]);
    expect(item.history.at(-1)!.by).toBe("human-1");
  });

  it("refuses approval with no actor — an unattributed approval is not a real one", () => {
    expect(() => approveEvidence(proposed(), "e1", "")).toThrow(EvidenceStateError);
  });

  it("refuses to approve an item that was never proposed", () => {
    expect(() => approveEvidence(verified(), "e1", "human-1")).toThrow(EvidenceStateError);
  });

  it("no other function in this module can ever produce state 'citable'", () => {
    const discovered = discoverSource(emptyLedger(), source("s1"));
    const ex = extractEvidence(discovered, { id: "e1", sourceId: "s1", quote: "q" });
    const ver = verifyEvidence(ex, "e1");
    const prop = proposeEvidence(ver, "e1", "claim-1");
    for (const ledger of [discovered, ex, ver, prop]) {
      const item = ledger.items[0];
      if (item) expect(item.state).not.toBe("citable");
    }
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
