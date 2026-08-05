// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const listProjects = vi.fn();
vi.mock("../../api", () => ({
  listProjects: (...a: unknown[]) => listProjects(...a),
}));

const { default: DeskPocketMount } = await import("../DeskPocketMount");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DeskPocketMount", () => {
  it("shows a loading state before the project list resolves", () => {
    listProjects.mockReturnValue(new Promise(() => {}));
    render(<DeskPocketMount projectId={null} />);
    expect(screen.getByText(/Loading your projects/)).toBeInTheDocument();
  });

  it("renders Pocket's home tab once projects load, with no project open", async () => {
    listProjects.mockResolvedValue({ items: [] });
    render(<DeskPocketMount projectId={null} />);
    // PocketShell's Home tab shows "Everything caught up" with no outstanding items.
    expect(await screen.findByText(/Everything caught up/)).toBeInTheDocument();
  });

  it("surfaces a load failure as an announced error", async () => {
    listProjects.mockRejectedValue(new Error("Network down."));
    render(<DeskPocketMount projectId={null} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Network down.");
  });

  it("maps a real project into Pocket's project list", async () => {
    listProjects.mockResolvedValue({
      items: [
        {
          projectId: "proj-1",
          outputTypeId: "OT-01",
          answers: { title: "A Study of Things" },
          intakeCompleteness: 0.5,
          hasDocument: false,
          gates: [{ gate: "G0", name: "Intake", status: "in_progress", outstandingBlocking: [] }],
        },
      ],
    });
    render(<DeskPocketMount projectId={null} />);
    // Home tab shows nothing outstanding for this project (no pending approvals/comments), so it's
    // still "Everything caught up" — switch to the Projects tab to see it listed.
    await screen.findByText(/Everything caught up/);
    screen.getByText("projects").closest("button")!.click();
    expect(await screen.findByText("A Study of Things")).toBeInTheDocument();
  });
});
