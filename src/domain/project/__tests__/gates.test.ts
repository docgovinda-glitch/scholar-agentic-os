import { describe, it, expect } from "vitest";
import {
  GATE_ORDER,
  emptyGateState,
  entryPrerequisitesMet,
  initialProjectGateState,
  invalidateGate,
  isProjectComplete,
  isReadyToSignOff,
  nextOutstandingGate,
  signOffGate,
  updateExitCriteria,
  GateTransitionError,
  type ExitCriterion,
  type ProjectGateState,
} from "../gates";

function crit(id: string, satisfied: boolean, blocking = true): ExitCriterion {
  return { id, description: id, satisfied, blocking };
}

describe("domain/project/gates: initial state", () => {
  it("a fresh project has only G0 with its entry satisfied", () => {
    const project = initialProjectGateState("p1");
    expect(project.gates.G0.entrySatisfied).toBe(true);
    expect(project.gates.G0.status).toBe("in_progress");
    for (const gate of GATE_ORDER.slice(1)) {
      expect(project.gates[gate].entrySatisfied).toBe(false);
      expect(project.gates[gate].status).toBe("not_started");
    }
  });
});

describe("domain/project/gates: entry prerequisites", () => {
  it("G1 requires G0 signed off; G2 also requires only G0", () => {
    const project = initialProjectGateState("p1");
    expect(entryPrerequisitesMet(project, "G1")).toBe(false);
    expect(entryPrerequisitesMet(project, "G2")).toBe(false);
  });

  it("G3 requires BOTH G0 and G2 signed off (G1 not required — parallel sourcing)", () => {
    let project = initialProjectGateState("p1");
    project = updateExitCriteria(project, "G0", [crit("x", true)]);
    project = signOffGate(project, "G0", "user", "hash0");
    // G3 not ready yet: G2 not signed off
    expect(entryPrerequisitesMet(project, "G3")).toBe(false);

    project = updateExitCriteria(project, "G2", [crit("y", true)]);
    project = signOffGate(project, "G2", "user", "hash2");
    expect(entryPrerequisitesMet(project, "G3")).toBe(true);
  });

  it("G4 requires G1, G2, AND G3 all signed off — the strictest prerequisite in the workflow", () => {
    let project = initialProjectGateState("p1");
    project = updateExitCriteria(project, "G0", [crit("x", true)]);
    project = signOffGate(project, "G0", "user", "h");
    project = updateExitCriteria(project, "G2", [crit("y", true)]);
    project = signOffGate(project, "G2", "user", "h");
    expect(entryPrerequisitesMet(project, "G4")).toBe(false); // G1, G3 still missing
  });
});

describe("domain/project/gates: readiness and sign-off", () => {
  it("is not ready to sign off while a blocking criterion is unsatisfied", () => {
    const project = initialProjectGateState("p1");
    const withCriteria = updateExitCriteria(project, "G0", [crit("a", true), crit("b", false)]);
    expect(isReadyToSignOff(withCriteria.gates.G0)).toBe(false);
  });

  it("a non-blocking (advisory) unsatisfied criterion does not prevent sign-off", () => {
    const project = initialProjectGateState("p1");
    const withCriteria = updateExitCriteria(project, "G0", [crit("a", true), crit("b", false, false)]);
    expect(isReadyToSignOff(withCriteria.gates.G0)).toBe(true);
  });

  it("signOffGate throws if not ready", () => {
    const project = initialProjectGateState("p1");
    const withCriteria = updateExitCriteria(project, "G0", [crit("a", false)]);
    expect(() => signOffGate(withCriteria, "G0", "user", "hash")).toThrow(GateTransitionError);
  });

  it("signOffGate records actor, timestamp, and the state hash", () => {
    const project = initialProjectGateState("p1");
    const withCriteria = updateExitCriteria(project, "G0", [crit("a", true)]);
    const signed = signOffGate(withCriteria, "G0", "amara", "deadbeef", "2026-01-01T00:00:00Z");
    expect(signed.gates.G0.status).toBe("signed_off");
    expect(signed.gates.G0.signoff).toEqual({ actor: "amara", at: "2026-01-01T00:00:00Z", stateHash: "deadbeef" });
  });

  it("signing off a gate immediately unlocks entrySatisfied for a gate whose only prerequisite was this one", () => {
    let project = initialProjectGateState("p1");
    project = updateExitCriteria(project, "G0", [crit("a", true)]);
    project = signOffGate(project, "G0", "user", "h");
    expect(project.gates.G1.entrySatisfied).toBe(true);
    expect(project.gates.G1.status).toBe("ready");
    expect(project.gates.G2.entrySatisfied).toBe(true);
  });

  it("updateExitCriteria refuses to recompute criteria on an already-signed-off gate", () => {
    let project = initialProjectGateState("p1");
    project = updateExitCriteria(project, "G0", [crit("a", true)]);
    project = signOffGate(project, "G0", "user", "h");
    expect(() => updateExitCriteria(project, "G0", [crit("a", true)])).toThrow(GateTransitionError);
  });
});

describe("domain/project/gates: invalidation cascade", () => {
  function fullySignedProject(): ProjectGateState {
    let project = initialProjectGateState("p1");
    project = updateExitCriteria(project, "G0", [crit("a", true)]);
    project = signOffGate(project, "G0", "u", "h0");
    project = updateExitCriteria(project, "G1", [crit("a", true)]);
    project = signOffGate(project, "G1", "u", "h1");
    project = updateExitCriteria(project, "G2", [crit("a", true)]);
    project = signOffGate(project, "G2", "u", "h2");
    project = updateExitCriteria(project, "G3", [crit("a", true)]);
    project = signOffGate(project, "G3", "u", "h3");
    project = updateExitCriteria(project, "G4", [crit("a", true)]);
    project = signOffGate(project, "G4", "u", "h4");
    return project;
  }

  it("invalidating G1 cascades forward to every gate that depended on it, but not backward to G0", () => {
    const project = fullySignedProject();
    const invalidated = invalidateGate(project, "G1", "requirements changed");

    expect(invalidated.gates.G0.status).toBe("signed_off"); // untouched — backward is unaffected
    expect(invalidated.gates.G1.status).toBe("invalidated");
    expect(invalidated.gates.G4.status).toBe("invalidated"); // depends on G1 directly
  });

  it("an invalidated gate's sign-off is cleared, and the reason is recorded", () => {
    const project = fullySignedProject();
    const invalidated = invalidateGate(project, "G2", "a source was revoked");
    expect(invalidated.gates.G2.signoff).toBeUndefined();
    expect(invalidated.gates.G2.invalidatedBy).toContain("a source was revoked");
  });

  it("invalidating a leaf gate (no dependents) only affects that gate", () => {
    const project = fullySignedProject();
    const invalidated = invalidateGate(project, "G4", "draft edited");
    expect(invalidated.gates.G4.status).toBe("invalidated");
    expect(invalidated.gates.G3.status).toBe("signed_off");
  });
});

describe("domain/project/gates: project-level queries", () => {
  it("isProjectComplete is false until every gate through G7 is signed off", () => {
    const project = initialProjectGateState("p1");
    expect(isProjectComplete(project)).toBe(false);
  });

  it("nextOutstandingGate returns the first gate not yet signed off", () => {
    let project = initialProjectGateState("p1");
    expect(nextOutstandingGate(project)).toBe("G0");
    project = updateExitCriteria(project, "G0", [crit("a", true)]);
    project = signOffGate(project, "G0", "u", "h");
    expect(nextOutstandingGate(project)).toBe("G1");
  });
});
