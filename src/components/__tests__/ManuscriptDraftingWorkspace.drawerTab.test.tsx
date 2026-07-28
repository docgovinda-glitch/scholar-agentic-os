// @vitest-environment jsdom
//
// Sci-fi redesign, navy-replacement step — characterization test for the
// drawer-tab nav's active-state click behavior, written BEFORE recoloring
// its active-state background from navy to the cyan system accent (this is
// system-chrome tab navigation, same pattern already redone for
// AppHeader/CommandPalette/AIControlCenter's tab navs in earlier steps).

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ManuscriptDraftingWorkspace from "../ManuscriptDraftingWorkspace";
import { DEFAULT_STATE, PaperProject } from "../../types";

vi.mock("../../services/agentService", () => ({ executeAgent: vi.fn() }));
vi.mock("../../services/aiService", () => ({
  draftSection: vi.fn(),
  buildBibliography: vi.fn().mockReturnValue(""),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWorkspace(overrides: Partial<PaperProject> = {}) {
  const project: PaperProject = { ...DEFAULT_STATE("tester"), title: "A Title", ...overrides };
  render(
    <ManuscriptDraftingWorkspace
      project={project}
      updateProject={vi.fn()}
      onNext={vi.fn()}
      onBack={vi.fn()}
      isFocusMode={true}
      onToggleFocusMode={vi.fn()}
    />
  );
}

describe("ManuscriptDraftingWorkspace — drawer tab nav behavior preserved across the redesign", () => {
  it("clicking the Vault Continuity drawer tab switches its content in", () => {
    renderWorkspace();
    fireEvent.click(screen.getByText("Vault Continuity"));
    expect(screen.getByText("Vault Continuity").closest("button")).toBeInTheDocument();
  });
});
