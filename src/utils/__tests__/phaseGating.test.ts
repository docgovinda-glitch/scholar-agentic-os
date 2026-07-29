import { describe, it, expect } from "vitest";
import { canEnterPhase, resolveFurthestPhase } from "../phaseGating";
import { WORKFLOW_PHASES } from "../../types";

describe("canEnterPhase — honest invalid-transition guard for the phase workflow", () => {
  it("always allows entering the current phase", () => {
    expect(canEnterPhase(WORKFLOW_PHASES, "C", "C", "C").allowed).toBe(true);
  });

  it("allows entering any already-reached phase (revisiting history)", () => {
    const result = canEnterPhase(WORKFLOW_PHASES, "F", "F", "B");
    expect(result.allowed).toBe(true);
  });

  it("allows entering the single next phase after the furthest reached", () => {
    const result = canEnterPhase(WORKFLOW_PHASES, "C", "C", "D");
    expect(result.allowed).toBe(true);
  });

  it("blocks jumping more than one phase past the furthest reached, with an honest reason naming the phase to complete first", () => {
    const result = canEnterPhase(WORKFLOW_PHASES, "B", "B", "F");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/data discovery/i);
  });

  it("uses furthestPhase, not currentPhase, as the ceiling when a user has navigated back", () => {
    // Currently viewing phase B (navigated back), but the project has
    // genuinely reached F before — B -> G should still be allowed, using
    // furthestPhase's position (F, so furthest+1 = G), not pretending
    // currentPhase=B means only B+1 is ever reachable.
    const result = canEnterPhase(WORKFLOW_PHASES, "B", "F", "G");
    expect(result.allowed).toBe(true);
  });

  it("blocks entering a phase beyond furthestPhase+1 even from a lower currentPhase", () => {
    const result = canEnterPhase(WORKFLOW_PHASES, "A", "C", "F");
    expect(result.allowed).toBe(false);
  });
});

describe("resolveFurthestPhase — safe default for projects/fixtures without a stored furthestPhase", () => {
  it("returns the stored furthestPhase when present", () => {
    expect(resolveFurthestPhase({ currentPhase: "B", furthestPhase: "F" } as any)).toBe("F");
  });

  it("falls back to currentPhase when furthestPhase is missing (existing projects, old fixtures)", () => {
    expect(resolveFurthestPhase({ currentPhase: "D" } as any)).toBe("D");
  });
});
