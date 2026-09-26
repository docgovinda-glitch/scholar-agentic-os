// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";

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
  isEphemeralProject: (id: string) => typeof id === "string" && (id.startsWith("draft-") || id.startsWith("ephemeral-")),
  commitProjectToDatabase: vi.fn().mockImplementation(async (id: string) => ({ projectId: id, answers: {} })),
}));

vi.mock("../../../services/userVault", () => ({
  loadVault: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../services/vault/cloudDriveService", () => ({
  getConnectedCloudDrives: vi.fn().mockResolvedValue([]),
}));

const { default: AssignmentWorkspace } = await import("../AssignmentWorkspace");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Scholar Core Assignment Workspace", () => {
  beforeEach(() => {
    getProject.mockResolvedValue({
      projectId: "proj-123",
      outputTypeId: "OT-01",
      title: "Ethics of Artificial Intelligence Assignment",
      hasDocument: false,
      answers: {
        assignment_question: "Critically evaluate the ethical implications of autonomous decision systems.",
        word_count: 2000,
        citation_style: "apa7",
        academic_level: "undergraduate",
        assignment_type: "critical_essay",
      },
      gates: [],
    });
    getDocument.mockResolvedValue(null);
    getRubric.mockResolvedValue(null);
    getOutputTypeSpec.mockResolvedValue({
      id: "OT-01",
      label: "Assignment",
    });
  });

  it("renders the 3-column workspace with 8-phase navigation, active workspace, and AI tutor panel", async () => {
    render(
      <AssignmentWorkspace
        projectId="proj-123"
        initialStage="understand"
        onStageChange={vi.fn()}
      />
    );

    // Left Rail: 8 stages strictly begin with navigation items
    expect(await screen.findByText(/Phase 2/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Phase 1/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Phase 4/i)).toBeInTheDocument();
    expect(screen.getByText(/Phase 5/i)).toBeInTheDocument();
    expect(screen.getByText(/Phase 6/i)).toBeInTheDocument();
    expect(screen.getByText(/Phase 8/i)).toBeInTheDocument();

    // Verify left rail purged elements
    expect(screen.queryByText(/Academic Assignment Journey/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Structured 8-phase research/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Undergraduate Workspace/i)).not.toBeInTheDocument();

    // Center Stage (lazy loaded)
    expect(await screen.findByText(/Phase 1: Understand the Assignment/i)).toBeInTheDocument();
    expect(screen.getByText(/Target Word Count/i)).toBeInTheDocument();

    // Right AI Tutor Sidebar: 4-tab navigation serves as top-most entry point
    const tutorPanel = await screen.findByRole("complementary");
    expect(within(tutorPanel).getByRole("button", { name: /socratic/i })).toBeInTheDocument();
    expect(within(tutorPanel).getByRole("button", { name: /rubric/i })).toBeInTheDocument();
    expect(within(tutorPanel).getByRole("button", { name: /counter-args/i })).toBeInTheDocument();
    expect(within(tutorPanel).getByRole("button", { name: /polish/i })).toBeInTheDocument();

    // Verify right sidebar purged header and duplicate word count are not present
    expect(screen.queryByText(/Academic Thinking & Writing Tutor/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Word Count Budget Planner/i)).not.toBeInTheDocument();
  });

  it("enforces mandatory target word count and citation style before analysis", async () => {
    getProject.mockResolvedValueOnce({
      projectId: "proj-123",
      outputTypeId: "OT-01",
      title: "Untitled Assignment",
      hasDocument: false,
      answers: {
        assignment_question: "",
        word_count: 0,
        citation_style: "",
      },
      gates: [],
    });

    render(
      <AssignmentWorkspace
        projectId="proj-123"
        initialStage="understand"
        onStageChange={vi.fn()}
      />
    );

    expect(await screen.findByText(/Please provide the assignment question, word count, and citation style to continue/i)).toBeInTheDocument();
  });

  it("renders a minimalist, decluttered workspace header", async () => {
    const handleClose = vi.fn();
    render(
      <AssignmentWorkspace
        projectId="proj-123"
        initialStage="understand"
        onStageChange={vi.fn()}
        onClose={handleClose}
      />
    );

    // 1. Clean Left Section: Back button and plain text title
    const header = await screen.findByRole("banner");
    const backBtn = within(header).getByRole("button", { name: /back/i });
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Inline-editable title with auto-save
    const titleInput = await within(header).findByLabelText("Assignment Title");
    expect(titleInput).toBeInTheDocument();
    fireEvent.change(titleInput, { target: { value: "Renamed Assignment" } });
    fireEvent.blur(titleInput);
    await waitFor(() => {
      expect(saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-123",
        expect.objectContaining({ assignment_title: "Renamed Assignment" })
      );
    });

    // Verify removed clutter on left: no Scholar Core logo or Undergraduate pill in header
    expect(within(header).queryByText("SCHOLAR CORE")).not.toBeInTheDocument();
    expect(within(header).queryByText("Undergraduate")).not.toBeInTheDocument();
    expect(within(header).queryByText("Postgraduate")).not.toBeInTheDocument();

    // 2. Purged Right Section: No Vault or AI Access buttons in workspace header
    expect(within(header).queryByRole("button", { name: /vault/i })).not.toBeInTheDocument();
    expect(within(header).queryByRole("button", { name: /ai access/i })).not.toBeInTheDocument();

    // 3. Simplified AI Tutor: minimalist icon button
    const tutorToggle = within(header).getByRole("button", { name: /toggle ai tutor/i });
    expect(tutorToggle).toBeInTheDocument();
    expect(within(header).queryByText("AI Tutor")).not.toBeInTheDocument();

    // 4. Compact status badge: 0 / 2,000 words
    expect(within(header).getByText(/0 \/ 2,000 words/i)).toBeInTheDocument();
  });

  it("completes full brief upload and sequential analysis flow with exact line citations without visual regressions", async () => {
    authedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        text: "[L001] Assessment Question: Critically evaluate algorithmic governance.\n[L002] Target word count is 2500 words.\n[L012-L015] Penalty Warning: Late submissions incur an automatic 5% per day penalty deduction.\n[L016] Excluded Topics: Do not write about general history before 2000.",
        lineCount: 4,
        detectedWordCount: 2500,
        detectedLevel: "undergraduate",
        detectedCitation: "apa7",
      }),
    });

    authedJsonFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        commandVerbs: [
          {
            verb: "Critically evaluate",
            meaning: "Weigh competing theoretical arguments and empirical evidence to judge their validity.",
            academicExpectation: "You must not merely describe; synthesize counterarguments and substantiate a justified academic conclusion. ([L001])",
          },
        ],
        summary: "The examiner requires a rigorous essay addressing algorithmic governance...",
        keyConcepts: ["Algorithmic Governance", "Accountability", "Empirical Evidence"],
        scopeBoundaries: {
          included: ["[L001] Systematic evaluation of algorithmic governance systems"],
          excluded: ["[L016] Do not write about general history before 2000"],
        },
        expectedResponseType: "Essay",
        evidenceRequirements: "Authoritative scholarly sources",
        markingCriteriaInsights: [
          "🚨 Detected Assessment Penalty: [L012-L015] Late submissions incur an automatic 5% per day penalty deduction.",
        ],
        wordCountImplications: "Target: 2,500 words (Intro: ~250w, Body: ~2000w, Conclusion: ~250w). Standard ±10% penalty threshold applies.",
        citationGuidance: "Format all in-text citations and reference list strictly according to APA7 conventions.",
        academicLevelNotes: "Calibrated for Undergraduate study.",
        approvedByUser: false,
        briefLedger: [
          {
            lineRange: "[L012-L015]",
            category: "penalty",
            description: "Late submission penalty",
            verbatimText: "Late submissions incur an automatic 5% per day penalty deduction.",
          },
        ],
      }),
    });

    render(
      <AssignmentWorkspace
        projectId="proj-123"
        initialStage="understand"
        onStageChange={vi.fn()}
      />
    );

    // 1. Wait for lazy-loaded Phase 1 and locate file input
    expect(await screen.findByText(/Phase 1: Understand the Assignment/i)).toBeInTheDocument();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    const dummyFile = new File(["dummy brief content"], "assignment_brief.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    Object.defineProperty(fileInput, "files", {
      value: [dummyFile],
      configurable: true,
    });
    fireEvent.change(fileInput, { target: { files: [dummyFile] } });

    // 2. Verify text populates textarea and metadata detected
    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/Paste your assignment prompt/i) as HTMLTextAreaElement;
      expect(textarea.value).toContain("[L012-L015] Penalty Warning");
    });

    // 3. Click "Analyze Assignment Brief"
    const analyzeBtn = screen.getByRole("button", { name: /Analyze Assignment Brief/i });
    expect(analyzeBtn).toBeInTheDocument();
    fireEvent.click(analyzeBtn);

    // 4. Verify existing analysis breakdown renders with exact line citations
    expect(await screen.findByText(/Assignment Analysis Breakdown/i)).toBeInTheDocument();
    expect(screen.getByText(/✓ Analysis Ready · 1 Rules Indexed/i)).toBeInTheDocument();
    expect(screen.getByText(/\[L012-L015\] Late submissions incur an automatic 5% per day penalty deduction/i)).toBeInTheDocument();
    expect(screen.getByText(/\[L016\] Do not write about general history before 2000/i)).toBeInTheDocument();

    // 5. Confirm no visual regressions or unwanted stage tabs exist
    expect(screen.queryByText(/AssignmentDeconstructStage/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AssignmentThesisBudgetStage/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AssignmentPeelMatrixStage/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AssignmentCitationGroundingStage/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AssignmentAuditExportStage/i)).not.toBeInTheDocument();

    // Confirm only the 8 canonical phases exist
    expect(screen.getByRole("button", { name: /Phase 1: Understand/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Phase 2: Plan/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Phase 3: Research/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Phase 4: Evidence/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Phase 5: Think/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Phase 6: Structure/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Phase 7: Draft/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Phase 8: Finalize/i })).toBeInTheDocument();
  });
});

