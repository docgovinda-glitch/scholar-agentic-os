import { describe, it, expect } from "vitest";
import {
  deriveHeuristicTitle,
  deriveSemanticAcademicTitle,
  autoUpdateProjectTitleIfUntitled,
} from "../project/assignment";

describe("Semantic Academic Auto-Naming", () => {
  describe("deriveHeuristicTitle", () => {
    it("extracts course code and topic from course headers", () => {
      const brief = `POLI3002: Security Analysis in the 21st Century\nWord count: 2500 words\nAPA 7th`;
      const title = deriveHeuristicTitle(brief);
      expect(title).toMatch(/POLI3002\s+Security\s+Analysis/i);
    });

    it("extracts from course codes formatted with dashes e.g. CS-7015", () => {
      const brief = `CS 7015 - Quantum Computing Architectures\nAssignment 2: Literature Review`;
      const title = deriveHeuristicTitle(brief);
      expect(title).toMatch(/CS7015\s+Quantum\s+Computing/i);
    });

    it("extracts and strips command verbs from prompt questions", () => {
      const brief = `Critically evaluate the impact of algorithmic bias in healthcare diagnostic models.`;
      const title = deriveHeuristicTitle(brief);
      expect(title).not.toMatch(/critically evaluate/i);
      expect(title).toMatch(/Algorithmic Bias/i);
      expect(title.split(/\s+/).length).toBeGreaterThanOrEqual(3);
      expect(title.split(/\s+/).length).toBeLessThanOrEqual(8);
    });

    it("extracts from explicit topic prefix e.g. 'Topic:'", () => {
      const brief = `Assignment Brief\nTopic: Macroeconomic Fiscal Policy Under Inflationary Shocks\nDue Date: Oct 15`;
      const title = deriveHeuristicTitle(brief);
      expect(title).toMatch(/Macroeconomic Fiscal Policy/i);
    });

    it("falls back gracefully for empty or short text", () => {
      expect(deriveHeuristicTitle("")).toBe("Academic Assignment");
      expect(deriveHeuristicTitle("   \n\n  ")).toBe("Academic Assignment");
    });
  });

  describe("deriveSemanticAcademicTitle", () => {
    it("derives academic topic title from brief", async () => {
      const brief = `POLI3002: Contemporary Nuclear Deterrence and Strategic Stability\nStudent ID: 12345`;
      const title = await deriveSemanticAcademicTitle(brief);
      expect(title).toMatch(/Nuclear Deterrence/i);
      expect(deriveHeuristicTitle(brief)).toMatch(/POLI3002/i);
    });
  });

  describe("autoUpdateProjectTitleIfUntitled", () => {
    it("updates project answers and title if current title is 'Untitled Project'", async () => {
      const mockProject = {
        projectId: "proj-123",
        title: "Untitled Project",
        answers: { title: "Untitled Project" },
      };

      const result = await autoUpdateProjectTitleIfUntitled(
        mockProject,
        "Quantum Computing Cryptographic Architectures"
      );

      expect(result).toBe("Quantum Computing Cryptographic Architectures");
      expect(mockProject.answers.title).toBe("Quantum Computing Cryptographic Architectures");
      expect(mockProject.answers.assignment_title).toBe("Quantum Computing Cryptographic Architectures");
      expect(mockProject.title).toBe("Quantum Computing Cryptographic Architectures");
    });

    it("updates project if title is 'Academic Assignment' or 'Untitled Project 1'", async () => {
      const mockProject = {
        projectId: "proj-456",
        title: "Untitled Project 1",
        answers: { title: "Untitled Project 1" },
      };

      const result = await autoUpdateProjectTitleIfUntitled(
        mockProject,
        "Algorithmic Bias in Healthcare"
      );

      expect(result).toBe("Algorithmic Bias in Healthcare");
      expect(mockProject.answers.title).toBe("Algorithmic Bias in Healthcare");
    });

    it("NEVER overwrites a custom user-defined title", async () => {
      const mockProject = {
        projectId: "proj-789",
        title: "My Custom Empirical Investigation",
        answers: { title: "My Custom Empirical Investigation" },
      };

      const result = await autoUpdateProjectTitleIfUntitled(
        mockProject,
        "Quantum Computing Cryptographic Architectures"
      );

      expect(result).toBe("My Custom Empirical Investigation");
      expect(mockProject.answers.title).toBe("My Custom Empirical Investigation");
      expect(mockProject.title).toBe("My Custom Empirical Investigation");
    });
  });
});
