import { describe, it, expect } from "vitest";
import {
  emptyGraph,
  addClaim,
  bindEvidence,
  removeSource,
  unsupportedClaims,
  claimsDependingOnSource,
  findConflicts,
  markClaimUnsupported,
  claimsNeedingResolution,
  ClaimGraphError,
} from "../graph";
import type { Claim, ClaimEvidenceBinding, ClaimEvidenceGraph, EvidenceSpan } from "../types";

function claim(id: string, text = id): Claim {
  return { id, text };
}

function span(sourceId: string, quote = "quote"): EvidenceSpan {
  return { sourceId, locator: { page: 1 }, quote };
}

function binding(
  id: string,
  claimId: string,
  strength: ClaimEvidenceBinding["strength"],
  evidence: EvidenceSpan[]
): ClaimEvidenceBinding {
  return { id, claimId, evidence, strength, rationale: "test" };
}

describe("domain/claim/graph: construction", () => {
  it("starts empty", () => {
    const graph = emptyGraph();
    expect(graph.claims).toHaveLength(0);
    expect(graph.bindings).toHaveLength(0);
  });

  it("addClaim refuses a duplicate id", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    expect(() => addClaim(graph, claim("c1"))).toThrow(ClaimGraphError);
  });

  it("bindEvidence refuses an unknown claim", () => {
    const graph = emptyGraph();
    expect(() => bindEvidence(graph, binding("b1", "no-such-claim", "strong", [span("s1")]))).toThrow(
      ClaimGraphError
    );
  });

  it("bindEvidence refuses a duplicate binding id", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    graph = bindEvidence(graph, binding("b1", "c1", "strong", [span("s1")]));
    expect(() => bindEvidence(graph, binding("b1", "c1", "weak", [span("s2")]))).toThrow(ClaimGraphError);
  });

  it("bindEvidence refuses a binding with zero evidence spans", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    expect(() => bindEvidence(graph, binding("b1", "c1", "strong", []))).toThrow(ClaimGraphError);
  });

  it("a valid bind succeeds and is queryable", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    graph = bindEvidence(graph, binding("b1", "c1", "strong", [span("s1")]));
    expect(graph.bindings).toHaveLength(1);
  });
});

describe("domain/claim/graph: unsupportedClaims", () => {
  it("a claim with no bindings is unsupported", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    expect(unsupportedClaims(graph).map((c) => c.id)).toEqual(["c1"]);
  });

  it("a claim with at least one binding is not unsupported, regardless of strength", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    graph = bindEvidence(graph, binding("b1", "c1", "weak", [span("s1")]));
    expect(unsupportedClaims(graph)).toHaveLength(0);
  });

  it("multiple claims: only the unbound ones are reported", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    graph = addClaim(graph, claim("c2"));
    graph = bindEvidence(graph, binding("b1", "c1", "strong", [span("s1")]));
    expect(unsupportedClaims(graph).map((c) => c.id)).toEqual(["c2"]);
  });
});

describe("domain/claim/graph: markClaimUnsupported", () => {
  it("throws for an unknown claim", () => {
    const graph = emptyGraph();
    expect(() => markClaimUnsupported(graph, "no-such-claim", "definitional statement", "u1")).toThrow(ClaimGraphError);
  });

  it("records the reason, marker, and a timestamp", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    graph = markClaimUnsupported(graph, "c1", "This is a definitional statement, not an empirical claim.", "u1");
    const marked = graph.claims.find((c) => c.id === "c1")!;
    expect(marked.explicitlyUnsupported?.reason).toBe("This is a definitional statement, not an empirical claim.");
    expect(marked.explicitlyUnsupported?.markedBy).toBe("u1");
    expect(typeof marked.explicitlyUnsupported?.at).toBe("string");
  });

  it("does not touch any other claim", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    graph = addClaim(graph, claim("c2"));
    graph = markClaimUnsupported(graph, "c1", "reason", "u1");
    expect(graph.claims.find((c) => c.id === "c2")!.explicitlyUnsupported).toBeUndefined();
  });

  it("a claim explicitly marked unsupported is STILL reported by unsupportedClaims — the compliance-grade check is not satisfied by this flag", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    graph = markClaimUnsupported(graph, "c1", "reason", "u1");
    expect(unsupportedClaims(graph).map((c) => c.id)).toEqual(["c1"]);
  });
});

describe("domain/claim/graph: claimsNeedingResolution (G4's looser draft-stage bar)", () => {
  it("an unbound, unmarked claim needs resolution", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    expect(claimsNeedingResolution(graph).map((c) => c.id)).toEqual(["c1"]);
  });

  it("a bound claim does not need resolution", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    graph = bindEvidence(graph, binding("b1", "c1", "strong", [span("s1")]));
    expect(claimsNeedingResolution(graph)).toHaveLength(0);
  });

  it("a claim explicitly marked unsupported does not need resolution, unlike unsupportedClaims' stricter check", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    graph = markClaimUnsupported(graph, "c1", "Definitional, needs no citation.", "u1");
    expect(claimsNeedingResolution(graph)).toHaveLength(0);
    expect(unsupportedClaims(graph)).toHaveLength(1); // the compliance-grade check still flags it
  });

  it("multiple claims: only the unresolved ones are reported", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    graph = addClaim(graph, claim("c2"));
    graph = addClaim(graph, claim("c3"));
    graph = bindEvidence(graph, binding("b1", "c1", "strong", [span("s1")]));
    graph = markClaimUnsupported(graph, "c2", "reason", "u1");
    expect(claimsNeedingResolution(graph).map((c) => c.id)).toEqual(["c3"]);
  });
});

describe("domain/claim/graph: claimsDependingOnSource", () => {
  it("finds claims whose evidence cites the given source", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    graph = addClaim(graph, claim("c2"));
    graph = bindEvidence(graph, binding("b1", "c1", "strong", [span("source-A")]));
    graph = bindEvidence(graph, binding("b2", "c2", "strong", [span("source-B")]));
    expect(claimsDependingOnSource(graph, "source-A").map((c) => c.id)).toEqual(["c1"]);
  });

  it("a claim bound to multiple sources is found for each", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    graph = bindEvidence(graph, binding("b1", "c1", "strong", [span("source-A"), span("source-B")]));
    expect(claimsDependingOnSource(graph, "source-A").map((c) => c.id)).toEqual(["c1"]);
    expect(claimsDependingOnSource(graph, "source-B").map((c) => c.id)).toEqual(["c1"]);
  });

  it("returns nothing for a source no claim depends on", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    graph = bindEvidence(graph, binding("b1", "c1", "strong", [span("source-A")]));
    expect(claimsDependingOnSource(graph, "source-Z")).toHaveLength(0);
  });
});

describe("domain/claim/graph: removeSource", () => {
  function graphWithTwoSourceBinding(): ClaimEvidenceGraph {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    graph = bindEvidence(graph, binding("b1", "c1", "strong", [span("source-A"), span("source-B")]));
    return graph;
  }

  it("dropping a source a binding solely relies on removes the binding entirely, leaving the claim unsupported", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    graph = bindEvidence(graph, binding("b1", "c1", "strong", [span("source-A")]));
    graph = removeSource(graph, "source-A");
    expect(graph.bindings).toHaveLength(0);
    expect(unsupportedClaims(graph).map((c) => c.id)).toEqual(["c1"]);
  });

  it("a binding citing multiple sources survives with the removed source's spans stripped", () => {
    let graph = graphWithTwoSourceBinding();
    graph = removeSource(graph, "source-A");
    expect(graph.bindings).toHaveLength(1);
    expect(graph.bindings[0].evidence.map((e) => e.sourceId)).toEqual(["source-B"]);
  });

  it("removing an unrelated source leaves the graph untouched", () => {
    let graph = graphWithTwoSourceBinding();
    graph = removeSource(graph, "source-Z");
    expect(graph.bindings[0].evidence).toHaveLength(2);
  });
});

describe("domain/claim/graph: findConflicts", () => {
  it("a claim with only supporting evidence has no conflict", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    graph = bindEvidence(graph, binding("b1", "c1", "strong", [span("s1")]));
    expect(findConflicts(graph)).toHaveLength(0);
  });

  it("a claim with only contradicting evidence has no conflict (nothing to disagree with)", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    graph = bindEvidence(graph, binding("b1", "c1", "contradicts", [span("s1")]));
    expect(findConflicts(graph)).toHaveLength(0);
  });

  it("a claim with both supporting and contradicting bindings is a conflict", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    graph = bindEvidence(graph, binding("b1", "c1", "moderate", [span("s1")]));
    graph = bindEvidence(graph, binding("b2", "c1", "contradicts", [span("s2")]));
    const conflicts = findConflicts(graph);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ claimId: "c1", bindingIds: ["b1", "b2"] });
  });

  it("conflicts on one claim do not affect another claim's unrelated bindings", () => {
    let graph = emptyGraph();
    graph = addClaim(graph, claim("c1"));
    graph = addClaim(graph, claim("c2"));
    graph = bindEvidence(graph, binding("b1", "c1", "strong", [span("s1")]));
    graph = bindEvidence(graph, binding("b2", "c1", "contradicts", [span("s2")]));
    graph = bindEvidence(graph, binding("b3", "c2", "strong", [span("s3")]));
    const conflicts = findConflicts(graph);
    expect(conflicts.map((c) => c.claimId)).toEqual(["c1"]);
  });
});
