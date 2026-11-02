// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  generateCuratedLiteratureSources,
  fetchMoreLiteratureSources,
  extractResearchIntent,
  generateStructuredSearchQueries,
  calculateScholarlyRelevance,
  areSourcesRelevantToQuestion,
  CORE_SCHOLARLY_CATALOG,
  IR_CHINA_GEOPOLITICS_CATALOG,
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
        assignment_sources: JSON.stringify(generateCuratedLiteratureSources("Critically evaluate algorithmic governance, procedural due process, and predictive accountability in administrative public decision-making.", "apa7")),
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
      expect(await screen.findByText(/Sources & Course Materials/i, undefined, { timeout: 5000 })).toBeInTheDocument();

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

      // Specific first card title visible
      expect(within(grid).getByText(/Algorithmic Governance and the Politics of Predictive Accountability/i)).toBeInTheDocument();
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
        name: /Approve Algorithmic Governance and the Politics of Predictive Accountability/i,
      });
      fireEvent.click(approveBtn);

      // Button label should update to ✓ Added
      await waitFor(() => {
        expect(saveIntakeAnswers).toHaveBeenCalledWith(
          "proj-lit-1",
          expect.objectContaining({
            approved_source_ids: expect.arrayContaining(["src-curated-1"]),
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

      expect(await screen.findByText(/Sources & Course Materials/i, undefined, { timeout: 5000 })).toBeInTheDocument();

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

  describe("6. Semantic Literature Discovery for 'How has the rise of China affected …'", () => {
    const chinaQuestion = "How has the rise of China affected …";

    it("parses assignment question into research intent, primary entities, and international relations domain", () => {
      const intent = extractResearchIntent(chinaQuestion);
      expect(intent.academicDomain).toBe("International Relations & Geopolitics");
      expect(intent.primaryEntities).toContain("China");
      expect(intent.coreThematicConcepts).toContain("Rise of China");
      expect(intent.commandVerb).toBe("Causal & Systemic Impact Evaluation");
    });

    it("generates multi-angle structured search queries capturing meaning and research intent", () => {
      const intent = extractResearchIntent(chinaQuestion);
      const queries = generateStructuredSearchQueries(intent);
      expect(queries.primary).toContain("China");
      expect(queries.primary).toContain("effects");
      expect(queries.theoretical).toMatch(/power transition|realism|liberalism/i);
      expect(queries.institutional).toMatch(/institutions|global governance|Bretton Woods/i);
      expect(queries.regional).toMatch(/Indo-Pacific|East Asia|security/i);
      expect(queries.economic).toMatch(/economic statecraft|Belt and Road/i);
    });

    it("retrieves genuinely relevant literature addressing China's rise, global influence, and international relations", () => {
      const sources = generateCuratedLiteratureSources(chinaQuestion, "apa7");
      expect(sources.length).toBeGreaterThanOrEqual(30);

      // Verify that literature directly addresses China, its rise, and geopolitics
      const chinaSources = sources.filter(
        (s) =>
          s.title.toLowerCase().includes("china") ||
          s.abstract?.toLowerCase().includes("china") ||
          s.keyConcepts?.some((k) => k.toLowerCase().includes("china"))
      );
      expect(chinaSources.length).toBeGreaterThanOrEqual(28);

      // Verify presence of seminal International Relations and China scholars
      const allAuthors = sources.flatMap((s) => s.authors).join(" ");
      expect(allAuthors).toMatch(/Allison|Johnston|Mearsheimer|Ikenberry|Shambaugh|Weiss|Economy/);

      // Verify zero unprompted algorithmic governance or machine learning papers leaked
      const leakedTechSources = sources.filter(
        (s) =>
          s.domain.toLowerCase().includes("computer science") ||
          s.title.toLowerCase().includes("algorithmic") ||
          s.title.toLowerCase().includes("machine learning")
      );
      expect(leakedTechSources.length).toBe(0);

      // Ensure every source satisfies relevance threshold >= 70
      sources.forEach((s) => {
        expect(s.relevanceScore).toBeGreaterThanOrEqual(70);
        expect(s.domain).toBe("International Relations & Geopolitics");
        expect(s.isVerifiedAcademic).toBe(true);
      });
    });

    it("detects mismatch when stale algorithmic governance sources exist for an IR China question", () => {
      // Algorithmic governance catalog should NOT be deemed relevant to China question
      const isRelevant = areSourcesRelevantToQuestion(CORE_SCHOLARLY_CATALOG as any, chinaQuestion);
      expect(isRelevant).toBe(false);

      // IR catalog should be deemed relevant
      const isIrRelevant = areSourcesRelevantToQuestion(IR_CHINA_GEOPOLITICS_CATALOG as any, chinaQuestion);
      expect(isIrRelevant).toBe(true);
    });

    it("progressively discovers additional non-duplicate China & IR literature on fetchMoreLiteratureSources", () => {
      const initialSources = generateCuratedLiteratureSources(chinaQuestion, "apa7");
      const moreSources = fetchMoreLiteratureSources(initialSources, chinaQuestion, 10);
      expect(moreSources.length).toBe(10);

      const initialIds = new Set(initialSources.map((s) => s.id));
      const initialDois = new Set(initialSources.map((s) => s.doi).filter(Boolean));

      moreSources.forEach((s) => {
        expect(initialIds.has(s.id)).toBe(false);
        if (s.doi) expect(initialDois.has(s.doi)).toBe(false);
        expect(s.relevanceScore).toBeGreaterThanOrEqual(70);
      });
    });
  });

  describe("7. Question Variations and Domain Generalizability", () => {
    it("handles specific variation: 'How has the rise of China affected the international order and US-China relations?'", () => {
      const prompt = "How has the rise of China affected the international order and US-China relations?";
      const sources = generateCuratedLiteratureSources(prompt, "apa7");
      expect(sources.length).toBeGreaterThanOrEqual(30);

      // Check top sources address international order and US-China relations
      const top3 = sources.slice(0, 3);
      const topTitles = top3.map((s) => s.title).join(" ");
      expect(topTitles).toMatch(/Status Quo|Liberal System|Destined for War|Great-Power/i);
    });

    it("handles specific variation: 'The economic and geopolitical implications of the Belt and Road Initiative on developing nations'", () => {
      const prompt = "The economic and geopolitical implications of the Belt and Road Initiative on developing nations";
      const sources = generateCuratedLiteratureSources(prompt, "apa7");
      expect(sources.length).toBeGreaterThanOrEqual(30);

      const briSources = sources.filter(
        (s) =>
          s.title.toLowerCase().includes("belt and road") ||
          s.abstract?.toLowerCase().includes("belt and road") ||
          s.abstract?.toLowerCase().includes("eurasian") ||
          s.title.toLowerCase().includes("economic") ||
          s.keyConcepts?.some((k) =>
            k.toLowerCase().includes("belt and road") ||
            k.toLowerCase().includes("economic") ||
            k.toLowerCase().includes("geoeconomic")
          )
      );
      expect(briSources.length).toBeGreaterThanOrEqual(8);
    });

    it("generalizes to other domains such as Environmental Science & Climate Policy", () => {
      const prompt = "Evaluating the efficacy of carbon pricing mechanisms and emissions trading in the European Union";
      const intent = extractResearchIntent(prompt);
      expect(intent.academicDomain).toBe("Environmental Science & Climate Policy");

      const sources = generateCuratedLiteratureSources(prompt, "apa7");
      expect(sources.length).toBeGreaterThanOrEqual(30);

      // Should not contain China or Algorithmic Governance papers
      const chinaPapers = sources.filter((s) => s.title.toLowerCase().includes("china"));
      expect(chinaPapers.length).toBe(0);
    });
  });
});
