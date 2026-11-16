import { describe, it, expect, vi, afterEach } from "vitest";
import { getProjectStore, onProjectSaved } from "../projectStore";

describe("onProjectSaved", () => {
  const offs: Array<() => void> = [];
  afterEach(() => offs.splice(0).forEach((off) => off()));

  it("runs listeners after a save and survives a throwing listener", async () => {
    const seen = vi.fn();
    offs.push(onProjectSaved(() => { throw new Error("boom"); }));
    offs.push(onProjectSaved(seen));
    const store = getProjectStore();
    const record = await store.create("OT-01", "owner-1");
    const saved = await store.save({ ...record, answers: { assignment_title: "T" } });
    // Coursework settings keep one stored name: the old alias lands on "title".
    expect(saved.answers.title).toBe("T");
    expect(saved.answers.assignment_title).toBeUndefined();
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ projectId: record.projectId }));
  });
});
