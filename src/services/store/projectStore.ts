/**
 * Resolves the active ProjectStore backend.
 *
 * Automatically chooses between PostgreSQL persistence (when DATABASE_URL is set)
 * or in-memory persistence for tests and unconfigured local development.
 */

import fs from "fs";
import path from "path";
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

/**
 * Creates an atomic disk-backed project store fallback for local environments.
 * Uses atomic tmp-file write and renameSync to avoid file corruption on unexpected crashes.
 */
export function createDiskFallbackStore(filePath: string = "data/.scholar_local_store.json"): ProjectStore {
  const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const dir = path.dirname(absPath);

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.warn("createDiskFallbackStore: could not create directory", dir, err);
  }

  const cache = new Map<string, ProjectRecord>();
  if (fs.existsSync(absPath)) {
    try {
      const raw = fs.readFileSync(absPath, "utf-8");
      const parsed: Record<string, ProjectRecord> = JSON.parse(raw);
      for (const [id, record] of Object.entries(parsed)) {
        cache.set(id, record);
      }
    } catch (err) {
      console.warn("createDiskFallbackStore: could not read existing store file, starting fresh", err);
    }
  }

  const flushToDisk = () => {
    try {
      const obj: Record<string, ProjectRecord> = {};
      for (const [id, record] of cache.entries()) {
        obj[id] = record;
      }
      const tmpPath = `${absPath}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2), "utf-8");
      fs.renameSync(tmpPath, absPath);
    } catch (err) {
      console.error("createDiskFallbackStore: atomic flush to disk failed", err);
    }
  };

  return {
    create: async (outputTypeId, ownerId) => {
      const record = inMemory.createProject(outputTypeId, ownerId);
      cache.set(record.projectId, record);
      flushToDisk();
      return record;
    },
    get: async (projectId) => {
      return cache.get(projectId);
    },
    save: async (record) => {
      cache.set(record.projectId, record);
      flushToDisk();
      return record;
    },
    listByOwner: async (ownerId) => {
      const results: ProjectRecord[] = [];
      for (const r of cache.values()) {
        if (!ownerId || r.ownerId === ownerId) {
          results.push(r);
        }
      }
      return results;
    },
    delete: async (projectId) => {
      cache.delete(projectId);
      flushToDisk();
    },
  };
}

let store: ProjectStore | undefined;

type SavedListener = (record: ProjectRecord) => void;
const savedListeners = new Set<SavedListener>();

/**
 * Register a callback run after every successful project save, whichever
 * backend is active (the server uses it to mirror Coursework state into its
 * normalized tables). A listener must not throw or block; errors are logged.
 * Returns an unsubscribe function.
 */
export function onProjectSaved(listener: SavedListener): () => void {
  savedListeners.add(listener);
  return () => savedListeners.delete(listener);
}

function withSaveListeners(inner: ProjectStore): ProjectStore {
  return {
    ...inner,
    async save(record) {
      const saved = await inner.save(record);
      for (const listener of savedListeners) {
        try {
          listener(saved);
        } catch (err) {
          console.warn("services/store: a project-saved listener threw", err);
        }
      }
      return saved;
    },
  };
}

/**
 * Lazily resolves the backend on first use rather than at import time, so
 * setting DATABASE_URL in a test's env before calling this still takes
 * effect, and so importing this module never opens a database connection
 * as a side effect.
 */
export function getProjectStore(): ProjectStore {
  if (!store) {
    store = withSaveListeners(resolveStore());
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
 *    configured. Retained deliberately rather than deleted: it supports SQL
 *    the Data API cannot express.
 *
 * 3. Disk store fallback — atomic disk file store (data/.scholar_local_store.json)
 *    so projects survive restarts in unconfigured development.
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
    "services/store: NO remote durable backend configured — falling back to atomic disk store (replacing ephemeral in-memory store) at data/.scholar_local_store.json."
  );
  return createDiskFallbackStore();
}

export type { ProjectRecord, ProjectStore };

/** Test-only: forgets the resolved backend, so a test can flip DATABASE_URL and re-resolve. */
export function __resetProjectStoreSelectionForTests(): void {
  store = undefined;
}
