// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mocks
const getProject = vi.fn();
const getDocument = vi.fn();
const getRubric = vi.fn();
const getOutputTypeSpec = vi.fn();
const saveIntakeAnswers = vi.fn();
const getAiAccessStatus = vi.fn();
const getProfile = vi.fn();
const authedFetch = vi.fn();
const authedJsonFetch = vi.fn();

vi.mock("../../api", () => {
  class UnauthenticatedError extends Error {
    constructor(msg?: string) {
      super(msg || "Unauthenticated");
      this.name = "UnauthenticatedError";
    }
  }
  return {
    getProject: (...args: any[]) => getProject(...args),
    getDocument: (...args: any[]) => getDocument(...args),
    getRubric: (...args: any[]) => getRubric(...args),
    getOutputTypeSpec: (...args: any[]) => getOutputTypeSpec(...args),
    saveIntakeAnswers: (...args: any[]) => saveIntakeAnswers(...args),
    authedFetch: (...args: any[]) => authedFetch(...args),
    authedJsonFetch: (...args: any[]) => authedJsonFetch(...args),
    isEphemeralProject: (id: string) => typeof id === "string" && (id.startsWith("draft-") || id.startsWith("ephemeral-")),
    commitProjectToDatabase: vi.fn().mockImplementation(async (id: string) => ({ projectId: id, answers: {} })),
    UnauthenticatedError,
  };
});

vi.mock("../../../services/projectService", () => ({
  getProject: (...args: any[]) => getProject(...args),
  getDocument: (...args: any[]) => getDocument(...args),
  getRubric: (...args: any[]) => getRubric(...args),
  getOutputTypeSpec: (...args: any[]) => getOutputTypeSpec(...args),
  saveIntakeAnswers: (...args: any[]) => saveIntakeAnswers(...args),
}));

vi.mock("../../../services/aiAccessService", () => ({
  getAiAccessStatus: (...args: any[]) => getAiAccessStatus(...args),
}));

vi.mock("../../../services/profileService", () => ({
  getProfile: (...args: any[]) => getProfile(...args),
}));

vi.mock("../../../services/vault/cloudDriveService", () => ({
  getConnectedCloudDrives: vi.fn().mockResolvedValue([]),
}));

const { default: AssignmentWorkspace } = await import("../AssignmentWorkspace");

afterEach(() => {
  vi.clearAllMocks();
});

describe("Phase 1 — Unified Assignment Setup Box & Question-Specific Dynamic Structure", () => {
  beforeEach(() => {
    getProject.mockResolvedValue({
      projectId: "proj-phase1-demo",
      outputTypeId: "OT-01",
      title: "Academic Assignment",
      hasDocument: false,
      answers: {
        assignment_question: "",
        word_count: 3000,
        target_word_count: 3000,
        citation_style: "apa7",
        academic_level: "undergraduate",
        assignment_type: "essay",
      },
      gates: [],
    });
    getDocument.mockResolvedValue(null);
    getRubric.mockResolvedValue(null);
    getOutputTypeSpec.mockResolvedValue({ id: "OT-01", name: "Essay" });
    saveIntakeAnswers.mockResolvedValue({ success: true });
    authedJsonFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    authedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    getAiAccessStatus.mockResolvedValue({
      connections: [],
      entitlement: { status: "none", active: false },
      quota: null,
      creditBalance: null,
    });
    getProfile.mockResolvedValue({
      success: true,
      profile: {
        userType: "student",
        educationLevel: "undergraduate",
      },
    });
  });

  it("Test 1-5: Renders unified setup box, accepts inputs, and primary CTA triggers question-specific structure", async () => {
    render(<AssignmentWorkspace projectId="proj-phase1-demo" initialStage="understand" />);

    // 1. Header and unified workspace is present
    expect(await screen.findByText(/Phase 1: Understand the Assignment Brief/i)).toBeInTheDocument();
    expect(screen.getByText(/Coursework & Essay/i)).toBeInTheDocument();

    // 2. Question input is prominent
    const textarea = screen.getByPlaceholderText(/Paste your assignment prompt, essay title, or question here/i);
    expect(textarea).toBeInTheDocument();

    // 3. Enter Question A (Interdependence & conflict)
    const questionA = "Examine the role of economic interdependence in reducing interstate conflict.";
    fireEvent.change(textarea, { target: { value: questionA } });

    // 4. Primary trigger button is "Generate Structure"
    const generateBtn = screen.getByRole("button", { name: /Generate Structure/i });
    expect(generateBtn).toBeInTheDocument();
    expect(generateBtn).not.toBeDisabled();

    // 5. Click "Generate Structure"
    fireEvent.click(generateBtn);

    // 6. Verify Question A generates specific analytical sections, NOT generic Intro/Body/Conclusion
    await waitFor(() => {
      expect(screen.getByText(/Theoretical Foundations of Economic Interdependence and Interstate Conflict/i)).toBeInTheDocument();
      expect(screen.getByText(/Relevant Theoretical Perspectives: Liberal Commercialism vs. Realist Vulnerability/i)).toBeInTheDocument();
    });

    // Verify dynamic word count status conforms to user requirement #11
    expect(screen.getAllByText(/Target:\s*3,000\s*words/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Allocated:\s*3,000\s*words/i)[0]).toBeInTheDocument();

    // Verify no unwanted AI conversation prose is rendered
    expect(screen.queryByText(/I've carefully analysed your assignment/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Here is a comprehensive structure/i)).not.toBeInTheDocument();
  });

  it("Test 6-7: Question B generates a distinct, question-specific structure for Nepal-India foreign policy", async () => {
    getProject.mockResolvedValueOnce({
      projectId: "proj-nepal-india",
      outputTypeId: "OT-01",
      title: "Academic Assignment",
      hasDocument: false,
      answers: {
        assignment_question: "Evaluate the effectiveness of Nepal's foreign policy toward India since 2015.",
        word_count: 2500,
        target_word_count: 2500,
        citation_style: "harvard",
        academic_level: "postgraduate",
        assignment_type: "policy_brief",
      },
      gates: [],
    });

    render(<AssignmentWorkspace projectId="proj-nepal-india" initialStage="understand" />);

    // Wait for stage to render
    expect(await screen.findByText(/Phase 1: Understand the Assignment Brief/i)).toBeInTheDocument();

    const generateBtn = screen.getByRole("button", { name: /Generate Structure/i });
    fireEvent.click(generateBtn);

    // Verify Question B generates Nepal-India specific sections
    await waitFor(() => {
      expect(screen.getByText(/Nepal's Foreign-Policy Context and Strategic Architecture/i)).toBeInTheDocument();
      expect(screen.getByText(/The 2015 Border Blockade, Diplomatic Ruptures, and Territorial Friction/i)).toBeInTheDocument();
    });

    // Ensure it did not generate economic interdependence or generic template
    expect(screen.queryByText(/Commercial Liberalism/i)).not.toBeInTheDocument();
  });

  it("Test 8-11: Allows editing headings, subheadings, and adjusting word counts with dynamic balancing", async () => {
    getProject.mockResolvedValueOnce({
      projectId: "proj-edit-demo",
      outputTypeId: "OT-01",
      title: "Academic Assignment",
      hasDocument: false,
      answers: {
        assignment_question: "Role of cell therapy in cancer remedy",
        word_count: 2000,
        target_word_count: 2000,
        citation_style: "apa7",
        academic_level: "undergraduate",
        assignment_type: "essay",
      },
      gates: [],
    });

    render(<AssignmentWorkspace projectId="proj-edit-demo" initialStage="understand" />);

    expect(await screen.findByText(/Phase 1: Understand the Assignment Brief/i)).toBeInTheDocument();
    const generateBtn = screen.getByRole("button", { name: /Generate Structure/i });
    fireEvent.click(generateBtn);

    // Verify cancer cell therapy structure appeared
    await waitFor(() => {
      expect(screen.getByText(/Foundations of Cell-Based Immunotherapy in Oncology/i)).toBeInTheDocument();
    });

    // Edit a subheading title directly
    const firstSubInput = screen.getByDisplayValue(/Conceptual Foundations of Cellular Therapeutics and T-Cell Engineering/i);
    fireEvent.change(firstSubInput, { target: { value: "Adoptive Cell Transfer & CAR-T Mechanics" } });
    expect(firstSubInput).toHaveValue("Adoptive Cell Transfer & CAR-T Mechanics");

    // Add a new main heading
    const addHeadingBtn = screen.getByRole("button", { name: /Add Main Analytical Heading/i });
    fireEvent.click(addHeadingBtn);

    const headingInput = screen.getByPlaceholderText(/Geopolitical Implications & Security Architecture/i);
    fireEvent.change(headingInput, { target: { value: "New Analytical Section" } });
    const confirmAddBtn = screen.getByRole("button", { name: /^Add Heading$/i });
    fireEvent.click(confirmAddBtn);

    await waitFor(() => {
      expect(screen.getByDisplayValue("New Analytical Section")).toBeInTheDocument();
    });

    // Click Auto-Balance to Target
    const autoBalanceBtn = screen.getByRole("button", { name: /^Auto-Balance$/i });
    fireEvent.click(autoBalanceBtn);

    // Verify balanced
    await waitFor(() => {
      expect(screen.getByText(/Remaining: 0 words \(Balanced\)/i)).toBeInTheDocument();
    });
  });

  it("Test 12-14: Confirms structure and persists canonical structure keys to Phase 2", async () => {
    getProject.mockResolvedValueOnce({
      projectId: "proj-proceed-demo",
      outputTypeId: "OT-01",
      title: "Academic Assignment",
      hasDocument: false,
      answers: {
        assignment_question: "Critically evaluate the role of cell therapy in cancer remedy",
        word_count: 2000,
        target_word_count: 2000,
        citation_style: "apa7",
        academic_level: "undergraduate",
        assignment_type: "essay",
      },
      gates: [],
    });

    render(<AssignmentWorkspace projectId="proj-proceed-demo" initialStage="understand" />);

    expect(await screen.findByText(/Phase 1: Understand the Assignment Brief/i)).toBeInTheDocument();

    const generateBtn = screen.getByRole("button", { name: /Generate Structure/i });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText(/Foundations of Cell-Based Immunotherapy in Oncology/i)).toBeInTheDocument();
    });

    // Click "Confirm Structure & Proceed to Sources"
    const proceedBtn = screen.getByRole("button", { name: /Confirm Structure & Proceed to Sources/i });
    expect(proceedBtn).not.toBeDisabled();
    fireEvent.click(proceedBtn);

    // Verify canonical structure keys saved to answers
    await waitFor(() => {
      expect(saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-proceed-demo",
        expect.objectContaining({
          assignment_question: expect.stringContaining("cell therapy"),
          assignment_structure: expect.objectContaining({
            isConfirmed: true,
            headings: expect.arrayContaining([
              expect.objectContaining({
                id: expect.stringMatching(/heading-/),
                subheadings: expect.arrayContaining([
                  expect.objectContaining({
                    id: expect.stringMatching(/sub-/),
                    targetWordCount: expect.any(Number),
                  }),
                ]),
              }),
            ]),
          }),
          sectionBudgets: expect.any(Array),
          assignment_internal_sections: expect.any(Array),
        })
      );
    });
  });
});
