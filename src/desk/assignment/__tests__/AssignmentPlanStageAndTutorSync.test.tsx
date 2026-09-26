// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import AssignmentPlanStage, {
  normalizeQuestion,
  normalizeStrategy,
  generateAdaptiveResearchPlan,
} from "../stages/AssignmentPlanStage";
import AssignmentAiTutorPanel from "../components/AssignmentAiTutorPanel";
import { AssignmentProvider, useAssignmentWorkspace } from "../AssignmentContext";

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

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Phase 2: Academic Research Plan (Plan One)", () => {
  const initialPlan = {
    coreQuestions: [
      {
        id: "q-1",
        question: "What theoretical frameworks underpin algorithmic governance?",
        category: "Theoretical Foundation",
        rationale: "Establishes baseline terminology.",
      },
      {
        id: "q-2",
        question: "How do competing regulatory perspectives balance operational efficiency and accountability?",
        category: "Dialectical Tension",
        rationale: "Directly satisfies the critical evaluation command verbs.",
      },
      {
        id: "q-3",
        question: "What empirical evidence measures compliance outcomes in automated decision systems?",
        category: "Empirical Reality",
        rationale: "Requires hard data and audit standards.",
      },
    ],
    mainConcepts: ["Algorithmic Governance", "Accountability", "EU AI Act"],
    keyDebates: ["Efficiency vs Procedural Justice", "Self-regulation vs Statutory Mandates"],
    evidenceTypesNeeded: ["Peer-reviewed journal articles", "Institutional audit datasets"],
    searchStrategies: [
      {
        id: "strat-1",
        database: "Google Scholar",
        searchQuery: '"algorithmic governance" AND "accountability" AND "empirical"',
        relevanceTarget: "High-impact peer-reviewed empirical studies.",
      },
      {
        id: "strat-2",
        database: "JSTOR / Scopus",
        searchQuery: '"EU AI Act" AND "statutory compliance" AND "audit"',
        relevanceTarget: "Regulatory frameworks and legal scholarship.",
      },
    ],
    outOfScopeTopics: ["Trade journalism without audited data", "General pre-2015 computing history"],
    approvedByUser: false,
  };

  beforeEach(() => {
    getProject.mockResolvedValue({
      projectId: "proj-123",
      outputTypeId: "OT-01",
      title: "Algorithmic Governance Essay",
      hasDocument: false,
      answers: {
        assignment_question: "Critically evaluate the governance of algorithmic decision systems.",
        word_count: "2500",
        citation_style: "apa7",
        academic_level: "undergraduate",
        assignment_type: "critical_essay",
        assignment_plan: JSON.stringify(initialPlan),
        assignment_research_plan: JSON.stringify(initialPlan),
      },
      gates: [],
    });
    getDocument.mockResolvedValue(null);
    getRubric.mockResolvedValue(null);
    getOutputTypeSpec.mockResolvedValue({ id: "OT-01", label: "Assignment" });
  });

  it("normalizes legacy string questions and strategies into structured objects", () => {
    const normQ = normalizeQuestion("Legacy question string", 0);
    expect(normQ.id).toBe("q-1");
    expect(normQ.question).toBe("Legacy question string");
    expect(normQ.category).toBe("Theoretical Foundation");

    const normStrat = normalizeStrategy('"legacy query" AND "test"', 0);
    expect(normStrat.id).toBe("strat-1");
    expect(normStrat.database).toBe("Google Scholar");
    expect(normStrat.searchQuery).toBe('"legacy query" AND "test"');

    const adaptive = generateAdaptiveResearchPlan("case_study", "Acme Corp Strategy", "undergraduate");
    expect(adaptive.coreQuestions.length).toBeGreaterThanOrEqual(3);
    expect(adaptive.searchStrategies.length).toBeGreaterThanOrEqual(3);
  });

  it("renders editable Core Questions cards, allows modifying question and adding a new question", async () => {
    render(
      <AssignmentProvider projectId="proj-123" initialStage="plan" onStageChangeCallback={vi.fn()}>
        <AssignmentPlanStage />
      </AssignmentProvider>
    );

    // Verify header
    expect(await screen.findByText(/Phase 2: Academic Research Plan/i)).toBeInTheDocument();
    expect(await screen.findByText(/3 Questions/i)).toBeInTheDocument();

    // Verify question cards
    expect(screen.getByDisplayValue("What theoretical frameworks underpin algorithmic governance?")).toBeInTheDocument();
    expect(screen.getByDisplayValue("How do competing regulatory perspectives balance operational efficiency and accountability?")).toBeInTheDocument();

    // Edit Question 1
    const q1Input = screen.getByLabelText("Question 1 Content") as HTMLTextAreaElement;
    fireEvent.change(q1Input, { target: { value: "Updated theoretical frameworks for autonomous governance?" } });
    expect(q1Input.value).toBe("Updated theoretical frameworks for autonomous governance?");

    // Add a custom research question via inline bar
    const addInput = screen.getByPlaceholderText(/Add custom research question/i);
    fireEvent.change(addInput, { target: { value: "How does the EU AI Act classify high-risk automated systems?" } });
    fireEvent.click(screen.getByRole("button", { name: /\+ Add Question/i }));

    // Verify 4 questions are now displayed
    expect(screen.getByText(/4 Questions/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("How does the EU AI Act classify high-risk automated systems?")).toBeInTheDocument();
  });

  it("renders Search Strategies with 1-click copy and allows adding custom strategies", async () => {
    render(
      <AssignmentProvider projectId="proj-123" initialStage="plan" onStageChangeCallback={vi.fn()}>
        <AssignmentPlanStage />
      </AssignmentProvider>
    );

    expect(await screen.findByText(/Recommended Search Strategies/i)).toBeInTheDocument();
    expect(await screen.findByText(/2 Queries/i)).toBeInTheDocument();

    // Test 1-click copy query
    const copyBtns = screen.getAllByRole("button", { name: /Copy Search Query/i });
    expect(copyBtns.length).toBe(2);
    fireEvent.click(copyBtns[0]);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('"algorithmic governance" AND "accountability" AND "empirical"');
    expect(await screen.findByText(/Copied!/i)).toBeInTheDocument();

    // Add custom search strategy
    const queryInput = screen.getByPlaceholderText(/Boolean query/i);
    fireEvent.change(queryInput, { target: { value: '"EU AI Act" AND "algorithmic transparency" AND "bias"' } });
    fireEvent.click(screen.getByRole("button", { name: /\+ Add Strategy/i }));

    expect(screen.getByText(/3 Queries/i)).toBeInTheDocument();
    expect(screen.getByText(/"EU AI Act" AND "algorithmic transparency" AND "bias"/i)).toBeInTheDocument();
  });

  it("advances to Phase 3 when clicking Approve Research Plan & Continue", async () => {
    const handleStageChange = vi.fn();
    render(
      <AssignmentProvider projectId="proj-123" initialStage="plan" onStageChangeCallback={handleStageChange}>
        <AssignmentPlanStage />
      </AssignmentProvider>
    );

    const approveBtn = await screen.findByRole("button", { name: /Approve Research Plan & Continue/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(handleStageChange).toHaveBeenCalledWith("research", undefined);
      expect(saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-123",
        expect.objectContaining({
          assignment_plan: expect.stringContaining('"approvedByUser":true'),
        })
      );
    });
  });

  it("bidirectionally synchronizes Socratic Tutor chat modifications to the workspace screen live", async () => {
    // Render workspace with both the active Plan Stage and the AI Tutor sidebar
    function IntegratedWorkspace() {
      const { currentStage } = useAssignmentWorkspace();
      return (
        <div className="flex">
          <div className="flex-1">
            {currentStage === "plan" && <AssignmentPlanStage />}
          </div>
          <div className="w-80">
            <AssignmentAiTutorPanel />
          </div>
        </div>
      );
    }

    render(
      <AssignmentProvider projectId="proj-123" initialStage="plan" onStageChangeCallback={vi.fn()}>
        <IntegratedWorkspace />
      </AssignmentProvider>
    );

    // Initial questions rendered
    expect(await screen.findByDisplayValue("What theoretical frameworks underpin algorithmic governance?")).toBeInTheDocument();
    expect(screen.getByDisplayValue("How do competing regulatory perspectives balance operational efficiency and accountability?")).toBeInTheDocument();

    // Mock tutor reply returning a patch that refocusses Question 2 on EU AI Act compliance
    authedJsonFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reply: "I have updated your research questions to center directly on the statutory compliance mechanisms of the EU AI Act.",
        mode: "socratic",
        patch: {
          plan: {
            coreQuestions: [
              {
                id: "q-1",
                question: "What theoretical frameworks underpin algorithmic governance?",
                category: "Theoretical Foundation",
                rationale: "Establishes baseline terminology.",
              },
              {
                id: "q-2",
                question: "How do EU AI Act statutory frameworks critically govern and substantiate algorithmic decision systems?",
                category: "Statutory Governance",
                rationale: "Refocused specifically on EU AI Act compliance per student guidance and First-Class grading criteria.",
              },
              {
                id: "q-3",
                question: "What empirical evidence measures compliance outcomes in automated decision systems?",
                category: "Empirical Reality",
                rationale: "Requires hard data and audit standards.",
              },
            ],
          },
        },
      }),
    });

    // Send a message in the Socratic sidebar asking to focus on EU AI Act
    const chatInput = screen.getByPlaceholderText(/Ask your Socratic Tutor/i);
    fireEvent.change(chatInput, { target: { value: "Focus question 2 on EU AI Act compliance" } });
    fireEvent.click(screen.getByRole("button", { name: /^Ask$/i }));

    // 1. Verify tutor reply received and patch live sync badge rendered in chat
    expect(await screen.findByText(/I have updated your research questions to center directly on the statutory compliance/i)).toBeInTheDocument();
    expect(screen.getByText(/⚡ Synchronized to Workspace live/i)).toBeInTheDocument();

    // 2. CRITICAL: Verify the open canvas card in Phase 2 re-rendered LIVE with the patched question!
    await waitFor(() => {
      expect(
        screen.getByDisplayValue(
          "How do EU AI Act statutory frameworks critically govern and substantiate algorithmic decision systems?"
        )
      ).toBeInTheDocument();
    });

    // Verify it was persisted to project store
    expect(saveIntakeAnswers).toHaveBeenCalledWith(
      "proj-123",
      expect.objectContaining({
        assignment_plan: expect.stringContaining(
          "How do EU AI Act statutory frameworks critically govern"
        ),
      })
    );
  });
});
