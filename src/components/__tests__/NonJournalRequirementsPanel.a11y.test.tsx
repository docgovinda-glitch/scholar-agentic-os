// @vitest-environment jsdom
//
// Production-readiness pass (2026-07-24, follow-up session) — a11y audit
// flagged 10 unlabeled form fields in NonJournalRequirementsPanel.tsx (real
// <label>s existed visually in most cases but weren't programmatically
// associated via htmlFor/id, so screen readers couldn't announce them).
// These tests confirm every form control has a real accessible name,
// queryable the same way assistive tech resolves one.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import NonJournalRequirementsPanel from "../NonJournalRequirementsPanel";
import { DEFAULT_STATE, PaperProject } from "../../types";

afterEach(() => {
  cleanup();
});

function renderPanel(overrides: Partial<PaperProject> = {}) {
  const project: PaperProject = { ...DEFAULT_STATE("jdoe"), outputFormat: "term-paper", ...overrides };
  render(<NonJournalRequirementsPanel project={project} updateProject={vi.fn()} onNext={vi.fn()} onBack={vi.fn()} />);
}

describe("NonJournalRequirementsPanel — accessible names for every form control", () => {
  it("every labeled field is resolvable by its accessible name (getByLabelText)", () => {
    renderPanel();

    expect(screen.getByLabelText("Citation Style")).toBeInTheDocument();
    expect(screen.getByLabelText("Minimum word count target")).toBeInTheDocument();
    expect(screen.getByLabelText("Maximum word count target")).toBeInTheDocument();
    expect(screen.getByLabelText("Margins (in)")).toBeInTheDocument();
    expect(screen.getByLabelText("Font Size (pt)")).toBeInTheDocument();
    expect(screen.getByLabelText("Font Family")).toBeInTheDocument();
    expect(screen.getByLabelText("Line Spacing")).toBeInTheDocument();
    expect(screen.getByLabelText("Institution / Instructor Notes")).toBeInTheDocument();
    expect(screen.getByLabelText("Upload sample document to detect section structure")).toBeInTheDocument();
    expect(screen.getByLabelText("Manuscript section structure, one section per line")).toBeInTheDocument();
  });

  it("the Citation Style select's label and control are programmatically linked via htmlFor/id, not just adjacent text", () => {
    renderPanel();
    const select = screen.getByLabelText("Citation Style") as HTMLSelectElement;
    const label = document.querySelector('label[for="citation-style"]');
    expect(label).not.toBeNull();
    expect(select.id).toBe("citation-style");
  });
});
