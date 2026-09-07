/**
 * Sync Manager for Scholar Core & Pocket Desk.
 * Manages online/offline state, cache hydration, and queue replay.
 */

import { authedJsonFetch } from "../../desk/api";
import {
  getPendingMutations,
  removePendingMutation,
  saveCachedProject,
  listCachedProjects,
  type OfflineMutation,
} from "./indexedDbStorage";

export type SyncStatus = "online" | "offline" | "syncing" | "synced" | "error";

type SyncListener = (status: SyncStatus, pendingCount: number) => void;

class PocketSyncManager {
  private status: SyncStatus = typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "online";
  private listeners: Set<SyncListener> = new Set();
  private isFlushing = false;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.handleOnline());
      window.addEventListener("offline", () => this.handleOffline());
    }
  }

  public isOnline(): boolean {
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      return navigator.onLine;
    }
    return true;
  }

  public getStatus(): SyncStatus {
    return this.status;
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.status, 0);
    getPendingMutations().then((mutations) => {
      listener(this.status, mutations.length);
    });

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(status: SyncStatus, pendingCount: number) {
    this.status = status;
    this.listeners.forEach((l) => l(status, pendingCount));
  }

  private async handleOnline() {
    const mutations = await getPendingMutations();
    this.notify("online", mutations.length);
    if (mutations.length > 0) {
      await this.flushSyncQueue();
    }
  }

  private async handleOffline() {
    const mutations = await getPendingMutations();
    this.notify("offline", mutations.length);
  }

  public async flushSyncQueue(): Promise<{ processed: number; errors: number }> {
    if (this.isFlushing || !this.isOnline()) {
      const current = await getPendingMutations();
      return { processed: 0, errors: current.length };
    }

    this.isFlushing = true;
    const mutations = await getPendingMutations();
    this.notify("syncing", mutations.length);

    let processed = 0;
    let errors = 0;

    for (const mut of mutations) {
      try {
        let endpoint = `/api/projects/${mut.projectId}/sync`;
        if (mut.type === "approve_source") {
          endpoint = `/api/projects/${mut.projectId}/sources/approve`;
        } else if (mut.type === "reject_source") {
          endpoint = `/api/projects/${mut.projectId}/sources/reject`;
        } else if (mut.type === "save_draft") {
          endpoint = `/api/projects/${mut.projectId}/draft`;
        }

        const res = await authedJsonFetch(endpoint, "POST", mut.payload);
        if (res.ok) {
          await removePendingMutation(mut.id);
          processed++;
        } else {
          errors++;
        }
      } catch (err) {
        console.warn(`[SyncManager] Failed to sync mutation ${mut.id}:`, err);
        errors++;
      }
    }

    const remaining = await getPendingMutations();
    this.isFlushing = false;
    this.notify(errors > 0 ? "error" : "synced", remaining.length);

    return { processed, errors };
  }

  public async hydrateProjects(projects: any[]): Promise<void> {
    if (!Array.isArray(projects)) return;
    for (const p of projects) {
      await saveCachedProject(p);
    }
  }

  public async fetchProjectsWithOfflineFallback(
    onlineFetcher: () => Promise<any[]>
  ): Promise<{ items: any[]; isOffline: boolean }> {
    if (this.isOnline()) {
      try {
        const items = await onlineFetcher();
        await this.hydrateProjects(items);
        return { items, isOffline: false };
      } catch (err) {
        console.warn("[SyncManager] Online fetch failed, falling back to local cache:", err);
      }
    }

    // Offline fallback from local IndexedDB cache
    const cached = await listCachedProjects();
    return { items: cached, isOffline: true };
  }
}

export const syncManager = new PocketSyncManager();
