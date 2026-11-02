// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProtocolBlueprintMode from "../ProtocolBlueprintMode";
import EvidenceMatrixMode from "../EvidenceMatrixMode";
import ResearchWorkspace from "../ResearchWorkspace";
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
}));

vi.mock("../../../services/discovery/multiPortalLiteratureHarvester", () => ({
  harvestFromOpenAlex: vi.fn().mockResolvedValue([
    {
      id: "openalex_w123",
      title: "Real-Time Syndrome Decoding in Surface Codes",
      authors: ["Smith, J.", "Kovacs, L."],
      year: 2024,
      doi: "10.1038/s41586-024-0001",
      abstract: "Demonstrated sub-50ns FPGA syndrome processing.",
      portal: "openalex",
    },
  ]),
  harvestFromCrossref: vi.fn().mockResolvedValue([]),
  harvestFromArxiv: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../services/liveSearchService", () => ({
  executeLiveSearch: vi.fn().mockResolvedValue([]),
  getLiveSearchGroundingEnabled: vi.fn().mockReturnValue(false),
  setLiveSearchGroundingEnabled: vi.fn(),
  onLiveSearchGroundingChange: vi.fn().mockReturnValue(() => {}),
}));

describe("Journal Rebuild Step B — 5-Mode Navigation, Mode 1 Word Budgeter & Mode 2 Evidence Matrix", () => {
  const mockBlueprint: WordBudgetBlueprint = {
    projectId: "proj-step-b",
    template: "IMRaD",
    targetTotalWords: 6000,
    allocatedTotalWords: 6000,
    totalSubSections: 14,
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
            assignedSourceIds: [],
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

  const baseProject: ProjectView = {
    projectId: "proj-step-b",
    outputTypeId: "OT-10",
    version: 3,
    answers: {
      core_problem: "Quantum error correction decoding latency",
      working_title: "Scalable FPGA Syndrome Decoding in Surface Codes",
      title_locked: "true",
      target_word_count: "6000",
      manuscript_template: "IMRaD",
      word_budget_blueprint: JSON.stringify(mockBlueprint),
    },
    authors: [],
    intakeCompleteness: 0.8,
    hasDocument: false,
    hasJournalRequirements: true,
    gates: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getProject).mockResolvedValue(baseProject);
    vi.mocked(api.saveIntakeAnswers).mockImplementation(async (_id, answers) => ({
      ...baseProject,
      answers: { ...baseProject.answers, ...answers },
    }));
    vi.mocked(api.allocateProjectWordBudget).mockResolvedValue({
      ok: true,
      blueprint: mockBlueprint,
    });
  });

  describe("2. Mode 1: ProtocolBlueprintMode (Word Budget & Gaps)", () => {
    it("renders thesis inputs, discovers literature gaps with DOIs, and locks title", async () => {
      vi.mocked(api.executeAgenticLLM).mockResolvedValueOnce(
        JSON.stringify({
          gaps: [
            {
              id: "gap_empirical_101",
              gap_type: "empirical",
              description: "Absence of real-time sub-100ns latency benchmarking on physical quantum testbeds.",
              importance_score: 95,
              supporting_doi: "10.1038/s41586-024-0999",
              why_it_matters: "Without physical timing validation, decoder throughput claims remain unverified.",
            },
          ],
          titles: [
            {
              id: "t_101",
              title_text: "Sub-100ns FPGA Syndrome Decoding",
              subtitle_text: "Empirical Architecture on Surface Code Lattices",
              rationale: "Direct and addresses the empirical gap.",
            },
          ],
        })
      );

      render(
        <ResearchProvider projectId="proj-step-b" initialStage="definition" onStageChangeCallback={() => {}}>
          <ProtocolBlueprintMode />
        </ResearchProvider>
      );

      // Wait for project hydration
      await waitFor(() => {
        expect(screen.getByLabelText(/Research Topic/i)).toHaveValue("Quantum error correction decoding latency");
      });

      // Topic input
      const topicInput = screen.getByLabelText(/Research Topic/i);
      expect(topicInput).toHaveValue("Quantum error correction decoding latency");

      // Click Discover Literature Gaps
      const discoverBtn = screen.getByRole("button", { name: /Discover Literature Gaps/i });
      fireEvent.click(discoverBtn);

      await waitFor(() => {
        expect(api.executeAgenticLLM).toHaveBeenCalled();
        expect(screen.getByText(/Absence of real-time sub-100ns latency benchmarking/i)).toBeInTheDocument();
        expect(screen.getByText(/DOI: 10.1038\/s41586-024-0999/i)).toBeInTheDocument();
      });

      // Lock Working Title & Gap
      const lockBtn = screen.getByRole("button", { name: /(Re-)?Lock (Working )?Title & Gap/i });
      fireEvent.click(lockBtn);

      await waitFor(() => {
        expect(api.saveIntakeAnswers).toHaveBeenCalled();
      });
    });

    it("renders the interactive 350–500 word sub-section budget table and allows target tweaking", async () => {
      render(
        <ResearchProvider projectId="proj-step-b" initialStage="definition" onStageChangeCallback={() => {}}>
          <ProtocolBlueprintMode />
        </ResearchProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("1. Introduction")).toBeInTheDocument();
        expect(screen.getByText("Problem Domain & Background")).toBeInTheDocument();
        expect(screen.getByText("Research Questions & Novelty")).toBeInTheDocument();
        expect(screen.getByText("Hardware Architecture Specification")).toBeInTheDocument();
      });

      // Check sub-section target inputs (450 words each)
      const input = screen.getByRole("spinbutton", { name: "Target words for Problem Domain & Background" });
      expect(input).toHaveValue(450);

      // Tweak sub-section target
      fireEvent.change(input, { target: { value: "475" } });

      await waitFor(() => {
        expect(api.saveIntakeAnswers).toHaveBeenCalled();
      });
    });
  });

  describe("3. Mode 2: EvidenceMatrixMode (Primary User Data & Smart Synthesis)", () => {
    it("renders primary user data dropzone, accepts raw data entry with IAST diacritics, and assigns [CITE:user_data_*] token", async () => {
      vi.mocked(api.uploadProjectUserData).mockResolvedValueOnce({
        ok: true,
        totalDatasets: 1,
        dataset: {
          id: "user_data_999",
          citationToken: "[CITE:user_data_999]",
          title: "Sanskrit Archival Inscriptions",
          author: "Research Team",
          year: 2026,
          badge: "Primary User Data / Upload",
          sourceType: "qualitative_document",
          format: "txt",
          summary: "Direct field inscriptions",
          extractedFindings: "Preserved phonemes: ā, ī, ū, ṛ, ś, ṣ, ṇ.",
          epistemicRole: "Primary User Dataset",
          createdAt: new Date().toISOString(),
        },
      });

      render(
        <ResearchProvider projectId="proj-step-b" initialStage="vault_sources" onStageChangeCallback={() => {}}>
          <EvidenceMatrixMode />
        </ResearchProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/Primary User Data & Empirical Document Ingestion/i)).toBeInTheDocument();
      });

      // Open Direct Paste Modal
      const pasteBtn = screen.getByRole("button", { name: /Paste Raw Data \/ Field Notes/i });
      fireEvent.click(pasteBtn);

      expect(screen.getByText("Direct Raw Data & Field Note Entry")).toBeInTheDocument();

      // Enter data with IAST diacritics
      const contentInput = screen.getByLabelText(/Raw Findings/i);
      fireEvent.change(contentInput, {
        target: { value: "Epigraphical field note with diacritics: ā, ī, ū, ṛ, ś, ṣ, ṇ." },
      });

      const titleInput = screen.getByLabelText(/Dataset \/ Note Title/i);
      fireEvent.change(titleInput, { target: { value: "Sanskrit Archival Inscriptions" } });

      const saveBtn = screen.getByRole("button", { name: /Save Primary Dataset/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(api.uploadProjectUserData).toHaveBeenCalledWith(
          "proj-step-b",
          expect.objectContaining({
            rawText: "Epigraphical field note with diacritics: ā, ī, ū, ṛ, ś, ṣ, ṇ.",
            title: "Sanskrit Archival Inscriptions",
          })
        );
      });
    });

    it("searches OpenAlex and adds harvested paper into the synthesis matrix with section assignment", async () => {
      render(
        <ResearchProvider projectId="proj-step-b" initialStage="vault_sources" onStageChangeCallback={() => {}}>
          <EvidenceMatrixMode />
        </ResearchProvider>
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search empirical literature/i)).toBeInTheDocument();
      });

      // Search query
      const searchInput = screen.getByPlaceholderText(/Search empirical literature/i);
      fireEvent.change(searchInput, { target: { value: "surface codes" } });

      const searchBtn = screen.getByRole("button", { name: /Search Portals/i });
      fireEvent.click(searchBtn);

      await waitFor(() => {
        expect(screen.getByText("Real-Time Syndrome Decoding in Surface Codes")).toBeInTheDocument();
      });

      // Click + Add to Matrix
      const addBtn = screen.getByRole("button", { name: /\+ Add to Matrix/i });
      fireEvent.click(addBtn);

      expect(api.saveIntakeAnswers).toHaveBeenCalled();

      await waitFor(() => {
        expect(screen.getByText("[CITE:openalex_w123]")).toBeInTheDocument();
        expect(screen.getAllByText(/Real-Time Syndrome Decoding in Surface Codes/i).length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe("4. Live Header Telemetry Strip (ResearchWorkspace)", () => {
    it("renders live actual words / target words, verified sources & data, active client model, and autosave version", async () => {
      render(
        <ResearchWorkspace
          projectId="proj-step-b"
          initialStage="definition"
          onStageChange={() => {}}
        />
      );

      await waitFor(() => {
        expect(screen.getByTitle("Actual Words / Target Words")).toBeInTheDocument();
        expect(screen.getByTitle("Verified Sources & User Datasets")).toBeInTheDocument();
        expect(screen.getByTitle(/Active Client AI Model/i)).toBeInTheDocument();
        expect(screen.getByTitle(/Autosave Status v3/i)).toBeInTheDocument();
      });

      // Target words matches blueprint 6,000 words
      expect(screen.getByTitle("Actual Words / Target Words")).toHaveTextContent("6,000");
      expect(screen.getByTitle(/Autosave Status v3/i)).toHaveTextContent(/v3/);
    });
  });
});
