// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { fixtureSources as seedSourcesFixture } from "./fixtures/sourceFixtures";
const seedSources = (question: string) => seedSourcesFixture(question, "apa7");


const getProject = vi.fn();
const getDocument = vi.fn();
const getRubric = vi.fn();
const getOutputTypeSpec = vi.fn();
const saveIntakeAnswers = vi.fn();
const authedFetch = vi.fn();
const authedJsonFetch = vi.fn();

// Live literature search is a network call; these UI tests stand in for it
// with fixture sources, so the grid/filter/approve behaviour is still tested.
// (The app itself no longer substitutes catalog entries when search fails.)
vi.mock("../services/realScholarlyDiscoveryService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/realScholarlyDiscoveryService")>();
  const fixtures = await import("./fixtures/sourceFixtures");
  return {
    ...actual,
    discoverRealScholarlySourcesFromServer: vi.fn(async (question: string, style = "apa7") =>
      fixtures.fixtureSources(question, style)
    ),
    fetchMoreRealSources: vi.fn(async (existing: Parameters<typeof fixtures.fixtureMoreSources>[0], question: string, n = 10) =>
      fixtures.fixtureMoreSources(existing, question, n)
    ),
  };
});

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

// The workspace loads the catalog works for this question; tests read titles
// and ids from it rather than naming entries, so they hold as the verified
// catalog changes.
const ETHICS_QUESTION = "Critically evaluate the ethics of autonomous decision-making systems.";
const fixtureSources = seedSources(ETHICS_QUESTION);
const [firstSource, secondSource, thirdSource] = fixtureSources;
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const titleRe = (text: string) => new RegExp(escapeRe(text), "i");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Assignment Phase 1 Wiring & Phase 2 Sources Workspace", () => {
  beforeEach(() => {
    getProject.mockResolvedValue({
      projectId: "proj-sources-1",
      outputTypeId: "OT-01",
      title: "Algorithmic Ethics Essay",
      hasDocument: false,
      answers: {
        assignment_question: "Critically evaluate the ethics of autonomous decision-making systems.",

        // Fixture: sources a previous live search saved to this project.

        assignment_sources: JSON.stringify(seedSources("Critically evaluate the ethics of autonomous decision-making systems.")),
        word_count: 2000,
        target_word_count: 2000,
        citation_style: "apa7",
        academic_level: "undergraduate",
        assignment_type: "critical_essay",
        marking_rubric: "1. Critical Analysis: 40%\n2. Evidence & Citations: 30%\n3. Structure & Cohesion: 30%",
        approved_source_ids: [],
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

  describe("Phase 1: Understand Wiring & Exit Gate Enforcement", () => {
    it("enforces exit gate: enables Proceed to Sources button when mandatory fields exist", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-sources-1"
          initialStage="understand"
          onStageChange={vi.fn()}
        />
      );

      const proceedBtn = await screen.findByRole("button", { name: /Proceed to Sources/i });
      expect(proceedBtn).toBeInTheDocument();
      expect(proceedBtn).not.toBeDisabled();

      fireEvent.click(proceedBtn);

      await waitFor(() => {
        expect(saveIntakeAnswers).toHaveBeenCalledWith(
          "proj-sources-1",
          expect.objectContaining({
            rawPrompt: expect.stringContaining("autonomous decision-making systems"),
            targetWordCount: 2000,
            wordBudget: expect.objectContaining({
              intro: 200,
              conclusion: 200,
              body: 1600,
            }),
            citationStyle: "apa7",
            rubricCriteria: expect.arrayContaining([
              expect.objectContaining({
                criterion: expect.stringContaining("Critical Analysis"),
                weightPercentage: 40,
              }),
            ]),
          })
        );
      });
    });

    it("disables Proceed to Sources when prompt or word count is missing", async () => {
      getProject.mockResolvedValueOnce({
        projectId: "proj-sources-empty",
        outputTypeId: "OT-01",
        title: "Untitled Assignment",
        hasDocument: false,
        answers: {
          assignment_question: "",

          // Fixture: sources a previous live search saved to this project.

          assignment_sources: JSON.stringify(seedSources("")),
          word_count: 0,
          citation_style: "",
        },
        gates: [],
      });

      render(
        <AssignmentWorkspace
          projectId="proj-sources-empty"
          initialStage="understand"
          onStageChange={vi.fn()}
        />
      );

      const proceedBtn = await screen.findByRole("button", { name: /Proceed to Sources/i });
      expect(proceedBtn).toBeDisabled();
      expect(screen.getByText(/Please provide the assignment question, word count, and citation style to continue/i)).toBeInTheDocument();
    });
  });

  describe("Phase 2: Sources Stage & Evidence Exit Gate", () => {
    it("renders curated literature cards with venue, authors, and rationale", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-sources-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      // Phase 2 Header & Section Headings
      expect(await screen.findByText(/Sources & Course Materials/i)).toBeInTheDocument();
      expect(screen.getByText(/Course Materials \& Syllabus Upload/i)).toBeInTheDocument();
      expect(screen.getByText(/Curated Scholarly Literature/i)).toBeInTheDocument();

      // Curated Literature Cards (Titles, Authors, Venue)
      expect(screen.getByText(titleRe(firstSource.title))).toBeInTheDocument();
      expect(screen.getAllByText(new RegExp(firstSource.authors[0].split(",")[0], "i")).length).toBeGreaterThan(0);
      expect(screen.getAllByText(titleRe((firstSource.journal || firstSource.publisher)!)).length).toBeGreaterThan(0);
      expect(screen.getByText(titleRe(secondSource.title))).toBeInTheDocument();

      // Exit Gate Counter (visible when sources are present) & unblocked Proceed to Drafting & Skip to Drafting buttons
      expect(screen.queryByTestId("evidence-counter")).not.toBeInTheDocument();

      const proceedDraftingBtn = screen.getByTestId("proceed-to-drafting-btn");
      expect(proceedDraftingBtn).not.toBeDisabled();

      // Clean bottom bar: no Skip / AI Analysis shortcuts, just Back and Proceed
      expect(screen.queryByTestId("skip-to-drafting-btn")).not.toBeInTheDocument();
      expect(screen.queryByText("Move to AI Analysis")).not.toBeInTheDocument();
      expect(screen.getByText("Back to Understand")).toBeInTheDocument();
    });

    it("allows one-click approve and remove actions on curated cards", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-sources-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      await screen.findByText(/Sources & Course Materials/i);

      // Approve card 1
      const approveBtn1 = screen.getByRole("button", { name: new RegExp(`Approve ${escapeRe(firstSource.title)}`, "i") });
      fireEvent.click(approveBtn1);

      await waitFor(() => {
        expect(saveIntakeAnswers).toHaveBeenCalledWith(
          "proj-sources-1",
          expect.objectContaining({
            approved_source_ids: expect.arrayContaining([firstSource.id]),
          })
        );
      });

      // Toggle off card 1 (Remove from approved)
      const removeBtn1 = screen.getByRole("button", { name: new RegExp(`Remove ${escapeRe(firstSource.title)} from approved`, "i") });
      fireEvent.click(removeBtn1);

      await waitFor(() => {
        expect(saveIntakeAnswers).toHaveBeenCalledWith(
          "proj-sources-1",
          expect.objectContaining({
            approved_source_ids: expect.not.arrayContaining([firstSource.id]),
          })
        );
      });
    });

    it("accepts lecture file uploads, auto-approves them, and tracks progress towards recommended sources", async () => {
      getProject.mockResolvedValueOnce({
        projectId: "proj-sources-1",
        outputTypeId: "OT-01",
        title: "Algorithmic Ethics Essay",
        hasDocument: false,
        answers: {
          assignment_question: "Critically evaluate the ethics of autonomous decision-making systems.",

          // Fixture: sources a previous live search saved to this project.

          assignment_sources: JSON.stringify(seedSources("Critically evaluate the ethics of autonomous decision-making systems.")),
          word_count: 2000,
          citation_style: "apa7",
          academic_level: "undergraduate",
          assignment_type: "critical_essay",
          approved_source_ids: [firstSource.id, secondSource.id, thirdSource.id],
        },
        gates: [],
      });

      render(
        <AssignmentWorkspace
          projectId="proj-sources-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      await screen.findByText(/Sources & Course Materials/i);

      // Check current count: 3 / 4 recommended
      expect(screen.queryByTestId("evidence-counter")).not.toBeInTheDocument();
      const proceedDraftingBtn = screen.getByTestId("proceed-to-drafting-btn");
      expect(proceedDraftingBtn).not.toBeDisabled();

      // Upload 1 lecture slides PDF to meet 4 recommended threshold
      const fileInput = screen.getByTestId("lecture-file-input");
      const file = new File(["lecture notes content"], "Week_04_Algorithmic_Ethics_Slides.pdf", {
        type: "application/pdf",
      });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(saveIntakeAnswers).toHaveBeenCalledWith(
          "proj-sources-1",
          expect.objectContaining({
            assignment_user_uploaded_sources: expect.arrayContaining([
              expect.objectContaining({ name: "Week_04_Algorithmic_Ethics_Slides.pdf" }),
            ]),
            approved_source_ids: expect.arrayContaining([
              firstSource.id,
              secondSource.id,
              thirdSource.id,
              expect.stringMatching(/^doc-/),
            ]),
          })
        );
      });
    });

    it("renders empty state container with 0 source cards when project is untitled with no uploads", async () => {
      getProject.mockResolvedValueOnce({
        projectId: "proj-sources-blank",
        outputTypeId: "OT-01",
        title: "Untitled Assignment",
        hasDocument: false,
        answers: {
          assignment_question: "",

          // Fixture: sources a previous live search saved to this project.

          assignment_sources: JSON.stringify(seedSources("")),
          word_count: 0,
          citation_style: "",
          approved_source_ids: [],
          assignment_sources: [],
          assignment_user_uploaded_sources: [],
        },
        gates: [],
      });

      render(
        <AssignmentWorkspace
          projectId="proj-sources-blank"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      // Verify empty state container renders with new simplified copy
      expect(await screen.findByTestId("sources-empty-state")).toBeInTheDocument();
      expect(screen.getByText(/Ground Your Assignment in Sources/i)).toBeInTheDocument();
      // Upload Course Materials / Define Assignment Topic buttons removed per UX refactor —
      // the dropzone itself is the CTA, and sources are optional.

      // Verify 0 literature cards are displayed
      expect(screen.queryByTestId("curated-sources-grid")).not.toBeInTheDocument();

      // Proceed stays available; there is no separate Skip button
      expect(screen.queryByTestId("skip-to-drafting-btn")).not.toBeInTheDocument();
      expect(screen.getAllByTestId("proceed-to-drafting-btn").length).toBeGreaterThan(0);
    });
  });
});
