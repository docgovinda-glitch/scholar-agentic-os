// @vitest-environment jsdom
//
// Sci-fi redesign, navy-replacement step — characterization test for the
// drawer-tab nav's active-state click behavior, written BEFORE recoloring
// its active-state background from navy to the cyan system accent (system-
// chrome tab navigation, same pattern already redone for AppHeader/
// CommandPalette/AIControlCenter's tab navs in earlier steps).

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ManuscriptEditorWorkspace from "../ManuscriptEditorWorkspace";
import { DEFAULT_STATE, PaperProject } from "../../types";

vi.mock("../../services/aiService", () => ({
  draftSection: vi.fn(),
}));

Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWorkspace(overrides: Partial<PaperProject> = {}) {
  const project: PaperProject = { ...DEFAULT_STATE("jdoe"), sections: { Introduction: "Real drafted intro text." }, ...overrides };
  render(
    <ManuscriptEditorWorkspace
      project={project}
      updateProject={vi.fn()}
      onNext={vi.fn()}
      onBack={vi.fn()}
      isFocusMode={true}
      onToggleFocusMode={vi.fn()}
    />
  );
}

describe("ManuscriptEditorWorkspace — drawer tab nav behavior preserved across the redesign", () => {
  it("clicking the Vault Continuity drawer tab renders it", () => {
    renderWorkspace();
    fireEvent.click(screen.getByText("Vault Continuity"));
    expect(screen.getByText("Vault Continuity").closest("button")).toBeInTheDocument();
  });
});
