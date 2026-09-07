// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncManager } from "../syncManager";
import {
  clearOfflineCache,
  enqueueOfflineMutation,
  getPendingMutations,
  saveCachedProject,
} from "../indexedDbStorage";

describe("syncManager", () => {
  beforeEach(async () => {
    await clearOfflineCache();
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
  });

  it("reports online state and allows subscription to sync status changes", async () => {
    const statusLogs: string[] = [];
    const unsubscribe = syncManager.subscribe((status) => {
      statusLogs.push(status);
    });

    expect(statusLogs.length).toBeGreaterThanOrEqual(1);
    unsubscribe();
  });

  it("flushes pending offline mutations when online", async () => {
    await enqueueOfflineMutation({
      projectId: "proj-sync-1",
      type: "approve_source",
      payload: { sourceId: "s-1" },
    });

    const initial = await getPendingMutations();
    expect(initial.length).toBe(1);

    const result = await syncManager.flushSyncQueue();
    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);

    const remaining = await getPendingMutations();
    expect(remaining.length).toBe(0);
  });

  it("falls back to local cached projects when offline fetch fails", async () => {
    await saveCachedProject({
      projectId: "cached-proj-1",
      title: "Offline Preserved Research",
      outputTypeId: "OT-01",
    });

    const failingFetcher = vi.fn().mockRejectedValue(new Error("Connection refused"));

    const res = await syncManager.fetchProjectsWithOfflineFallback(failingFetcher);
    expect(res.items.length).toBe(1);
    expect(res.items[0].title).toBe("Offline Preserved Research");
    expect(res.isOffline).toBe(true);
  });
});
