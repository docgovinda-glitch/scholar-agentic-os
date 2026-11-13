// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { planBriefInquiries } from "../../../domain/assignment/briefInquiryPlan";
import {
  generateDynamicAssignmentStructure,
  generateAdaptiveDefaultOutline,
} from "../services/outlineService";
import { DynamicStructurePlanner } from "../components/DynamicStructurePlanner";

describe("Ask Scholar Research-Driven Outline Architecture", () => {
  describe("1-3. Brief-grounded inquiry plan (no catalogs, no theory tables)", () => {
    it("types the inquiry from the brief's own command words", () => {
      expect(planBriefInquiries({ question: "Compare Structural Realism and Liberal Institutionalism in explaining peace in East Asia." }).inquiryType).toBe("comparative_analysis");
      expect(planBriefInquiries({ question: "Why did the 2015 border blockade occur, and what factors led to diplomatic rupture?" }).inquiryType).toBe("causal_inquiry");
      expect(planBriefInquiries({ question: "Strategic Turnaround Analysis", assignmentType: "coursework" }).inquiryType).toBe("policy_diagnostic");
    });

    it("takes sub-questions from the brief and invents no theories, debates or references", () => {
      const brief = [
        "Assessment Brief",
        "Question 1: Explain how central banks set interest rates. [20 marks]",
        "Question 2: Evaluate the effect of quantitative easing on inflation. [30 marks]",
        "Question 3: Recommend a policy response to a supply shock. [50 marks]",
      ].join("\n");
      const result = planBriefInquiries({ question: "Monetary policy report", briefText: brief, assignmentType: "report" });
      expect(result.subQuestions.length).toBe(3);
      expect(result.subQuestions.join(" ")).toMatch(/interest rates/i);
      expect(result.coreDebates).toEqual([]);
      expect(result.sources).toEqual([]);
      expect(result.qualityControlChecklist.literatureGrounded).toBe(false);
      result.questionMappingMatrix.forEach((m, idx) => {
        expect(m.relevantSources).toEqual([]);
        expect(m.proposedSectionNumber).toBe(idx + 1);
      });
      // No subject words that are not in the brief (e.g. an IR theory table).
      expect(JSON.stringify(result)).not.toMatch(/Realism|Institutionalism|Constructivism/);
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
      // One mapping per question the brief actually asks (here: one).
      expect(structure.questionMappingMatrix?.length).toBeGreaterThanOrEqual(1);

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
        // Frameworks come only from the AI or the student, never a lookup table.
        expect(Array.isArray(heading.keyTheories)).toBe(true);
        expect(heading.keyArguments?.length).toBeGreaterThanOrEqual(1);
        expect(heading.evidenceRequired).toBeDefined();
        expect(heading.counterarguments?.length).toBeGreaterThanOrEqual(1);
        expect(heading.expectedContribution).toBeDefined();
        expect(heading.scholarlySources ?? []).toEqual([]); // no pre-selected references

        // Check Subheadings
        for (const sub of heading.subheadings) {
          expect(sub.purpose).toBeDefined();
          expect(sub.assignmentQuestionAddressed).toBeDefined();
          expect(Array.isArray(sub.keyTheories ?? [])).toBe(true);
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
