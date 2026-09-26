// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AssignmentProvider } from "../AssignmentContext";
import AssignmentUnderstandStage from "../stages/AssignmentUnderstandStage";
import { cleanAnswerString, extractStandardizedInstructions } from "../types";

const getProject = vi.fn();
const getDocument = vi.fn();
const getRubric = vi.fn();
const getOutputTypeSpec = vi.fn();
const saveIntakeAnswers = vi.fn();
const authedFetch = vi.fn();
const authedJsonFetch = vi.fn();

vi.mock("../../api", () => ({
  getProject: (...a: unknown[]) => getProject(...a),
  getDocument: (...a: unknown[]) => getDocument(...a),
  getRubric: (...a: unknown[]) => getRubric(...a),
  getOutputTypeSpec: (...a: unknown[]) => getOutputTypeSpec(...a),
  saveIntakeAnswers: (...a: unknown[]) => saveIntakeAnswers(...a),
  authedFetch: (...a: unknown[]) => authedFetch(...a),
  authedJsonFetch: (...a: unknown[]) => authedJsonFetch(...a),
  isEphemeralProject: (id: string) =>
    typeof id === "string" && (id.startsWith("draft-") || id.startsWith("ephemeral-")),
  commitProjectToDatabase: vi.fn().mockImplementation(async (id: string) => ({ projectId: id, answers: {} })),
}));

vi.mock("../../../services/userVault", () => ({
  loadVault: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../services/vault/cloudDriveService", () => ({
  getConnectedCloudDrives: vi.fn().mockResolvedValue([]),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Assignment Data Hydration and Persistence Guarantee", () => {
  beforeEach(() => {
    getDocument.mockResolvedValue(null);
    getRubric.mockResolvedValue(null);
    getOutputTypeSpec.mockResolvedValue({ id: "OT-01", label: "Assignment" });
    saveIntakeAnswers.mockResolvedValue({ success: true });
  });

  it("cleanAnswerString and extractStandardizedInstructions discard 'provisional' sentinels and resolve legacy keys", () => {
    expect(cleanAnswerString("provisional")).toBe("");
    expect(cleanAnswerString("  PROVISIONAL  ")).toBe("");
    expect(cleanAnswerString("Evaluate algorithmic bias")).toBe("Evaluate algorithmic bias");

    // Case 1: Conductor initial project state with provisional brief
    const conductorInitial = { assignment_brief: "provisional" };
    expect(extractStandardizedInstructions(conductorInitial)).toBe("");

    // Case 2: Legacy key 'prompt'
    const legacyPrompt = { prompt: "Critically assess UK healthcare policy reforms." };
    expect(extractStandardizedInstructions(legacyPrompt)).toBe("Critically assess UK healthcare policy reforms.");

    // Case 3: Standardized 'instructions' key takes precedence
    const standardized = {
      instructions: "New standardized instruction brief text.",
      assignment_brief: "provisional",
      prompt: "old prompt",
    };
    expect(extractStandardizedInstructions(standardized)).toBe("New standardized instruction brief text.");
  });

  it("does NOT display 'provisional' when mounting a project initialized with conductor sentinel values", async () => {
    getProject.mockResolvedValue({
      projectId: "proj-provisional-test",
      outputTypeId: "OT-01",
      title: "Untitled Assignment",
      hasDocument: false,
      answers: {
        assignment_brief: "provisional",
        word_limit: "2000",
      },
      gates: [],
    });

    render(
      <AssignmentProvider projectId="proj-provisional-test" initialStage="understand" onStageChangeCallback={vi.fn()}>
        <AssignmentUnderstandStage />
      </AssignmentProvider>
    );

    // Header rendered
    expect(await screen.findByText(/Phase 1: Understand the Assignment/i)).toBeInTheDocument();

    // Verify textarea is empty and NOT populated with "provisional"
    const textarea = screen.getByPlaceholderText(/Paste your assignment prompt/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
    expect(textarea.value).not.toBe("provisional");
  });

  it("asynchronously hydrates legacy persisted keys into form controls once project loads", async () => {
    getProject.mockResolvedValue({
      projectId: "proj-legacy-hydrate",
      outputTypeId: "OT-01",
      title: "Corporate Governance Essay",
      hasDocument: false,
      answers: {
        assignment_question: "Critically evaluate board diversity mandates under corporate governance codes.",
        academic_level: "postgraduate",
        assignment_type: "case_study",
        word_count: "3500",
        citation_style: "harvard",
        course_name: "BUSI7001 Strategic Management",
        institution: "London Business School",
      },
      gates: [],
    });

    render(
      <AssignmentProvider projectId="proj-legacy-hydrate" initialStage="understand" onStageChangeCallback={vi.fn()}>
        <AssignmentUnderstandStage />
      </AssignmentProvider>
    );

    // Wait for hydration
    const textarea = (await screen.findByDisplayValue(
      "Critically evaluate board diversity mandates under corporate governance codes."
    )) as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();

    // Verify Postgraduate is active
    const postgradBtn = screen.getByRole("button", { name: /Postgraduate \/ Masters/i });
    expect(postgradBtn.className).toContain("bg-white");

    // Verify word count is 3500
    const wordCountInput = screen.getByDisplayValue("3500") as HTMLInputElement;
    expect(wordCountInput).toBeInTheDocument();
  });

  it("immediately persists edits to project.answers onBlur and onChange", async () => {
    getProject.mockResolvedValue({
      projectId: "proj-edit-test",
      outputTypeId: "OT-01",
      title: "AI Ethics",
      hasDocument: false,
      answers: {
        instructions: "Initial prompt text for ethical analysis.",
        academic_level: "undergraduate",
        word_count: "2000",
      },
      gates: [],
    });

    render(
      <AssignmentProvider projectId="proj-edit-test" initialStage="understand" onStageChangeCallback={vi.fn()}>
        <AssignmentUnderstandStage />
      </AssignmentProvider>
    );

    const textarea = (await screen.findByDisplayValue("Initial prompt text for ethical analysis.")) as HTMLTextAreaElement;

    // Type new brief instructions and blur
    fireEvent.change(textarea, { target: { value: "Updated prompt: Critically assess the EU AI Act risk categories." } });
    fireEvent.blur(textarea);

    expect(saveIntakeAnswers).toHaveBeenCalledWith(
      "proj-edit-test",
      expect.objectContaining({
        instructions: "Updated prompt: Critically assess the EU AI Act risk categories.",
        assignment_question: "Updated prompt: Critically assess the EU AI Act risk categories.",
      })
    );

    // Change academic level to Postgraduate
    const postgradBtn = screen.getByRole("button", { name: /Postgraduate \/ Masters/i });
    fireEvent.click(postgradBtn);

    expect(saveIntakeAnswers).toHaveBeenCalledWith(
      "proj-edit-test",
      expect.objectContaining({
        academicLevel: "postgraduate",
        academic_level: "postgraduate",
      })
    );
  });

  it("guarantees permanent database persistence immediately on brief file upload", async () => {
    getProject.mockResolvedValue({
      projectId: "proj-upload-persistence",
      outputTypeId: "OT-01",
      title: "New Coursework",
      hasDocument: false,
      answers: {},
      gates: [],
    });

    // Mock upload response
    authedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        text: "Syllabus Brief: Analyze cybersecurity vulnerabilities in industrial SCADA systems. Word count: 3000 words. APA 7th referencing required.",
        lineCount: 45,
        detectedWordCount: 3000,
        detectedLevel: "postgraduate",
        detectedCitation: "apa7",
      }),
    });

    render(
      <AssignmentProvider projectId="proj-upload-persistence" initialStage="understand" onStageChangeCallback={vi.fn()}>
        <AssignmentUnderstandStage />
      </AssignmentProvider>
    );

    expect(await screen.findByText(/Phase 1: Understand the Assignment/i)).toBeInTheDocument();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const testFile = new File(["dummy brief content"], "coursework_brief.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [testFile] } });

    // Verify textarea updates with extracted text
    await waitFor(() => {
      expect(
        screen.getByDisplayValue(/Syllabus Brief: Analyze cybersecurity vulnerabilities in industrial SCADA systems/i)
      ).toBeInTheDocument();
    });

    // CRITICAL: Verify that the brief was immediately committed to PostgreSQL / JSONB answers!
    expect(saveIntakeAnswers).toHaveBeenCalledWith(
      "proj-upload-persistence",
      expect.objectContaining({
        instructions: expect.stringContaining("Analyze cybersecurity vulnerabilities in industrial SCADA systems"),
        assignment_question: expect.stringContaining("Analyze cybersecurity vulnerabilities in industrial SCADA systems"),
        word_count: 3000,
        targetWordCount: 3000,
        academic_level: "postgraduate",
        citation_style: "apa7",
      })
    );
  });
});
