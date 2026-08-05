// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import PocketShell from "../PocketShell";
import type { PocketProject } from "../types";

describe("PocketShell", () => {
  const mockProjects: PocketProject[] = [
    {
      projectId: "project-a",
      title: "Project A",
      outputTypeId: "ot-01",
      answers: {},
      intakeCompleteness: 0.8,
      hasDocument: true,
      gates: [],
      lastModified: new Date("2024-01-15"),
      unreadComments: 2,
      pendingStudioChanges: 1,
      sourcesAwaitingApproval: 3,
    },
    {
      projectId: "project-b",
      title: "Project B",
      outputTypeId: "ot-02",
      answers: {},
      intakeCompleteness: 0.5,
      hasDocument: false,
      gates: [],
      lastModified: new Date("2024-01-10"),
      unreadComments: 0,
      pendingStudioChanges: 0,
      sourcesAwaitingApproval: 0,
    },
  ];

  it("renders tabs view by default", () => {
    render(<PocketShell projects={mockProjects} />);
    expect(screen.getByText("Scholar OS")).toBeInTheDocument();
  });

  it("displays home tab on mount", () => {
    const projectsWithNoAttention: PocketProject[] = [
      {
        ...mockProjects[0],
        sourcesAwaitingApproval: 0,
        pendingStudioChanges: 0,
        unreadComments: 0,
      },
    ];
    render(<PocketShell projects={projectsWithNoAttention} />);
    expect(screen.getByText("Everything caught up")).toBeInTheDocument();
  });

  it("shows home tab has attention items when projects have pending items", () => {
    render(<PocketShell projects={mockProjects} />);
    expect(screen.getByText("Needs Attention")).toBeInTheDocument();
    expect(screen.getByText(/Project A/)).toBeInTheDocument();
  });

  it("shows project titles rather than project ids", () => {
    render(<PocketShell projects={mockProjects} />);
    expect(screen.getByText("Project A")).toBeInTheDocument();
    expect(screen.queryByText("project-a")).not.toBeInTheDocument();
  });

  it("survives projectId appearing and disappearing", () => {
    const { rerender } = render(<PocketShell projects={mockProjects} />);
    expect(screen.getByText("Scholar OS")).toBeInTheDocument();

    rerender(<PocketShell projects={mockProjects} projectId="project-a" />);
    expect(screen.getByText("Scholar OS")).toBeInTheDocument();

    rerender(<PocketShell projects={mockProjects} />);
    expect(screen.getByText("Scholar OS")).toBeInTheDocument();
  });
});
