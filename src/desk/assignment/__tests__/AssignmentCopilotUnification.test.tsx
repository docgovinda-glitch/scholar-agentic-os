// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import ContextPanel from "../../workspace/ContextPanel";
import AssignmentWorkspace from "../AssignmentWorkspace";
import {
  ASSIGNMENT_AGENT_CONFIGS,
  getAssignmentAgentConfig,
  sendAssignmentCopilotMessage,
  dispatchAssignmentQuickAction,
} from "../services/assignmentCopilotService";

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Round 5: Context Panel Copilot Unification", () => {
  beforeEach(() => {
    getProject.mockResolvedValue({
      projectId: "proj-copilot-test",
      outputTypeId: "OT-01",
      title: "Bioethics and Gene Editing Critical Essay",
      hasDocument: false,
      answers: {
        assignment_question: "Critically evaluate the ethical implications of germline editing in human embryos.",
        word_count: 2500,
        citation_style: "apa7",
        academic_level: "undergraduate",
        assignment_type: "critical_essay",
        assignment_analysis: {
          commandVerbs: [
            {
              verb: "Critically evaluate",
              meaning: "Weigh competing theoretical arguments and empirical evidence.",
              academicExpectation: "Synthesize counterarguments and reach a balanced conclusion.",
            },
          ],
          keyConcepts: ["Germline Editing", "Bioethics", "CRISPR-Cas9"],
        },
        assignment_sources: [
          {
            id: "src-1",
            title: "CRISPR Therapeutics in Human Embryos",
            authors: ["Doudna, J.", "Charpentier, E."],
            year: 2023,
            venue: "Nature Biotechnology",
            status: "kept",
            relevanceRationale: "Foundational empirical analysis of editing fidelity.",
          },
        ],
        lecture_slides: [
          {
            id: "deck-1",
            title: "Week 4: Ethical Frameworks",
            extractedConcepts: ["Deontology", "Utilitarianism", "Somatic vs Germline"],
          },
        ],
        assignment_outline: [
          {
            id: "sec-1",
            title: "Introduction & Demarcation",
            targetWordCount: 350,
            currentWordCount: 320,
            draftContent: "Germline genome modification presents unprecedented ethical dilemmas...",
            guidance: "Introduce central thesis and demarcation.",
            linkedEvidenceIds: ["src-1"],
            status: "drafting",
          },
        ],
        assignment_peel_sections: [
          {
            sectionId: "sec-1",
            point: "Somatic therapy differs categorically from germline alterations.",
            evidence: "Doudna & Charpentier (2023) highlight transgenerational heredity.",
            explanation: "70% critical analysis addressing moral hazard and off-target risks.",
            link: "Establishes the core moral boundary for subsequent evaluation.",
          },
        ],
        submission_audit: {
          overallScore: 78,
          overallBand: "1st_class",
          bandLabel: "First Class (1st) — 78%",
          rubricAlignmentScore: 88,
          readyForSubmission: true,
          priorityFixes: ["Deepen rebuttal in section 3"],
          unresolvedCitations: [],
        },
      },
      gates: [],
    });
    getDocument.mockResolvedValue(null);
    getRubric.mockResolvedValue(null);
    getOutputTypeSpec.mockResolvedValue({ id: "OT-01", label: "Assignment" });
  });

  describe("1. Agent Configs & Persona Definitions", () => {
    it("defines distinct personas for all 4 assignment phases", () => {
      expect(ASSIGNMENT_AGENT_CONFIGS.understand.name).toBe("Advisor");
      expect(ASSIGNMENT_AGENT_CONFIGS.understand.role).toContain("Rubric Guidance");
      expect(ASSIGNMENT_AGENT_CONFIGS.understand.quickActions).toContain("Analyze prompt command verbs");

      expect(ASSIGNMENT_AGENT_CONFIGS.sources.name).toBe("Librarian");
      expect(ASSIGNMENT_AGENT_CONFIGS.sources.role).toContain("Literature & Sourcing");
      expect(ASSIGNMENT_AGENT_CONFIGS.sources.quickActions).toContain("Recommend empirical sources");

      expect(ASSIGNMENT_AGENT_CONFIGS.drafting.name).toBe("Scribe");
      expect(ASSIGNMENT_AGENT_CONFIGS.drafting.role).toContain("Academic Drafting & Synthesis");
      expect(ASSIGNMENT_AGENT_CONFIGS.drafting.quickActions).toContain("Deepen analytical critique");

      expect(ASSIGNMENT_AGENT_CONFIGS.submission.name).toBe("Examiner");
      expect(ASSIGNMENT_AGENT_CONFIGS.submission.role).toContain("Quality Audit & Final Review");
      expect(ASSIGNMENT_AGENT_CONFIGS.submission.quickActions).toContain("Explain predicted grade");
    });

    it("getAssignmentAgentConfig retrieves the appropriate persona or defaults safely", () => {
      expect(getAssignmentAgentConfig("understand").name).toBe("Advisor");
      expect(getAssignmentAgentConfig("sources").name).toBe("Librarian");
      expect(getAssignmentAgentConfig("drafting").name).toBe("Scribe");
      expect(getAssignmentAgentConfig("submission").name).toBe("Examiner");
      expect(getAssignmentAgentConfig("unknown" as any).name).toBe("Advisor");
    });
  });

  describe("2. Client API Service: sendAssignmentCopilotMessage & dispatchAssignmentQuickAction", () => {
    it("dispatches POST /api/projects/:id/assignment/copilot-chat with phase, message, history, and state", async () => {
      authedJsonFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          response: "### Command Verb Analysis\n'Critically evaluate' requires weighing competing counterarguments.",
          persona: { name: "Advisor", role: "Assignment Brief & Rubric Guidance" },
        }),
      });

      const res = await sendAssignmentCopilotMessage(
        "proj-123",
        "understand",
        "Analyze prompt command verbs",
        [],
        { currentPhase: "understand" }
      );

      expect(authedJsonFetch).toHaveBeenCalledWith(
        "/api/projects/proj-123/assignment/copilot-chat",
        "POST",
        expect.objectContaining({
          phase: "understand",
          message: "Analyze prompt command verbs",
          history: [],
          projectState: { currentPhase: "understand" },
        })
      );

      expect(res.ok).toBe(true);
      expect(res.response).toContain("Critically evaluate");
      expect(res.persona?.name).toBe("Advisor");
    });

    it("handles error response safely and returns ok: false", async () => {
      authedJsonFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Internal copilot error" }),
      });

      const res = await sendAssignmentCopilotMessage("proj-123", "drafting", "Strengthen PEEL");
      expect(res.ok).toBe(false);
      expect(res.error).toBe("Internal copilot error");
    });

    it("dispatches quick-action chip clicks immediately", async () => {
      authedJsonFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          response: "Empirical recommendations...",
          persona: { name: "Librarian", role: "Scholarly Literature & Sourcing" },
        }),
      });

      const res = await dispatchAssignmentQuickAction(
        "proj-123",
        "sources",
        "Recommend empirical sources"
      );

      expect(authedJsonFetch).toHaveBeenCalledWith(
        "/api/projects/proj-123/assignment/copilot-chat",
        "POST",
        expect.objectContaining({
          phase: "sources",
          message: "Recommend empirical sources",
        })
      );
      expect(res.ok).toBe(true);
    });
  });

  describe("3. Unified ContextPanel UI Component with Assignment Personas", () => {
    it("renders custom persona and suggested actions", () => {
      const agent = ASSIGNMENT_AGENT_CONFIGS.drafting;
      render(
        <ContextPanel
          isOpen={true}
          currentStage="drafting"
          agent={agent}
          stageName="Phase 3: Drafting"
          projectId="proj-123"
        />
      );

      expect(screen.getByText("Scribe")).toBeInTheDocument();
      expect(screen.getByText(/Academic Drafting & Synthesis/i)).toBeInTheDocument();
      expect(screen.getByText("Suggested Actions")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Deepen analytical critique/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Strengthen PEEL structure/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Synthesize counterargument/i })).toBeInTheDocument();
      expect(screen.getByText(/Phase 3: Drafting/i)).toBeInTheDocument();
    });

    it("triggers onSendMessage when a suggested action chip is clicked", async () => {
      const onSendMessage = vi.fn().mockResolvedValue({
        ok: true,
        response: "Here is how to deepen analytical evaluation: allocate 70% of the paragraph to critique.",
      });

      render(
        <ContextPanel
          isOpen={true}
          currentStage="drafting"
          agent={ASSIGNMENT_AGENT_CONFIGS.drafting}
          stageName="Phase 3: Drafting"
          projectId="proj-123"
          onSendMessage={onSendMessage}
        />
      );

      const deepenChip = screen.getByRole("button", { name: /Deepen analytical critique/i });
      fireEvent.click(deepenChip);

      await waitFor(() => {
        expect(onSendMessage).toHaveBeenCalledWith(
          "Deepen analytical critique",
          expect.any(Array)
        );
      });

      // User message rendered in chat
      expect(screen.getByText("Deepen analytical critique")).toBeInTheDocument();
      // Assistant response rendered
      expect(await screen.findByText(/allocate 70% of the paragraph to critique/i)).toBeInTheDocument();
    });

    it("triggers onSendMessage when submitting text in the input box", async () => {
      const onSendMessage = vi.fn().mockResolvedValue({
        ok: true,
        response: "Examiner feedback: Your predicted grade is a First Class.",
      });

      render(
        <ContextPanel
          isOpen={true}
          currentStage="submission"
          agent={ASSIGNMENT_AGENT_CONFIGS.submission}
          stageName="Phase 4: Submission"
          projectId="proj-123"
          onSendMessage={onSendMessage}
        />
      );

      const input = screen.getByPlaceholderText("Ask Examiner a question...");
      fireEvent.change(input, { target: { value: "How is my grade predicted?" } });
      const submitBtn = screen.getByRole("button", { name: "" }); // icon button
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(onSendMessage).toHaveBeenCalledWith(
          "How is my grade predicted?",
          expect.any(Array)
        );
      });

      expect(await screen.findByText(/Examiner feedback: Your predicted grade is a First Class/i)).toBeInTheDocument();
    });
  });

  describe("4. End-to-End Persona Swapping in AssignmentWorkspace", () => {
    it("renders Advisor in Phase 1 and swaps to Librarian when switching to Phase 2", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-copilot-test"
          initialStage="understand"
          onStageChange={vi.fn()}
        />
      );

      // Phase 1 Advisor mounted in right drawer
      const sidebar = await screen.findByRole("complementary");
      expect(within(sidebar).getByText("Advisor")).toBeInTheDocument();
      expect(within(sidebar).getByText(/Assignment Brief & Rubric Guidance/i)).toBeInTheDocument();
      expect(within(sidebar).getByRole("button", { name: /Analyze prompt command verbs/i })).toBeInTheDocument();

      // Click Phase 2: Sources button in the top navigation bar
      const sourcesNavBtn = screen.getByRole("button", { name: /Phase 2: Sources/i });
      fireEvent.click(sourcesNavBtn);

      // Verify persona dynamically swaps to Librarian
      await waitFor(() => {
        expect(within(sidebar).getByText("Librarian")).toBeInTheDocument();
        expect(within(sidebar).getByText(/Scholarly Literature & Sourcing/i)).toBeInTheDocument();
        expect(within(sidebar).getByRole("button", { name: /Recommend empirical sources/i })).toBeInTheDocument();
      });
    });

    it("swaps to Scribe in Phase 3 Drafting and Examiner in Phase 4 Submission", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-copilot-test"
          initialStage="drafting"
          onStageChange={vi.fn()}
        />
      );

      const sidebar = await screen.findByRole("complementary");

      // Verify Scribe in Phase 3
      expect(await within(sidebar).findByText("Scribe")).toBeInTheDocument();
      expect(within(sidebar).getByText(/Academic Drafting & Synthesis/i)).toBeInTheDocument();
      expect(within(sidebar).getByRole("button", { name: /Deepen analytical critique/i })).toBeInTheDocument();

      // Click Phase 4: Submission
      const submissionNavBtn = screen.getByRole("button", { name: /Phase 4: Submission/i });
      fireEvent.click(submissionNavBtn);

      // Verify Examiner in Phase 4
      await waitFor(() => {
        expect(within(sidebar).getByText("Examiner")).toBeInTheDocument();
        expect(within(sidebar).getByText(/Quality Audit & Final Review/i)).toBeInTheDocument();
        expect(within(sidebar).getByRole("button", { name: /Explain predicted grade/i })).toBeInTheDocument();
      });
    });
  });
});
