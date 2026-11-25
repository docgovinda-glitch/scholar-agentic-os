// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const supa = vi.hoisted(() => ({ configured: false }));
vi.mock("../../services/supabaseClient", () => ({
  isSupabaseConfigured: () => supa.configured,
  getSupabaseClient: () => null,
}));
vi.mock("../../services/offline/indexedDbStorage", () => ({
  deleteCachedProject: vi.fn().mockResolvedValue(undefined),
  removePendingMutationsForProject: vi.fn().mockResolvedValue(undefined),
}));
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("../originalFetch", () => ({ originalFetch: fetchMock }));
vi.mock("../api/authHeaders", () => ({ authHeaders: async () => ({}) }));

import {
  clearAllEphemeralProjects,
  createEphemeralProject,
  getMigratedDraftRealId,
  isEphemeralProject,
  recordDraftMigration,
} from "../ephemeralProjectStore";
import { commitProjectToDatabase } from "../api/client";
import { deleteProject } from "../api/projectsApi";

const res = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;

describe("migrated project ids", () => {
  beforeEach(() => {
    clearAllEphemeralProjects();
    fetchMock.mockReset();
  });

  it("a migrated proj-* id is not ephemeral, and chains resolve to the final id", () => {
    const draft = createEphemeralProject("OT-01");
    expect(isEphemeralProject(draft.projectId)).toBe(true);
    recordDraftMigration(draft.projectId, "proj-a");
    expect(isEphemeralProject("proj-a")).toBe(false);
    expect(isEphemeralProject(draft.projectId)).toBe(false);
    // A persisted id is never recorded as an alias of another row (that was the cloning bug).
    recordDraftMigration("proj-a", "proj-b");
    expect(getMigratedDraftRealId("proj-a")).toBeNull();
    expect(getMigratedDraftRealId(draft.projectId)).toBe("proj-a");
  });

  it("draft chains resolve transitively and cycles terminate", () => {
    recordDraftMigration("draft-x-1", "draft-x-2");
    recordDraftMigration("draft-x-2", "proj-final");
    expect(getMigratedDraftRealId("draft-x-1")).toBe("proj-final");
    recordDraftMigration("draft-c-1", "draft-c-2");
    recordDraftMigration("draft-c-2", "draft-c-1");
    expect(getMigratedDraftRealId("draft-c-1")).toBeTruthy();
  });

  it("scrubs legacy proj-* entries and proj-* -> proj-* aliases left in storage by older builds", () => {
    localStorage.setItem("scholar_ephemeral_projects_backup", JSON.stringify([{ projectId: "proj-legacy", outputTypeId: "OT-01", answers: {} }]));
    localStorage.setItem("scholar_migrated_drafts_map", JSON.stringify({ "proj-old": "proj-clone", "draft-ok-1": "proj-real", "draft-self": "draft-self" }));
    expect(isEphemeralProject("proj-legacy")).toBe(false);
    expect(getMigratedDraftRealId("proj-old")).toBeNull();
    expect(getMigratedDraftRealId("draft-self")).toBeNull();
    expect(getMigratedDraftRealId("draft-ok-1")).toBe("proj-real");
    // Nothing persisted is written back into the ephemeral store.
    recordDraftMigration("draft-ok-2", "proj-real-2");
    const after = JSON.parse(localStorage.getItem("scholar_ephemeral_projects_backup") ?? "[]") as Array<{ projectId: string }>;
    expect(after.some((p) => p.projectId === "proj-legacy")).toBe(false);
    const map = JSON.parse(localStorage.getItem("scholar_migrated_drafts_map") ?? "{}") as Record<string, string>;
    expect(map["proj-old"]).toBeUndefined();
  });

  it("concurrent commits of one draft share a single POST", async () => {
    const draft = createEphemeralProject("OT-01");
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === "POST" ? res(200, { projectId: "proj-new", outputTypeId: "OT-01", answers: {} }) : res(200, { projectId: "proj-new", answers: { title: "Untitled Project" } })
    );
    const [a, b] = await Promise.all([commitProjectToDatabase(draft.projectId), commitProjectToDatabase(draft.projectId)]);
    expect(a.projectId).toBe("proj-new");
    expect(b.projectId).toBe("proj-new");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    // A later commit of the same draft returns the server row, never a clone.
    await commitProjectToDatabase(draft.projectId);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("commitProjectToDatabase never creates a second row for a proj-* id", async () => {
    fetchMock.mockResolvedValue(res(200, { projectId: "proj-1", answers: {} }));
    const out = await commitProjectToDatabase("proj-1");
    expect(out.projectId).toBe("proj-1");
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
  });
});

describe("deleteProject", () => {
  beforeEach(() => {
    clearAllEphemeralProjects();
    fetchMock.mockReset();
  });

  it("sends DELETE for a migrated project's real id", async () => {
    recordDraftMigration("draft-ot01-1", "proj-9");
    fetchMock.mockResolvedValue(res(200));
    await deleteProject("draft-ot01-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/projects/proj-9");
    expect(init.method).toBe("DELETE");
    expect(getMigratedDraftRealId("draft-ot01-1")).toBeNull();
  });

  it("throws on a server error instead of reporting success", async () => {
    fetchMock.mockResolvedValue(res(500));
    await expect(deleteProject("proj-5")).rejects.toThrow();
  });

  it("keeps local copies when the server delete fails, and clears every alias and cache once it succeeds", async () => {
    const { deleteCachedProject, removePendingMutationsForProject } = await import("../../services/offline/indexedDbStorage");
    recordDraftMigration("draft-ot01-7", "proj-7");
    sessionStorage.setItem("project_proj-7_state", "x");
    fetchMock.mockResolvedValueOnce(res(503));
    await expect(deleteProject("proj-7")).rejects.toThrow(/503/);
    expect(getMigratedDraftRealId("draft-ot01-7")).toBe("proj-7");
    expect(sessionStorage.getItem("project_proj-7_state")).toBe("x");

    fetchMock.mockResolvedValueOnce(res(200));
    await deleteProject("proj-7");
    expect(getMigratedDraftRealId("draft-ot01-7")).toBeNull();
    expect(sessionStorage.getItem("project_proj-7_state")).toBeNull();
    expect(deleteCachedProject).toHaveBeenCalledWith("proj-7");
    expect(removePendingMutationsForProject).toHaveBeenCalledWith("proj-7");
  });

  it("deletes through the server route only (no direct browser table delete)", async () => {
    supa.configured = true;
    fetchMock.mockResolvedValue(res(200));
    await deleteProject("proj-8");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    supa.configured = false;
  });

  it("treats 404 as already deleted", async () => {
    fetchMock.mockResolvedValue(res(404));
    await expect(deleteProject("proj-5")).resolves.toEqual({ success: true, id: "proj-5" });
  });
});
