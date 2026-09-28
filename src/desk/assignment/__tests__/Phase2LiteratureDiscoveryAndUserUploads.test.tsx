// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  generateCuratedLiteratureSources,
  fetchMoreLiteratureSources,
  extractResearchIntent,
} from "../services/scholarlyDiscoveryService";
import type { UploadedSourceDocument } from "../types";

const getProject = vi.fn();
const getDocument = vi.fn();
const getRubric = vi.fn();
const getOutputTypeSpec = vi.fn();
const saveIntakeAnswers = vi.fn();
const authedFetch = vi.fn();
const authedJsonFetch = vi.fn();

class UnauthenticatedError extends Error {
  constructor(message = "Unauthenticated") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

vi.mock("../../api", () => ({
  UnauthenticatedError,
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

describe("Phase 2 — Strengthened Literature Discovery, Phase 1 Integration & Unified User Sources", () => {
  const unQuestion = "Examine the role of the United Nations in maintaining international peace and security. What are its major limitations?";

  beforeEach(() => {
    vi.clearAllMocks();
    getProject.mockResolvedValue({
      projectId: "proj-un-test",
      outputTypeId: "OT-01",
      title: "UN Peace and Security Essay",
      hasDocument: false,
      answers: {
        assignment_question: unQuestion,
        word_count: 2000,
        target_word_count: 2000,
        citation_style: "apa7",
        academic_level: "undergraduate",
        assignment_type: "essay",
        approved_source_ids: [],
      },
      gates: [],
    });
    saveIntakeAnswers.mockResolvedValue({});
    getDocument.mockResolvedValue(null);
    getRubric.mockResolvedValue(null);
    getOutputTypeSpec.mockResolvedValue({
      id: "OT-01",
      label: "Assignment",
    });
  });

  describe("1. Academic Credibility & Deep Literature Curation for UN Question", () => {
    it("identifies UN peace & security subtopic and extracts seminal entities", () => {
      const intent = extractResearchIntent(unQuestion);
      expect(intent.subTopic).toBe("un_peace_security");
      expect(intent.academicDomain).toBe("International Relations & Geopolitics");
      expect(intent.primaryEntities).toEqual(
        expect.arrayContaining([
          "United Nations",
          "UN Security Council",
          "Permanent Five (P5)",
        ])
      );
      expect(intent.coreThematicConcepts).toEqual(
        expect.arrayContaining([
          "Collective Security",
          "Security Council Veto Power",
          "Chapter VII Enforcement Mandates",
        ])
      );
    });

    it("retrieves authentic seminal UN literature without cross-topic leakage", () => {
      const sources = generateCuratedLiteratureSources(unQuestion, "apa7");
      expect(sources.length).toBeGreaterThanOrEqual(30);

      // Verify seminal UN works are ranked at the top
      const topTitles = sources.slice(0, 10).map((s) => s.title);
      const hasKennedyOrBarnett = topTitles.some(
        (t) =>
          t.includes("Parliament of Man") ||
          t.includes("Security Council and War") ||
          t.includes("Eyewitness to a Genocide") ||
          t.includes("Swords into Plowshares")
      );
      expect(hasKennedyOrBarnett).toBe(true);

      // Verify NO cross-topic leakage from China or AI catalogs in top sources
      const chinaLeakage = sources.slice(0, 15).some((s) => s.title.includes("Rise of China") || s.title.includes("Belt and Road"));
      expect(chinaLeakage).toBe(false);

      // Verify peer-reviewed and academic-press accreditation
      const peerReviewedOrPress = sources.every(
        (s) => s.sourceCredibility === "peer-reviewed" || s.sourceCredibility === "academic-press" || s.isVerifiedAcademic
      );
      expect(peerReviewedOrPress).toBe(true);
    });
  });

  describe("2. Phase 1 Functionality Directly Embedded in Phase 2", () => {
    it("renders the Assignment Brief & Research Scope Panel with active question and calibration badges", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-un-test"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      // Prompt and section header
      expect(await screen.findByText(/Assignment Research Prompt/i)).toBeInTheDocument();
      expect(screen.getByText(unQuestion)).toBeInTheDocument();

      // Academic level toggle, assignment type, citation style, and budget
      expect(screen.getByText("Undergrad")).toBeInTheDocument();
      expect(screen.getByText("Postgrad / Masters")).toBeInTheDocument();
      expect(screen.getByText("2,000 words")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Upload Brief/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Rubric & Command Verbs/i })).toBeInTheDocument();
    });

    it("allows switching Academic Level to Postgraduate directly from Phase 2", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-un-test"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      await screen.findByText(/Assignment Research Prompt/i);

      const postgradBtn = screen.getByText("Postgrad / Masters");
      fireEvent.click(postgradBtn);

      await waitFor(() => {
        expect(saveIntakeAnswers).toHaveBeenCalledWith(
          "proj-un-test",
          expect.objectContaining({
            academicLevel: "postgraduate",
            academic_level: "postgraduate",
          })
        );
      });
    });

    it("opens Rubric & Command Verbs Guidance modal with academic actions and boundaries", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-un-test"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      await screen.findByText(/Assignment Research Prompt/i);

      const rubricBtn = screen.getByRole("button", { name: /Rubric & Command Verbs/i });
      fireEvent.click(rubricBtn);

      expect(await screen.findByText(/Rubric Criteria & Command Verbs Analysis/i)).toBeInTheDocument();
      expect(screen.getByText(/Scope & Analytical Boundaries/i)).toBeInTheDocument();
      expect(screen.getByText(/Included Focus/i)).toBeInTheDocument();
      expect(screen.getByText(/Excluded from Scope/i)).toBeInTheDocument();

      // Close modal
      const closeBtn = screen.getByRole("button", { name: /Close Guidance/i });
      fireEvent.click(closeBtn);
      await waitFor(() => {
        expect(screen.queryByText(/Rubric Criteria & Command Verbs Analysis/i)).not.toBeInTheDocument();
      });
    });
  });

  describe("3. Unified Literature & Source Collection (Scholarly + User Uploads)", () => {
    it("displays user-uploaded documents in the literature collection alongside scholarly works", async () => {
      const mockUploadedSlide: UploadedSourceDocument = {
        id: "doc-lecture-slide-1",
        name: "Week_05_UN_Security_Council_Veto.pptx",
        sourceType: "pptx",
        uploadedAt: new Date().toISOString(),
        author: "Prof. H. Morgenthau",
        publicationDate: "2024",
        relevanceSummary: "Lecture slides analyzing Article 27(3) P5 veto deadlock during Cold War and Syrian civil war crises.",
        extractedEvidences: [
          {
            id: "ev-slide-1",
            excerpt: "The permanent members have cast over 260 vetoes since 1946, paralyzing Chapter VII enforcement during humanitarian crises.",
            context: "Slide 8: Structural Inertia of the Security Council",
            sourceLocation: "Slide 8",
            claim: "P5 veto paralysis restricts collective security response during acute conflicts.",
          },
        ],
      };

      getProject.mockResolvedValue({
        projectId: "proj-un-user-uploads-1",
        outputTypeId: "OT-01",
        title: "UN Peace and Security Essay",
        hasDocument: false,
        answers: {
          assignment_question: unQuestion,
          word_count: 2000,
          target_word_count: 2000,
          citation_style: "apa7",
          academic_level: "undergraduate",
          assignment_type: "essay",
          assignment_current_phase: "sources",
          assignment_current_stage: "sources",
          approved_source_ids: ["doc-lecture-slide-1"],
          assignment_user_uploaded_sources: [mockUploadedSlide],
        },
        gates: [],
      });

      render(
        <AssignmentWorkspace
          projectId="proj-un-user-uploads-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      await screen.findByText(/Curated Literature & Course Sources/i);
      const curatedGrid = await screen.findByTestId("curated-sources-grid");
      expect(within(curatedGrid).getByText("Week_05_UN_Security_Council_Veto.pptx")).toBeInTheDocument();
      expect(screen.getByText(/Uploaded: PPTX/i)).toBeInTheDocument();
      expect(screen.getByText(/1 Extracted Excerpt\(s\)/i)).toBeInTheDocument();

      // Verify Tab Filtering: "My Uploads" tab
      const myUploadsTab = screen.getByRole("button", { name: /My Uploads/i });
      expect(myUploadsTab).toBeInTheDocument();
      fireEvent.click(myUploadsTab);

      // When on "My Uploads", uploaded source is visible in grid
      const filteredGrid = screen.getByTestId("curated-sources-grid");
      expect(within(filteredGrid).getByText("Week_05_UN_Security_Council_Veto.pptx")).toBeInTheDocument();

      // Extracted Content & Used References is open by default, showing location pins and quotes
      expect(screen.getByRole("button", { name: /Extracted Content & Used References/i })).toBeInTheDocument();
      expect(within(filteredGrid).getByText(/📍 Slide 8/i)).toBeInTheDocument();
      expect(within(filteredGrid).getByText(/The permanent members have cast over 260 vetoes since 1946/i)).toBeInTheDocument();
      expect(within(filteredGrid).getByText(/P5 veto paralysis restricts collective security response/i)).toBeInTheDocument();
    });

    it("displays spreadsheet data summary and pin badges for uploaded dataset files", async () => {
      const mockSpreadsheet: UploadedSourceDocument = {
        id: "doc-sheet-1",
        name: "UN_Peacekeeping_Budgets_And_Fatalities_1990_2024.xlsx",
        sourceType: "spreadsheet",
        uploadedAt: new Date().toISOString(),
        author: "UN Department of Peace Operations",
        publicationDate: "2024",
        structuredDataSummary: "Dataset: 34 rows, 6 columns tracking annual peacekeeping budgets, active missions, and blue helmet casualties.",
        extractedEvidences: [
          {
            id: "ev-sheet-1",
            excerpt: "Average peacekeeping budget peaked at $8.27 billion in 2014-2015 before declining under budgetary austerity.",
            context: "Sheet 'Financial Overview', Rows 2-35",
            sourceLocation: "Sheet 'Financial Overview', Rows 2-35",
            claim: "Financial retrenchment has constrained UN operational capacity in contemporary missions.",
          },
        ],
      };

      getProject.mockResolvedValue({
        projectId: "proj-un-spreadsheet-2",
        outputTypeId: "OT-01",
        title: "UN Peace and Security Essay",
        hasDocument: false,
        answers: {
          assignment_question: unQuestion,
          word_count: 2000,
          target_word_count: 2000,
          citation_style: "apa7",
          academic_level: "undergraduate",
          assignment_type: "essay",
          assignment_current_phase: "sources",
          assignment_current_stage: "sources",
          approved_source_ids: ["doc-sheet-1"],
          assignment_user_uploaded_sources: [mockSpreadsheet],
        },
        gates: [],
      });

      render(
        <AssignmentWorkspace
          projectId="proj-un-spreadsheet-2"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      await screen.findByText(/Curated Literature & Course Sources/i);
      const curatedGrid = await screen.findByTestId("curated-sources-grid");
      expect(within(curatedGrid).getByText("UN_Peacekeeping_Budgets_And_Fatalities_1990_2024.xlsx")).toBeInTheDocument();
      expect(within(curatedGrid).getByText(/Uploaded: SPREADSHEET/i)).toBeInTheDocument();
      expect(within(curatedGrid).getByText(/Dataset: 34 rows, 6 columns tracking annual peacekeeping budgets/i)).toBeInTheDocument();
      expect(within(curatedGrid).getByText(/📍 Sheet 'Financial Overview', Rows 2-35/i)).toBeInTheDocument();
    });
  });

  describe("4. Scholarly Research & Verification Pipeline Visualizer", () => {
    it("renders the 4-phase research lifecycle with live verification status", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-un-test"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      // Verify Pipeline component renders
      expect(await screen.findByText(/Active Scholarly Research Engine/i)).toBeInTheDocument();
      expect(screen.getByText(/UN Peace & Security, Collective Security & Veto Dynamics/i)).toBeInTheDocument();
      expect(screen.getByText(/Semantic Extraction/i)).toBeInTheDocument();
      expect(screen.getByText(/Repository Querying/i)).toBeInTheDocument();
      expect(screen.getByText(/Rigor & DOI Check/i)).toBeInTheDocument();
      expect(screen.getByText(/Thesis Alignment/i)).toBeInTheDocument();

      // Trigger "Research & Refine Literature" button
      const researchBtn = screen.getByRole("button", { name: /Research & Refine Literature/i });
      expect(researchBtn).toBeInTheDocument();
      fireEvent.click(researchBtn);

      await waitFor(() => {
        expect(saveIntakeAnswers).toHaveBeenCalled();
      });
    });
  });
});
