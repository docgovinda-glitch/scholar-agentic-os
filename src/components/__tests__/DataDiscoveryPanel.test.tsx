// @vitest-environment jsdom
//
// Characterization tests for DataDiscoveryPanel.tsx's Stage 6 (target-workflow.md)
// research-proposal gate. Per the spec, research proposals are the only format
// that skips primary/secondary data collection entirely, and the only format where
// agents never add data sources (discoverDataSources itself already gates this —
// see aiService.discoverDataSources.test.ts). This file locks in the CURRENT
// (pre-gate) UI behavior first, then — after the gate is added — the first test
// below is updated to the new intentional behavior; the rest keep proving every
// other format is unaffected.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import DataDiscoveryPanel from "../DataDiscoveryPanel";
import { DEFAULT_STATE, PaperProject, OutputFormat } from "../../types";

vi.mock("../../services/aiService", () => ({
  discoverDataSources: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

function buildProject(outputFormat: OutputFormat | "", overrides: Partial<PaperProject> = {}): PaperProject {
  return { ...DEFAULT_STATE("jdoe"), outputFormat, ...overrides };
}

function renderPanel(project: PaperProject) {
  const updateProject = vi.fn();
  const onNext = vi.fn();
  const onBack = vi.fn();
  render(<DataDiscoveryPanel project={project} updateProject={updateProject} onNext={onNext} onBack={onBack} />);
  return { updateProject, onNext, onBack };
}

describe("DataDiscoveryPanel — research-proposal gate", () => {
  it("skips primary/secondary data collection for research-proposal projects, showing a dedicated notice instead", () => {
    renderPanel(buildProject("research-proposal"));

    expect(screen.getByText(/skip(s)? primary/i)).toBeInTheDocument();
    expect(screen.queryByText("Query Authentic Directories")).not.toBeInTheDocument();
    expect(screen.queryByText("Document Upload & Profile")).not.toBeInTheDocument();
  });

  it("'Continue' from the research-proposal notice advances to the next phase directly", () => {
    const { onNext } = renderPanel(buildProject("research-proposal"));
    screen.getByText(/continue/i).click();
    expect(onNext).toHaveBeenCalled();
  });

  it.each<[OutputFormat | ""]>([[""], ["journal-article"], ["research-paper"], ["term-paper"], ["book-chapter"], ["report"]])(
    "still shows the normal discovery UI for %s",
    (outputFormat) => {
      renderPanel(buildProject(outputFormat));

      expect(screen.getByText("Query Authentic Directories")).toBeInTheDocument();
      expect(screen.getByText("Document Upload & Profile")).toBeInTheDocument();
    }
  );
});
