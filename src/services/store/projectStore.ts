/**
 * Resolves the active ProjectStore backend.
 *
 * Automatically chooses between PostgreSQL persistence (when DATABASE_URL is set)
 * or in-memory persistence for tests and unconfigured local development.
 */

import * as inMemory from "../../app/conductor/projectStore";
import { createPgProjectStore, createPool } from "./pgProjectStore";
import { createRestProjectStore } from "./restProjectStore";
import { createDiskProjectStore } from "./diskProjectStore";
import type { ProjectRecord, ProjectStore } from "./types";

function inMemoryAsStore(): ProjectStore {
  return {
    create: (outputTypeId, ownerId) => Promise.resolve(inMemory.createProject(outputTypeId, ownerId)),
    get: (projectId) => Promise.resolve(inMemory.getProject(projectId)),
    save: (record) => Promise.resolve(inMemory.saveProject(record)),
    listByOwner: (ownerId) => Promise.resolve(inMemory.listProjectsByOwner(ownerId)),
    delete: (projectId) => {
      inMemory.deleteProject(projectId);
      return Promise.resolve();
    },
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
    store = resolveStore();
  }
  return store;
}

/**
 * Pick a backend, most durable and most reachable first.
 *
 * 1. Data API (HTTPS) — preferred. Needs only the two values the server
 *    already requires to verify tokens, and reaches Supabase over the same
 *    hostname and protocol as everything else.
 *
 * 2. Direct Postgres — used when DATABASE_URL is set and the Data API is not
 *    configured.
 *
 * 3. Disk-backed Store (Atomic JSON write-ahead) — durable local fallback
 *    preventing project evaporation across server restarts.
 *
 * 4. Pure In-memory — strictly isolated for automated testing (`NODE_ENV === "test"`).
 */
function resolveStore(): ProjectStore {
  if (process.env.NODE_ENV === "test" && !process.env.USE_REAL_STORE_IN_TESTS) {
    return inMemoryAsStore();
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    console.log("services/store: using the Supabase Data API (HTTPS) for project persistence");
    return createRestProjectStore({ supabaseUrl, serviceRoleKey });
  }

  if (process.env.DATABASE_URL) {
    console.log("services/store: using a direct Postgres connection for project persistence");
    return createPgProjectStore(createPool());
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[FATAL: Durable Persistence Required] Production cannot start with ephemeral in-memory project storage. " +
        "User projects would be permanently lost on container restart. Configure a durable persistence backend using " +
        "VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (preferred) or DATABASE_URL."
    );
  }

  console.warn(
    "services/store: NO remote database configured — falling back from in-memory to local atomic file store (data/.scholar_local_store.json). " +
      "Set VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (preferred) or DATABASE_URL for cloud database persistence."
  );
  return createDiskProjectStore();
}

export type { ProjectRecord, ProjectStore };

/** Test-only: forgets the resolved backend, so a test can flip DATABASE_URL and re-resolve. */
export function __resetProjectStoreSelectionForTests(): void {
  store = undefined;
}
