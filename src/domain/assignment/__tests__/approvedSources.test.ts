import { describe, it, expect } from "vitest";
import { isSourceApproved, selectApprovedSources } from "../approvedSources";
import { buildAssignmentRelationalSnapshot } from "../assignmentRelational";

const live = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: id, status: "kept", ...extra });

describe("approved Coursework sources", () => {
  it("a discovered paper still in the list ('kept') is not approved until the student approves it", () => {
    const sources = [live("a"), live("b"), live("c")];
    expect(selectApprovedSources(sources, ["b"]).map((s) => s.id)).toEqual(["b"]);
    expect(selectApprovedSources(sources, [])).toEqual([]);
    expect(selectApprovedSources(sources, null)).toEqual([]);
  });

  it("a removed or excluded source is never approved, even if its id lingers in the list", () => {
    expect(isSourceApproved(live("a", { status: "removed" }), ["a"])).toBe(false);
    expect(isSourceApproved(live("a", { isExcluded: true }), ["a"])).toBe(false);
  });

  it("the DB mirror marks only approved sources (prescribed ones before any decision)", () => {
    const sources = [live("p", { prescribedInBrief: true }), live("x"), live("y")];
    const before = buildAssignmentRelationalSnapshot("p1", { assignment_sources: JSON.stringify(sources) });
    expect(before.sourceOrigins.filter((s) => s.is_approved).map((s) => s.source_id)).toEqual(["p"]);
    const after = buildAssignmentRelationalSnapshot("p1", {
      assignment_sources: JSON.stringify(sources),
      approved_source_ids: JSON.stringify(["y"]),
    });
    expect(after.sourceOrigins.filter((s) => s.is_approved).map((s) => s.source_id)).toEqual(["y"]);
  });
});

describe("approval statuses", () => {
  it("accepts an unreviewed source that is in the approved list, never a removed one", async () => {
    const { isSourceApproved } = await import("../approvedSources");
    expect(isSourceApproved({ id: "a", status: "unreviewed" }, ["a"])).toBe(true);
    expect(isSourceApproved({ id: "a", status: "unreviewed" }, [])).toBe(false);
    expect(isSourceApproved({ id: "a", status: "removed" }, ["a"])).toBe(false);
  });
});
