/**
 * app/conductor — public entry point.
 *
 * Spec: docs/03-workflow/30-ACADEMIC-WORKFLOW-ARCHITECTURE.md.
 *
 * Binds the pure gate state machine (domain/project/gates.ts) to the two
 * modules already built that a gate's exit criteria can be computed from
 * today: Atlas for G0 (has every required intake field been answered, or
 * explicitly deferred), and the Rubric for G6 (are there any unresolved
 * blocking or required compliance findings). G1-G5 and G7 exit criteria are
 * not wired to anything yet — there is no requirement-extraction pipeline,
 * drafting pipeline, review pipeline, or export pipeline built (see
 * docs/01-product/13-MODULE-SPECIFICATIONS.md §8.3) — but the gate state
 * machine itself supports them identically once those modules exist:
 * `updateExitCriteria()` takes any `ExitCriterion[]`, computed however the
 * caller likes.
 *
 * TRACKED GAP: per-chapter independent gating for `long_form_chaptered`
 * (docs 30 §3's "G3 runs per chapter") is not implemented. This module
 * tracks one gate state per project. Extending to per-chapter state is
 * additive — a `Record<chapterId, ProjectGateState>` for G3-G5 with G6/G7
 * remaining project-level — not a redesign of what's here.
 */

import {
  GATE_ORDER,
  GATE_NAMES,
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
  type GateId,
  type GateState,
  type ProjectGateState,
} from "../../domain/project/gates";
import { computeStateHash } from "./hash";
import type { OutputTypeSpec } from "../atlas/types";
import { allIntakeFields } from "../atlas/proposals";
import type { RubricReport } from "../rubric/rubric";

export {
  GATE_ORDER,
  GATE_NAMES,
  initialProjectGateState,
  isProjectComplete,
  nextOutstandingGate,
  GateTransitionError,
} from "../../domain/project/gates";
export type { GateId, GateState, ProjectGateState, ExitCriterion } from "../../domain/project/gates";

/**
 * Compute G0's exit criteria from an Atlas output type and the user's
 * intake answers so far (docs 30 §3 G0 "Exit": every Required field
 * answered or explicitly deferred). One criterion per required field.
 */
export function computeG0ExitCriteria(
  spec: OutputTypeSpec,
  answers: Record<string, string | "provisional">
): ExitCriterion[] {
  return spec.intakeSchema.required.map((field) => {
    const answer = answers[field.key];
    const satisfied = answer !== undefined && (answer !== "provisional" || field.allowsProvisional);
    return {
      id: field.key,
      description: `"${field.label}" answered${field.allowsProvisional ? " (or marked provisional)" : ""}`,
      satisfied,
      blocking: true,
    };
  });
}

/** Every field across all tiers that has an answer — informational, not gating (recommended/optional never block G0). */
export function intakeCompleteness(spec: OutputTypeSpec, answers: Record<string, string | "provisional">): number {
  const fields = allIntakeFields(spec);
  if (fields.length === 0) return 1;
  const answered = fields.filter((f) => answers[f.key] !== undefined).length;
  return answered / fields.length;
}

/**
 * Compute G6's exit criteria from a Rubric report (docs 30 §3 G6 "Exit":
 * "Zero blocking findings · every required finding resolved or waived").
 * `not_applicable` findings (an evaluator that doesn't exist yet, per
 * domain/compliance's honest-gap design) are surfaced as non-blocking so an
 * unimplemented rule type never silently prevents export, but they are
 * never reported as satisfied either — the description says plainly that
 * they were not checked.
 */
export function computeG6ExitCriteria(report: RubricReport): ExitCriterion[] {
  return report.findings
    .filter((f) => f.severity !== "advisory")
    .map((f) => {
      if (f.status === "not_applicable") {
        return { id: f.ruleId, description: `${f.message} (not yet automatically verified)`, satisfied: true, blocking: false };
      }
      return {
        id: f.ruleId,
        description: f.message,
        satisfied: f.status === "pass" || f.status === "warn",
        blocking: true,
      };
    });
}

/** Update a gate's exit criteria from freshly computed values, deriving status. Throws if the gate is currently signed off — invalidate first. */
export { updateExitCriteria } from "../../domain/project/gates";

/**
 * Sign off a gate: computes the state hash from a caller-supplied snapshot
 * of exactly what is being approved (typically the exit criteria plus
 * whatever content they were computed from — e.g. G0's answers, G6's
 * RubricReport), then records the sign-off. Docs 30 §2.2: the hash is what
 * lets a later change be detected as having invalidated an approval.
 */
export async function signOff(
  project: ProjectGateState,
  gate: GateId,
  actor: string,
  approvedSnapshot: unknown
): Promise<ProjectGateState> {
  const stateHash = await computeStateHash(approvedSnapshot);
  return signOffGate(project, gate, actor, stateHash);
}

/**
 * Invalidate a gate because its underlying content changed after sign-off,
 * cascading to every gate that depended on it (docs 30 §2.1: "Returning
 * invalidates downstream").
 */
export { invalidateGate } from "../../domain/project/gates";

/** True if re-signing off `gate` with `newSnapshot` would produce a different hash than its current sign-off — i.e., the approval is stale. */
export async function isSignoffStale(state: GateState, newSnapshot: unknown): Promise<boolean> {
  if (!state.signoff) return false;
  const newHash = await computeStateHash(newSnapshot);
  return newHash !== state.signoff.stateHash;
}

/** A compact summary suitable for the Workflow Monitor (docs 30 §4). */
export interface GateSummary {
  gate: GateId;
  name: string;
  status: GateState["status"];
  outstandingBlocking: string[];
}

export function summarize(project: ProjectGateState): GateSummary[] {
  return GATE_ORDER.map((gate) => {
    const state = project.gates[gate];
    return {
      gate,
      name: GATE_NAMES[gate],
      status: state.status,
      outstandingBlocking: state.exitCriteria.filter((c) => c.blocking && !c.satisfied).map((c) => c.description),
    };
  });
}
