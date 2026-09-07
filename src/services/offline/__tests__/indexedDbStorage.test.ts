import { describe, it, expect, beforeEach } from "vitest";
import {
  saveCachedProject,
  getCachedProject,
  listCachedProjects,
  enqueueOfflineMutation,
  getPendingMutations,
  removePendingMutation,
  clearOfflineCache,
} from "../indexedDbStorage";

describe("indexedDbStorage", () => {
  beforeEach(async () => {
    await clearOfflineCache();
  });

  it("saves and retrieves a cached project", async () => {
    const project = {
      projectId: "proj-cached-1",
      title: "Grounded Bayesian Inference",
      currentWordCount: 5000,
    };

    await saveCachedProject(project);
    const retrieved = await getCachedProject("proj-cached-1");

    expect(retrieved).toEqual(project);
  });

  it("lists all cached projects in the local offline store", async () => {
    await saveCachedProject({ projectId: "p-1", title: "Project 1" });
    await saveCachedProject({ projectId: "p-2", title: "Project 2" });

    const all = await listCachedProjects();
    expect(all.length).toBe(2);
    expect(all.map((p) => p.projectId)).toContain("p-1");
    expect(all.map((p) => p.projectId)).toContain("p-2");
  });

  it("enqueues, retrieves and removes offline mutations in chronological order", async () => {
    const mut1 = await enqueueOfflineMutation({
      projectId: "p-1",
      type: "approve_source",
      payload: { sourceId: "src-101" },
    });

    const mut2 = await enqueueOfflineMutation({
      projectId: "p-1",
      type: "save_draft",
      payload: { content: "Updated draft content" },
    });

    let pending = await getPendingMutations();
    expect(pending.length).toBe(2);
    expect(pending[0].id).toBe(mut1.id);
    expect(pending[1].id).toBe(mut2.id);

    await removePendingMutation(mut1.id);

    pending = await getPendingMutations();
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe(mut2.id);
  });
});
