import fs from "fs";
import path from "path";
import * as inMemory from "../../app/conductor/projectStore";
import type { ProjectRecord, ProjectStore } from "./types";

/**
 * Disk-backed local project store with atomic write-ahead persistence.
 * Used when no cloud database (Supabase Data API or PostgreSQL) is configured,
 * preventing data evaporation on server restarts outside of test environments.
 */
export function createDiskProjectStore(
  filePath: string = path.resolve(process.cwd(), "data/.scholar_local_store.json")
): ProjectStore {
  const cache = new Map<string, ProjectRecord>();

  // Hydrate initial state from disk if file exists
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      if (raw.trim()) {
        const records = JSON.parse(raw);
        if (Array.isArray(records)) {
          for (const r of records) {
            if (r && r.projectId) {
              cache.set(r.projectId, r as ProjectRecord);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[diskProjectStore] Could not load local store from ${filePath}:`, err);
  }

  function flushToDisk(): void {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      const serialized = JSON.stringify(Array.from(cache.values()), null, 2);
      fs.writeFileSync(tmpPath, serialized, "utf8");
      fs.renameSync(tmpPath, filePath);
    } catch (err) {
      console.error(`[diskProjectStore] Failed atomic write-ahead to ${filePath}:`, err);
      throw err;
    }
  }

  return {
    async create(outputTypeId: string, ownerId: string): Promise<ProjectRecord> {
      const record = inMemory.createProject(outputTypeId, ownerId);
      cache.set(record.projectId, record);
      flushToDisk();
      return JSON.parse(JSON.stringify(record));
    },

    async get(projectId: string): Promise<ProjectRecord | undefined> {
      const found = cache.get(projectId);
      return found ? JSON.parse(JSON.stringify(found)) : undefined;
    },

    async save(record: ProjectRecord): Promise<ProjectRecord> {
      const updated: ProjectRecord = {
        ...record,
        version: (record.version ?? 0) + 1,
      };
      cache.set(updated.projectId, updated);
      flushToDisk();
      return JSON.parse(JSON.stringify(updated));
    },

    async listByOwner(ownerId: string): Promise<ProjectRecord[]> {
      const results: ProjectRecord[] = [];
      for (const record of cache.values()) {
        if (record.ownerId === ownerId) {
          results.push(JSON.parse(JSON.stringify(record)));
        }
      }
      return results;
    },

    async delete(projectId: string): Promise<void> {
      cache.delete(projectId);
      flushToDisk();
    },
  };
}
