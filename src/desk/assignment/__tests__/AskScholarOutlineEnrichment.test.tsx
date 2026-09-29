// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  generateDynamicAssignmentStructure,
  extractTargetFrameworks,
  isGenericPlaceholderTitle,
  sanitizeOutlineHeadings,
  assignmentStructureToOutlineTree,
  outlineTreeToAssignmentStructure,
  addTargetFramework,
  removeTargetFramework,
  updateTargetFrameworks,
} from "../services/outlineService";
import { DynamicStructurePlanner } from "../components/DynamicStructurePlanner";
import type { AssignmentStructure, AskScholarOutlineResponse } from "../types";

describe("AskScholar Pattern Outline Enrichment", () => {
  describe("1. Target Framework Extraction & Domain Detection", () => {
    it("extracts explicit frameworks mentioned in prompt or brief", () => {
      const frameworks = extractTargetFrameworks(
        "Evaluate strategic capabilities of Netflix",
        "coursework",
        "The submission must apply Porter's Five Forces and VRIO to evaluate competitive advantage."
      );
      expect(frameworks).toContain("Porter's Five Forces & Value Chain Analysis");
      expect(frameworks).toContain("VRIO Framework");
    });

    it("infers domain theoretical models when not explicitly named", () => {
      const econ = extractTargetFrameworks("Does bilateral trade mitigate interstate military friction?", "essay");
      expect(econ).toContain("Liberal Commercial Peace Theory");
      expect(econ).toContain("Realist Strategic Vulnerability");

      const oncology = extractTargetFrameworks("Cellular immunotherapy in refractory lymphoma", "essay");
      expect(oncology).toContain("Adoptive Cellular Transfer (ACT) Mechanics");
      expect(oncology).toContain("Tumor Microenvironment (TME) Immunosuppression");

      const ethics = extractTargetFrameworks("Algorithmic discrimination and governance in credit scoring", "essay");
      expect(ethics).toContain("Rawlsian Distributive Justice & Fairness Parity");
      expect(ethics).toContain("EU AI Act Risk-Tiered Governance Architecture");
    });

    it("populates targetFrameworks on generated AssignmentStructure", () => {
      const structure = generateDynamicAssignmentStructure({
        question: "Role of AI in machine learning",
        assignmentType: "essay",
        academicLevel: "undergraduate",
        targetWordCount: 2000,
      });
      expect(structure.targetFrameworks).toBeDefined();
      expect(structure.targetFrameworks?.length).toBeGreaterThan(0);
      expect(structure.targetFrameworks).toContain("Empirical Risk Minimization (ERM)");
    });
  });

  describe("2. Strict Banning of Generic Placeholders", () => {
    it("identifies generic placeholder titles", () => {
      expect(isGenericPlaceholderTitle("Introduction")).toBe(true);
      expect(isGenericPlaceholderTitle("1.0 Introduction")).toBe(true);
      expect(isGenericPlaceholderTitle("Body Paragraph 1")).toBe(true);
      expect(isGenericPlaceholderTitle("Section 2")).toBe(true);
      expect(isGenericPlaceholderTitle("Main Argument")).toBe(true);
      expect(isGenericPlaceholderTitle("Analysis")).toBe(true);
      expect(isGenericPlaceholderTitle("Discussion")).toBe(true);
      expect(isGenericPlaceholderTitle("Conclusion")).toBe(true);
      expect(isGenericPlaceholderTitle("Overview")).toBe(true);
      expect(isGenericPlaceholderTitle("Summary")).toBe(true);

      // Non-generic titles should not be flagged
      expect(isGenericPlaceholderTitle("Theoretical Foundations of Economic Interdependence")).toBe(false);
      expect(isGenericPlaceholderTitle("Diagnostic Problem Decomposition")).toBe(false);
      expect(isGenericPlaceholderTitle("Antithesis: Counter-Arguments and Dissenting Perspectives")).toBe(false);
    });

    it("sanitizes generic placeholder headings into substantive domain-specific titles", () => {
      const genericHeadings: any[] = [
        {
          id: "heading-1",
          number: 1,
          title: "Introduction",
          targetWordCount: 500,
          subheadings: [
            { id: "sub-1-1", headingId: "heading-1", numberStr: "1.1", title: "Overview", targetWordCount: 250, keyPoints: [] },
            { id: "sub-1-2", headingId: "heading-1", numberStr: "1.2", title: "Background", targetWordCount: 250, keyPoints: [] },
          ],
        },
        {
          id: "heading-2",
          number: 2,
          title: "Body Paragraph 1",
          targetWordCount: 1000,
          subheadings: [
            { id: "sub-2-1", headingId: "heading-2", numberStr: "2.1", title: "Analysis", targetWordCount: 500, keyPoints: [] },
            { id: "sub-2-2", headingId: "heading-2", numberStr: "2.2", title: "Discussion", targetWordCount: 500, keyPoints: [] },
          ],
        },
        {
          id: "heading-3",
          number: 3,
          title: "Conclusion",
          targetWordCount: 500,
          subheadings: [
            { id: "sub-3-1", headingId: "heading-3", numberStr: "3.1", title: "Summary", targetWordCount: 500, keyPoints: [] },
          ],
        },
      ];

      const sanitized = sanitizeOutlineHeadings(genericHeadings, "Impact of Monetary Policy on Inflation Dynamics", "essay");
      expect(sanitized[0].title).not.toMatch(/^Introduction$/i);
      expect(sanitized[0].title).toContain("Monetary Policy");
      expect(sanitized[1].title).not.toMatch(/^Body Paragraph 1$/i);
      expect(sanitized[2].title).not.toMatch(/^Conclusion$/i);
      expect(sanitized[0].subheadings[0].title).not.toMatch(/^Overview$/i);
    });
  });

  describe("3. Workspace Adaptations: Essay vs Coursework", () => {
    it("generates dialectical argument progression for Essay workspace", () => {
      const structure = generateDynamicAssignmentStructure({
        question: "Does Globalization Reduce State Sovereignty?",
        assignmentType: "essay",
        academicLevel: "undergraduate",
        targetWordCount: 2000,
      });

      expect(structure.headings).toHaveLength(3);
      // H1: Theoretical & Conceptual Foundations
      expect(structure.headings[0].title).toContain("Foundations");
      expect(structure.headings[0].subheadings[0].title).toContain("Conceptual Parameters");

      // H2: Antithesis & Contested Evidence
      expect(structure.headings[1].title).toContain("Substantive Evidence");
      expect(structure.headings[1].subheadings[0].title).toContain("Antithesis");

      // H3: Dialectical Synthesis & Resolution
      expect(structure.headings[2].title).toContain("Critical Counter-Perspectives");
      expect(structure.headings[2].subheadings[0].title).toContain("Critical Refutation");
      expect(structure.headings[2].subheadings[1].title).toContain("Scholarly Synthesis");

      // Structure depth: each subheading has concrete H3 key points
      expect(structure.headings[0].subheadings[0].keyPoints.length).toBeGreaterThanOrEqual(3);
      expect(structure.headings[1].subheadings[0].keyPoints.length).toBeGreaterThanOrEqual(3);
    });

    it("generates problem decomposition and applied intervention structure for Coursework workspace", () => {
      const structure = generateDynamicAssignmentStructure({
        question: "Strategic Turnaround Analysis for Marks and Spencer",
        assignmentType: "coursework",
        academicLevel: "undergraduate",
        targetWordCount: 2500,
      });

      expect(structure.headings).toHaveLength(3);
      // H1: Problem Formulation & Learning Objectives
      expect(structure.headings[0].title).toContain("Problem Formulation");
      expect(structure.headings[0].subheadings[0].title).toContain("Diagnostic Problem Decomposition");
      expect(structure.headings[0].subheadings[1].title).toContain("Applied Analytical Framework");

      // H2: Applied Empirical Investigation & Diagnostics
      expect(structure.headings[1].title).toContain("Applied Empirical Investigation");
      expect(structure.headings[1].subheadings[0].title).toContain("In-Depth Diagnostic Model Application");
      expect(structure.headings[1].subheadings[1].title).toContain("Critical Evaluation of Institutional Constraints");

      // H3: Strategic Recommendations & Implementation Roadmap
      expect(structure.headings[2].title).toContain("Strategic Interventions");
      expect(structure.headings[2].subheadings[0].title).toContain("Prioritized Evidence-Based Recommendations");
      expect(structure.headings[2].subheadings[1].title).toContain("Implementation Roadmap");

      // Verifies target frameworks present for Coursework
      expect(structure.targetFrameworks).toBeDefined();
      expect(structure.targetFrameworks).toContain("Porter's Five Forces & Value Chain Analysis");
    });
  });

  describe("4. AskScholar Tree Schema Bidirectional Conversion", () => {
    it("converts AssignmentStructure to AskScholar structured outline tree", () => {
      const structure = generateDynamicAssignmentStructure({
        question: "Role of AI in machine learning",
        assignmentType: "essay",
        targetWordCount: 2000,
      });

      const tree = assignmentStructureToOutlineTree(structure);
      expect(tree.thesis_statement).toBe(structure.thesisStatement);
      expect(tree.target_frameworks).toEqual(structure.targetFrameworks);
      expect(tree.sections).toHaveLength(3);
      expect(tree.sections[0].level).toBe("h1");
      expect(tree.sections[0].children?.[0].level).toBe("h2");
      expect(tree.sections[0].children?.[0].children?.[0].level).toBe("h3");
    });

    it("converts AskScholar tree response back to internal AssignmentStructure", () => {
      const treeResponse: AskScholarOutlineResponse = {
        thesis_statement: "Custom academic thesis formulation",
        target_frameworks: ["Framework Alpha", "Model Beta"],
        targetWordCount: 2400,
        writingTone: "analytical",
        sections: [
          {
            level: "h1",
            title: "1.0 Foundational Inquiry",
            guidance: "Foundational notes",
            targetWordCount: 800,
            children: [
              {
                level: "h2",
                title: "1.1 Core Conceptual Framing",
                guidance: "Guidance for 1.1",
                targetWordCount: 400,
                children: [
                  { level: "h3", title: "Empirical observation A" },
                  { level: "h3", title: "Causal mechanism B" },
                  { level: "h3", title: "Theoretical boundary C" },
                ],
              },
              {
                level: "h2",
                title: "1.2 Theoretical Model Application",
                guidance: "Guidance for 1.2",
                targetWordCount: 400,
                children: [
                  { level: "h3", title: "Model parameter X" },
                  { level: "h3", title: "Equilibrium condition Y" },
                ],
              },
            ],
          },
          {
            level: "h1",
            title: "2.0 Empirical Diagnostics",
            guidance: "Diagnostics notes",
            targetWordCount: 1600,
            children: [
              {
                level: "h2",
                title: "2.1 Field Evidence",
                guidance: "Guidance 2.1",
                targetWordCount: 800,
                children: [{ level: "h3", title: "Data trend 1" }],
              },
              {
                level: "h2",
                title: "2.2 Comparative Variance",
                guidance: "Guidance 2.2",
                targetWordCount: 800,
                children: [{ level: "h3", title: "Variance metric 2" }],
              },
            ],
          },
        ],
      };

      const converted = outlineTreeToAssignmentStructure(treeResponse, 2400);
      expect(converted.headings).toHaveLength(2);
      expect(converted.thesisStatement).toBe("Custom academic thesis formulation");
      expect(converted.targetFrameworks).toEqual(["Framework Alpha", "Model Beta"]);
      expect(converted.headings[0].subheadings[0].keyPoints).toContain("Empirical observation A");
      expect(converted.totalAllocated).toBe(2400);
    });
  });

  describe("5. Target Frameworks Mutation Helpers", () => {
    it("allows adding, removing, and updating target frameworks", () => {
      let structure = generateDynamicAssignmentStructure({
        question: "Role of AI in machine learning",
        targetWordCount: 2000,
      });

      // Add a framework
      structure = addTargetFramework(structure, "Neuro-Symbolic Reasoning Architectures");
      expect(structure.targetFrameworks).toContain("Neuro-Symbolic Reasoning Architectures");

      // Does not add duplicate
      const lenBefore = structure.targetFrameworks?.length || 0;
      structure = addTargetFramework(structure, "Neuro-Symbolic Reasoning Architectures");
      expect(structure.targetFrameworks?.length).toBe(lenBefore);

      // Remove a framework
      structure = removeTargetFramework(structure, 0);
      expect(structure.targetFrameworks?.length).toBe(lenBefore - 1);

      // Set batch frameworks
      structure = updateTargetFrameworks(structure, ["Model X", "Model Y"]);
      expect(structure.targetFrameworks).toEqual(["Model X", "Model Y"]);
    });
  });

  describe("6. DynamicStructurePlanner UI Integration", () => {
    it("renders Target Theoretical Frameworks & Models chip list and allows adding a framework", () => {
      const sampleStructure: AssignmentStructure = {
        version: 1,
        isConfirmed: false,
        targetWordCount: 2000,
        totalAllocated: 2000,
        thesisStatement: "Test thesis statement",
        targetFrameworks: ["Resource-Based View (RBV)", "Porter's Five Forces"],
        headings: [
          {
            id: "heading-1",
            number: 1,
            title: "Foundations of Strategy",
            targetWordCount: 2000,
            subheadings: [
              {
                id: "sub-1-1",
                headingId: "heading-1",
                numberStr: "1.1",
                title: "Internal Capabilities",
                targetWordCount: 2000,
                currentWordCount: 0,
                guidance: "Test guidance",
                keyPoints: ["VRIO analysis", "Core competencies", "Dynamic capabilities"],
                researchStatus: "not_researched",
                sourcesCount: 0,
                boundSourceIds: [],
                draftContent: "",
                draftStatus: "not_started",
              },
            ],
          },
        ],
      };

      const handleChange = vi.fn();

      render(
        <DynamicStructurePlanner
          structure={sampleStructure}
          targetWordCount={2000}
          onChange={handleChange}
        />
      );

      // Verify framework chips are visible
      expect(screen.getByText("Target Theoretical Frameworks & Models")).toBeInTheDocument();
      expect(screen.getByText("Resource-Based View (RBV)")).toBeInTheDocument();
      expect(screen.getByText("Porter's Five Forces")).toBeInTheDocument();
      expect(screen.getByText("2 active")).toBeInTheDocument();

      // Add a framework via the input
      const input = screen.getByLabelText("Add theoretical framework");
      fireEvent.change(input, { target: { value: "Stakeholder Salience Theory" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

      expect(handleChange).toHaveBeenCalled();
      const updatedStructure = handleChange.mock.calls[0][0];
      expect(updatedStructure.targetFrameworks).toContain("Stakeholder Salience Theory");
    });
  });
});
