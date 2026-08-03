/**
 * services/store's chosen ProjectStore backend for this process.
 *
 * server/routes/project.ts imports from here, not from a specific backend —
 * it depends on the ProjectStore interface (./types.ts), not on whether
 * projects live in a Map or in Postgres. Selection is by DATABASE_URL:
 * unset (the default in tests and un-configured dev) keeps using
 * src/app/conductor/projectStore.ts's in-memory Map, exactly as before this
 * module existed; set, it connects to Postgres via pgProjectStore.ts. This
 * is the honest resolution of the gap flagged at
 * docs/01-product/13-MODULE-SPECIFICATIONS.md §8.3 ("services/* is the
 * largest near-term gap") — without silently changing behaviour for anyone
 * who hasn't configured a database yet.
 */

import * as inMemory from "../../app/conductor/projectStore";
import { createPgProjectStore, createPool } from "./pgProjectStore";
import type { ProjectRecord, ProjectStore } from "./types";

function inMemoryAsStore(): ProjectStore {
  return {
    create: (outputTypeId) => Promise.resolve(inMemory.createProject(outputTypeId)),
    get: (projectId) => Promise.resolve(inMemory.getProject(projectId)),
    save: (record) => Promise.resolve(inMemory.saveProject(record)),
  };
}

let store: ProjectStore | undefined;

/**
 * Lazily resolves the backend on first use rather than at import time, so
 * setting DATABASE_URL in a test's env before calling this still takes
 * effect, and so importing this module never opens a database connection
 * as a side effect.
 */
export function getProjectStore(): ProjectStore {
  if (!store) {
    store = process.env.DATABASE_URL ? createPgProjectStore(createPool()) : inMemoryAsStore();
  }
  return store;
}

export type { ProjectRecord, ProjectStore };

/** Test-only: forgets the resolved backend, so a test can flip DATABASE_URL and re-resolve. */
export function __resetProjectStoreSelectionForTests(): void {
  store = undefined;
}
