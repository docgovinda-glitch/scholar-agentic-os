// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  generateCuratedLiteratureSources,
  fetchMoreLiteratureSources,
} from "../services/scholarlyDiscoveryService";
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

  describe("1. Initial Literature Discovery (30+ Sources)", () => {
    it("generates at least 30 credible, authentic academic literature items initially", () => {
      const sources = generateCuratedLiteratureSources(
        "Critically evaluate algorithmic governance and administrative law",
        "apa7"
      );

      // Must return at least 30 items
      expect(sources.length).toBeGreaterThanOrEqual(30);

      // Verify academic quality and diversity
      const journals = sources.filter((s) => s.type === "journal");
      const books = sources.filter((s) => s.type === "book");
      const conferences = sources.filter((s) => s.type === "conference");
      const institutional = sources.filter((s) => s.type === "institutional" || s.type === "report");

      expect(journals.length).toBeGreaterThanOrEqual(10);
      expect(books.length).toBeGreaterThanOrEqual(4);
      expect(conferences.length).toBeGreaterThanOrEqual(2);
      expect(institutional.length).toBeGreaterThanOrEqual(2);

      // Verify each item contains required academic metadata
      sources.forEach((source) => {
        expect(source.id).toBeTruthy();
        expect(source.title).toBeTruthy();
        expect(source.authors.length).toBeGreaterThan(0);
        expect(source.year).toMatch(/^\d{4}$/);
        expect(source.journal || source.publisher).toBeTruthy();
        expect(source.abstract).toBeTruthy();
        expect(source.abstract!.length).toBeGreaterThan(30);
        expect(source.relevanceScore).toBeGreaterThanOrEqual(70);
        expect(source.citation).toBeTruthy();
        expect(source.methodology).toBeTruthy();
        expect(source.citationCount).toBeDefined();
        expect(source.isVerifiedAcademic).toBe(true);
      });
    });

    it("renders the 30+ sources count in the workspace UI", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-lit-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      // Stage header should load
      expect(await screen.findByText(/Curated Literature & Course Sources/i)).toBeInTheDocument();

      // Check header source counter indicates at least 30 identified
      const sourceCountMatches = screen.getAllByText(/\(\d+\s+identified\)/i);
      expect(sourceCountMatches.length).toBeGreaterThan(0);
      const text = sourceCountMatches[0].textContent;
      const countMatch = text?.match(/\((\d+)\s+identified\)/);
      const count = countMatch ? parseInt(countMatch[1], 10) : 0;
      expect(count).toBeGreaterThanOrEqual(30);
    });
  });

  describe("2. Find More Literature (Progressive Discovery without duplicates)", () => {
    it("deduplicates and retrieves new literature sources when calling fetchMoreLiteratureSources", () => {
      const initialSources = generateCuratedLiteratureSources("Algorithmic Governance", "apa7");
      const initialCount = initialSources.length;

      const moreSources = fetchMoreLiteratureSources(initialSources, "Algorithmic Governance", 10);
      expect(moreSources.length).toBeGreaterThan(0);

      // Ensure no duplicates exist between initial and new batch
      const initialIds = new Set(initialSources.map((s) => s.id));
      const initialDois = new Set(initialSources.map((s) => s.doi).filter(Boolean));

      moreSources.forEach((source) => {
        expect(initialIds.has(source.id)).toBe(false);
        if (source.doi) {
          expect(initialDois.has(source.doi)).toBe(false);
        }
      });
    });

    it("displays 'Find More Literature' button and expands literature pool on click", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-lit-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      expect(await screen.findByText(/Curated Literature & Course Sources/i)).toBeInTheDocument();

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

  describe("3. Multiple Literature Viewing Modes", () => {
    it("supports switching between Card, List, Table, and Compact views while preserving context", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-lit-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      expect(await screen.findByText(/Curated Literature & Course Sources/i)).toBeInTheDocument();

      // Default view is Card View
      expect(screen.getByTestId("curated-sources-grid")).toBeInTheDocument();

      // Switch to List View
      const listBtn = screen.getByRole("button", { name: /List View/i });
      fireEvent.click(listBtn);
      expect(await screen.findByTestId("curated-sources-list-view")).toBeInTheDocument();
      expect(screen.queryByTestId("curated-sources-grid")).not.toBeInTheDocument();

      // Switch to Table View
      const tableBtn = screen.getByRole("button", { name: /Table View/i });
      fireEvent.click(tableBtn);
      expect(await screen.findByTestId("curated-sources-table")).toBeInTheDocument();
      expect(screen.queryByTestId("curated-sources-list-view")).not.toBeInTheDocument();

      // Switch to Compact View
      const compactBtn = screen.getByRole("button", { name: /Compact View/i });
      fireEvent.click(compactBtn);
      expect(await screen.findByTestId("curated-sources-compact-view")).toBeInTheDocument();

      // Switch back to Card View
      const cardBtn = screen.getByRole("button", { name: /Card View/i });
      fireEvent.click(cardBtn);
      expect(await screen.findByTestId("curated-sources-grid")).toBeInTheDocument();
    });
  });

  describe("4. Literature Quality, Abstracts, & Academic Badges", () => {
    it("renders verified academic badges, methodology tags, and citation counts", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-lit-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      expect(await screen.findByText(/Curated Literature & Course Sources/i)).toBeInTheDocument();

      // Check for verified academic badges
      const verifiedBadges = screen.getAllByText(/Verified Academic/i);
      expect(verifiedBadges.length).toBeGreaterThan(0);

      // Check for citation count display
      const citationMatches = screen.getAllByText(/citations/i);
      expect(citationMatches.length).toBeGreaterThan(0);

      // Check for prompt alignment rationale
      const rationaleHeaders = screen.getAllByText(/How it supports your assignment prompt/i);
      expect(rationaleHeaders.length).toBeGreaterThan(0);
    });

    it("allows expanding scholarly abstract", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-lit-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      expect(await screen.findByText(/Curated Literature & Course Sources/i)).toBeInTheDocument();

      // Find first "Read scholarly abstract" button
      const abstractBtns = screen.getAllByText(/Read scholarly abstract/i);
      expect(abstractBtns.length).toBeGreaterThan(0);

      fireEvent.click(abstractBtns[0]);

      // "Hide abstract" should now appear
      expect(screen.getByText(/Hide abstract/i)).toBeInTheDocument();
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

      expect(await screen.findByText(/Curated Literature & Course Sources/i)).toBeInTheDocument();

      const searchInput = screen.getByLabelText(/Search curated literature/i);
      fireEvent.change(searchInput, { target: { value: "Pasquale" } });

      // Should show matching item and filter out non-matching
      expect(screen.getByText(/Algorithmic Governance and the Politics of Predictive Accountability/i)).toBeInTheDocument();
      expect(screen.queryByText(/Critical Synthesis of Empirical Evidence in Socio-Technical Decision Making/i)).not.toBeInTheDocument();
    });

    it("allows bookmarking sources and viewing them under the Bookmarked tab", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-lit-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      expect(await screen.findByText(/Curated Literature & Course Sources/i)).toBeInTheDocument();

      // Bookmark first source
      const bookmarkBtns = screen.getAllByLabelText(/Bookmark this source/i);
      expect(bookmarkBtns.length).toBeGreaterThan(0);
      fireEvent.click(bookmarkBtns[0]);

      // Click Bookmarked tab
      const bookmarkedTab = screen.getByRole("button", { name: /Bookmarked/i });
      fireEvent.click(bookmarkedTab);

      // Verify bookmarked item is shown
      expect(screen.getByText(/Algorithmic Governance and the Politics of Predictive Accountability/i)).toBeInTheDocument();
    });
  });
});
