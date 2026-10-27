// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ManuscriptStudioMode from "../ManuscriptStudioMode";
import RefereeRebuttalMode from "../RefereeRebuttalMode";
import { ResearchProvider } from "../ResearchContext";
import * as api from "../../api";
import type { ProjectView } from "../../types";
import type { WordBudgetBlueprint } from "../types";

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
    vi.mocked(api.getProject).mockImplementation(async () => JSON.parse(JSON.stringify(baseProject)));
    vi.mocked(api.saveIntakeAnswers).mockImplementation(async (_id, answers) => ({
      ...JSON.parse(JSON.stringify(baseProject)),
      answers: { ...baseProject.answers, ...answers },
    }));
  });

  describe("1. Mode 3: Grounded Manuscript Studio (ManuscriptStudioMode)", () => {
    it("renders 3-pane split layout, displays sub-section word budgets from Mode 1, and drafts sub-sections within target budget", async () => {
      vi.mocked(api.draftProjectSubSection).mockResolvedValueOnce({
        ok: true,
        subSectionId: "sub-intro-1",
        content:
          "Contemporary quantum information processors necessitate sub-100ns decoding cycles to sustain fault tolerance across scalable surface codes [CITE:src_f101]. As demonstrated in physical hardware trials [CITE:user_data_101], pipelined FPGA syndromic processors mitigate communication bottlenecks and maintain consistent real-time operational thresholds.",
        actualWords: 432,
        warnings: [],
        citedSources: ["src_f101", "user_data_101"],
      });

      render(
        <ResearchProvider projectId="proj-step-c" initialStage="draft">
          <ManuscriptStudioMode />
        </ResearchProvider>
      );

      // Verify Mode 3 header & 3-pane elements
      await waitFor(() => {
        expect(screen.getByText("Mode 3")).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(screen.getByText(/Grounded Manuscript Studio/i)).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(screen.getByText(/350–500 Word Slices/i)).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(screen.getAllByText(/Problem Domain & Background/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/Research Questions & Novelty/i).length).toBeGreaterThanOrEqual(1);
      });

      // Verify Left Pane displays word targets and action buttons
      expect(screen.getByRole("button", { name: /Draft Active Sub-Section/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Draft Entire Section Iteratively/i })).toBeInTheDocument();

      // Trigger Fact-Locked Sub-Section Drafting
      const draftBtn = screen.getByRole("button", { name: /Draft Active Sub-Section/i });
      fireEvent.click(draftBtn);

      await waitFor(() => {
        expect(api.draftProjectSubSection).toHaveBeenCalledWith(
          "proj-step-c",
          expect.objectContaining({
            sectionId: "sec-intro",
            subSectionId: "sub-intro-1",
            subSectionTitle: "Problem Domain & Background",
            targetWords: 450,
            dialect: "en-GB",
          })
        );
      });

      // Confirm prose updated in manuscript canvas
      await waitFor(() => {
        const textarea = screen.getByRole("textbox", { name: /Academic Manuscript Canvas/i }) as HTMLTextAreaElement;
        expect(textarea.value).toContain(
          "Contemporary quantum information processors necessitate sub-100ns decoding cycles"
        );
      });
    });

    it("supports Zen Focus writing mode toggling to collapse and expand sidebars", async () => {
      render(
        <ResearchProvider projectId="proj-step-c" initialStage="draft">
          <ManuscriptStudioMode />
        </ResearchProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/Zen Focus/i)).toBeInTheDocument();
      });

      const zenToggle = screen.getByRole("button", { name: /Zen Focus/i });
      fireEvent.click(zenToggle);

      // Sidebars should now be collapsed and toggle should read "Exit Zen"
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Exit Zen/i })).toBeInTheDocument();
      });

      // Toggle back
      fireEvent.click(screen.getByRole("button", { name: /Exit Zen/i }));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Zen Focus/i })).toBeInTheDocument();
      });
    });

    it("iteratively drafts an entire section through sequential runner with telemetry", async () => {
      vi.mocked(api.draftProjectSubSection)
        .mockResolvedValueOnce({
          ok: true,
          subSectionId: "sub-intro-1",
          content: "Slice 1 completed with high precision [CITE:src_f101].",
          actualWords: 420,
          warnings: [],
          citedSources: ["src_f101"],
        })
        .mockResolvedValueOnce({
          ok: true,
          subSectionId: "sub-intro-2",
          content: "Slice 2 introduces our central research questions and novel decoder architecture.",
          actualWords: 440,
          warnings: [],
          citedSources: [],
        });

      render(
        <ResearchProvider projectId="proj-step-c" initialStage="draft">
          <ManuscriptStudioMode />
        </ResearchProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Draft Entire Section Iteratively/i })).toBeInTheDocument();
      });

      const iterativeBtn = screen.getByRole("button", { name: /Draft Entire Section Iteratively/i });
      fireEvent.click(iterativeBtn);

      await waitFor(() => {
        expect(api.draftProjectSubSection).toHaveBeenCalledTimes(2);
      });

      await waitFor(() => {
        const textarea = screen.getByRole("textbox", { name: /Academic Manuscript Canvas/i }) as HTMLTextAreaElement;
        expect(textarea.value).toContain("Slice 1 completed with high precision");
        expect(textarea.value).toContain("Slice 2 introduces our central research questions");
      });
    });

    it("displays both scholarly literature and primary user datasets in the Evidence Drawer with 1-click citation insertion", async () => {
      render(
        <ResearchProvider projectId="proj-step-c" initialStage="draft">
          <ManuscriptStudioMode />
        </ResearchProvider>
      );

      // Check Evidence Drawer
      await waitFor(() => {
        expect(screen.getByText(/Evidence Ledger/i)).toBeInTheDocument();
        expect(screen.getByText("All Sources (2)")).toBeInTheDocument();
      });

      // Switch to All Sources tab to inspect full ledger
      const allSourcesTab = screen.getByRole("button", { name: /All Sources/i });
      fireEvent.click(allSourcesTab);

      await waitFor(() => {
        expect(screen.getAllByText(/FPGA Latency Benchmark Data/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/Real-Time Syndrome Decoding in Surface Codes/i).length).toBeGreaterThanOrEqual(1);
      });

      // Check badges for Primary Data and Literature
      expect(screen.getByText("Primary Data")).toBeInTheDocument();
      expect(screen.getByText("Literature")).toBeInTheDocument();

      // Test 1-click citation insert
      const insertButtons = screen.getAllByRole("button", { name: /\+ Insert Citation/i });
      expect(insertButtons.length).toBeGreaterThanOrEqual(1);

      fireEvent.click(insertButtons[0]);

      // Check textarea receives the citation token
      await waitFor(() => {
        const textarea = screen.getByRole("textbox", { name: /Academic Manuscript Canvas/i }) as HTMLTextAreaElement;
        expect(textarea.value).toContain("[CITE:user_data_101]");
      });
    });

    it("renders live APA 7 Verified Bibliography and provides IAST diacritic insertion popover", async () => {
      render(
        <ResearchProvider projectId="proj-step-c" initialStage="draft">
          <ManuscriptStudioMode />
        </ResearchProvider>
      );

      // Verify APA 7 Bibliography automatically appended and formatted
      await waitFor(() => {
        expect(screen.getByText(/Verified Bibliography/i)).toBeInTheDocument();
        expect(
          screen.getByText(/Kovacs, L\. \(2026\)\. FPGA Latency Benchmark Data \[Empirical Research Dataset\]\. Primary User Ingestion\./i)
        ).toBeInTheDocument();
        expect(
          screen.getByText(/Smith, J\. \(2024\)\. Real-Time Syndrome Decoding in Surface Codes\. Verified Scholarly Publication\./i)
        ).toBeInTheDocument();
      });

      // Verify IAST Diacritic toolbar popover
      const iastButton = screen.getByRole("button", { name: /IAST Diacritics/i });
      fireEvent.click(iastButton);

      await waitFor(() => {
        expect(screen.getByText(/Click to Insert Scholarly Diacritic/i)).toBeInTheDocument();
        expect(screen.getByTitle(/Long a/i)).toBeInTheDocument();
        expect(screen.getByTitle(/Palatal s/i)).toBeInTheDocument();
      });

      // Insert diacritic ā
      fireEvent.click(screen.getByTitle(/Long a/i));

      await waitFor(() => {
        const textarea = screen.getByRole("textbox", { name: /Academic Manuscript Canvas/i }) as HTMLTextAreaElement;
        expect(textarea.value).toContain("ā");
      });
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
