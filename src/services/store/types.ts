/**
 * Public contract for project persistence.
 *
 * Provides asynchronous create, get, and save operations agnostic of underlying storage engine.
 */

import type { ProjectRecord } from "../../app/conductor/projectStore";

export type { ProjectRecord };

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
  /** Owner-scoped listing — the only way to enumerate projects. */
  listByOwner(ownerId: string): Promise<ProjectRecord[]>;
  delete(projectId: string): Promise<void>;
}
