// @vitest-environment jsdom
//
// Stage 7 (target-workflow.md) sample-document structure learning —
// ComplianceChecklistPanel.tsx (journal path). Was read-only (a static chip
// list); this closes the gap flagged in HANDOVER.md by making section
// structure editable and wiring the same real upload/parse service already
// built for NonJournalRequirementsPanel.tsx. No pre-existing test file for
// this component, so these tests are scoped to the new feature only, not a
// full characterization of the panel.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ComplianceChecklistPanel from "../ComplianceChecklistPanel";
import { DEFAULT_STATE, PaperProject, ComplianceRules } from "../../types";

const { mockLearnStructure } = vi.hoisted(() => ({ mockLearnStructure: vi.fn() }));
vi.mock("../../services/sampleDocLearningService", () => ({
  learnStructureFromSampleDocument: mockLearnStructure,
}));

vi.mock("../../services/aiService", () => ({
  extractRequirements: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function rules(overrides: Partial<ComplianceRules> = {}): ComplianceRules {
  return {
    wordCountGoal: "6,000 - 8,000 words",
    citationStyle: "APA 7th Edition",
    formattingRules: [],
    sectionStructure: ["Title Page", "Abstract & Keywords", "Introduction"],
    abstractRequirements: "",
    referencesRequirement: "",
    ethicalDisclosure: "",
    coverLetterNecessity: "",
    ...overrides,
  };
}

function renderPanel(overrides: Partial<PaperProject> = {}, updateProject = vi.fn()) {
  const project: PaperProject = {
    ...DEFAULT_STATE("jdoe"),
    targetJournal: { name: "Some Journal" } as any,
    complianceRules: rules(),
    ...overrides,
  };
  render(<ComplianceChecklistPanel project={project} updateProject={updateProject} onNext={vi.fn()} onBack={vi.fn()} />);
  return { project, updateProject };
}

function uploadFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("ComplianceChecklistPanel — Target Section Structure is now editable", () => {
  it("shows the section structure as a read-only chip list by default, with an Edit Structure toggle", () => {
    renderPanel();

    expect(screen.getByText("Introduction")).toBeInTheDocument();
    expect(screen.getByText("Edit Structure")).toBeInTheDocument();
    expect(screen.queryByText("Save Section Structure")).not.toBeInTheDocument();
  });

  it("clicking Edit Structure reveals an editable textarea pre-filled with the real current structure, and saves real edits", () => {
    const updateProject = vi.fn();
    renderPanel({}, updateProject);

    fireEvent.click(screen.getByText("Edit Structure"));
    const textarea = screen.getAllByRole("textbox").find((el) => (el as HTMLTextAreaElement).value.includes("Introduction")) as HTMLTextAreaElement;
    expect(textarea.value).toBe("Title Page\nAbstract & Keywords\nIntroduction");

    fireEvent.change(textarea, { target: { value: "Custom A\nCustom B" } });
    fireEvent.click(screen.getByText("Save Section Structure"));

    const saved = updateProject.mock.calls[0][0].complianceRules;
    expect(saved.sectionStructure).toEqual(["Custom A", "Custom B"]);
  });
});

describe("ComplianceChecklistPanel — Stage 7 sample-document structure learning", () => {
  it("replaces the section structure with the real detected structure from an uploaded sample, and shows the provenance badge", async () => {
    mockLearnStructure.mockResolvedValue({
      sectionStructure: ["Executive Summary", "Background", "Findings"],
      sourceFileName: "target-journal-sample.pdf",
    });
    const updateProject = vi.fn();
    renderPanel({}, updateProject);

    uploadFile(new File(["fake bytes"], "target-journal-sample.pdf", { type: "application/pdf" }));

    await waitFor(() => expect(screen.getByText(/Learned from: target-journal-sample.pdf/i)).toBeInTheDocument());
    const textarea = screen.getAllByRole("textbox").find((el) => (el as HTMLTextAreaElement).value.includes("Executive Summary")) as HTMLTextAreaElement;
    expect(textarea.value).toBe("Executive Summary\nBackground\nFindings");

    fireEvent.click(screen.getByText("Save Section Structure"));
    expect(updateProject.mock.calls[0][0].complianceRules.sectionStructure).toEqual(["Executive Summary", "Background", "Findings"]);
  });

  it("shows an honest error (not a fabricated fallback structure) when structure learning fails", async () => {
    mockLearnStructure.mockRejectedValue(new Error("Could not detect any section structure in this document."));
    renderPanel();

    uploadFile(new File(["fake bytes"], "scanned.pdf", { type: "application/pdf" }));

    expect(await screen.findByText(/Could not detect any section structure/i)).toBeInTheDocument();
    expect(screen.queryByText(/Learned from:/i)).not.toBeInTheDocument();
  });

  it("clears the 'Learned from' badge when the user manually edits the textarea after a successful upload", async () => {
    mockLearnStructure.mockResolvedValue({ sectionStructure: ["Abstract", "Introduction"], sourceFileName: "sample.docx" });
    renderPanel();

    uploadFile(new File(["fake bytes"], "sample.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    await waitFor(() => expect(screen.getByText(/Learned from: sample.docx/i)).toBeInTheDocument());

    const textarea = screen.getAllByRole("textbox").find((el) => (el as HTMLTextAreaElement).value.includes("Abstract")) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Abstract\nIntroduction\nManually Added" } });

    expect(screen.queryByText(/Learned from:/i)).not.toBeInTheDocument();
    expect(screen.getByText("Journal Template Aligned")).toBeInTheDocument();
  });
});
