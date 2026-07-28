// @vitest-environment jsdom
//
// Sci-fi redesign, Step 5 (ResearchIntelligenceDashboard.tsx) — no test file
// existed for this component before this step. These characterization
// tests, written BEFORE the visual redesign per this project's standing TDD
// discipline, lock in project search/select/create/delete, phase
// navigation, and the citations-vault sidebar toggle so the redesign (cyan
// AI-dispatch accents on the still-light dashboard surface) only ever
// changes classNames, never these behaviors.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ResearchIntelligenceDashboard from "../ResearchIntelligenceDashboard";
import { DEFAULT_STATE, PaperProject } from "../../types";

afterEach(() => {
  cleanup();
});

function makeProject(overrides: Partial<PaperProject> = {}): PaperProject {
  return { ...DEFAULT_STATE("jdoe"), title: "Test Dissertation", field: "Philosophy", ...overrides };
}

function renderDashboard(overrides: Partial<React.ComponentProps<typeof ResearchIntelligenceDashboard>> = {}) {
  const project = makeProject();
  const props = {
    project,
    projects: [project],
    onSelectProject: vi.fn(),
    onCreateProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onNavigateToPhase: vi.fn(),
    ...overrides
  };
  render(<ResearchIntelligenceDashboard {...props} />);
  return props;
}

describe("ResearchIntelligenceDashboard — behavior preserved across the redesign", () => {
  it("renders summary metrics and the project card", () => {
    renderDashboard();
    expect(screen.getByText("Research Intelligence Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Test Dissertation")).toBeInTheDocument();
  });

  it("filters projects by search query", () => {
    const projectA = makeProject({ id: "a", title: "Alpha Paper" });
    const projectB = makeProject({ id: "b", title: "Beta Paper" });
    renderDashboard({ project: projectA, projects: [projectA, projectB] });

    fireEvent.change(screen.getByPlaceholderText("Search projects..."), { target: { value: "Alpha" } });
    expect(screen.getByText("Alpha Paper")).toBeInTheDocument();
    expect(screen.queryByText("Beta Paper")).not.toBeInTheDocument();
  });

  it("clicking a project card calls onSelectProject with its id", () => {
    const props = renderDashboard();
    fireEvent.click(screen.getByText("Test Dissertation"));
    expect(props.onSelectProject).toHaveBeenCalledWith(props.project!.id);
  });

  it("clicking New Project calls onCreateProject", () => {
    const props = renderDashboard();
    fireEvent.click(screen.getByText("New Project"));
    expect(props.onCreateProject).toHaveBeenCalled();
  });

  it("clicking a project's delete button calls onDeleteProject with its id, without selecting it", () => {
    const props = renderDashboard();
    fireEvent.click(screen.getByTitle("Delete workspace"));
    expect(props.onDeleteProject).toHaveBeenCalledWith(props.project!.id);
    expect(props.onSelectProject).not.toHaveBeenCalled();
  });

  it("Quick Command Panel buttons call onNavigateToPhase with the right phase", () => {
    const props = renderDashboard();
    fireEvent.click(screen.getByText("Anchor to Dissertation"));
    expect(props.onNavigateToPhase).toHaveBeenCalledWith("B");
    fireEvent.click(screen.getByText("Find Target Journal"));
    expect(props.onNavigateToPhase).toHaveBeenCalledWith("D");
    fireEvent.click(screen.getByText("Run Compliance Audit"));
    expect(props.onNavigateToPhase).toHaveBeenCalledWith("G");
  });

  it("toggles the Citations Vault sidebar open and closed", () => {
    renderDashboard();
    expect(screen.queryByText("Cached Vault Citations")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Citations Vault"));
    expect(screen.getByText("Cached Vault Citations")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Close Vault"));
    expect(screen.queryByText("Cached Vault Citations")).not.toBeInTheDocument();
  });
});
