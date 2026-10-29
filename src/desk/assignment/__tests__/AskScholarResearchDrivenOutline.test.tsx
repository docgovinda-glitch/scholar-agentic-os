// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { conductAskScholarResearchForOutline } from "../services/scholarlyDiscoveryService";
import {
  generateDynamicAssignmentStructure,
  generateAdaptiveDefaultOutline,
} from "../services/outlineService";
import { DynamicStructurePlanner } from "../components/DynamicStructurePlanner";

describe("Ask Scholar Research-Driven Outline Architecture", () => {
  describe("1. Assignment Inquiry Deconstruction & Inquiry Typing", () => {
    it("deconstructs a comparative analytical question into research components and sub-questions", () => {
      const result = conductAskScholarResearchForOutline({
        question: "Compare Structural Realism and Liberal Institutionalism in explaining peace in East Asia.",
        academicLevel: "undergraduate",
        assignmentType: "essay",
        targetWordCount: 2000,
      });

      expect(result.inquiryType).toBe("comparative_analysis");
      expect(result.centralProblem).toContain("comparative");
      expect(result.subQuestions.length).toBeGreaterThanOrEqual(3);
      expect(result.subQuestions[0]).toMatch(/ontological|assumptions|mechanisms|Structural Realism/i);
      expect(result.analyticalComponents.length).toBeGreaterThanOrEqual(3);
      expect(result.coreDebates.length).toBeGreaterThanOrEqual(1);
    });

    it("identifies causal inquiry for event explanations", () => {
      const result = conductAskScholarResearchForOutline({
        question: "Why did the 2015 border blockade occur between Nepal and India, and what factors led to diplomatic rupture?",
        academicLevel: "undergraduate",
        assignmentType: "essay",
        targetWordCount: 2500,
      });

      expect(result.inquiryType).toBe("causal_inquiry");
      expect(result.centralProblem).toContain("causal mechanisms");
      expect(result.subQuestions.length).toBeGreaterThanOrEqual(3);
      expect(result.subQuestions[0]).toMatch(/factors precipitated|structural|mechanisms/i);
    });

    it("identifies policy diagnostic structure for coursework turnaround briefs", () => {
      const result = conductAskScholarResearchForOutline({
        question: "Strategic Turnaround Analysis for Marks and Spencer",
        briefText: "1. Diagnose root causes. 2. Apply Value Chain framework. 3. Formulate SMART recommendations.",
        academicLevel: "undergraduate",
        assignmentType: "coursework",
        targetWordCount: 3000,
      });

      expect(result.inquiryType).toBe("policy_diagnostic");
      expect(result.centralProblem).toContain("Diagnosing");
      expect(result.subQuestions.length).toBeGreaterThanOrEqual(3);
      expect(result.subQuestions[0]).toMatch(/diagnostic problem|baseline|root-cause/i);
    });
  });

  describe("2. Ask Scholar Literature Grounding & Recency Balance", () => {
    it("never invents literature: the outline planner proposes no references of its own", () => {
      // Rewritten 2026-10-29: the planner used to return catalog/synthesized
      // "sources" (most DOIs did not resolve). References now come only from
      // live discovery or the user's vault.
      const result = conductAskScholarResearchForOutline({
        question: "Does Economic Interdependence Reduce Interstate Conflict?",
        academicLevel: "undergraduate",
        assignmentType: "essay",
        targetWordCount: 2000,
      });

      expect(result.sources).toEqual([]);
      expect(result.curatedDiscoveredSources).toEqual([]);
      expect(result.qualityControlChecklist.literatureGrounded).toBe(false);
    });
  });

  describe("3. Explicit Assignment-Question Mapping Matrix", () => {
    it("maps every section to an assignment question, analytical objective, and relevant sources", () => {
      const result = conductAskScholarResearchForOutline({
        question: "Critically evaluate whether the EU AI Act effectively mitigates algorithmic discrimination in employment.",
        academicLevel: "postgraduate",
        assignmentType: "analytical_essay",
        targetWordCount: 3000,
      });

      expect(result.questionMappingMatrix.length).toBeGreaterThanOrEqual(3);

      result.questionMappingMatrix.forEach((mapping, idx) => {
        expect(mapping.assignmentQuestion).toBeDefined();
        expect(mapping.assignmentQuestion.length).toBeGreaterThan(10);
        expect(mapping.analyticalObjective).toBeDefined();
        expect(mapping.analyticalObjective.length).toBeGreaterThan(15);
        expect(mapping.researchNeeded).toBeDefined();
        expect(mapping.keyArguments.length).toBeGreaterThanOrEqual(2);
        // No pre-selected references (see the "never invents literature" test).
        expect(mapping.relevantSources).toEqual([]);
        expect(mapping.proposedSectionTitle).toBeDefined();
        expect(mapping.proposedSectionNumber).toBe(idx + 1);
      });
    });
  });

  describe("4. Research-Aware Outline Blueprint Generation", () => {
    it("generates an AssignmentStructure where all headings and subheadings contain complete research blueprint fields", () => {
      const structure = generateDynamicAssignmentStructure({
        question: "Does Globalization Reduce State Sovereignty?",
        academicLevel: "undergraduate",
        assignmentType: "essay",
        targetWordCount: 2000,
      });

      // Overview blueprint
      expect(structure.researchBlueprintOverview).toBeDefined();
      expect(structure.researchBlueprintOverview?.centralProblem).toBeDefined();
      expect(structure.researchBlueprintOverview?.inquiryType).toBe("dialectical_argument");
      expect(structure.questionMappingMatrix).toBeDefined();
      expect(structure.questionMappingMatrix?.length).toBeGreaterThanOrEqual(3);

      // Quality control checklist verified
      const qc = structure.researchBlueprintOverview?.qualityControlChecklist;
      expect(qc?.allQuestionsCovered).toBe(true);
      // The planner no longer claims literature grounding it doesn't have.
      expect(qc?.literatureGrounded).toBe(false);
      expect(qc?.freeOfGenericFluff).toBe(true);
      expect(qc?.recencyBalanced).toBe(false);

      // Check Main Headings
      for (const heading of structure.headings) {
        expect(heading.purpose).toBeDefined();
        expect(heading.assignmentQuestionAddressed).toBeDefined();
        expect(heading.analyticalObjective).toBeDefined();
        expect(heading.keyTheories?.length).toBeGreaterThanOrEqual(1);
        expect(heading.keyArguments?.length).toBeGreaterThanOrEqual(1);
        expect(heading.evidenceRequired).toBeDefined();
        expect(heading.counterarguments?.length).toBeGreaterThanOrEqual(1);
        expect(heading.expectedContribution).toBeDefined();
        expect(heading.scholarlySources ?? []).toEqual([]); // no pre-selected references

        // Check Subheadings
        for (const sub of heading.subheadings) {
          expect(sub.purpose).toBeDefined();
          expect(sub.assignmentQuestionAddressed).toBeDefined();
          expect(sub.keyTheories?.length).toBeGreaterThanOrEqual(1);
          expect(sub.keyArguments?.length).toBeGreaterThanOrEqual(1);
          // Without discovered sources nothing is bound, and the section
          // honestly reports that it has not been researched yet.
          expect(sub.scholarlySources ?? []).toEqual([]);
          expect(sub.boundSourceIds ?? []).toEqual([]);
          expect(sub.researchStatus).toBe("not_researched");
        }
      }
    });

    it("organizes outline around the intellectual problem rather than generic academic templates", () => {
      const structure = generateDynamicAssignmentStructure({
        question: "Evaluate superconducting transmons vs trapped-ion physical architectures in NISQ quantum computing.",
        academicLevel: "postgraduate",
        assignmentType: "coursework",
        targetWordCount: 2500,
      });

      // No generic template titles like "Introduction", "Body", "Analysis", "Conclusion"
      for (const h of structure.headings) {
        expect(h.title.toLowerCase()).not.toBe("introduction");
        expect(h.title.toLowerCase()).not.toBe("literature review");
        expect(h.title.toLowerCase()).not.toBe("methodology");
        expect(h.title.toLowerCase()).not.toBe("analysis");
        expect(h.title.toLowerCase()).not.toBe("conclusion");
      }
    });
  });

  describe("5. DynamicStructurePlanner UI: Subtle Research Basis Affordances", () => {
    it("renders the outline without internal architecture boxes and exposes subtle research basis affordances", () => {
      const structure = generateDynamicAssignmentStructure({
        question: "Does Globalization Reduce State Sovereignty?",
        academicLevel: "undergraduate",
        assignmentType: "essay",
        targetWordCount: 2000,
      });

      render(
        <DynamicStructurePlanner
          structure={structure}
          targetWordCount={2000}
          onStructureChange={vi.fn()}
        />
      );

      // Verify internal architecture banner is NOT present in the user-facing UI
      expect(screen.queryByText(/Ask Scholar Research Architecture & Question Mapping/i)).toBeNull();
      expect(screen.queryByText(/Assignment Question → Analytical Objective → Section Mapping/i)).toBeNull();

      // Check that subtle "Research basis" buttons exist on headings
      const researchBasisButtons = screen.getAllByRole("button", { name: /Research basis for section/i });
      expect(researchBasisButtons.length).toBeGreaterThanOrEqual(1);

      // Click "Research basis" toggle on section 1
      fireEvent.click(researchBasisButtons[0]);

      // Should display section 1 subtle research basis drawer with analytical purpose and supporting literature
      expect(screen.getByText(/Section 1 Research Basis/i)).toBeDefined();
      expect(screen.getByText("Purpose & Objective")).toBeDefined();
      expect(screen.getByText("Empirical Evidence Required")).toBeDefined();
      // No pre-selected references, so no "Supporting Scholarly Sources" list.
      expect(screen.queryByText(/Supporting Scholarly Sources/i)).toBeNull();
    });
  });
});
