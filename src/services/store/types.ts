/**
 * `services/store`'s public contract for project persistence
 * (docs/01-product/13-MODULE-SPECIFICATIONS.md §L1 "services/store": "Object
 * persistence, transactions, snapshots. Owns the Postgres schema.").
 *
 * This is deliberately the same shape as the interim in-memory store's three
 * functions (src/app/conductor/projectStore.ts's createProject/getProject/
 * saveProject), just made async — that's what lets server/routes/project.ts
 * depend on one interface while the concrete backend (in-memory for tests
 * and DATABASE_URL-less dev, Postgres once configured) is chosen at startup
 * by src/services/store/projectStore.ts. Nothing here interprets
 * ProjectRecord's contents (no knowledge of what a Draft or a Claim means) —
 * consistent with the module spec's "does not know what a Draft means".
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
