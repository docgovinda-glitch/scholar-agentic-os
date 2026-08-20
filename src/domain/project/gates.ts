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
  /** Gates that operate on a per-chapter basis (G3, G4, G5). Map of chapterId (section_name) -> { gateId -> GateState } */
  chapterGates?: Record<string, Record<GateId, GateState>>;
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
  return { projectId, gates, chapterGates: {} };
}

/** Helper to resolve either a whole-document gate or a per-chapter gate. */
export function getGateState(project: ProjectGateState, gate: GateId, chapterId?: string): GateState {
  if (chapterId && project.chapterGates?.[chapterId]?.[gate]) {
    return project.chapterGates[chapterId][gate];
  }
  return project.gates[gate];
}

/** Helper to check if a gate is considered signed off. For per-chapter gates without a specific chapter ID passed, it requires ALL chapters to be signed off. */
export function isGateSignedOff(project: ProjectGateState, gate: GateId, chapterId?: string): boolean {
  if (chapterId) {
    return getGateState(project, gate, chapterId).status === "signed_off";
  }
  if (project.chapterGates && Object.keys(project.chapterGates).length > 0 && (gate === "G3" || gate === "G4" || gate === "G5")) {
    return Object.values(project.chapterGates).every(cg => cg[gate]?.status === "signed_off");
  }
  return project.gates[gate].status === "signed_off";
}

/** Whether every predecessor this gate requires is currently signed off. */
export function entryPrerequisitesMet(project: ProjectGateState, gate: GateId, chapterId?: string): boolean {
  return GATE_ENTRY_REQUIRES[gate].every((req) => isGateSignedOff(project, req, chapterId));
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
export function updateExitCriteria(project: ProjectGateState, gate: GateId, criteria: ExitCriterion[], chapterId?: string): ProjectGateState {
  const current = getGateState(project, gate, chapterId);
  if (current.status === "signed_off") {
    throw new GateTransitionError(
      `Gate ${gate} is signed off — invalidate it before recomputing exit criteria, so the invalidation is recorded.`
    );
  }
  const entrySatisfied = entryPrerequisitesMet(project, gate, chapterId);
  const ready = entrySatisfied && criteria.filter((c) => c.blocking).every((c) => c.satisfied);
  const nextState: GateState = {
    ...current,
    entrySatisfied,
    exitCriteria: criteria,
    status: ready ? "ready" : entrySatisfied ? "in_progress" : "not_started",
  };
  
  if (chapterId) {
    const cg = project.chapterGates || {};
    return {
      ...project,
      chapterGates: {
        ...cg,
        [chapterId]: { ...(cg[chapterId] || {}), [gate]: nextState }
      }
    };
  }
  return { ...project, gates: { ...project.gates, [gate]: nextState } };
}

/**
 * Sign off a gate. Throws if not ready (docs §2.1: "Forward requires
 * sign-off... No gate advances without a recorded human decision").
 * `stateHash` is supplied by the caller — see conductor.ts's
 * computeStateHash, kept out of this pure module because it uses the Web
 * Crypto API (async).
 */
export function signOffGate(project: ProjectGateState, gate: GateId, actor: string, stateHash: string, at: string = new Date().toISOString(), chapterId?: string): ProjectGateState {
  const state = getGateState(project, gate, chapterId);
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
  
  let next: ProjectGateState;
  if (chapterId) {
    const cg = project.chapterGates || {};
    next = {
      ...project,
      chapterGates: {
        ...cg,
        [chapterId]: { ...(cg[chapterId] || {}), [gate]: nextState }
      }
    };
  } else {
    next = { ...project, gates: { ...project.gates, [gate]: nextState } };
  }

  // Signing off a gate may satisfy the entry prerequisites of the next
  // gate(s); recompute their entrySatisfied flag so the UI reflects
  // "you can start this now" immediately, without requiring a second event.
  for (const g of GATE_ORDER) {
    if (g === gate) continue;
    
    // Evaluate project-level downstream gate
    const s = next.gates[g];
    if (s.status === "not_started" && entryPrerequisitesMet(next, g)) {
      const isReady = s.exitCriteria.every((c) => c.satisfied || !c.blocking);
      next = { ...next, gates: { ...next.gates, [g]: { ...s, entrySatisfied: true, status: isReady ? "ready" : "in_progress" } } };
    }
    
    // Evaluate chapter-level downstream gates
    if (next.chapterGates) {
      for (const cid of Object.keys(next.chapterGates)) {
        const cs = next.chapterGates[cid][g];
        if (cs && cs.status === "not_started" && entryPrerequisitesMet(next, g, cid)) {
           const isReady = cs.exitCriteria.every((c) => c.satisfied || !c.blocking);
           next.chapterGates[cid][g] = { ...cs, entrySatisfied: true, status: isReady ? "ready" : "in_progress" };
        }
      }
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
export function invalidateGate(project: ProjectGateState, gate: GateId, reason: string, chapterId?: string): ProjectGateState {
  const dependents = downstreamDependents(gate);
  let next = project;
  
  const processInvalidation = (g: GateId, cid?: string) => {
    const s = getGateState(next, g, cid);
    if (s.status === "signed_off" || s.status === "ready" || (g === gate && cid === chapterId)) {
      const invalidatedState = { ...s, status: "invalidated" as const, signoff: undefined, invalidatedBy: [...s.invalidatedBy, reason] };
      if (cid) {
        const cg = next.chapterGates || {};
        next = {
          ...next,
          chapterGates: {
            ...cg,
            [cid]: { ...(cg[cid] || {}), [g]: invalidatedState }
          }
        };
      } else {
        next = { ...next, gates: { ...next.gates, [g]: invalidatedState } };
      }
    }
  };

  for (const g of [gate, ...dependents]) {
    // If we're invalidating a project-level gate, it cascades to all chapters.
    // If we're invalidating a chapter-level gate, it cascades to that chapter's downstream gates, and any downstream project-level gates.
    if (chapterId && (g === "G3" || g === "G4" || g === "G5")) {
      processInvalidation(g, chapterId);
    } else {
      processInvalidation(g);
      if (next.chapterGates) {
         for (const cid of Object.keys(next.chapterGates)) {
           processInvalidation(g, cid);
         }
      }
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
  return GATE_ORDER.every((g) => isGateSignedOff(project, g));
}

/** The first gate that is not yet signed off, in order — "what should I do next?" */
export function nextOutstandingGate(project: ProjectGateState): GateId | undefined {
  return GATE_ORDER.find((g) => !isGateSignedOff(project, g));
}
