/**
 * Interim in-memory project store.
 *
 * Same honest scope note as src/app/studio/sessionPolicyStore.ts: this is
 * an explicitly-labelled stand-in for what `services/store` should provide
 * once it exists (docs/01-product/13-MODULE-SPECIFICATIONS.md §8.3 —
 * "the largest near-term gap"). It does not survive a process restart and
 * does not scale past one process. server/routes/project.ts is the only
 * caller; nothing in domain/ or app/conductor's pure logic depends on this
 * file existing.
 */

import { initialProjectGateState } from "../../domain/project/gates";
import type { ProjectGateState } from "../../domain/project/gates";

export interface ProjectRecord {
  projectId: string;
  outputTypeId: string;
  /** Intake answers so far, keyed by IntakeField.key. "provisional" is a valid value (docs 14 §5.2). */
  answers: Record<string, string>;
  gates: ProjectGateState;
}

const projects = new Map<string, ProjectRecord>();
let counter = 0;

function generateProjectId(): string {
  counter += 1;
  return `proj-${Date.now().toString(36)}-${counter}`;
}

export function createProject(outputTypeId: string): ProjectRecord {
  const projectId = generateProjectId();
  const record: ProjectRecord = {
    projectId,
    outputTypeId,
    answers: {},
    gates: initialProjectGateState(projectId),
  };
  projects.set(projectId, record);
  return record;
}

export function getProject(projectId: string): ProjectRecord | undefined {
  return projects.get(projectId);
}

export function saveProject(record: ProjectRecord): ProjectRecord {
  projects.set(record.projectId, record);
  return record;
}

export function __resetProjectStoreForTests(): void {
  projects.clear();
  counter = 0;
}
