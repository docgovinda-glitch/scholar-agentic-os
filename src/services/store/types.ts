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
  create(outputTypeId: string): Promise<ProjectRecord>;
  get(projectId: string): Promise<ProjectRecord | undefined>;
  save(record: ProjectRecord): Promise<ProjectRecord>;
}
