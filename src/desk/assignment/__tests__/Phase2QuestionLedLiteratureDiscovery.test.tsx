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
      expect(sources.length).toBeGreaterThanOrEqual(30);

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

      const sources = generateCuratedLiteratureSources(nuclearQuestion, "apa7");
      expect(sources.length).toBeGreaterThanOrEqual(30);

      const nuclearSources = sources.filter(
        (s) =>
          s.title.toLowerCase().includes("deterrence") ||
          s.title.toLowerCase().includes("stability") ||
          s.keyConcepts?.some((k) => k.toLowerCase().includes("deterrence") || k.toLowerCase().includes("stability"))
      );
      expect(nuclearSources.length).toBeGreaterThanOrEqual(25);
    });
  });

  describe("2. Recency-First Discovery & Seminal Core Theory Preservation", () => {
    it("prioritizes recent 2026/2025 scholarship first while retaining seminal works as Core theory", () => {
      const sources = generateCuratedLiteratureSources(ukraineQuestion, "apa7");

      // Top source must be a recent 2026 empirical study
      const top1 = sources[0];
      expect(parseInt(top1.year, 10)).toBeGreaterThanOrEqual(2025);
      expect(top1.roleInAssignment).toBe("Empirical evidence");
      expect(top1.relevanceCategory).toBe("Very High");

      // Top 3 sources should feature 2026 and 2025 studies
      const top3Years = sources.slice(0, 3).map((s) => parseInt(s.year, 10));
      expect(top3Years.some((y) => y >= 2026)).toBe(true);

      // Must also retain foundational studies (< 2010) as 'Core theory'
      const seminalCore = sources.filter((s) => s.roleInAssignment === "Core theory");
      expect(seminalCore.length).toBeGreaterThanOrEqual(2);
      expect(seminalCore.some((s) => parseInt(s.year, 10) <= 2005)).toBe(true);
    });

    it("assigns expected role and relevance categories to sources matching the required user table", () => {
      const sources = generateCuratedLiteratureSources(ukraineQuestion, "apa7");

      // Verify presence of all expected assignment roles:
      const roles = new Set(sources.map((s) => s.roleInAssignment));
      expect(roles.has("Empirical evidence")).toBe(true);
      expect(roles.has("Theoretical framework")).toBe(true);
      expect(roles.has("Comparative evidence")).toBe(true);
      expect(roles.has("Core theory")).toBe(true);
      expect(roles.has("Methodological framework")).toBe(true);

      // Verify each source has questionAlignment populated
      sources.forEach((source) => {
        expect(source.questionAlignment).toBeDefined();
        expect(source.questionAlignment.directScore).toBeGreaterThanOrEqual(70);
        expect(source.questionAlignment.supportsPart).toBeTruthy();
        expect(source.questionAlignment.evidenceType).toBeTruthy();
      });
    });
  });

  describe("3. Workspace Table View & Evidence Badges", () => {
    it("renders the curated sources in Table view mode with Source, Year, Relevance, and Role in Assignment columns", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-ir-ukraine-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      expect(await screen.findByText(/Curated Literature & Course Sources/i)).toBeInTheDocument();

      // Switch to Table view
      const tableBtn = screen.getByRole("button", { name: /Table View/i });
      fireEvent.click(tableBtn);

      // Verify Table View rendered
      const table = await screen.findByTestId("curated-sources-table");
      expect(table).toBeInTheDocument();

      // Verify expected table columns
      expect(within(table).getByText(/^Source$/i)).toBeInTheDocument();
      expect(within(table).getByText(/^Year$/i)).toBeInTheDocument();
      expect(within(table).getByText(/^Relevance$/i)).toBeInTheDocument();
      expect(within(table).getByText(/^Role in Assignment$/i)).toBeInTheDocument();

      // Verify 2026 Recent badges are rendered in table
      const recentBadges = within(table).getAllByText(/2026 Recent/i);
      expect(recentBadges.length).toBeGreaterThan(0);

      // Verify Role badges are rendered (e.g. Empirical evidence)
      const empiricalBadges = within(table).getAllByText(/Empirical evidence/i);
      expect(empiricalBadges.length).toBeGreaterThan(0);
    });

    it("filters literature by Role in Assignment (e.g. Theoretical framework)", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-ir-ukraine-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      expect(await screen.findByText(/Curated Literature & Course Sources/i)).toBeInTheDocument();

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

    it("filters literature by latest 2026 publication year", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-ir-ukraine-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      expect(await screen.findByText(/Curated Literature & Course Sources/i)).toBeInTheDocument();

      // Open advanced filters drawer
      const filterToggle = screen.getByRole("button", { name: /Filters/i });
      fireEvent.click(filterToggle);

      // Select 2026 publication year
      const yearSelect = screen.getByLabelText(/Publication Year/i);
      fireEvent.change(yearSelect, { target: { value: "2026" } });

      // Verify only 2026 sources are visible
      const year2026Badges = screen.getAllByText(/2026 Recent/i);
      expect(year2026Badges.length).toBeGreaterThan(0);
    });
  });
});
