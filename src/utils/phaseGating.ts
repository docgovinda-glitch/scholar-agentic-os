import { WORKFLOW_PHASES, PaperProject } from "../types";

type PhaseId = (typeof WORKFLOW_PHASES)[number]["id"];

/** Existing projects/fixtures predate `furthestPhase` — treat a missing
 * value as equal to currentPhase rather than requiring a stored migration. */
export function resolveFurthestPhase(project: Pick<PaperProject, "currentPhase" | "furthestPhase">): string {
  return project.furthestPhase || project.currentPhase;
}

export interface PhaseGateResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Honest invalid-transition guard for the phase workflow (navigation
 * overhaul, docs/planning/navigation-scoping.md). A phase is enterable if
 * it's at or before the furthest phase the project has ever reached, or is
 * the single next phase after that ceiling — matching how a linear,
 * gated workflow is normally allowed to progress one step at a time.
 * Uses furthestPhase (not currentPhase) as the ceiling so navigating back
 * to review an earlier phase doesn't lower what's reachable.
 */
export function canEnterPhase(
  phases: readonly { id: string; name: string }[],
  _currentPhase: string,
  furthestPhase: string,
  targetPhase: string
): PhaseGateResult {
  const furthestIndex = phases.findIndex((p) => p.id === furthestPhase);
  const targetIndex = phases.findIndex((p) => p.id === targetPhase);

  if (furthestIndex === -1 || targetIndex === -1) {
    return { allowed: false, reason: "Unknown phase." };
  }

  if (targetIndex <= furthestIndex + 1) {
    return { allowed: true };
  }

  const blockingPhase = phases[furthestIndex + 1];
  return {
    allowed: false,
    reason: `Complete "${blockingPhase.name}" first before jumping ahead to "${phases[targetIndex].name}".`
  };
}

export type { PhaseId };
