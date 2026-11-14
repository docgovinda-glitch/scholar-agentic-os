// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { fixtureSources as buildFixtureSources } from "./fixtures/sourceFixtures";
import type { DiscoveredSource } from "../types";

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

// AssignmentWorkspace React.lazy()-loads ContextPanel and its stages. Under
// vitest the first import() of each makes Vite transform it on demand, which
// under CPU load runs past the 1 s default findBy* timeout before the
// Suspense fallback is replaced. Load them here, before any test's clock
// starts, so findBy* only waits on render. Keep in sync with the lazy()
// imports in AssignmentWorkspace.tsx.
await Promise.all([
  import("../../workspace/ContextPanel"),
  import("../stages/AssignmentUnderstandStage"),
  import("../stages/AssignmentSourcesStage"),
  import("../stages/AssignmentDraftingStage"),
  import("../stages/AssignmentSubmissionStage"),
]);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});


// The workspace loads the catalog works for this question; tests read titles
// and ids from it rather than naming entries, so they hold as the verified
// catalog changes.
const FIXTURE_QUESTION =
  "Critically evaluate algorithmic governance, procedural due process, and predictive accountability in administrative public decision-making.";
const fixtureSources = buildFixtureSources(FIXTURE_QUESTION, "apa7");
const firstSource = fixtureSources[0];
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const titleRe = (text: string) => new RegExp(escapeRe(text), "i");

describe("Phase 2 — Curated Literature & Course Sources Discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProject.mockResolvedValue({
      projectId: "proj-lit-1",
      outputTypeId: "OT-01",
      title: "Algorithmic Governance and AI Accountability",
      hasDocument: false,
      answers: {
        assignment_question: "Critically evaluate algorithmic governance, procedural due process, and predictive accountability in administrative public decision-making.",
        // Fixture: sources a previous live search saved to this project.
        assignment_sources: JSON.stringify(fixtureSources),
        word_count: 2500,
        citation_style: "apa7",
        academic_level: "postgraduate",
        assignment_type: "critical_essay",
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

  describe("1. Initial Literature Discovery (catalog works only)", () => {
    it("renders the true sources count in the workspace UI", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-lit-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      // Stage header should load
      expect(await screen.findByText(/Sources & Course Materials/i, undefined, { timeout: 5000 })).toBeInTheDocument();

      // Check header source counter shows how many were found
      const sourceCountMatches = screen.getAllByText(/\(\d+\s+identified\)/i);
      expect(sourceCountMatches.length).toBeGreaterThan(0);
      const text = sourceCountMatches[0].textContent;
      const countMatch = text?.match(/\((\d+)\s+identified\)/);
      const count = countMatch ? parseInt(countMatch[1], 10) : 0;
      expect(count).toBeGreaterThan(0);
    });
  });

  describe("2. Find More Literature (Progressive Discovery without duplicates)", () => {
    it("displays 'Find More Literature' button and expands literature pool on click", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-lit-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      expect(await screen.findByText(/Sources & Course Materials/i, undefined, { timeout: 5000 })).toBeInTheDocument();

      const findMoreBtn = screen.getByTestId("find-more-literature-btn");
      expect(findMoreBtn).toBeInTheDocument();
      expect(findMoreBtn).toHaveTextContent(/Find More Literature/i);

      // Click to discover more
      fireEvent.click(findMoreBtn);

      // Should save updated expanded sources list
      await waitFor(() => {
        expect(saveIntakeAnswers).toHaveBeenCalledWith(
          "proj-lit-1",
          expect.objectContaining({
            assignment_sources: expect.any(Array),
          })
        );
      });
    });
  });

  describe("3. Literature Card Grid", () => {
    // View-mode switcher (Card/List/Table/Compact) removed per UX refactor.
    // All sources are shown in a single responsive card grid.
    it("renders all sources in the card grid and the grid is always visible", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-lit-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      expect(await screen.findByText(/Sources & Course Materials/i, undefined, { timeout: 5000 })).toBeInTheDocument();

      // Grid is always rendered when sources exist (no view-mode switcher)
      const grid = screen.getByTestId("curated-sources-grid");
      expect(grid).toBeInTheDocument();

      // Source type pill and role badge visible on cards (types: journal|book|conference|institutional|report)
      const typePills = within(grid).getAllByText(/journal|book|conference|institutional|report/i);
      expect(typePills.length).toBeGreaterThan(0);
    });
  });

  describe("4. Literature Card Content & Actions", () => {
    // 'Verified Academic' badges, citation count, and 'Read scholarly abstract' toggle
    // were removed per UX refactor. Cards now show type pill, role badge, relevance snippet,
    // and a single approve/dismiss pill action.
    it("renders source type pills, role badges, relevance snippet, and approve actions", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-lit-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      expect(await screen.findByText(/Sources & Course Materials/i, undefined, { timeout: 5000 })).toBeInTheDocument();

      const grid = screen.getByTestId("curated-sources-grid");

      // Source type pills rendered on each card (types: journal|book|conference|institutional|report)
      const typePills = within(grid).getAllByText(/journal|book|conference|institutional|report/i);
      expect(typePills.length).toBeGreaterThan(0);

      // Approve action buttons rendered
      const approveBtns = within(grid).getAllByText(/\+ Add Source/i);
      expect(approveBtns.length).toBeGreaterThan(0);

      // A catalog work's title is visible on its card
      expect(within(grid).getByText(titleRe(firstSource.title))).toBeInTheDocument();
    });

    it("toggles approve / added state on a source card", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-lit-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      expect(await screen.findByText(/Sources & Course Materials/i, undefined, { timeout: 5000 })).toBeInTheDocument();

      const approveBtn = screen.getByRole("button", {
        name: new RegExp(`Approve ${escapeRe(firstSource.title)}`, "i"),
      });
      fireEvent.click(approveBtn);

      // Button label should update to ✓ Added
      await waitFor(() => {
        expect(saveIntakeAnswers).toHaveBeenCalledWith(
          "proj-lit-1",
          expect.objectContaining({
            approved_source_ids: expect.arrayContaining([firstSource.id]),
          })
        );
      });
    });
  });

  describe("5. Search, Filtering, and Bookmarking", () => {
    it("filters sources via the search input in real time", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-lit-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      expect(await screen.findByText(/Sources & Course Materials/i, undefined, { timeout: 5000 })).toBeInTheDocument();

      // Search by the first work's lead author: it stays, a work without
      // that name in its title or authors is filtered out.
      const surname = firstSource.authors[0].split(",")[0];
      const other = fixtureSources.find(
        (s) => !s.authors.join(" ").includes(surname) && !s.title.includes(surname)
      )!;
      const searchInput = screen.getByLabelText(/Search curated literature/i);
      fireEvent.change(searchInput, { target: { value: surname } });

      expect(screen.getByText(titleRe(firstSource.title))).toBeInTheDocument();
      expect(screen.queryByText(titleRe(other.title))).not.toBeInTheDocument();
    });

    it("allows bookmarking sources and viewing them under the Bookmarked tab", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-lit-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      expect(await screen.findByText(/Sources & Course Materials/i, undefined, { timeout: 5000 })).toBeInTheDocument();

      // Bookmark first source
      const bookmarkBtns = screen.getAllByLabelText(/Bookmark this source/i);
      expect(bookmarkBtns.length).toBeGreaterThan(0);
      fireEvent.click(bookmarkBtns[0]);

      // Click Bookmarked tab
      const bookmarkedTab = screen.getByRole("button", { name: /Bookmarked/i });
      fireEvent.click(bookmarkedTab);

      // Verify bookmarked item is shown
      expect(screen.getByText(titleRe(firstSource.title))).toBeInTheDocument();
    });
  });

});
