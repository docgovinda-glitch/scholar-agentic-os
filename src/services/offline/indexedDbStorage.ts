/**
 * Offline IndexedDB Storage Service for Scholar Core PWA & Pocket Desk.
 * Provides resilient offline caching for projects, vault sources, and mutation queues.
 */

export interface OfflineMutation {
  id: string;
  projectId: string;
  type: "approve_source" | "reject_source" | "save_draft" | "add_note" | "update_gate";
  payload: any;
  timestamp: number;
  retryCount: number;
}

const DB_NAME = "ScholarCore_OfflineDB";
const DB_VERSION = 1;

// In-memory fallback for environments where indexedDB is not available
const memoryStorage = {
  projects: new Map<string, any>(),
  vaultSources: new Map<string, any>(),
  syncQueue: new Map<string, OfflineMutation>(),
};

function hasIndexedDb(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

export function openScholarDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      return reject(new Error("IndexedDB not supported in this environment"));
    }

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "projectId" });
      }
      if (!db.objectStoreNames.contains("vault_sources")) {
        db.createObjectStore("vault_sources", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("sync_queue")) {
        db.createObjectStore("sync_queue", { keyPath: "id" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCachedProject(project: any): Promise<void> {
  if (!project || !project.projectId) return;

  if (!hasIndexedDb()) {
    memoryStorage.projects.set(project.projectId, project);
    return;
  }

  try {
    const db = await openScholarDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("projects", "readwrite");
      const store = tx.objectStore("projects");
      const req = store.put(project);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    memoryStorage.projects.set(project.projectId, project);
  }
}

export async function getCachedProject(projectId: string): Promise<any | null> {
  if (!projectId) return null;

  if (!hasIndexedDb()) {
    return memoryStorage.projects.get(projectId) || null;
  }

  try {
    const db = await openScholarDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("projects", "readonly");
      const store = tx.objectStore("projects");
      const req = store.get(projectId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return memoryStorage.projects.get(projectId) || null;
  }
}

export async function listCachedProjects(): Promise<any[]> {
  if (!hasIndexedDb()) {
    return Array.from(memoryStorage.projects.values());
  }

  try {
    const db = await openScholarDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("projects", "readonly");
      const store = tx.objectStore("projects");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return Array.from(memoryStorage.projects.values());
  }
}

export async function enqueueOfflineMutation(
  mutation: Omit<OfflineMutation, "id" | "timestamp" | "retryCount"> & { id?: string }
): Promise<OfflineMutation> {
  const fullMutation: OfflineMutation = {
    id: mutation.id || `mut-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    projectId: mutation.projectId,
    type: mutation.type,
    payload: mutation.payload,
    timestamp: Date.now(),
    retryCount: 0,
  };

  if (!hasIndexedDb()) {
    memoryStorage.syncQueue.set(fullMutation.id, fullMutation);
    return fullMutation;
  }

  try {
    const db = await openScholarDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("sync_queue", "readwrite");
      const store = tx.objectStore("sync_queue");
      const req = store.put(fullMutation);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    memoryStorage.syncQueue.set(fullMutation.id, fullMutation);
  }

  return fullMutation;
}

export async function getPendingMutations(): Promise<OfflineMutation[]> {
  if (!hasIndexedDb()) {
    return Array.from(memoryStorage.syncQueue.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  try {
    const db = await openScholarDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("sync_queue", "readonly");
      const store = tx.objectStore("sync_queue");
      const req = store.getAll();
      req.onsuccess = () => {
        const items: OfflineMutation[] = req.result || [];
        resolve(items.sort((a, b) => a.timestamp - b.timestamp));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return Array.from(memoryStorage.syncQueue.values()).sort((a, b) => a.timestamp - b.timestamp);
  }
}

export async function removePendingMutation(id: string): Promise<void> {
  if (!hasIndexedDb()) {
    memoryStorage.syncQueue.delete(id);
    return;
  }

  try {
    const db = await openScholarDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("sync_queue", "readwrite");
      const store = tx.objectStore("sync_queue");
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    memoryStorage.syncQueue.delete(id);
  }
}

export async function clearOfflineCache(): Promise<void> {
  memoryStorage.projects.clear();
  memoryStorage.vaultSources.clear();
  memoryStorage.syncQueue.clear();

  if (hasIndexedDb()) {
    try {
      const db = await openScholarDb();
      const tx = db.transaction(["projects", "vault_sources", "sync_queue"], "readwrite");
      tx.objectStore("projects").clear();
      tx.objectStore("vault_sources").clear();
      tx.objectStore("sync_queue").clear();
    } catch {
      // Ignored
    }
  }
}
