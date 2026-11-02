// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ManuscriptStudioMode from "../ManuscriptStudioMode";
import RefereeRebuttalMode from "../RefereeRebuttalMode";
import { ResearchProvider } from "../ResearchContext";
import * as api from "../../api";
import type { ProjectView } from "../../types";
import type { WordBudgetBlueprint } from "../types";

// jsdom has no layout; ProseMirror measures the cursor when it scrolls to it.
if (typeof Range !== "undefined") {
  Range.prototype.getClientRects = Range.prototype.getClientRects || (() => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList);
  Range.prototype.getBoundingClientRect = Range.prototype.getBoundingClientRect || (() => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect);
}
if (typeof document !== "undefined" && !document.elementFromPoint) {
  document.elementFromPoint = () => null;
}

let confirmAnswer = true;
let confirmCalls = 0;
vi.mock("../../../components/ui/FeedbackSystem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../components/ui/FeedbackSystem")>()),
  requestAppConfirm: async () => {
    confirmCalls += 1;
    return confirmAnswer;
  },
}));

// Mock API modules
vi.mock("../../api", () => ({
  saveIntakeAnswers: vi.fn(),
  getProject: vi.fn(),
  getDocument: vi.fn().mockResolvedValue(null),
  getRubric: vi.fn().mockResolvedValue(null),
  getOutputTypeSpec: vi.fn().mockResolvedValue({
    id: "OT-10",
    label: "Journal Article",
    structure: { sections: [] },
  }),
  isSupabaseConfigured: vi.fn().mockReturnValue(false),
  getSupabaseClient: vi.fn(),
  executeAgenticLLM: vi.fn(),
  setGlobalManualModelOverride: vi.fn(),
  allocateProjectWordBudget: vi.fn(),
  uploadProjectUserData: vi.fn(),
  updateProjectUserData: vi.fn(),
  draftProjectSubSection: vi.fn(),
  polishProjectManuscript: vi.fn(),
  simulateFiveRefereeReview: vi.fn(),
  generateProjectRebuttalMatrix: vi.fn(),
}));

describe("Journal Rebuild Step C — Mode 3 Grounded Manuscript Studio & Mode 4 Unified Referee Rebuttal Workbench", () => {
  const mockBlueprint: WordBudgetBlueprint = {
    projectId: "proj-step-c",
    template: "IMRaD",
    targetTotalWords: 6000,
    allocatedTotalWords: 6000,
    totalSubSections: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections: [
      {
        id: "sec-intro",
        sectionKey: "introduction",
        sectionName: "Introduction",
        targetWords: 900,
        order: 1,
        subSections: [
          {
            id: "sub-intro-1",
            sectionId: "sec-intro",
            title: "Problem Domain & Background",
            targetWords: 450,
            order: 1,
            assignedSourceIds: ["user_data_101", "src_f101"],
          },
          {
            id: "sub-intro-2",
            sectionId: "sec-intro",
            title: "Research Questions & Novelty",
            targetWords: 450,
            order: 2,
            assignedSourceIds: [],
          },
        ],
      },
      {
        id: "sec-methods",
        sectionKey: "methodology",
        sectionName: "Methodology",
        targetWords: 1500,
        order: 2,
        subSections: [
          {
            id: "sub-meth-1",
            sectionId: "sec-methods",
            title: "Hardware Architecture Specification",
            targetWords: 500,
            order: 1,
            assignedSourceIds: [],
          },
        ],
      },
    ],
  };

  const initialManuscript = `### § Problem Domain & Background\n\nScalable surface code quantum error correction requires real-time decoding cycles under 100ns to prevent exponential fault accumulation [CITE:src_f101].\n\nEmpirical latency benchmarks verify that FPGA architectures reduce decoder memory latency [CITE:user_data_101].`;

  const baseProject: ProjectView = {
    projectId: "proj-step-c",
    outputTypeId: "OT-10",
    version: 4,
    answers: {
      core_problem: "Quantum error correction decoding latency",
      working_title: "Scalable FPGA Syndrome Decoding in Surface Codes",
      title_locked: "true",
      target_word_count: "6000",
      manuscript_template: "IMRaD",
      manuscript_dialect: "en-GB",
      word_budget_blueprint: JSON.stringify(mockBlueprint),
      manuscript_markdown: initialManuscript,
      assembled_draft: initialManuscript,
      user_data_entries: JSON.stringify([
        {
          id: "user_data_101",
          citationToken: "[CITE:user_data_101]",
          title: "FPGA Latency Benchmark Data",
          author: "Kovacs, L.",
          year: 2026,
          summary: "Direct FPGA syndrome decoding measurements.",
          extractedFindings: "Average decoding cycle time was 48.2ns across 10,000 syndrome iterations.",
          sourceType: "dataset",
          format: "csv",
          assignedSectionId: "sub-intro-1",
        },
      ]),
      vault_sources: JSON.stringify([
        {
          id: "src_f101",
          title: "Real-Time Syndrome Decoding in Surface Codes",
          author: "Smith, J.",
          year: 2024,
          keyFindings: "Demonstrated sub-50ns FPGA syndrome processing.",
          portal: "OpenAlex",
          assignedSectionId: "sub-intro-1",
        },
      ]),
    },
    authors: [],
    intakeCompleteness: 0.85,
    hasDocument: false,
    hasJournalRequirements: true,
    gates: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    confirmAnswer = true;
    confirmCalls = 0;
    vi.mocked(api.getProject).mockImplementation(async () => JSON.parse(JSON.stringify(baseProject)));
    vi.mocked(api.saveIntakeAnswers).mockImplementation(async (_id, answers) => ({
      ...JSON.parse(JSON.stringify(baseProject)),
      answers: { ...baseProject.answers, ...answers },
    }));
  });

  describe("1. Mode 3: Writing Studio (ManuscriptStudioMode)", () => {
    const renderStudio = () =>
      render(
        <ResearchProvider projectId="proj-step-c" initialStage="draft">
          <ManuscriptStudioMode />
        </ResearchProvider>
      );
    // Waits for the project to load (the outline shows the blueprint) and the unit to open.
    const openUnit = async (title: RegExp) => {
      await waitFor(() => {
        const outline = screen.getByRole("navigation", { name: "Manuscript outline" });
        fireEvent.click(within(outline).getByRole("button", { name: title }));
        expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
      });
    };

    it("shows the outline in writing order with words per sub-section, and the earlier draft split into its sections", async () => {
      renderStudio();
      const outline = await screen.findByRole("navigation", { name: "Manuscript outline" });
      // Methods before the Introduction in writing order.
      const text = outline.textContent || "";
      expect(text.indexOf("Methodology")).toBeLessThan(text.indexOf("Introduction"));
      expect(within(outline).getByText("Write 1st")).toBeInTheDocument();
      // It opens on the next thing to write: the empty Methods sub-section.
      expect(await screen.findByRole("heading", { name: "Hardware Architecture Specification" })).toBeInTheDocument();
      // The old single document was split on its sub-section heading.
      await openUnit(/Problem Domain & Background/);
      const box = screen.getByRole("textbox", { name: "Problem Domain & Background text" });
      expect(box).toHaveTextContent("Scalable surface code quantum error correction");
      expect(box).not.toHaveTextContent("### §");
      // Citations are objects in the text, shown as author and year.
      expect(box.querySelectorAll('[data-cite="src_f101"]')).toHaveLength(1);
      expect(box.querySelector('[data-cite="src_f101"]')).toHaveTextContent("Smith, 2024");
    });

    it("drafts a section with its sources and what is already written, and saves sections plus the assembled manuscript", async () => {
      vi.mocked(api.draftProjectSubSection).mockResolvedValueOnce({
        ok: true,
        subSectionId: "sub-intro-2",
        content: "We ask whether pipelined FPGA decoders stay under 100ns [CITE:src_f101].",
        actualWords: 12,
      });
      renderStudio();
      await openUnit(/Research Questions & Novelty/);
      fireEvent.click(screen.getByRole("button", { name: /Draft Research Questions & Novelty with AI/i }));
      await waitFor(() => expect(api.draftProjectSubSection).toHaveBeenCalled());
      const payload = vi.mocked(api.draftProjectSubSection).mock.calls[0][1];
      expect(payload).toMatchObject({
        sectionId: "sec-intro",
        subSectionId: "sub-intro-2",
        subSectionTitle: "Introduction: Research Questions & Novelty",
        targetWords: 450,
        dialect: "en-GB",
      });
      // The AI sees the Introduction text already written, to stay consistent.
      expect(payload.contextPrompt).toContain("Scalable surface code quantum error correction");
      await waitFor(() =>
        expect(screen.getByRole("textbox", { name: "Research Questions & Novelty text" })).toHaveTextContent(
          "We ask whether pipelined FPGA decoders stay under 100ns"
        )
      );
      await waitFor(() => expect(api.saveIntakeAnswers).toHaveBeenCalled(), { timeout: 3000 });
      const saved = vi.mocked(api.saveIntakeAnswers).mock.calls.at(-1)![1] as Record<string, string>;
      expect(JSON.parse(saved.manuscript_sections).texts["sub-intro-2"]).toContain("pipelined FPGA decoders");
      expect(saved.manuscript_markdown).toContain("## Introduction\n\n### § Problem Domain & Background");
      expect(saved.manuscript_markdown).toContain("### § Research Questions & Novelty\n\nWe ask whether");
      // Only the studio's own fields are sent, not a stale copy of every answer.
      expect(Object.keys(saved).sort()).toEqual(["assembled_draft", "full_text_markdown", "manuscript_markdown", "manuscript_sections"]);
    });

    it("asks before an AI draft replaces text the author wrote, and keeps it when declined", async () => {
      confirmAnswer = false;
      renderStudio();
      await openUnit(/Problem Domain & Background/);
      fireEvent.click(screen.getByRole("button", { name: /Redraft Problem Domain & Background with AI/i }));
      await waitFor(() => expect(confirmCalls).toBe(1));
      expect(api.draftProjectSubSection).not.toHaveBeenCalled();
      expect(screen.getByRole("textbox", { name: "Problem Domain & Background text" })).toHaveTextContent("Scalable surface code");
    });

    it("Focus hides the outline and sources so the text gets the page", async () => {
      renderStudio();
      await screen.findByRole("navigation", { name: "Manuscript outline" });
      fireEvent.click(screen.getByRole("button", { name: /^Sources$/ }));
      expect(screen.getByRole("complementary", { name: "Sources panel" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^Focus$/ }));
      expect(screen.queryByRole("navigation", { name: "Manuscript outline" })).not.toBeInTheDocument();
      expect(screen.queryByRole("complementary", { name: "Sources panel" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Exit focus/ }));
      expect(screen.getByRole("navigation", { name: "Manuscript outline" })).toBeInTheDocument();
    });

    it("lists the section's sources and the author's data, cites in one click, and builds references from what is recorded", async () => {
      renderStudio();
      await openUnit(/Problem Domain & Background/);
      fireEvent.click(screen.getByRole("button", { name: /^Sources$/ }));
      const panel = screen.getByRole("complementary", { name: "Sources panel" });
      expect(within(panel).getByRole("button", { name: "This section (2)" })).toBeInTheDocument();
      expect(within(panel).getByText("Your data")).toBeInTheDocument();
      expect(within(panel).getByText("Literature")).toBeInTheDocument();
      // References from the citations already in the text: nothing claimed beyond the record.
      expect(within(panel).getByText("Kovacs, L. (2026). FPGA Latency Benchmark Data. [Dataset].")).toBeInTheDocument();
      expect(within(panel).getByText("Smith, J. (2024). Real-Time Syndrome Decoding in Surface Codes.")).toBeInTheDocument();
      expect(panel.textContent).not.toMatch(/Verified Scholarly Publication|Primary User Ingestion/);

      fireEvent.click(within(panel).getByRole("button", { name: "Cite Real-Time Syndrome Decoding in Surface Codes" }));
      const box = screen.getByRole("textbox", { name: "Problem Domain & Background text" });
      await waitFor(() => expect(box.querySelectorAll('[data-cite="src_f101"]')).toHaveLength(2));
      // The new citation is saved as a [CITE:id] marker in the section's text.
      await waitFor(() => {
        const saved = vi.mocked(api.saveIntakeAnswers).mock.calls.at(-1)?.[1] as Record<string, string> | undefined;
        expect(saved && JSON.parse(saved.manuscript_sections).texts["sub-intro-1"].match(/\[CITE:src_f101\]/g)).toHaveLength(2);
      }, { timeout: 3000 });

      fireEvent.click(screen.getByRole("button", { name: /Diacritics/ }));
      fireEvent.click(screen.getByRole("button", { name: "Insert Long a" }));
      await waitFor(() => expect(box).toHaveTextContent("ā"));
    });
  });

  describe("2. Mode 4: 5-Referee Adversarial Peer Review & Surgical Rebuttal Workbench (RefereeRebuttalMode)", () => {
    const mockCritiques = [
      {
        id: "crit-1",
        referee: "Methodologist" as const,
        severity: "Major" as const,
        section: "Methodology",
        critique: "The latency benchmarking methodology fails to specify clock cycle jitter tolerances in the FPGA.",
        lens: "Internal Validity & Causal Rigour",
        recommendation: "State jitter margins and sampling frequencies.",
      },
      {
        id: "crit-2",
        referee: "Biostatistician" as const,
        severity: "Major" as const,
        section: "Results & Discussion",
        critique: "Sample size for the 10,000 syndrome iterations requires statistical confidence intervals.",
        lens: "Quantitative Power & Reproducibility",
        recommendation: "Include 95% bootstrap confidence intervals for mean decoding latency.",
      },
    ];

    const mockMatrix = [
      {
        id: "reb-1",
        referee: "Methodologist" as const,
        critique: "The latency benchmarking methodology fails to specify clock cycle jitter tolerances in the FPGA.",
        severity: "Major" as const,
        section: "Methodology",
        lens: "Internal Validity & Causal Rigour",
        authorResponse: "We have incorporated a precise jitter margin specification (±2.1ps at 250MHz PLL).",
        status: "Pending Revision" as const,
        revisionAction: "Incorporate hardware PLL clock jitter tolerance metrics.",
        diff: {
          find: "Empirical latency benchmarks verify that FPGA architectures reduce decoder memory latency [CITE:user_data_101].",
          replace:
            "Empirical latency benchmarks (operating with ±2.1ps PLL clock jitter tolerance at 250MHz) verify that FPGA architectures reduce decoder memory latency [CITE:user_data_101].",
        },
      },
      {
        id: "reb-2",
        referee: "Biostatistician" as const,
        critique: "Sample size for the 10,000 syndrome iterations requires statistical confidence intervals.",
        severity: "Major" as const,
        section: "Results & Discussion",
        lens: "Quantitative Power & Reproducibility",
        authorResponse: "Reported 95% confidence intervals across all iterations.",
        status: "Pending Revision" as const,
        revisionAction: "Add 95% CI bounds.",
        diff: {
          find: "Average decoding cycle time was 48.2ns across 10,000 syndrome iterations.",
          replace: "Average decoding cycle time was 48.2ns [95% CI: 47.8ns, 48.6ns] across 10,000 syndrome iterations.",
        },
      },
    ];

    it("renders the 5 specialist referee personas and runs adversarial simulation", async () => {
      vi.mocked(api.simulateFiveRefereeReview).mockResolvedValueOnce({
        ok: true,
        data: mockCritiques,
      });
      vi.mocked(api.generateProjectRebuttalMatrix).mockResolvedValueOnce({
        ok: true,
        matrix: mockMatrix,
      });

      render(
        <ResearchProvider projectId="proj-step-c" initialStage="peer_review">
          <RefereeRebuttalMode />
        </ResearchProvider>
      );

      // Verify Mode 4 header & 5 specialist personas
      await waitFor(() => {
        expect(screen.getByText("Mode 4")).toBeInTheDocument();
        expect(
          screen.getByText(/Adversarial 5-Referee Peer Review & Surgical Rebuttal Workbench/i)
        ).toBeInTheDocument();
        expect(screen.getAllByText("Methodologist").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Domain Specialist").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Biostatistician").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Synthesizer").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Formal Editor").length).toBeGreaterThanOrEqual(1);
      });

      // Run 5-Referee simulation
      const simButton = screen.getByRole("button", { name: /Simulate 5-Referee Adversarial Review/i });
      fireEvent.click(simButton);

      await waitFor(() => {
        expect(api.simulateFiveRefereeReview).toHaveBeenCalledWith("proj-step-c");
      });

      // Critiques rendered in matrix
      await waitFor(() => {
        expect(
          screen.getByText(/The latency benchmarking methodology fails to specify clock cycle jitter tolerances/i)
        ).toBeInTheDocument();
      });
    });

    it("renders the Point-by-Point Rebuttal Matrix with surgical diff patch and applies patch directly to manuscript", async () => {
      const projectWithRebuttal: ProjectView = {
        ...baseProject,
        answers: {
          ...baseProject.answers,
          peer_review_critiques: JSON.stringify(mockCritiques),
          rebuttal_matrix: JSON.stringify(mockMatrix),
        },
      };
      vi.mocked(api.getProject).mockImplementation(async () => JSON.parse(JSON.stringify(projectWithRebuttal)));

      render(
        <ResearchProvider projectId="proj-step-c" initialStage="peer_review">
          <RefereeRebuttalMode />
        </ResearchProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/B\. Surgical Patch Diff & Point-by-Point Rebuttal Matrix/i)).toBeInTheDocument();
        expect(screen.getByText(/±2\.1ps PLL clock jitter tolerance/i)).toBeInTheDocument();
      });

      // Check author response textarea
      const responseTextarea = screen.getByDisplayValue(
        /We have incorporated a precise jitter margin specification/i
      );
      expect(responseTextarea).toBeInTheDocument();

      // Check Accept & Apply Patch button
      const applyButtons = screen.getAllByRole("button", { name: /Accept & Apply Patch/i });
      expect(applyButtons.length).toBeGreaterThanOrEqual(1);

      fireEvent.click(applyButtons[0]);

      // Verify saveIntakeAnswers was called with patched manuscript
      await waitFor(() => {
        expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
          "proj-step-c",
          expect.objectContaining({
            manuscript_markdown: expect.stringContaining(
              "Empirical latency benchmarks (operating with ±2.1ps PLL clock jitter tolerance at 250MHz)"
            ),
          })
        );
      });

      // Verify button status updates to applied
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /✓ Patch Applied to Manuscript/i })).toBeInTheDocument();
      });
    });

    it("exports the structured Point-by-Point Author Response Letter modal", async () => {
      const projectWithRebuttal: ProjectView = {
        ...baseProject,
        answers: {
          ...baseProject.answers,
          peer_review_critiques: JSON.stringify(mockCritiques),
          rebuttal_matrix: JSON.stringify(mockMatrix),
        },
      };
      vi.mocked(api.getProject).mockImplementation(async () => JSON.parse(JSON.stringify(projectWithRebuttal)));

      render(
        <ResearchProvider projectId="proj-step-c" initialStage="peer_review">
          <RefereeRebuttalMode />
        </ResearchProvider>
      );

      // Wait for matrix items to render and button to become enabled
      await waitFor(() => {
        expect(screen.getByText(/±2\.1ps PLL clock jitter tolerance/i)).toBeInTheDocument();
      });

      const letterBtn = screen.getByRole("button", { name: /Rebuttal Letter/i });
      expect(letterBtn).not.toBeDisabled();
      fireEvent.click(letterBtn);

      // Letter modal should be displayed
      await waitFor(() => {
        expect(screen.getByText(/Export Point-by-Point Author Rebuttal Letter/i)).toBeInTheDocument();
        const letterArea = screen.getByRole("textbox", {
          name: /Formatted Author Rebuttal Letter/i,
        }) as HTMLTextAreaElement;
        expect(letterArea.value).toContain("Dear Editors and Reviewers");
        expect(letterArea.value).toContain("Point-by-Point Author Response & Rebuttal Letter");
      });
    });
  });
});
