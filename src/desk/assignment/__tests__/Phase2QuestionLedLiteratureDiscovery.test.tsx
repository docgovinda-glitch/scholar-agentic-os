// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  generateCuratedLiteratureSources,
  fetchMoreLiteratureSources,
  extractResearchIntent,
  deconstructAssignmentQuestion,
  calculateScholarlyRelevance,
} from "../services/scholarlyDiscoveryService";
import type { DiscoveredSource } from "../types";
import {
  CORE_SCHOLARLY_CATALOG,
  IR_CHINA_GEOPOLITICS_CATALOG,
  ORGANIZATIONAL_CULTURE_CATALOG,
} from "../services/scholarlyDiscoveryService";
import { QUANTUM_COMPUTING_CATALOG } from "../services/catalogs/quantumComputingCatalog";
import { UN_PEACE_SECURITY_CATALOG } from "../services/catalogs/unPeaceSecurityCatalog";

// Every offline result must be a curated catalog entry, unchanged: the
// discovery no longer makes up papers to reach a target count.
const CATALOG = new Map(
  [
    ...CORE_SCHOLARLY_CATALOG,
    ...IR_CHINA_GEOPOLITICS_CATALOG,
    ...ORGANIZATIONAL_CULTURE_CATALOG,
    ...QUANTUM_COMPUTING_CATALOG,
    ...UN_PEACE_SECURITY_CATALOG,
  ].map((c) => [c.title, c])
);
function expectFromCatalog(sources: DiscoveredSource[]) {
  for (const s of sources) {
    const entry = CATALOG.get(s.title);
    expect(entry, s.title).toBeDefined();
    expect(s.authors).toEqual(entry!.authors);
    expect(String(s.year)).toBe(String(entry!.year));
  }
}
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

describe("Phase 02 — Strictly Question-Led, Evidence-Oriented, Discipline-Aware & Recency-First Literature Discovery", () => {
  const ukraineQuestion =
    "Critically analyze the strategic implications of the Russia-Ukraine War for European security architecture and NATO deterrence.";

  const nuclearQuestion =
    "Evaluate nuclear deterrence, crisis stability, and escalation dynamics between India and Pakistan in South Asia.";

  beforeEach(() => {
    vi.clearAllMocks();
    getProject.mockResolvedValue({
      projectId: "proj-ir-ukraine-1",
      outputTypeId: "OT-01",
      title: "Russia-Ukraine War & European Security Architecture",
      hasDocument: false,
      answers: {
        assignment_question: ukraineQuestion,

        // Fixture: sources a previous live search saved to this project.

        assignment_sources: JSON.stringify(seedSources(ukraineQuestion)),
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

  describe("1. Question Deconstruction & Disciplinary Contextual Constraint", () => {
    it("deconstructs the assignment question into key concepts, variables, theories, cases, and geographic scope", () => {
      const deconstruction = deconstructAssignmentQuestion(ukraineQuestion);

      expect(deconstruction.academicDiscipline).toBe("International Relations & Geopolitics");
      expect(deconstruction.geographicScope).toContain("Eastern Europe & Transatlantic");
      expect(deconstruction.cases).toContain("Russia-Ukraine War & European Security Architecture");
      expect(deconstruction.theories.length).toBeGreaterThan(0);
      expect(deconstruction.theories.some((t) => t.includes("Deterrence") || t.includes("Realism"))).toBe(true);

      // Variables extracted
      expect(deconstruction.variables.independent.length).toBeGreaterThan(0);
      expect(deconstruction.variables.dependent.length).toBeGreaterThan(0);
      expect(deconstruction.variables.explanatory.length).toBeGreaterThan(0);

      // Key concepts extracted
      expect(deconstruction.keyConcepts.some((c) => c.toLowerCase().includes("russia") || c.toLowerCase().includes("ukraine"))).toBe(true);
      expect(deconstruction.keyConcepts.some((c) => c.toLowerCase().includes("nato"))).toBe(true);
    });

    it("treats academic discipline as a contextual constraint and does not search broad IR or leak unrelated UN veto papers", () => {
      const sources = generateCuratedLiteratureSources(ukraineQuestion, "apa7");
      // Short list rather than padded: only catalog works that match.
      expect(sources.length).toBeGreaterThan(0);
      expectFromCatalog(sources);

      // Zero leakage of UN Security Council veto papers (ir-un-01, ir-un-02, etc.)
      const unVetoLeaked = sources.filter((s) => s.id.startsWith("src-ir-un"));
      expect(unVetoLeaked.length).toBe(0);

      // Zero leakage of China Belt and Road papers
      const chinaBriLeaked = sources.filter((s) => s.id.startsWith("src-ir-china"));
      expect(chinaBriLeaked.length).toBe(0);

      // All sources are verified academic and have relevanceScore >= 70
      sources.forEach((s) => {
        expect(s.relevanceScore).toBeGreaterThanOrEqual(70);
        expect(s.isVerifiedAcademic).toBe(true);
      });
    });

    it("correctly deconstructs South Asia nuclear deterrence question and aligns literature to crisis stability", () => {
      const deconstruction = deconstructAssignmentQuestion(nuclearQuestion);
      expect(deconstruction.academicDiscipline).toBe("International Relations & Geopolitics");
      expect(deconstruction.geographicScope).toContain("South Asia");
      expect(deconstruction.cases).toContain("India-Pakistan Nuclear Dyad & Crisis Stability");

      // The offline catalogs hold no South Asian nuclear studies, so none are
      // made up to fill the list; live portal search supplies them.
      const sources = generateCuratedLiteratureSources(nuclearQuestion, "apa7");
      expect(sources.length).toBeLessThan(30);
      expectFromCatalog(sources);
    });
  });

  describe("2. Recency-First Discovery & Seminal Core Theory Preservation", () => {
    it("does not invent recent studies, and retains seminal works as Core theory", () => {
      const sources = generateCuratedLiteratureSources(ukraineQuestion, "apa7");

      // Years are the catalog's own; no "2026 study" is made up to lead the list.
      expectFromCatalog(sources);

      // Must also retain foundational studies (< 2010) as 'Core theory'
      const seminalCore = sources.filter((s) => s.roleInAssignment === "Core theory");
      expect(seminalCore.length).toBeGreaterThanOrEqual(2);
      expect(seminalCore.some((s) => parseInt(s.year, 10) <= 2005)).toBe(true);
    });

    it("assigns a role from the user table to every source", () => {
      const sources = generateCuratedLiteratureSources(ukraineQuestion, "apa7");

      // Every role comes from the table; not every role must appear, since
      // the list holds only the works that match the question.
      const allowed = new Set([
        "Empirical evidence",
        "Theoretical framework",
        "Comparative evidence",
        "Core theory",
        "Methodological framework",
        "Contextual evidence",
      ]);
      sources.forEach((s) => expect(allowed.has(s.roleInAssignment as string), s.roleInAssignment).toBe(true));

      // Verify each source has questionAlignment populated
      sources.forEach((source) => {
        expect(source.questionAlignment).toBeDefined();
        expect(source.questionAlignment!.directScore).toBeGreaterThanOrEqual(70);
        expect(source.questionAlignment!.supportsPart).toBeTruthy();
        expect(source.questionAlignment!.evidenceType).toBeTruthy();
      });
    });
  });

  describe("3. Workspace Card Grid & Evidence Badges", () => {
    // Table/List/Compact view-mode switcher was removed per UX refactor (task 6).
    // Sources are now displayed in a single standardised responsive card grid.
    it("renders the curated sources grid with the catalog works", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-ir-ukraine-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      expect(await screen.findByText(/Sources & Course Materials/i, undefined, { timeout: 5000 })).toBeInTheDocument();

      // Verify standardised grid is rendered
      const grid = await screen.findByTestId("curated-sources-grid");
      expect(grid).toBeInTheDocument();

      // The compact grid shows each work's own title (here, a catalog book);
      // the old assertion found "Empirical evidence" only on invented filler.
      expect(within(grid).getByText(/Swords into Plowshares/i)).toBeInTheDocument();
    });

    it("filters literature by Role in Assignment (e.g. Theoretical framework)", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-ir-ukraine-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      expect(await screen.findByText(/Sources & Course Materials/i, undefined, { timeout: 5000 })).toBeInTheDocument();

      // Open advanced filters drawer
      const filterToggle = screen.getByRole("button", { name: /Filters/i });
      fireEvent.click(filterToggle);

      // Select Role in Assignment filter
      const roleSelect = screen.getByLabelText(/Role in Assignment/i);
      fireEvent.change(roleSelect, { target: { value: "Theoretical framework" } });

      // Verify all rendered cards or items display Theoretical framework
      const theoreticalBadges = screen.getAllByText(/Theoretical framework/i);
      expect(theoreticalBadges.length).toBeGreaterThan(0);
    });

    it("filters literature by publication year (seminal works)", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-ir-ukraine-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      expect(await screen.findByText(/Sources & Course Materials/i, undefined, { timeout: 5000 })).toBeInTheDocument();

      // Open advanced filters drawer
      const filterToggle = screen.getByRole("button", { name: /Filters/i });
      fireEvent.click(filterToggle);

      // Select seminal works (no invented 2026 studies exist to filter on)
      const yearSelect = screen.getByLabelText(/Publication Year/i);
      fireEvent.change(yearSelect, { target: { value: "seminal" } });

      const grid = screen.getByTestId("curated-sources-grid");
      expect(grid).toBeInTheDocument();
      // Filtered sources show their own year, e.g. Claude's 2006 book
      const seminalItems = within(grid).getAllByText("2006");
      expect(seminalItems.length).toBeGreaterThan(0);
    });
  });
});
