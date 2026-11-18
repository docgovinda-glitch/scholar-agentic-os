/**
 * Public contract for project persistence.
 *
 * Provides asynchronous create, get, and save operations agnostic of underlying storage engine.
 */

import type { ProjectRecord } from "../../app/conductor/projectStore";

export type { ProjectRecord };

/** Answer keys to set; null removes the key, undefined is ignored. */
export type AnswersPatch = Record<string, unknown>;

/** The answers after `patch` is applied: null removes a key, anything else replaces it. */
export function applyAnswersPatch(answers: ProjectRecord["answers"] | undefined, patch: AnswersPatch): ProjectRecord["answers"] {
  const next: Record<string, unknown> = { ...(answers ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue; // not sent over JSON either
    if (v === null) delete next[k];
    else next[k] = v;
  }
  return next as ProjectRecord["answers"];
}

export interface ProjectStore {
  /** `ownerId` is required — see ProjectRecord.ownerId for why it is not optional. */
  create(outputTypeId: string, ownerId: string): Promise<ProjectRecord>;
  /**
   * Returns the record regardless of owner. Authorisation is the caller's
   * job (server/routes/project.ts's loadOwnedProject), deliberately: the
   * store's contract is persistence, and a store that silently filtered by
   * owner could not tell "does not exist" apart from "not yours" — a
   * distinction the route layer needs in order to respond consistently.
   */
  get(projectId: string): Promise<ProjectRecord | undefined>;
  save(record: ProjectRecord): Promise<ProjectRecord>;
  /**
   * Merges answer keys into the stored record in one step, so a write that
   * lands meanwhile on other keys is kept. A key set to null is removed.
   * Returns the updated record, or undefined when the project does not exist.
   * Backends without an atomic merge leave this out; `getProjectStore()`
   * then supplies a read-merge-write (safe in a single-process store).
   */
  patchAnswers?(projectId: string, patch: AnswersPatch): Promise<ProjectRecord | undefined>;
  /** Owner-scoped listing — the only way to enumerate projects. */
  listByOwner(ownerId: string): Promise<ProjectRecord[]>;
  delete(projectId: string): Promise<void>;
}

export class OptimisticLockError extends Error {
  constructor(projectId: string) {
    super(`OptimisticLockError: Project ${projectId} has been modified by another request.`);
    this.name = "OptimisticLockError";
  }
}
