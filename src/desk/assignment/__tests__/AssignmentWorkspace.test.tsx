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

  it("renders the 4-phase horizontal navigation, active workspace, with the AI tutor panel closed", async () => {
    render(
      <AssignmentWorkspace
        projectId="proj-123"
        initialStage="understand"
        onStageChange={vi.fn()}
      />
    );

    // One flow with five stages; there is no Minimal/Detailed choice any more.
    expect(await screen.findByRole("button", { name: /Phase 1: Extract/i })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Detailed|Minimal/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Phase 2: Understand/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Phase 3: Sources/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Phase 4: Drafting/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Phase 5: Submission/i })).toBeInTheDocument();

    // Verify purged legacy elements
    expect(screen.queryByText(/Academic Assignment Journey/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Structured 8-phase research/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Undergraduate Workspace/i)).not.toBeInTheDocument();

    // Center Stage (lazy loaded)
    expect(await screen.findByText(/Phase 1: Understand the Assignment/i)).toBeInTheDocument();
    expect(screen.getByText(/Target Word Count/i)).toBeInTheDocument();

    // The right-hand Architect / tutor drawer stays closed so it takes no screen space
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Ask Advisor a question\.\.\./i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("assignment-tutor-drawer")).not.toBeInTheDocument();
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

    // 1. One back button: the studio header's. The assignment bar below it
    // no longer repeats it.
    const header = await screen.findByRole("banner");
    expect(within(header).queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("studio-back-to-desk-btn"));
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

    // 3. No stage-count, tutor, Zen or Inspector pills in the header.
    expect(within(header).queryByRole("button", { name: /toggle ai tutor/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("inspector-toggle")).not.toBeInTheDocument();
    expect(screen.queryByText("Socratic Tutor AI")).not.toBeInTheDocument();
    expect(screen.queryByText("5 stages")).not.toBeInTheDocument();
    expect(screen.queryByText("Zen")).not.toBeInTheDocument();
    expect(screen.queryByText("Inspector")).not.toBeInTheDocument();
    expect(within(header).queryByText("AI Tutor")).not.toBeInTheDocument();

    // 4. Duplicate counter removed from top header; lives exclusively in stage navigation
    expect(within(header).queryByText(/0 \/ 2,000 words/i)).not.toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: /Assignment Workflow Phases/i });
    expect(within(nav).getByText(/2,000 words/i)).toBeInTheDocument();
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

    // 2. Verify auto-transition to Understand stage with clean, human-centered cards
    await waitFor(() => {
      expect(screen.getByText(/Assignment Brief Summary/i)).toBeInTheDocument();
    });

    // 4. Verify 4 Human-Centered Cards and clean tags (stripped [L012-L015])
    expect(screen.queryByText(/Plain-English Assignment Deconstruction/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Command Verb Decoded/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Visual Storyline Roadmap/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Clean Grading Checklist/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Topic & Core Angle/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Do not write about general history before 2000/i).length).toBeGreaterThanOrEqual(1);

    // 5. Confirm no visual regressions or unwanted stage tabs exist
    expect(screen.queryByText(/AssignmentDeconstructStage/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AssignmentThesisBudgetStage/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AssignmentPeelMatrixStage/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AssignmentCitationGroundingStage/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AssignmentAuditExportStage/i)).not.toBeInTheDocument();

    // Confirm canonical phases exist in navigation
    const nav = screen.getByRole("navigation", { name: /Assignment Workflow Phases/i });
    expect(within(nav).getByRole("button", { name: /Phase 1: Extract/i })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: /Phase 2: Understand/i })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: /Phase 3: Sources/i })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: /Phase 4: Drafting/i })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: /Phase 5: Submission/i })).toBeInTheDocument();
  });

  it("renaming in the studio header saves the title", async () => {
    render(<AssignmentWorkspace projectId="proj-123" initialStage="understand" onStageChange={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("studio-project-title"));
    const input = screen.getByTestId("studio-project-title-input");
    fireEvent.change(input, { target: { value: "Renamed From Header" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(saveIntakeAnswers).toHaveBeenCalledWith("proj-123", expect.objectContaining({ assignment_title: "Renamed From Header" }))
    );
  });

  it("the tutor starts closed on a phone-width screen and has no header toggle", async () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    try {
      render(<AssignmentWorkspace projectId="proj-123" initialStage="understand" onStageChange={vi.fn()} />);
      await screen.findByRole("navigation", { name: /Assignment Workflow Phases/i });
      expect(screen.queryByTestId("assignment-tutor-drawer")).not.toBeInTheDocument();
      expect(screen.queryByTestId("inspector-toggle")).not.toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });

  it("an empty brief shows 0% and cannot proceed, with a hint instead of an error", async () => {
    getProject.mockResolvedValueOnce({
      projectId: "proj-empty",
      outputTypeId: "OT-01",
      title: "Untitled Assignment",
      hasDocument: false,
      answers: { assignment_question: "", word_count: 0, citation_style: "" },
      gates: [],
    });
    render(<AssignmentWorkspace projectId="proj-empty" initialStage="understand" onStageChange={vi.fn()} />);
    const nav = await screen.findByRole("navigation", { name: /Assignment Workflow Phases/i });
    expect(within(nav).getByRole("button", { name: /Phase 1: Extract/i })).toHaveTextContent("0%");
    expect(await screen.findByRole("button", { name: /Proceed to Sources/i })).toBeDisabled();
    expect(screen.getByText(/Still needed: .*the assignment question/i)).toBeInTheDocument();
    // No Minimal/Detailed choice: the five-stage flow is the only one.
    expect(screen.queryByRole("radio", { name: /Detailed|Minimal/i })).not.toBeInTheDocument();
  });

  it("does not grade an empty paper on the Submission step", async () => {
    render(<AssignmentWorkspace projectId="proj-123" initialStage="submission" onStageChange={vi.fn()} />);
    expect(await screen.findByTestId("submission-nothing-drafted")).toBeInTheDocument();
    expect(screen.queryByText(/Predicted Grade Band/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Third Class|First Class|Upper Second/i)).not.toBeInTheDocument();
    // No audit was saved for it either.
    await new Promise((r) => setTimeout(r, 50));
    expect(saveIntakeAnswers).not.toHaveBeenCalledWith("proj-123", expect.objectContaining({ assignment_submission_report: expect.anything() }));
    const nav = screen.getByRole("navigation", { name: /Assignment Workflow Phases/i });
    expect(within(nav).getByRole("button", { name: /Phase \d: Submission/i })).toHaveTextContent("0%");
  });

  it("Drafting asks for the brief instead of showing a generic outline", async () => {
    getProject.mockResolvedValue({
      projectId: "proj-nobrief",
      outputTypeId: "OT-01",
      title: "Untitled Assignment",
      hasDocument: false,
      answers: { assignment_question: "", word_count: 0, citation_style: "" },
      gates: [],
    });
    render(<AssignmentWorkspace projectId="proj-nobrief" initialStage="drafting" onStageChange={vi.fn()} />);
    expect(await screen.findByTestId("drafting-needs-brief", undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(/Core Analytical Subject|Theoretical Foundations of/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Go to Extract/i }));
    expect(await screen.findByText(/Please provide the assignment question/i, undefined, { timeout: 4000 })).toBeInTheDocument();
  });
});
