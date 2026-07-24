// @vitest-environment jsdom
//
// Stage 8 (target-workflow.md) — structured requirements capture for
// non-journal formats. New component, new tests (no pre-existing behavior
// to characterize).

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import NonJournalRequirementsPanel from "../NonJournalRequirementsPanel";
import { DEFAULT_STATE, PaperProject } from "../../types";

afterEach(() => {
  cleanup();
});

function renderPanel(overrides: Partial<PaperProject> = {}, updateProject = vi.fn(), onNext = vi.fn()) {
  const project: PaperProject = { ...DEFAULT_STATE("jdoe"), outputFormat: "term-paper", ...overrides };
  render(
    <NonJournalRequirementsPanel project={project} updateProject={updateProject} onNext={onNext} onBack={vi.fn()} />
  );
  return { project, updateProject, onNext };
}

describe("NonJournalRequirementsPanel — pre-population from documentTemplates.ts", () => {
  it("pre-populates the section-structure textarea from the term-paper template when no complianceRules exist yet", () => {
    renderPanel();
    const textarea = screen.getAllByRole("textbox").find((el) => (el as HTMLTextAreaElement).value.includes("Introduction")) as HTMLTextAreaElement;
    expect(textarea.value).toContain("Title Page");
    expect(textarea.value).toContain("Body / Discussion");
    expect(textarea.value).not.toContain("Abstract & Keywords"); // term-paper has no abstract
  });

  it("pre-populates citation style from the format's default", () => {
    renderPanel({ outputFormat: "book-chapter" });
    expect(screen.getByDisplayValue("Chicago")).toBeInTheDocument(); // book-chapter's defaultCitationStyle
  });
});

describe("NonJournalRequirementsPanel — save behavior", () => {
  it("saves citationStyle, wordCountMin/Max, sectionStructure, and customNotes onto complianceRules, advancing the phase in the same updateProject call", () => {
    const updateProject = vi.fn();
    renderPanel({ currentPhase: "E" }, updateProject);

    fireEvent.change(screen.getByDisplayValue("APA 7th"), { target: { value: "MLA 9th" } });
    fireEvent.change(screen.getByPlaceholderText("Min"), { target: { value: "2500" } });
    fireEvent.change(screen.getByPlaceholderText("Max"), { target: { value: "3000" } });
    fireEvent.change(screen.getByPlaceholderText(/institution, instructor/i), { target: { value: "Must use 12pt Garamond per Prof. Lee's rubric." } });

    fireEvent.click(screen.getByText("Save & Proceed to Drafting →"));

    // Exactly one updateProject call — folding the phase advance into the
    // same call as the save avoids the real race this app's updateProject
    // (useProjectPersistence.ts) has when called twice in a row: it closes
    // over the pre-save project, so a second, separate call would silently
    // drop complianceRules (confirmed live before this fix).
    expect(updateProject).toHaveBeenCalledTimes(1);
    const call = updateProject.mock.calls[0][0];
    const savedRules = call.complianceRules;
    expect(savedRules.citationStyle).toBe("MLA 9th");
    expect(savedRules.wordCountMin).toBe(2500);
    expect(savedRules.wordCountMax).toBe(3000);
    expect(savedRules.wordCountGoal).toBe("2500-3000 words");
    expect(savedRules.customNotes).toBe("Must use 12pt Garamond per Prof. Lee's rubric.");
    expect(savedRules.sectionStructure).toContain("Introduction");
    expect(call.currentPhase).toBe("F");
  });

  it("allows editing the section structure textarea, splitting on newlines into an array", () => {
    const updateProject = vi.fn();
    renderPanel({}, updateProject);

    const textarea = screen.getAllByRole("textbox").find((el) => (el as HTMLTextAreaElement).value.includes("Introduction")) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Custom Intro\nCustom Body\nCustom Conclusion" } });

    fireEvent.click(screen.getByText("Save & Proceed to Drafting →"));

    const savedRules = updateProject.mock.calls[0][0].complianceRules;
    expect(savedRules.sectionStructure).toEqual(["Custom Intro", "Custom Body", "Custom Conclusion"]);
  });
});
