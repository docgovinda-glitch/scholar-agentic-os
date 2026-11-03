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
  authedJsonFetch: vi.fn(),
  getJournalRequirements: vi.fn().mockResolvedValue(null),
  saveJournalRequirements: vi.fn(),
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
    // The old flow asked the AI for gaps "with DOIs" and showed whatever DOI it
    // typed (e.g. 10.1038/s41586-024-0999, which it never looked up). Gaps now
    // come only from real papers found first, each with a quote from them.
    it("explores from an interest: grounded gaps, questions, a matched journal, then lock and Mode 2", async () => {
      const calls: string[] = [];
      vi.mocked(api.authedJsonFetch).mockImplementation(async (url: string) => {
        calls.push(url);
        if (url.endsWith("/blueprint/gaps"))
          return new Response(JSON.stringify({
            since: 2021,
            dropped: 1,
            papers: [{ key: "p1", title: "Decoder latency on FPGA testbeds", year: 2024, doi: "10.1/fpga", authors: [], abstract: "Physical timing was not measured.", source: "openalex" }],
            gaps: [{ id: "gap-1", type: "empirical", statement: "Physical decoder timing is unmeasured.", whyItMatters: "Claims stay unverified.", evidence: [{ paperKey: "p1", quote: "Physical timing was not measured" }] }],
          }), { status: 200 });
        if (url.endsWith("/blueprint/questions"))
          return new Response(JSON.stringify({ questions: ["How fast are FPGA decoders on physical testbeds?"], titles: ["Timing FPGA Decoders on Real Hardware"] }), { status: 200 });
        if (url.endsWith("/blueprint/journals"))
          return new Response(JSON.stringify({ since: 2021, journals: [{ id: "S1", name: "Quantum", publisher: "Verein", matchingWorks: 4, searchedWorks: 100, sampleTitles: ["A"], source: "openalex", rationale: "Published 4 of the 100 most relevant articles on this topic since 2021, e.g. “A”." }] }), { status: 200 });
        return new Response("{}", { status: 404 });
      });
      const setModeSpy = vi.fn();
      const noTitle = { ...baseProject, answers: { ...baseProject.answers, working_title: "", core_problem: "", title_locked: "" } };
      vi.mocked(api.getProject).mockResolvedValue(noTitle);

      render(
        <ResearchProvider projectId="proj-step-b" initialStage="definition" onStageChangeCallback={setModeSpy}>
          <ProtocolBlueprintMode />
        </ResearchProvider>
      );

      fireEvent.click(await screen.findByRole("radio", { name: /Explore and discover/i }));
      fireEvent.change(screen.getByLabelText(/Your area of interest/i), { target: { value: "quantum error correction" } });
      fireEvent.click(screen.getByRole("button", { name: /Find research gaps/i }));

      // The gap shows the quote and the real paper it rests on; no made-up DOI or score.
      expect(await screen.findByText(/Physical decoder timing is unmeasured/)).toBeInTheDocument();
      expect(screen.getByText(/“Physical timing was not measured”/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Decoder latency on FPGA testbeds \(2024\)/ })).toHaveAttribute("href", "https://doi.org/10.1/fpga");
      expect(screen.getByTestId("gap-basis")).toHaveTextContent("1 proposed gap was left out");
      expect(screen.queryByText(/Significance/)).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: /Physical decoder timing is unmeasured/ }));
      fireEvent.click(screen.getByRole("button", { name: /Suggest questions and titles/i }));
      await waitFor(() => expect(screen.getByLabelText("Research question 1")).toHaveValue("How fast are FPGA decoders on physical testbeds?"));
      expect(screen.getByLabelText(/Working article title/)).toHaveValue("Timing FPGA Decoders on Real Hardware");

      // No journal yet: the lock is closed and says why.
      const lock = screen.getByRole("button", { name: /Lock blueprint and continue to Mode 2/i });
      expect(lock).toBeDisabled();
      expect(screen.getByText(/Still needed: a target journal/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Find best-fit journals/i }));
      expect(await screen.findByText(/Published 4 of the 100 most relevant articles/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Select Quantum" }));
      // The guidelines form opens for the chosen journal; its rules come from there, not the index.
      expect(await screen.findByTestId("journal-guidelines-prompt")).toHaveTextContent("not in public indexes");

      await waitFor(() => expect(lock).toBeEnabled());
      fireEvent.click(lock);
      await waitFor(() =>
        expect(vi.mocked(api.saveIntakeAnswers).mock.calls.some(([, a]) => (a as Record<string, string>).blueprint_locked === "true")),
      );
      const lockPatch = vi.mocked(api.saveIntakeAnswers).mock.calls.map(([, a]) => a as Record<string, string>).find((a) => a.blueprint_locked === "true")!;
      expect(lockPatch).toMatchObject({ core_problem: "Physical decoder timing is unmeasured.", primary_research_question: "How fast are FPGA decoders on physical testbeds?", title: "Timing FPGA Decoders on Real Hardware" });
      expect(calls.every((u) => u.startsWith("/api/projects/proj-step-b/agentic/blueprint/"))).toBe(true);
    });

    it("renders the interactive 350–500 word sub-section budget table and allows target tweaking", async () => {
      render(
        <ResearchProvider projectId="proj-step-b" initialStage="definition" onStageChangeCallback={() => {}}>
          <ProtocolBlueprintMode />
        </ResearchProvider>
      );

      // Sub-section headings are now editable inputs, so they are found by value.
      await waitFor(() => {
        expect(screen.getByText("1. Introduction")).toBeInTheDocument();
        expect(screen.getByDisplayValue("Problem Domain & Background")).toBeInTheDocument();
        expect(screen.getByDisplayValue("Research Questions & Novelty")).toBeInTheDocument();
        expect(screen.getByDisplayValue("Hardware Architecture Specification")).toBeInTheDocument();
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

  describe("2b. Mode 1: the AI writes the table of contents for this article", () => {
    it("starts with no template, writes the outline with AI, applies a requested change, and can undo it", async () => {
      const noOutline = { ...baseProject, answers: { ...baseProject.answers, word_budget_blueprint: "" } };
      vi.mocked(api.getProject).mockResolvedValue(noOutline);
      vi.mocked(api.saveIntakeAnswers).mockImplementation(async (_id, answers) => ({ ...noOutline, answers: { ...noOutline.answers, ...answers } }));
      const outline = (sections: Array<[string, string[]]>, total: number) => ({
        projectId: "proj-step-b", template: "IMRaD", targetTotalWords: total, allocatedTotalWords: total, totalSubSections: sections.reduce((n, [, u]) => n + u.length, 0),
        createdAt: "", updatedAt: "",
        sections: sections.map(([name, subs], i) => ({
          id: `ai-${i + 1}`, sectionKey: "other", sectionName: name, order: i + 1, targetWords: Math.round(total / sections.length),
          subSections: subs.map((t, j) => ({ id: `ai-${i + 1}-${j + 1}`, sectionId: `ai-${i + 1}`, title: t, order: j + 1, targetWords: Math.round(total / sections.length / subs.length), assignedSourceIds: [] })),
        })),
      });
      const bodies: unknown[] = [];
      vi.mocked(api.authedJsonFetch).mockImplementation(async (url: string, _m: string, body: unknown) => {
        bodies.push(body);
        if (!url.endsWith("/blueprint/outline")) return new Response("{}", { status: 404 });
        const first = bodies.length === 1;
        return new Response(JSON.stringify({ blueprint: first
          ? outline([["Introduction", ["FPGA decoders and the timing gap"]], ["Methods", ["Testbed and timing protocol"]]], 6000)
          : outline([["Introduction", ["FPGA decoders and the timing gap"]], ["Methods", ["Testbed and timing protocol"]], ["Policy implications", ["Hardware procurement"]]], 6000) }), { status: 200 });
      });

      render(
        <ResearchProvider projectId="proj-step-b" initialStage="definition" onStageChangeCallback={() => {}}>
          <ProtocolBlueprintMode />
        </ResearchProvider>
      );

      // No fixed template is put in place.
      expect(await screen.findByTestId("outline-empty")).toBeInTheDocument();
      expect(api.allocateProjectWordBudget).not.toHaveBeenCalled();

      // Ready once the project (title, problem) has loaded.
      await waitFor(() => expect(screen.queryByText(/Add a working title or a research problem/)).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: "Write my table of contents with AI" }));
      expect(await screen.findByDisplayValue("FPGA decoders and the timing gap")).toBeInTheDocument();
      expect(bodies[0]).toEqual({});

      fireEvent.change(screen.getByLabelText("Ask AI to change the outline"), { target: { value: "Add a section on policy implications" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));
      expect(await screen.findByText("3. Policy implications")).toBeInTheDocument();
      expect(bodies[1]).toEqual({ instruction: "Add a section on policy implications" });

      fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
      await waitFor(() => expect(screen.queryByText("3. Policy implications")).toBeNull());
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
