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
    recordDraftMigration("proj-a", "proj-b");
    expect(getMigratedDraftRealId(draft.projectId)).toBe("proj-b");
    // a cycle must terminate
    recordDraftMigration("proj-b", "proj-a");
    expect(getMigratedDraftRealId(draft.projectId)).toBeTruthy();
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

  it("treats 404 as already deleted", async () => {
    fetchMock.mockResolvedValue(res(404));
    await expect(deleteProject("proj-5")).resolves.toEqual({ success: true, id: "proj-5" });
  });
});
