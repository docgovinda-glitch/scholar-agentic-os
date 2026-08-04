// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import PocketShell from "../PocketShell";
import type { PocketProject, ApprovalQueueState } from "../types";

describe("PocketShell", () => {
  const mockProjects: PocketProject[] = [
    {
      projectId: "Project A",
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
      projectId: "Project B",
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

  const mockApprovalQueue: ApprovalQueueState = {
    candidates: [
      {
        id: "src-1",
        title: "Sample Paper",
        authors: ["John Doe", "Jane Smith"],
        venue: "Journal of Examples",
        year: 2024,
        doi: "10.1234/example",
        summary: "An example paper",
        authenticityChecks: {
          doiResolves: true,
          publisherVerified: true,
          notRetracted: true,
          journalRanking: "A",
        },
        citationString: "Doe, J., & Smith, J. (2024). Sample paper. Journal of Examples.",
        pdfUrl: "https://example.com/paper.pdf",
        reasonSuggested: "Relevant to methodology",
        position: 0,
        total: 5,
      },
    ],
    currentIndex: 0,
    approvedCount: 0,
    rejectedCount: 0,
  };

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

  it("navigates to approval queue view", () => {
    render(<PocketShell projects={mockProjects} approvalQueue={mockApprovalQueue} />);
    const startReviewingButton = screen.getByText("Start Reviewing");
    fireEvent.click(startReviewingButton);
    expect(screen.getByText("Source Review")).toBeInTheDocument();
  });

  it("shows home tab has attention items when projects have pending items", () => {
    const projectsWithAttention: PocketProject[] = [
      {
        ...mockProjects[0],
        sourcesAwaitingApproval: 5,
      },
    ];
    render(<PocketShell projects={projectsWithAttention} />);
    expect(screen.getByText("Needs Attention")).toBeInTheDocument();
  });

  it("displays start reviewing button in reach zone on home tab", () => {
    render(<PocketShell projects={mockProjects} />);
    const startReviewingButton = screen.getByText("Start Reviewing");
    expect(startReviewingButton).toBeInTheDocument();
  });

  it("renders approval queue with source data", () => {
    render(<PocketShell projects={mockProjects} approvalQueue={mockApprovalQueue} />);
    const startReviewingButton = screen.getByText("Start Reviewing");
    fireEvent.click(startReviewingButton);
    expect(screen.getByText("Sample Paper")).toBeInTheDocument();
    expect(screen.getByText("John Doe, Jane Smith")).toBeInTheDocument();
  });

  it("returns to home from approval queue", () => {
    render(<PocketShell projects={mockProjects} approvalQueue={mockApprovalQueue} />);
    const startReviewingButton = screen.getByText("Start Reviewing");
    fireEvent.click(startReviewingButton);
    const backButton = screen.getByText("← Back to Home");
    fireEvent.click(backButton);
    expect(screen.getByText("Scholar OS")).toBeInTheDocument();
  });
});
