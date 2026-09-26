import { describe, it, expect } from "vitest";
import {
  isDuplicateProjectTitle,
  getNextUntitledProjectTitle,
  findReusableEmptyProject,
  getProjectTitle,
  isBlankProject,
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
});
