import { describe, it, expect } from "vitest";
import { toPocketProject, toPocketProjects } from "../toPocketProjects";
import type { ProjectView } from "../../types";

function project(overrides: Partial<ProjectView> = {}): ProjectView {
  return {
    projectId: "proj-1",
    outputTypeId: "OT-01",
    answers: {},
    intakeCompleteness: 0.5,
    hasDocument: false,
    gates: [{ gate: "G0", name: "Intake", status: "in_progress", outstandingBlocking: [] }],
    ...overrides,
  };
}

describe("toPocketProject", () => {
  it("falls back to the output type id when there is no title answer", () => {
    const p = toPocketProject(project({ outputTypeId: "OT-04" }));
    expect(p.title).toBe("OT-04");
  });

  it("uses the title intake answer when present", () => {
    const p = toPocketProject(project({ answers: { title: "A Study of Things" } }));
    expect(p.title).toBe("A Study of Things");
  });

  it("carries the project's real gates through unchanged", () => {
    const p = toPocketProject(project());
    expect(p.gates).toEqual([{ gate: "G0", name: "Intake", status: "in_progress", outstandingBlocking: [] }]);
  });

  it("is honest about counts Desk doesn't track, rather than fabricating them", () => {
    const p = toPocketProject(project());
    expect(p.unreadComments).toBe(0);
    expect(p.pendingStudioChanges).toBe(0);
    expect(p.sourcesAwaitingApproval).toBe(0);
  });

  it("maps a whole list", () => {
    const list = toPocketProjects([project({ projectId: "p1" }), project({ projectId: "p2" })]);
    expect(list.map((p) => p.projectId)).toEqual(["p1", "p2"]);
  });
});
