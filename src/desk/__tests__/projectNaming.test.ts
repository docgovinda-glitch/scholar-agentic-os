import { describe, it, expect } from "vitest";
import {
  isDuplicateProjectTitle,
  getNextUntitledProjectTitle,
  findReusableEmptyProject,
  getProjectTitle,
  isBlankProject,
  deriveHeuristicTitle,
  getProjectDisplayName,
  getProjectHeadingPlaceholder,
  matchesProjectSearch,
  getFormatLabel,
  deduplicateProjectList,
} from "../projectNaming";

describe("projectNaming utilities", () => {
  describe("getProjectTitle", () => {
    it("extracts title from answers", () => {
      expect(getProjectTitle({ answers: { title: "Quantum Computing" } })).toBe("Quantum Computing");
    });

    it("extracts title from document when answers title is absent", () => {
      expect(getProjectTitle({ document: { title: "Neural Networks" } })).toBe("Neural Networks");
    });

    it("falls back to empty string for empty project", () => {
      expect(getProjectTitle({})).toBe("");
      expect(getProjectTitle(null)).toBe("");
    });
  });

  describe("isDuplicateProjectTitle", () => {
    const existing = [
      { id: "p1", projectId: "p1", answers: { title: "Neural Dynamics" } },
      { id: "p2", projectId: "p2", answers: { title: "Untitled Project" } },
      { id: "p3", projectId: "p3", answers: { title: "Quantum Simulation" } },
    ];

    it("detects exact duplicate title", () => {
      expect(isDuplicateProjectTitle("Neural Dynamics", undefined, existing)).toBe(true);
    });

    it("detects case-insensitive and trimmed duplicate title", () => {
      expect(isDuplicateProjectTitle("  neural dynamics  ", undefined, existing)).toBe(true);
      expect(isDuplicateProjectTitle("UNTITLED PROJECT", undefined, existing)).toBe(true);
    });

    it("ignores self when renaming current project", () => {
      expect(isDuplicateProjectTitle("Neural Dynamics", "p1", existing)).toBe(false);
      expect(isDuplicateProjectTitle("neural dynamics", "p1", existing)).toBe(false);
    });

    it("detects collision when renaming to another project's title", () => {
      expect(isDuplicateProjectTitle("Quantum Simulation", "p1", existing)).toBe(true);
    });

    it("permits unique titles", () => {
      expect(isDuplicateProjectTitle("A Brand New Paper", undefined, existing)).toBe(false);
      expect(isDuplicateProjectTitle("A Brand New Paper", "p1", existing)).toBe(false);
    });
  });

  describe("getNextUntitledProjectTitle", () => {
    it("returns 'Untitled Project' if none exists", () => {
      expect(getNextUntitledProjectTitle([])).toBe("Untitled Project");
      expect(getNextUntitledProjectTitle([{ answers: { title: "Some Paper" } }])).toBe("Untitled Project");
    });

    it("returns 'Untitled Project 1' when 'Untitled Project' exists", () => {
      const existing = [{ answers: { title: "Untitled Project" } }];
      expect(getNextUntitledProjectTitle(existing)).toBe("Untitled Project 1");
    });

    it("auto-increments past existing numbered untitled projects", () => {
      const existing = [
        { answers: { title: "Untitled Project" } },
        { answers: { title: "Untitled Project 1" } },
        { answers: { title: "untitled project 2" } },
      ];
      expect(getNextUntitledProjectTitle(existing)).toBe("Untitled Project 3");
    });

    it("fills first available gap in sequence", () => {
      const existing = [
        { answers: { title: "Untitled Project" } },
        { answers: { title: "Untitled Project 2" } },
      ];
      expect(getNextUntitledProjectTitle(existing)).toBe("Untitled Project 1");
    });
  });

  describe("findReusableEmptyProject", () => {
    it("identifies a zero-content 'Untitled Project' matching the output type", () => {
      const existing = [
        {
          projectId: "p1",
          outputTypeId: "OT-01",
          answers: { title: "Untitled Project" },
          hasDocument: false,
          intakeCompleteness: 0,
        },
      ];
      const match = findReusableEmptyProject(existing, "OT-01");
      expect(match).not.toBeNull();
      expect(match?.projectId).toBe("p1");
    });

    it("does not reuse if project has document or completed intake", () => {
      const withDoc = [
        {
          projectId: "p1",
          outputTypeId: "OT-01",
          answers: { title: "Untitled Project" },
          hasDocument: true,
          intakeCompleteness: 0,
        },
      ];
      expect(findReusableEmptyProject(withDoc, "OT-01")).toBeNull();

      const withIntake = [
        {
          projectId: "p2",
          outputTypeId: "OT-01",
          answers: { title: "Untitled Project" },
          hasDocument: false,
          intakeCompleteness: 0.5,
        },
      ];
      expect(findReusableEmptyProject(withIntake, "OT-01")).toBeNull();
    });

    it("does not reuse if outputTypeId does not match", () => {
      const existing = [
        {
          projectId: "p1",
          outputTypeId: "OT-01",
          answers: { title: "Untitled Project" },
          hasDocument: false,
          intakeCompleteness: 0,
        },
      ];
      expect(findReusableEmptyProject(existing, "OT-10")).toBeNull();
    });

    it("identifies untitled variants such as 'Academic Assignment' as reusable if empty", () => {
      const existing = [
        {
          projectId: "p1",
          outputTypeId: "OT-01",
          answers: { title: "Academic Assignment" },
          hasDocument: false,
          intakeCompleteness: 0,
        },
      ];
      expect(findReusableEmptyProject(existing, "OT-01")?.projectId).toBe("p1");
    });
  });

  describe("isBlankProject", () => {
    it("returns true for null, undefined, or empty project", () => {
      expect(isBlankProject(null)).toBe(true);
      expect(isBlankProject(undefined)).toBe(true);
      expect(isBlankProject({})).toBe(true);
    });

    it("returns true for pristine project with only default word count or provisional fields", () => {
      expect(
        isBlankProject({
          answers: {
            title: "Untitled Project",
            instructions: "provisional",
            word_count: "2000",
          },
          hasDocument: false,
          intakeCompleteness: 0,
        })
      ).toBe(true);
    });

    it("returns false if project has a document", () => {
      expect(isBlankProject({ hasDocument: true })).toBe(false);
    });

    it("returns false if project has actual brief or instructions", () => {
      expect(
        isBlankProject({
          answers: {
            instructions: "Analyze macroeconomic policy shocks",
          },
        })
      ).toBe(false);
    });

    it("returns false if intake completeness is greater than 0.1", () => {
      expect(
        isBlankProject({
          intakeCompleteness: 0.4,
        })
      ).toBe(false);
    });
  });

  describe("deriveHeuristicTitle", () => {
    it("extracts course code and topic from course headers", () => {
      const brief = "POLI3002: Security Analysis in the 21st Century\nWord count: 2500 words\nAPA 7th";
      const title = deriveHeuristicTitle(brief);
      expect(title).toMatch(/POLI3002\s+Security\s+Analysis/i);
    });

    it("extracts from course codes formatted with dashes e.g. CS-7015", () => {
      const brief = "CS 7015 - Quantum Computing Architectures\nAssignment 2: Literature Review";
      const title = deriveHeuristicTitle(brief);
      expect(title).toMatch(/CS7015\s+Quantum\s+Computing/i);
    });

    it("extracts and strips command verbs from prompt questions", () => {
      const brief = "Critically evaluate the impact of algorithmic bias in healthcare diagnostic models.";
      const title = deriveHeuristicTitle(brief);
      expect(title).not.toMatch(/critically evaluate/i);
      expect(title).toMatch(/Algorithmic Bias/i);
      expect(title.split(/\s+/).length).toBeGreaterThanOrEqual(3);
      expect(title.split(/\s+/).length).toBeLessThanOrEqual(8);
    });

    it("extracts from explicit topic prefix e.g. 'Topic:'", () => {
      const brief = "Assignment Brief\nTopic: Macroeconomic Fiscal Policy Under Inflationary Shocks\nDue Date: Oct 15";
      const title = deriveHeuristicTitle(brief);
      expect(title).toMatch(/Macroeconomic Fiscal Policy/i);
    });

    it("falls back gracefully for empty or short text", () => {
      expect(deriveHeuristicTitle("")).toBe("Academic Assignment");
      expect(deriveHeuristicTitle("   \n\n  ")).toBe("Academic Assignment");
    });
  });

  describe("getFormatLabel", () => {
    it("returns correct labels for standard output type IDs", () => {
      expect(getFormatLabel("OT-01")).toBe("Assignment");
      expect(getFormatLabel("OT-10")).toBe("Journal Article");
      expect(getFormatLabel("OT-19")).toBe("Research Proposal");
      expect(getFormatLabel("OT-22")).toBe("Presentation");
      expect(getFormatLabel("OT-06")).toBe("Thesis / Dissertation");
    });

    it("falls back to Project for missing ID or returns unknown ID", () => {
      expect(getFormatLabel(undefined)).toBe("Project");
      expect(getFormatLabel("CUSTOM-99")).toBe("CUSTOM-99");
    });
  });

  describe("getProjectDisplayName", () => {
    it("returns explicit user title when present", () => {
      const p = {
        projectId: "p1",
        outputTypeId: "OT-10",
        answers: { title: "Rta and Rashi in Sanskrit Epistemology" },
      };
      expect(getProjectDisplayName(p)).toBe("Rta and Rashi in Sanskrit Epistemology");
    });

    it("checks working_title and assignment_title when title is missing", () => {
      expect(
        getProjectDisplayName({
          projectId: "p1",
          outputTypeId: "OT-10",
          answers: { working_title: "Working Draft on Quantum Mechanics" },
        })
      ).toBe("Working Draft on Quantum Mechanics");

      expect(
        getProjectDisplayName({
          projectId: "p2",
          outputTypeId: "OT-01",
          answers: { assignment_title: "Ethics in Generative AI Essay" },
        })
      ).toBe("Ethics in Generative AI Essay");
    });

    it("falls back to research topic or question if non-provisional", () => {
      expect(
        getProjectDisplayName({
          projectId: "p1",
          outputTypeId: "OT-19",
          answers: { topic: "CRISPR-Cas9 Gene Editing Efficiency" },
        })
      ).toBe("CRISPR-Cas9 Gene Editing Efficiency");
    });

    it("generates distinct format-aware placeholder when untitled", () => {
      expect(
        getProjectDisplayName({
          projectId: "p-assign",
          outputTypeId: "OT-01",
          answers: {},
        })
      ).toBe("Untitled Assignment");

      expect(
        getProjectDisplayName({
          projectId: "p-pres",
          outputTypeId: "OT-22",
          answers: {},
        })
      ).toBe("Untitled Presentation");
    });

    it("replaces bare format label with distinct format-aware placeholder", () => {
      expect(
        getProjectDisplayName({
          projectId: "p-bare",
          outputTypeId: "OT-01",
          answers: { title: "Assignment" },
        })
      ).toBe("Untitled Assignment");
    });

    it("disambiguates multiple untitled projects of the same format", () => {
      const projects = [
        { projectId: "p-1", outputTypeId: "OT-01", answers: {} },
        { projectId: "p-2", outputTypeId: "OT-01", answers: {} },
        { projectId: "p-3", outputTypeId: "OT-22", answers: {} },
      ];

      expect(getProjectDisplayName(projects[0], projects)).toBe("Untitled Assignment 1");
      expect(getProjectDisplayName(projects[1], projects)).toBe("Untitled Assignment 2");
      // p-3 is the only presentation so it stays Untitled Presentation
      expect(getProjectDisplayName(projects[2], projects)).toBe("Untitled Presentation");
    });
  });

  describe("getProjectHeadingPlaceholder", () => {
    it("returns format-specific heading placeholder", () => {
      expect(getProjectHeadingPlaceholder({ outputTypeId: "OT-01" })).toBe("e.g. Untitled Assignment");
      expect(getProjectHeadingPlaceholder({ outputTypeId: "OT-22" })).toBe("e.g. Untitled Presentation");
      expect(getProjectHeadingPlaceholder({ outputTypeId: "OT-10" })).toBe("e.g. Untitled Journal Article");
    });
  });

  describe("matchesProjectSearch", () => {
    const project = {
      projectId: "proj-crispr",
      outputTypeId: "OT-10",
      answers: {
        title: "Genome Editing in Marine Diatoms",
        research_question: "How does Cas12a improve off-target fidelity?",
        topic: "Marine Biotechnology",
      },
    };

    it("matches query on title", () => {
      expect(matchesProjectSearch(project, "Marine Diatoms")).toBe(true);
      expect(matchesProjectSearch(project, "genome")).toBe(true);
    });

    it("matches query on format label", () => {
      expect(matchesProjectSearch(project, "Journal Article")).toBe(true);
      expect(matchesProjectSearch(project, "journal")).toBe(true);
    });

    it("matches query on research question and topic", () => {
      expect(matchesProjectSearch(project, "Cas12a")).toBe(true);
      expect(matchesProjectSearch(project, "Biotechnology")).toBe(true);
    });

    it("returns false when query does not match anything", () => {
      expect(matchesProjectSearch(project, "Quantum Electrodynamics")).toBe(false);
    });

    it("matches untitled project by its distinct heading placeholder", () => {
      const untitled = {
        projectId: "p-empty",
        outputTypeId: "OT-01",
        answers: {},
      };
      expect(matchesProjectSearch(untitled, "Assignment")).toBe(true);
      expect(matchesProjectSearch(untitled, "Untitled")).toBe(true);
    });
  });

  describe("deduplicateProjectList", () => {
    it("deduplicates identical project titles, keeping the most recent one", () => {
      const projects = [
        { projectId: "p-china-new", answers: { title: "Role of China in Advanced Manufacturing" } },
        { projectId: "p-rasuwa-1", answers: { title: "Rasuwa Flood" } },
        { projectId: "p-rasuwa-2", answers: { title: "Rasuwa Flood" } },
        { projectId: "p-rasuwa-3", answers: { title: "Rasuwa Flood" } },
        { projectId: "p-jasmine", answers: { title: "Jasmine Ojha" } },
        { projectId: "p-kastha-1", answers: { title: "History of Kasthamandap" } },
        { projectId: "p-kastha-2", answers: { title: "History of Kasthamandap" } },
        { projectId: "p-climate", answers: { title: "What Are Causes of Climate Change" } },
        { projectId: "p-china-old1", answers: { title: "Role of China in Advanced Manufacturing" } },
        { projectId: "p-china-old2", answers: { title: "Role of China in Advanced Manufacturing" } },
        { projectId: "p-un", answers: { title: "Is United Nations Successful" } },
      ];

      const deduped = deduplicateProjectList(projects);
      expect(deduped.map((p) => p.projectId)).toEqual([
        "p-china-new",
        "p-rasuwa-1",
        "p-jasmine",
        "p-kastha-1",
        "p-climate",
        "p-un",
      ]);
    });

    it("deduplicates duplicate project IDs", () => {
      const projects = [
        { projectId: "p-1", answers: { title: "Project Alpha" } },
        { projectId: "p-1", answers: { title: "Project Alpha" } },
        { projectId: "p-2", answers: { title: "Project Beta" } },
      ];
      const deduped = deduplicateProjectList(projects);
      expect(deduped).toHaveLength(2);
      expect(deduped.map((p) => p.projectId)).toEqual(["p-1", "p-2"]);
    });

    it("unifies titles with and without trailing ellipsis", () => {
      const projects = [
        { projectId: "p-1", answers: { title: "Role of China in Advanced Manufacturing..." } },
        { projectId: "p-2", answers: { title: "Role of China in Advanced Manufacturing" } },
      ];
      const deduped = deduplicateProjectList(projects);
      expect(deduped).toHaveLength(1);
      expect(deduped[0].projectId).toBe("p-1");
    });

    it("prioritizes pinned project when duplicate title exists", () => {
      const projects = [
        { projectId: "p-unpinned", answers: { title: "Rasuwa Flood" } },
        { projectId: "p-pinned", answers: { title: "Rasuwa Flood" } },
      ];
      const deduped = deduplicateProjectList(projects, undefined, ["p-pinned"]);
      expect(deduped).toHaveLength(1);
      expect(deduped[0].projectId).toBe("p-pinned");
    });

    it("preserves distinct numbered untitled projects", () => {
      const projects = [
        { projectId: "p-u1", outputTypeId: "OT-01", answers: {} },
        { projectId: "p-u2", outputTypeId: "OT-01", answers: {} },
        { projectId: "p-pres", outputTypeId: "OT-22", answers: {} },
      ];
      const deduped = deduplicateProjectList(projects);
      expect(deduped).toHaveLength(3);
      expect(getProjectDisplayName(deduped[0], deduped)).toBe("Untitled Assignment 1");
      expect(getProjectDisplayName(deduped[1], deduped)).toBe("Untitled Assignment 2");
      expect(getProjectDisplayName(deduped[2], deduped)).toBe("Untitled Presentation");
    });

    it("handles empty or single item arrays safely", () => {
      expect(deduplicateProjectList([])).toEqual([]);
      const single = [{ projectId: "p-1", answers: { title: "Single" } }];
      expect(deduplicateProjectList(single)).toEqual(single);
    });
  });
});
