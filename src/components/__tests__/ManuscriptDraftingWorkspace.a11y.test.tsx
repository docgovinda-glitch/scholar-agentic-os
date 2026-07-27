// @vitest-environment jsdom
//
// Production-readiness pass (2026-07-24, follow-up session) — a11y audit
// flagged 9 unlabeled form fields plus one icon-only send button in
// ManuscriptDraftingWorkspace.tsx. These tests confirm every form control
// has a real accessible name (label/aria-label), queryable the same way
// assistive tech resolves one.

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

function renderWorkspace(overrides: Partial<PaperProject> = {}, isFocusMode = false) {
  const project: PaperProject = { ...DEFAULT_STATE("tester"), title: "A Title", ...overrides };
  render(
    <ManuscriptDraftingWorkspace
      project={project}
      updateProject={vi.fn()}
      onNext={vi.fn()}
      onBack={vi.fn()}
      isFocusMode={isFocusMode}
      onToggleFocusMode={vi.fn()}
    />
  );
}

describe("ManuscriptDraftingWorkspace — accessible names for every form control", () => {
  it("Focus Mode's section-switcher select and canvas editor both have real accessible names", () => {
    renderWorkspace({}, true);

    expect(screen.getByLabelText("Select manuscript section to edit")).toBeInTheDocument();
    expect(screen.getByLabelText("Manuscript section draft editor")).toBeInTheDocument();
  });

  it("the standard (non-focus) mode's main draft editor has a real accessible name", () => {
    renderWorkspace();

    expect(screen.getByLabelText("Manuscript section draft editor")).toBeInTheDocument();
  });

  it("the writing-controls sidebar fields all have real accessible names", () => {
    renderWorkspace();

    expect(screen.getByLabelText("2. Writing Style Sample")).toBeInTheDocument();
    expect(screen.getByLabelText("3. Section Outline (Optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("4. Custom Writing Directives")).toBeInTheDocument();
  });

  it("the Scriptural Support and Humanize Prose checkboxes are labeled via a real <label htmlFor>, not just adjacent text", () => {
    renderWorkspace();

    const scriptureCheckbox = document.getElementById("scripture-toggle") as HTMLInputElement;
    const humanizeCheckbox = document.getElementById("humanize-toggle") as HTMLInputElement;
    expect(scriptureCheckbox).not.toBeNull();
    expect(humanizeCheckbox).not.toBeNull();
    expect(document.querySelector('label[for="scripture-toggle"]')).not.toBeNull();
    expect(document.querySelector('label[for="humanize-toggle"]')).not.toBeNull();
  });

  it("the AI chat instruction input and its send button both have real accessible names, once the AI Chat Refiner tab is active", () => {
    renderWorkspace();
    fireEvent.click(screen.getByText("AI Chat Refiner"));

    expect(screen.getByLabelText("Instruct AI to edit the current section")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send instruction to AI" })).toBeInTheDocument();
  });
});
