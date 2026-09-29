/**
 * Resolves the active ProjectStore backend.
 *
 * Automatically chooses between PostgreSQL persistence (when DATABASE_URL is set)
 * or in-memory persistence for tests and unconfigured local development.
 */

import * as inMemory from "../../app/conductor/projectStore";
import { createPgProjectStore, createPool } from "./pgProjectStore";
import { createRestProjectStore } from "./restProjectStore";
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
 *    hostname and protocol as everything else. It is ranked above the direct
 *    connection because that path failed in production four separate ways:
 *    an IPv6-only hostname on an IPv4-only network, a pooler needing the
 *    right region/port/tenant username, a certificate chain Node does not
 *    trust, and a database password distinct from every other credential.
 *
 * 2. Direct Postgres — used when DATABASE_URL is set and the Data API is not
 *    configured. Retained deliberately rather than deleted: it supports SQL
 *    the Data API cannot express, and a future store needing real
 *    transactions will want it.
 *
 * 3. In-memory — the last resort, and the dangerous one, because it looks
 *    like it works. It does not survive a restart, so on a plan that idles
 *    out the container a user's projects vanish within the hour with nothing
 *    reported. It is therefore announced loudly at startup rather than
 *    entered quietly.
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
    "services/store: NO durable backend configured — falling back to the in-memory store. " +
      "Projects will be lost on every restart. Set VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY " +
      "(preferred) or DATABASE_URL. See supabase/schema_store.sql."
  );
  return inMemoryAsStore();
}

export type { ProjectRecord, ProjectStore };

/** Test-only: forgets the resolved backend, so a test can flip DATABASE_URL and re-resolve. */
export function __resetProjectStoreSelectionForTests(): void {
  store = undefined;
}
