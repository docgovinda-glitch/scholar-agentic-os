/**
 * The gate state machine — pure types and transitions.
 *
 * Spec: docs/03-workflow/30-ACADEMIC-WORKFLOW-ARCHITECTURE.md §2-3.
 *
 * SCOPE, STATED HONESTLY: this implements the whole-document gate model in
 * full. Per-chapter independent gating for the `long_form_chaptered`
 * workflow variant (§3's "For long_form_chaptered, G3 runs per chapter
 * after a whole-document skeleton is agreed") is NOT implemented — this
 * module tracks one gate state per project, not per chapter. That is a
 * genuinely larger feature (parallel gate-state instances with G6/G7
 * remaining whole-document) and is the next extension, not a redesign, when
 * a client exists to drive it. See src/app/conductor/conductor.ts's module
 * comment for the tracked gap.
 */

export type GateId = "G0" | "G1" | "G2" | "G3" | "G4" | "G5" | "G6" | "G7";

export const GATE_ORDER: GateId[] = ["G0", "G1", "G2", "G3", "G4", "G5", "G6", "G7"];

export const GATE_NAMES: Record<GateId, string> = {
  G0: "Intake",
  G1: "Requirements",
  G2: "Sources",
  G3: "Structure",
  G4: "Draft",
  G5: "Review",
  G6: "Compliance",
  G7: "Export",
};

/**
 * Per-gate entry prerequisites (docs 30 §3, each gate's "Entry" row). `G2`
 * is deliberately looser than G1/G3 — it may start as soon as G0 is signed
 * off, in parallel with G1 (docs: "G1 not required — sourcing can proceed
 * in parallel").
 */
export const GATE_ENTRY_REQUIRES: Record<GateId, GateId[]> = {
  G0: [],
  G1: ["G0"],
  G2: ["G0"],
  G3: ["G0", "G2"],
  G4: ["G1", "G2", "G3"],
  G5: ["G4"],
  G6: ["G5"],
  G7: ["G6"],
};

export type GateStatus = "not_started" | "in_progress" | "ready" | "signed_off" | "invalidated";

export interface ExitCriterion {
  id: string;
  description: string;
  satisfied: boolean;
  /** A blocking criterion must be satisfied to sign off; a non-blocking one is advisory. */
  blocking: boolean;
}

export interface GateSignoff {
  actor: string;
  at: string;
  /** What exactly was approved — docs §2.2: "so the system can detect when the approved thing has changed underneath the sign-off." */
  stateHash: string;
}

export interface GateState {
  gate: GateId;
  status: GateStatus;
  entrySatisfied: boolean;
  exitCriteria: ExitCriterion[];
  signoff?: GateSignoff;
  /** Reasons this gate was invalidated, most recent last. Docs §2.1: "Returning invalidates downstream." */
  invalidatedBy: string[];
}

export interface ProjectGateState {
  projectId: string;
  gates: Record<GateId, GateState>;
}

export function emptyGateState(gate: GateId, entrySatisfied = false): GateState {
  return {
    gate,
    status: entrySatisfied ? "in_progress" : "not_started",
    entrySatisfied,
    exitCriteria: [],
    invalidatedBy: [],
  };
}

/** A fresh project: only G0 has its entry satisfied (a project always starts there). */
export function initialProjectGateState(projectId: string): ProjectGateState {
  const gates = {} as Record<GateId, GateState>;
  for (const gate of GATE_ORDER) {
    gates[gate] = emptyGateState(gate, gate === "G0");
  }
  return { projectId, gates };
}

/** Whether every predecessor this gate requires is currently signed off. */
export function entryPrerequisitesMet(project: ProjectGateState, gate: GateId): boolean {
  return GATE_ENTRY_REQUIRES[gate].every((req) => project.gates[req].status === "signed_off");
}

/** Whether every blocking exit criterion is satisfied — the condition for being ready to sign off. */
export function isReadyToSignOff(state: GateState): boolean {
  return state.entrySatisfied && state.exitCriteria.filter((c) => c.blocking).every((c) => c.satisfied);
}

export class GateTransitionError extends Error {}

/**
 * Set a gate's exit criteria (typically recomputed from the module that
 * owns the underlying check — Atlas for G0, the Rubric for G6, etc.) and
 * update status accordingly. Does not sign off; that is a separate,
 * explicit human action (`signOffGate`).
 */
export function updateExitCriteria(project: ProjectGateState, gate: GateId, criteria: ExitCriterion[]): ProjectGateState {
  const current = project.gates[gate];
  if (current.status === "signed_off") {
    // Content changed under a signed-off gate — this is exactly the case
    // §2.1 calls "invalidates downstream." The caller should invalidate
    // first (see invalidateGate) before recomputing criteria; recomputing
    // in place here would silently discard the "this used to be approved"
    // signal, so we refuse.
    throw new GateTransitionError(
      `Gate ${gate} is signed off — invalidate it before recomputing exit criteria, so the invalidation is recorded.`
    );
  }
  const entrySatisfied = entryPrerequisitesMet(project, gate);
  const ready = entrySatisfied && criteria.filter((c) => c.blocking).every((c) => c.satisfied);
  const nextState: GateState = {
    ...current,
    entrySatisfied,
    exitCriteria: criteria,
    status: ready ? "ready" : entrySatisfied ? "in_progress" : "not_started",
  };
  return { ...project, gates: { ...project.gates, [gate]: nextState } };
}

/**
 * Sign off a gate. Throws if not ready (docs §2.1: "Forward requires
 * sign-off... No gate advances without a recorded human decision").
 * `stateHash` is supplied by the caller — see conductor.ts's
 * computeStateHash, kept out of this pure module because it uses the Web
 * Crypto API (async).
 */
export function signOffGate(project: ProjectGateState, gate: GateId, actor: string, stateHash: string, at: string = new Date().toISOString()): ProjectGateState {
  const state = project.gates[gate];
  if (!isReadyToSignOff(state)) {
    throw new GateTransitionError(
      `Gate ${gate} is not ready to sign off: ${state.exitCriteria.filter((c) => c.blocking && !c.satisfied).map((c) => c.id).join(", ") || "entry prerequisites unmet"}.`
    );
  }
  const nextState: GateState = {
    ...state,
    status: "signed_off",
    signoff: { actor, at, stateHash },
  };
  let next: ProjectGateState = { ...project, gates: { ...project.gates, [gate]: nextState } };

  // Signing off a gate may satisfy the entry prerequisites of the next
  // gate(s); recompute their entrySatisfied flag so the UI reflects
  // "you can start this now" immediately, without requiring a second event.
  for (const g of GATE_ORDER) {
    if (g === gate) continue;
    const s = next.gates[g];
    if (s.status === "not_started" && entryPrerequisitesMet(next, g)) {
      next = { ...next, gates: { ...next.gates, [g]: { ...s, entrySatisfied: true, status: "in_progress" } } };
    }
  }
  return next;
}

/**
 * Invalidate a gate and cascade forward: every gate that was signed off and
 * depends (directly or transitively) on this one is invalidated too, since
 * its prerequisite state has changed underneath it (docs §2.1: "Returning
 * invalidates downstream").
 */
export function invalidateGate(project: ProjectGateState, gate: GateId, reason: string): ProjectGateState {
  const dependents = downstreamDependents(gate);
  let next = project;
  for (const g of [gate, ...dependents]) {
    const s = next.gates[g];
    if (s.status === "signed_off" || s.status === "ready" || g === gate) {
      next = {
        ...next,
        gates: {
          ...next.gates,
          [g]: { ...s, status: "invalidated", signoff: undefined, invalidatedBy: [...s.invalidatedBy, reason] },
        },
      };
    }
  }
  return next;
}

/** Every gate that (directly or transitively) requires `gate` to be signed off. */
function downstreamDependents(gate: GateId): GateId[] {
  const result: GateId[] = [];
  const visited = new Set<GateId>();
  function visit(g: GateId) {
    for (const candidate of GATE_ORDER) {
      if (GATE_ENTRY_REQUIRES[candidate].includes(g) && !visited.has(candidate)) {
        visited.add(candidate);
        result.push(candidate);
        visit(candidate);
      }
    }
  }
  visit(gate);
  return result;
}

/** True once every gate through G7 is signed off — the project is exported. */
export function isProjectComplete(project: ProjectGateState): boolean {
  return GATE_ORDER.every((g) => project.gates[g].status === "signed_off");
}

/** The first gate that is not yet signed off, in order — "what should I do next?" */
export function nextOutstandingGate(project: ProjectGateState): GateId | undefined {
  return GATE_ORDER.find((g) => project.gates[g].status !== "signed_off");
}
