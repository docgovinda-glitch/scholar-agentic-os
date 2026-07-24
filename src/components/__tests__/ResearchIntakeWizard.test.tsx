// @vitest-environment jsdom
//
// Stage 4/5 field-gating tests (target-workflow.md §3) for ResearchIntakeWizard.tsx.
// Confirms the conditional-field logic driven by project.outputFormat and
// OUTPUT_FORMAT_FIELD_CONFIG (src/config/outputFormats.ts): which of Research
// Questions / Objectives / Research Gap / Methodology are shown/required/hidden
// per format, that newspaper-article renders a distinct "needs a dedicated
// intake flow" placeholder instead of the shared form, and that isFormValid()
// only requires fields the current format actually marks required.
//
// AI-assist network calls (suggestTopic, suggestObjectives, etc.) are mocked
// out — none of these tests exercise those buttons, this is purely about
// field visibility/requiredness, not the AI-drafting logic (out of scope).

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ResearchIntakeWizard from "../ResearchIntakeWizard";
import { DEFAULT_STATE, PaperProject, OutputFormat } from "../../types";

vi.mock("../../services/aiService", () => ({
  suggestTopic: vi.fn(),
  improveTitle: vi.fn(),
  generateTitleVariations: vi.fn(),
  suggestObjectives: vi.fn(),
  suggestMethodology: vi.fn(),
  checkRQsQuality: vi.fn(),
  suggestFullBlueprint: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

const OBJECTIVES_PLACEHOLDER = "Outline the core objective parameters of this study...";
const RQ_PLACEHOLDER = "1. What is the impact of...? 2. To what extent...?";
const GAP_PLACEHOLDER = "Describe what core theoretical discrepancy or literature missing this study reconciles...";
const METHOD_PLACEHOLDER = "Specify study framework, comparative tests, hermeneutical limits...";

function buildProject(outputFormat: OutputFormat, overrides: Partial<PaperProject> = {}): PaperProject {
  return {
    ...DEFAULT_STATE("jdoe"),
    outputFormat,
    ...overrides,
  };
}

function renderWizard(project: PaperProject, onNext = vi.fn(), updateProject = vi.fn()) {
  render(
    <ResearchIntakeWizard
      project={project}
      updateProject={updateProject}
      onNext={onNext}
      intakeProgress={0}
    />
  );
  return { onNext, updateProject };
}

describe("ResearchIntakeWizard — Stage 4/5 field gating", () => {
  it.each<[OutputFormat, string]>([
    ["journal-article", "Journal Article"],
    ["research-paper", "Research Paper"],
    ["book-chapter", "Book Chapter"],
    ["research-proposal", "Research Proposal"],
  ])("%s: shows Research Questions, Objectives, Research Gap, and Methodology, all required", (format) => {
    renderWizard(buildProject(format));

    expect(screen.getByPlaceholderText(OBJECTIVES_PLACEHOLDER)).toBeRequired();
    expect(screen.getByPlaceholderText(RQ_PLACEHOLDER)).toBeRequired();
    expect(screen.getByPlaceholderText(GAP_PLACEHOLDER)).toBeRequired();
    expect(screen.getByPlaceholderText(METHOD_PLACEHOLDER)).toBeRequired();
  });

  it("term-paper: hides Objectives and Research Gap, shows Research Questions as optional, keeps Methodology required", () => {
    renderWizard(buildProject("term-paper"));

    expect(screen.queryByPlaceholderText(OBJECTIVES_PLACEHOLDER)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(GAP_PLACEHOLDER)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(RQ_PLACEHOLDER)).not.toBeRequired();
    expect(screen.getByPlaceholderText(METHOD_PLACEHOLDER)).toBeRequired();
  });

  it("report: Objectives required, Research Questions/Research Gap/Methodology all shown but optional", () => {
    renderWizard(buildProject("report"));

    expect(screen.getByPlaceholderText(OBJECTIVES_PLACEHOLDER)).toBeRequired();
    expect(screen.getByPlaceholderText(RQ_PLACEHOLDER)).not.toBeRequired();
    expect(screen.getByPlaceholderText(GAP_PLACEHOLDER)).not.toBeRequired();
    expect(screen.getByPlaceholderText(METHOD_PLACEHOLDER)).not.toBeRequired();
  });

  it("newspaper-article: renders the dedicated-intake-flow placeholder instead of the shared form", () => {
    renderWizard(buildProject("newspaper-article"));

    expect(screen.getByText(/Newspaper Article needs a dedicated intake flow/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(OBJECTIVES_PLACEHOLDER)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(RQ_PLACEHOLDER)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(GAP_PLACEHOLDER)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(METHOD_PLACEHOLDER)).not.toBeInTheDocument();
  });

  it("newspaper-article: 'Choose a Different Format' clears outputFormat so the selector can show again", () => {
    const { updateProject } = renderWizard(buildProject("newspaper-article"));

    fireEvent.click(screen.getByText("← Choose a Different Format"));
    expect(updateProject).toHaveBeenCalledWith({ outputFormat: "" });
  });

  it("shows the current format in the banner and 'Change Format' clears outputFormat", () => {
    const { updateProject } = renderWizard(buildProject("journal-article"));

    expect(screen.getByText("Journal Article")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Change Format"));
    expect(updateProject).toHaveBeenCalledWith({ outputFormat: "" });
  });

  it("renders the target reference count field and reports a numeric entry via updateProject", () => {
    const { updateProject } = renderWizard(buildProject("journal-article"));

    const input = screen.getByPlaceholderText("e.g. 30");
    fireEvent.change(input, { target: { value: "45" } });
    expect(updateProject).toHaveBeenCalledWith({ targetReferenceCount: 45 });
  });

  it("clearing a previously-set target reference count reports undefined", () => {
    const { updateProject } = renderWizard(buildProject("journal-article", { targetReferenceCount: 30 }));

    const input = screen.getByPlaceholderText("e.g. 30");
    fireEvent.change(input, { target: { value: "" } });
    expect(updateProject).toHaveBeenCalledWith({ targetReferenceCount: undefined });
  });

  describe("isFormValid gating per format", () => {
    it("journal-article: blocks onNext when Objectives is missing (baseline unchanged)", () => {
      const { onNext } = renderWizard(
        buildProject("journal-article", {
          title: "A Title",
          field: "Philosophy",
          researchQuestions: "Some RQs",
          researchGap: "Some gap",
          methodology: "Some method",
          objectives: "",
        })
      );

      fireEvent.click(screen.getByText("Continue Setup"));
      expect(onNext).not.toHaveBeenCalled();
      expect(screen.getByText(/Please fill in at least the essential research inputs/i)).toBeInTheDocument();
    });

    it("journal-article: allows onNext when all four gated fields are filled", () => {
      const { onNext } = renderWizard(
        buildProject("journal-article", {
          title: "A Title",
          field: "Philosophy",
          researchQuestions: "Some RQs",
          researchGap: "Some gap",
          methodology: "Some method",
          objectives: "Some objectives",
        })
      );

      fireEvent.click(screen.getByText("Continue Setup"));
      expect(onNext).toHaveBeenCalled();
    });

    it("term-paper: allows onNext with Objectives/Research Gap left blank (hidden, not required)", () => {
      const { onNext } = renderWizard(
        buildProject("term-paper", {
          title: "A Title",
          field: "Philosophy",
          methodology: "Some method",
          researchQuestions: "",
          objectives: "",
          researchGap: "",
        })
      );

      fireEvent.click(screen.getByText("Continue Setup"));
      expect(onNext).toHaveBeenCalled();
    });

    it("term-paper: still blocks onNext when Methodology (required for this format) is missing", () => {
      const { onNext } = renderWizard(
        buildProject("term-paper", {
          title: "A Title",
          field: "Philosophy",
          methodology: "",
        })
      );

      fireEvent.click(screen.getByText("Continue Setup"));
      expect(onNext).not.toHaveBeenCalled();
    });

    it("report: allows onNext with Research Questions/Research Gap/Methodology left blank (all optional)", () => {
      const { onNext } = renderWizard(
        buildProject("report", {
          title: "A Title",
          field: "Public Policy",
          objectives: "Purpose and scope of this report",
          researchQuestions: "",
          researchGap: "",
          methodology: "",
        })
      );

      fireEvent.click(screen.getByText("Continue Setup"));
      expect(onNext).toHaveBeenCalled();
    });
  });

  describe("title-only alternative path (target-workflow.md Stage 5)", () => {
    it("'Continue Setup' still blocks onNext when only a title is set (baseline unchanged)", () => {
      const { onNext } = renderWizard(
        buildProject("journal-article", {
          title: "A Title",
          field: "",
          objectives: "",
          researchQuestions: "",
          researchGap: "",
          methodology: "",
        })
      );

      fireEvent.click(screen.getByText("Continue Setup"));
      expect(onNext).not.toHaveBeenCalled();
    });

    it("'Start With Title Only' blocks onNext and shows an error when the title is empty", () => {
      const { onNext } = renderWizard(buildProject("journal-article", { title: "" }));

      fireEvent.click(screen.getByText(/Start With Title Only/i));
      expect(onNext).not.toHaveBeenCalled();
      expect(screen.getByText(/Please specify a research title/i)).toBeInTheDocument();
    });

    it("'Start With Title Only' calls onNext with just a title, bypassing all other required-field gating", () => {
      const { onNext } = renderWizard(
        buildProject("journal-article", {
          title: "A Title",
          field: "",
          objectives: "",
          researchQuestions: "",
          researchGap: "",
          methodology: "",
        })
      );

      fireEvent.click(screen.getByText(/Start With Title Only/i));
      expect(onNext).toHaveBeenCalled();
    });

    it("'Start With Title Only' works even for formats whose guided path would normally require everything (research-proposal)", () => {
      const { onNext } = renderWizard(buildProject("research-proposal", { title: "A Title" }));

      fireEvent.click(screen.getByText(/Start With Title Only/i));
      expect(onNext).toHaveBeenCalled();
    });
  });
});
