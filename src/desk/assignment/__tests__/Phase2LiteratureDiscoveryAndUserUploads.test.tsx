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
import { UN_PEACE_SECURITY_CATALOG } from "../services/catalogs/unPeaceSecurityCatalog";
import { generateCuratedLiteratureSources as seedSourcesFixture } from "../services/scholarlyDiscoveryService";
const seedSources = (question: string) => seedSourcesFixture(question, "apa7");


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

// Live literature search is a network call; these UI tests stand in for it
// with fixture sources, so the grid/filter/approve behaviour is still tested.
// (The app itself no longer substitutes catalog entries when search fails.)
vi.mock("../services/realScholarlyDiscoveryService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/realScholarlyDiscoveryService")>();
  const fixtures = await import("../services/scholarlyDiscoveryService");
  return {
    ...actual,
    discoverRealScholarlySourcesFromServer: vi.fn(async (question: string, style = "apa7") =>
      fixtures.generateCuratedLiteratureSources(question, style)
    ),
    fetchMoreRealSources: vi.fn(async (existing: Parameters<typeof fixtures.fetchMoreLiteratureSources>[0], question: string, n = 10) =>
      fixtures.fetchMoreLiteratureSources(existing, question, n)
    ),
  };
});

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

        // Fixture: sources a previous live search saved to this project.

        assignment_sources: JSON.stringify(seedSources(unQuestion)),
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
      // As many works as the verified UN catalog holds, and no more (the old
      // floor of 30 was met by works that could not be confirmed).
      expect(sources.length).toBeGreaterThan(0);
      const unIds = new Set(UN_PEACE_SECURITY_CATALOG.map((c) => c.id));
      sources.forEach((s) => expect(unIds.has(s.id), s.id).toBe(true));

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

  describe("2. Phase 1 Context Visible in Phase 2 (Topic Breadcrumb)", () => {
    // AssignmentBriefScopePanel was removed per UX refactor directive (task 6).
    // Phase 1 parameters (Academic Level, Assignment Type etc.) are defined in Phase 1 only.
    // Phase 2 shows an unobtrusive single-line topic breadcrumb and the h1 heading.
    it("renders the Sources stage heading without a raw topic line", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-un-test"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      // New Phase 2 h1 heading
      expect(await screen.findByText(/Sources & Course Materials/i, undefined, { timeout: 5000 })).toBeInTheDocument();

      // The raw topic line is no longer echoed under the heading
      expect(screen.queryByText(unQuestion)).not.toBeInTheDocument();

      // Proceed to Drafting is always available (unblocked)
      expect(screen.getByTestId("proceed-to-drafting-btn")).not.toBeDisabled();
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

          // Fixture: sources a previous live search saved to this project.

          assignment_sources: JSON.stringify(seedSources(unQuestion)),
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

      await screen.findByText(/Sources & Course Materials/i, undefined, { timeout: 5000 });
      const curatedGrid = await screen.findByTestId("curated-sources-grid");
      expect(within(curatedGrid).getByText("Week_05_UN_Security_Council_Veto.pptx")).toBeInTheDocument();
      expect(screen.getByText(/Uploaded: PPTX/i)).toBeInTheDocument();
      // Card now renders "Extracted Content & Used References (N)" not "N Extracted Excerpt(s)"
      expect(screen.getByRole("button", { name: /Extracted Content & Used References/i })).toBeInTheDocument();

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

          // Fixture: sources a previous live search saved to this project.

          assignment_sources: JSON.stringify(seedSources(unQuestion)),
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

      await screen.findByText(/Sources & Course Materials/i, undefined, { timeout: 5000 });
      const curatedGrid = await screen.findByTestId("curated-sources-grid");
      expect(within(curatedGrid).getByText("UN_Peacekeeping_Budgets_And_Fatalities_1990_2024.xlsx")).toBeInTheDocument();
      expect(within(curatedGrid).getByText(/Uploaded: SPREADSHEET/i)).toBeInTheDocument();
      expect(within(curatedGrid).getByText(/Dataset: 34 rows, 6 columns tracking annual peacekeeping budgets/i)).toBeInTheDocument();
      expect(within(curatedGrid).getByText(/📍 Sheet 'Financial Overview', Rows 2-35/i)).toBeInTheDocument();

      // Verify the Evidence Knowledge Panel displays the 3 distinct layers for the uploaded file:
      const knowledgePanel = screen.getByTestId("uploaded-materials-list");
      expect(knowledgePanel).toBeInTheDocument();

      // 1. Uploaded material layer
      expect(within(knowledgePanel).getByText(/1. Uploaded Material/i)).toBeInTheDocument();
      expect(within(knowledgePanel).getAllByText("UN_Peacekeeping_Budgets_And_Fatalities_1990_2024.xlsx").length).toBeGreaterThan(0);
      expect(within(knowledgePanel).getAllByText(/Processed/i).length).toBeGreaterThan(0);

      // 2. Engine extracted layer
      expect(within(knowledgePanel).getByText(/2. Engine Extracted/i)).toBeInTheDocument();
      expect(within(knowledgePanel).getByText(/Key Findings:/i)).toBeInTheDocument();

      // 3. Used in assignment layer
      expect(within(knowledgePanel).getByText(/3. Used in Assignment/i)).toBeInTheDocument();
      expect(within(knowledgePanel).getByText(/relevant passages/i)).toBeInTheDocument();
      expect(within(knowledgePanel).getAllByText(/findings/i).length).toBeGreaterThan(0);
      expect(within(knowledgePanel).getAllByText(/citations/i).length).toBeGreaterThan(0);
    });
  });

  describe("4. Scholarly Research Engine Background Processing & Clean UI", () => {
    it("runs research processing automatically in the background without rendering the visible pipeline box", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-un-test"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      // Verify the visible box from screenshot 1 is NOT rendered in the frontend UI
      expect(screen.queryByText(/Active Scholarly Research Engine/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Semantic Extraction/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Repository Querying/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Rigor & DOI Check/i)).not.toBeInTheDocument();

      // Verify underlying research processing works in the background automatically:
      // Topic-calibrated literature is populated and available in the workspace
      expect(await screen.findByText(/Curated Scholarly Literature/i)).toBeInTheDocument();
      const curatedGrid = await screen.findByTestId("curated-sources-grid");
      expect(curatedGrid).toBeInTheDocument();
    });
  });
});
