// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getProject = vi.fn();
const getDocument = vi.fn();
const getRubric = vi.fn();
const getOutputTypeSpec = vi.fn();
const saveIntakeAnswers = vi.fn();
const getAiAccessStatus = vi.fn();
const getProfile = vi.fn();
const authedFetch = vi.fn();
const authedJsonFetch = vi.fn();

vi.mock("../../api", () => {
  class UnauthenticatedError extends Error {
    constructor(msg?: string) {
      super(msg || "Unauthenticated");
      this.name = "UnauthenticatedError";
    }
  }
  return {
    getProject: (...args: any[]) => getProject(...args),
    getDocument: (...args: any[]) => getDocument(...args),
    getRubric: (...args: any[]) => getRubric(...args),
    getOutputTypeSpec: (...args: any[]) => getOutputTypeSpec(...args),
    saveIntakeAnswers: (...args: any[]) => saveIntakeAnswers(...args),
    authedFetch: (...args: any[]) => authedFetch(...args),
    authedJsonFetch: (...args: any[]) => authedJsonFetch(...args),
    isEphemeralProject: (id: string) => typeof id === "string" && (id.startsWith("draft-") || id.startsWith("ephemeral-")),
    commitProjectToDatabase: vi.fn().mockImplementation(async (id: string) => ({ projectId: id, answers: {} })),
    UnauthenticatedError,
  };
});

vi.mock("../../../services/projectService", () => ({
  getProject: (...args: any[]) => getProject(...args),
  getDocument: (...args: any[]) => getDocument(...args),
  getRubric: (...args: any[]) => getRubric(...args),
  getOutputTypeSpec: (...args: any[]) => getOutputTypeSpec(...args),
  saveIntakeAnswers: (...args: any[]) => saveIntakeAnswers(...args),
}));

vi.mock("../../../services/aiAccessService", () => ({
  getAiAccessStatus: (...args: any[]) => getAiAccessStatus(...args),
}));

vi.mock("../../../services/profileService", () => ({
  getProfile: (...args: any[]) => getProfile(...args),
}));

vi.mock("../../../services/vault/cloudDriveService", () => ({
  getConnectedCloudDrives: vi.fn().mockResolvedValue([]),
}));

const { default: AssignmentWorkspace } = await import("../AssignmentWorkspace");

import {
  extractBriefInquiriesAndConcepts,
  buildBriefSpecificSpecs,
  adjustHeadingWordCount,
  autoBalanceStructure,
} from "../services/outlineService";

beforeEach(() => {
  window.matchMedia =
    window.matchMedia ||
    function () {
      return {
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
      };
    };

  getDocument.mockResolvedValue(null);
  getRubric.mockResolvedValue(null);
  getOutputTypeSpec.mockResolvedValue({ id: "OT-01", name: "Coursework" });
  saveIntakeAnswers.mockResolvedValue({ success: true });
  authedJsonFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  authedFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  getAiAccessStatus.mockResolvedValue({
    connections: [],
    entitlement: { status: "none", active: false },
    quota: null,
    creditBalance: null,
  });
  getProfile.mockResolvedValue({
    success: true,
    profile: { userType: "student", educationLevel: "undergraduate" },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Phase 1: Dynamic Target Word Count & Brief-Specific Outline Generation", () => {
  describe("1. outlineService: Brief-Specific Extraction and Tailored Generation", () => {
    it("extracts explicit inquiry directives, acronyms, and questions ending in ? from brief text", () => {
      const briefText = `
        Coursework Brief:
        Critically evaluate the implementation of the EU Carbon Border Adjustment Mechanism (CBAM) under WTO law.
        1. How does CBAM comply with GATT Article III and Article XX?
        2. Assess the risk of retaliatory tariffs by trade partners such as China and the US.
        3. Formulate strategic policy recommendations for global decarbonisation.
      `;
      const question = "Critically evaluate EU CBAM under WTO law";

      const extracted = extractBriefInquiriesAndConcepts(question, briefText);

      expect(extracted.subQuestions.length + extracted.extractedTasks.length).toBeGreaterThanOrEqual(2);
      expect(extracted.keyConcepts).toContain("CBAM");
      expect(extracted.keyConcepts).toContain("GATT");
      expect(extracted.keyConcepts).toContain("WTO");

      const specs = buildBriefSpecificSpecs(question, briefText, "coursework", ["GATT Article XX"]);
      expect(specs.length).toBeGreaterThanOrEqual(3);

      // Verify headings incorporate brief concepts rather than generic placeholders
      const joinedTitles = specs.map((s) => s.title).join(" ");
      expect(joinedTitles).toMatch(/CBAM|GATT|Carbon Border/i);
    });

    it("adjustHeadingWordCount proportionally adjusts subheadings when heading words change", () => {
      const structure = {
        version: 1,
        totalAllocated: 2000,
        headings: [
          {
            id: "h1",
            number: 1,
            title: "Analysis of CBAM Implementation",
            targetWordCount: 800,
            subheadings: [
              {
                id: "s1",
                numberStr: "1.1",
                title: "Regulatory Framework",
                targetWordCount: 400,
                keyPoints: [],
              },
              {
                id: "s2",
                numberStr: "1.2",
                title: "WTO Consistency",
                targetWordCount: 400,
                keyPoints: [],
              },
            ],
          },
          {
            id: "h2",
            number: 2,
            title: "Conclusion & Policy Implications",
            targetWordCount: 1200,
            subheadings: [
              {
                id: "s3",
                numberStr: "2.1",
                title: "Strategic Recommendations",
                targetWordCount: 1200,
                keyPoints: [],
              },
            ],
          },
        ],
      };

      // Adjust h1 by +200 words (delta object)
      const adjusted = adjustHeadingWordCount(structure, "h1", { delta: 200 });
      const h1 = adjusted.headings.find((h) => h.id === "h1")!;
      expect(h1.targetWordCount).toBe(1000);
      expect(h1.subheadings[0].targetWordCount).toBe(500);
      expect(h1.subheadings[1].targetWordCount).toBe(500);
      expect(adjusted.totalAllocated).toBe(2200);

      // Auto balance back to 2000
      const balanced = autoBalanceStructure(adjusted, 2000);
      expect(balanced.totalAllocated).toBe(2000);
    });
  });

  describe("2. UI/UX: Dynamic Target Word Count Stepper and Downstream Persistence", () => {
    it("renders stepper controls allowing increasing/decreasing target word count", async () => {
      getProject.mockResolvedValue({
        projectId: "proj-dynamic-step",
        outputTypeId: "OT-01",
        title: "Academic Assignment",
        hasDocument: false,
        answers: {
          assignment_question: "Assess EU CBAM compatibility with WTO jurisprudence",
          word_count: 2500,
          target_word_count: 2500,
          citation_style: "apa7",
          academic_level: "undergraduate",
          assignment_type: "coursework",
        },
        gates: [],
      });

      render(<AssignmentWorkspace projectId="proj-dynamic-step" initialStage="understand" />);

      expect(await screen.findByText(/Phase 1: Understand the Assignment Brief/i)).toBeInTheDocument();

      const wordCountInput = screen.getByRole("spinbutton", { name: /^Target Word Count$/i }) as HTMLInputElement;
      expect(wordCountInput).toBeInTheDocument();
      expect(wordCountInput.value).toBe("2500");

      // Click stepper "+" to increase by 250
      const plusBtn = screen.getByRole("button", { name: /Increase target word count/i });
      fireEvent.click(plusBtn);

      await waitFor(() => {
        expect(wordCountInput.value).toBe("2750");
      });

      // Click stepper "-" to decrease by 250
      const minusBtn = screen.getByRole("button", { name: /Decrease target word count/i });
      fireEvent.click(minusBtn);

      await waitFor(() => {
        expect(wordCountInput.value).toBe("2500");
      });

      // Direct numeric input change to 3200
      fireEvent.change(wordCountInput, { target: { value: "3200" } });
      await waitFor(() => {
        expect(wordCountInput.value).toBe("3200");
      });
    });
  });

  describe("3. Dynamic Outline Generation & Bottom Button Renaming", () => {
    it("displays 'Save & Build' trigger and renames bottom outline approval button to 'Proceed'", async () => {
      getProject.mockResolvedValue({
        projectId: "proj-dynamic-proceed",
        outputTypeId: "OT-01",
        title: "Academic Assignment",
        hasDocument: false,
        answers: {
          assignment_question: "Examine CBAM compliance with WTO jurisprudence",
          word_count: 3000,
          target_word_count: 3000,
          citation_style: "apa7",
          academic_level: "undergraduate",
          assignment_type: "coursework",
        },
        gates: [],
      });

      render(<AssignmentWorkspace projectId="proj-dynamic-proceed" initialStage="understand" />);

      expect(await screen.findByText(/Phase 1: Understand the Assignment Brief/i)).toBeInTheDocument();

      // Verify Step 1 primary button is "Save & Build"
      const buildButton = screen.getByRole("button", {
        name: /Save & Build/i,
      });
      expect(buildButton).toBeInTheDocument();

      // Click "Save & Build" to generate tailored outline
      fireEvent.click(buildButton);

      // Outline Planner Step should appear with generated sections
      await waitFor(() => {
        expect(screen.getByText(/Target Word Count & Section Allocations/i)).toBeInTheDocument();
      });

      // Verify the bottom button is renamed to "Proceed"
      const proceedButton = screen.getByRole("button", {
        name: /^Proceed/i,
      });
      expect(proceedButton).toBeInTheDocument();
      expect(proceedButton).toHaveTextContent("Proceed");
    });
  });

  describe("4. Outline Tree Customization & Word Allocation (CRUD)", () => {
    it("allows full inline editing, adding/deleting subheadings, and section word adjustments", async () => {
      getProject.mockResolvedValue({
        projectId: "proj-dynamic-crud",
        outputTypeId: "OT-01",
        title: "Academic Assignment",
        hasDocument: false,
        answers: {
          assignment_question: "Economic interdependence and supply chains",
          word_count: 2000,
          target_word_count: 2000,
          citation_style: "apa7",
          academic_level: "undergraduate",
          assignment_type: "essay",
        },
        gates: [],
      });

      render(<AssignmentWorkspace projectId="proj-dynamic-crud" initialStage="understand" />);

      expect(await screen.findByText(/Phase 1: Understand the Assignment Brief/i)).toBeInTheDocument();

      // Trigger outline generation
      const buildBtn = screen.getByRole("button", { name: /Save & Build/i });
      fireEvent.click(buildBtn);

      await waitFor(() => {
        expect(screen.getByText(/Target Word Count & Section Allocations/i)).toBeInTheDocument();
      });

      // 1. Edit heading title inline
      const headingInputs = screen.getAllByPlaceholderText("Main Heading Title");
      expect(headingInputs.length).toBeGreaterThan(0);
      fireEvent.change(headingInputs[0], { target: { value: "1. Global Supply Chain Architectures" } });
      expect((headingInputs[0] as HTMLInputElement).value).toBe("1. Global Supply Chain Architectures");

      // 2. Adjust section word count (+50 on Section 1)
      const plusSectionWordBtn = screen.getByRole("button", {
        name: /Increase section 1 word count by 50/i,
      });
      fireEvent.click(plusSectionWordBtn);

      // 3. Add a subheading to Section 1
      const addSubheadingBtn = screen.getByRole("button", {
        name: /Add subheading to section 1/i,
      });
      fireEvent.click(addSubheadingBtn);

      // Verify the new subheading input appears
      await waitFor(() => {
        const subInputs = screen.getAllByPlaceholderText("Subheading Title");
        expect(subInputs.length).toBeGreaterThan(2);
      });

      // 4. Edit subheading title inline
      const subInputs = screen.getAllByPlaceholderText("Subheading Title");
      fireEvent.change(subInputs[0], { target: { value: "1.1 Just-in-Time Vulnerabilities" } });
      expect((subInputs[0] as HTMLInputElement).value).toBe("1.1 Just-in-Time Vulnerabilities");

      // 5. Delete a subheading
      const deleteSubBtns = screen.getAllByTitle(/Delete subheading/i);
      const initialCount = deleteSubBtns.length;
      fireEvent.click(deleteSubBtns[deleteSubBtns.length - 1]);

      await waitFor(() => {
        const updatedDeleteBtns = screen.getAllByTitle(/Delete subheading/i);
        expect(updatedDeleteBtns.length).toBe(initialCount - 1);
      });

      // 6. 1-Click Auto-Balance
      const autoBalanceBtn = screen.getByRole("button", { name: /Auto-Balance/i });
      fireEvent.click(autoBalanceBtn);

      // Verify outline is still present and valid
      expect(screen.getByText(/Target Word Count & Section Allocations/i)).toBeInTheDocument();
    });
  });
});
