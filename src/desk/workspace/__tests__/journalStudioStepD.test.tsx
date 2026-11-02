// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AuditExportMode from "../AuditExportMode";
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
  downloadProjectExportBlob: vi.fn(),
  downloadRefereeResponseLetterBlob: vi.fn(),
  runPreFlightComplianceAudit: vi.fn(),
  exportProjectManuscript: vi.fn(),
}));

describe("Journal Rebuild Step D — Mode 5 Pre-Flight Compliance Studio & Camera-Ready Compiler", () => {
  const mockBlueprint: WordBudgetBlueprint = {
    projectId: "proj-step-d",
    template: "IMRaD",
    targetTotalWords: 200,
    allocatedTotalWords: 200,
    totalSubSections: 4,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections: [
      {
        id: "sec-intro",
        sectionKey: "introduction",
        sectionName: "Introduction",
        targetWords: 700,
        order: 1,
        subSections: [],
      },
      {
        id: "sec-methods",
        sectionKey: "methodology",
        sectionName: "Methodology",
        targetWords: 1000,
        order: 2,
        subSections: [],
      },
      {
        id: "sec-results",
        sectionKey: "results",
        sectionName: "Results",
        targetWords: 1000,
        order: 3,
        subSections: [],
      },
      {
        id: "sec-discussion",
        sectionKey: "discussion",
        sectionName: "Discussion",
        targetWords: 800,
        order: 4,
        subSections: [],
      },
    ],
  };

  const sampleManuscript = `
# Provable Bounds in Autonomous Research Workflows

## Abstract
Autonomous scientific synthesis requires continuous verification to prevent cumulative hallucination cascade. We prove stability invariants for multi-agent synthesis under bounded conditions.

## 1. Introduction
Modern scientific automation demands provable grounding across distributed literature nodes [CITE:src_f101]. We examine sub-microsecond syndrome decoding using primary benchmark datasets [CITE:user_data_101]. The empirical measurements establish reliable convergence across varied topological surface code configurations.

## 2. Methodology & Formal Bounds
Under Lemma 1, asymptotic latency is strictly bounded at O(|C| · |E| log |V|). Experimental decoding runs confirm high burstiness across operational cycles.

| Syndrome Step | Physical Latency (ns) | Fidelity (%) |
| :--- | :--- | :--- |
| Step 1 (Setup) | 120 | 99.8 |
| Step 2 (Decode) | 340 | 99.4 |
| Step 3 (Commit) | 180 | 99.9 |

## 3. Results
Empirical evaluation validates our theoretical bounds under continuous load. The hardware decoder achieves sub-microsecond response latency.

## 4. Discussion & Validity Threats
These findings establish that multi-agent consensus can achieve provable stability.

## References
1. Vaswani, A. et al. (2017). Attention is all you need. Advances in Neural Information Processing Systems.
2. Kovacs, L. (2026). FPGA Latency Benchmark Data [Empirical Research Dataset].
`.trim();

  const baseProject: ProjectView = {
    projectId: "proj-step-d",
    userId: "usr-step-d",
    outputTypeId: "OT-10",
    currentStage: "export",
    gates: { G7: { signedOff: true } },
    answers: {
      working_title: "Provable Bounds in Autonomous Research Workflows",
      selected_journal_name: "Nature Machine Intelligence",
      running_head: "PROVABLE BOUNDS IN AUTONOMOUS WORKFLOWS",
      author_orcid: "0000-0002-1825-0097",
      // A finished submission: the authors have written their declarations.
      data_availability_statement: "Benchmark data are available from the corresponding author on reasonable request.",
      competing_interests_statement: "The authors declare no competing interests.",
      credit_statement: "E. Rostova: Conceptualization, Writing – original draft.",
      ai_disclosure_statement: "AI tools were used for language editing; the authors take responsibility for the content.",
      keywords: "Quantum Computing, Error Correction, Surface Codes, FPGA Decoding",
      word_budget_blueprint: JSON.stringify(mockBlueprint),
      manuscript_markdown: sampleManuscript,
      vault_sources: JSON.stringify([
        {
          id: "src_f101",
          title: "Real-Time Syndrome Decoding in Surface Codes",
          authors: ["Fowler, A."],
          year: 2024,
        },
      ]),
      user_data_entries: JSON.stringify([
        {
          id: "user_data_101",
          title: "FPGA Latency Benchmark Data",
          name: "FPGA Latency Benchmark Data",
        },
      ]),
      rebuttal_matrix: JSON.stringify([
        {
          id: "rebuttal-1",
          referee: "Methodologist",
          lens: "Hardware Latency Bounds",
          section: "2. Methodology",
          severity: "Major",
          critique: "Empirical verification on physical FPGA decoder is required.",
          authorResponse: "Empirical FPGA latency data from user_data_101 was incorporated.",
          revisionAction: "Added Table 1 with experimental latency and fidelity metrics.",
        },
      ]),
    },
    authors: [
      {
        id: "auth-1",
        firstName: "Elena",
        surname: "Rostova",
        affiliation: "University of Oxford",
        email: "e.rostova@oxford.ac.uk",
      },
    ],
    claimGraph: { nodes: [], edges: [] },
    evidenceLedger: { items: [] },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getProject).mockResolvedValue(baseProject);
    vi.mocked(api.saveIntakeAnswers).mockImplementation(async (_id, updates) => ({
      ...baseProject,
      answers: { ...baseProject.answers, ...updates },
    }));

    // Mock URL.createObjectURL and URL.revokeObjectURL
    if (typeof window !== "undefined") {
      window.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-download-url");
      window.URL.revokeObjectURL = vi.fn();
    }
  });

  it("renders Mode 5 header, Conductor Gate G7 certification badge, and 4-part Gatekeeper Scorecard", async () => {
    render(
      <ResearchProvider projectId="proj-step-d" initialStage="export" onStageChangeCallback={vi.fn()}>
        <AuditExportMode />
      </ResearchProvider>
    );

    // Wait for async project data to load into ResearchContext
    await waitFor(() => {
      expect(screen.getByText(/Gate G7: CERTIFIED READY/i)).toBeInTheDocument();
    });

    // Header inspection
    expect(screen.getByText("Mode 5")).toBeInTheDocument();
    expect(screen.getByText("Conductor Gate G7")).toBeInTheDocument();
    expect(screen.getByText(/Pre-Flight Compliance Audit & Submission Compiler/i)).toBeInTheDocument();

    // Check 1: Word Count Budget Compliance
    expect(screen.getByText(/1\. Word Count Budget Compliance/i)).toBeInTheDocument();
    expect(screen.getByText(/Within Budget/i)).toBeInTheDocument();

    // Check 2: References. One cited source has no DOI to check, one is the author's dataset.
    expect(screen.getByText("2. References")).toBeInTheDocument();
    expect(screen.getByText("2 cited · 1 to review")).toBeInTheDocument();

    // Check 3: Verification. The sample has no test statistics, spelling mixes,
    // abstract numbers or figure mentions, so there is nothing to fix.
    expect(screen.getByText("3. Verification")).toBeInTheDocument();
    expect(screen.getByText("No problems found")).toBeInTheDocument();
    expect(screen.getByText("Statistics recomputed")).toBeInTheDocument();

    // Check 4: 2026 Publisher Ethical Declarations
    expect(screen.getByText(/4\. 2026 Publisher Ethical & Provenance Declarations/i)).toBeInTheDocument();
    expect(screen.getByText(/Data & Primary Material Availability Statement/i)).toBeInTheDocument();
    expect(screen.getByText(/Competing Interests \/ Funding Declaration/i)).toBeInTheDocument();
    expect(screen.getByText(/CRediT Author Contribution Statement/i)).toBeInTheDocument();
    expect(screen.getByText(/Transparent Methodology & AI-Assisted Tool Disclosure/i)).toBeInTheDocument();
  });

  it("a new project has no stand-in author or declarations and is not certified", async () => {
    vi.mocked(api.getProject).mockResolvedValue({
      ...baseProject,
      authors: [],
      answers: {
        working_title: "My Article",
        word_budget_blueprint: baseProject.answers.word_budget_blueprint,
        manuscript_markdown: baseProject.answers.manuscript_markdown,
        user_data_entries: baseProject.answers.user_data_entries,
      },
    });
    render(
      <ResearchProvider projectId="proj-step-d" initialStage="export" onStageChangeCallback={vi.fn()}>
        <AuditExportMode />
      </ResearchProvider>
    );
    await waitFor(() => expect((screen.getByLabelText(/Full Article Title/i) as HTMLInputElement).value).toBe("My Article"));
    expect((screen.getByLabelText(/Author Name\(s\)/i) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/ORCID iD/i) as HTMLInputElement).value).toBe("");
    for (const name of [/Data Availability Statement/i, /Competing Interests Statement/i, /CRediT Statement/i, /AI Disclosure Statement/i]) {
      expect((screen.getByRole("textbox", { name }) as HTMLTextAreaElement).value).toBe("");
    }
    expect(document.body.textContent).not.toMatch(/Rostova|Oxford|0000-0002-1825-0097|no known competing/);
    expect(screen.getByText(/Gate G7: ACTION REQUIRED/i)).toBeInTheDocument();
  });

  it("an empty manuscript passes no text checks: 0 of 5 and nothing to check yet", async () => {
    vi.mocked(api.getProject).mockResolvedValue({ ...baseProject, authors: [], answers: { working_title: "Empty" } });
    render(
      <ResearchProvider projectId="proj-step-d" initialStage="export" onStageChangeCallback={vi.fn()}>
        <AuditExportMode />
      </ResearchProvider>
    );
    await waitFor(() => expect(screen.getAllByText("Nothing to check yet")).toHaveLength(2));
    expect(screen.getByText(/^0 of 5 checks pass$/)).toBeInTheDocument();
    expect(screen.getByText("No word target set in Blueprint")).toBeInTheDocument();
    expect(screen.queryByText(/No problems found|all resolved/)).not.toBeInTheDocument();
  });

  it("offers a data-availability draft naming the author's datasets, only on request", async () => {
    vi.mocked(api.getProject).mockResolvedValue({
      ...baseProject,
      answers: { ...baseProject.answers, data_availability_statement: "" },
    });
    render(
      <ResearchProvider projectId="proj-step-d" initialStage="export" onStageChangeCallback={vi.fn()}>
        <AuditExportMode />
      </ResearchProvider>
    );
    const area = (await screen.findByRole("textbox", { name: /Data Availability Statement/i })) as HTMLTextAreaElement;
    expect(area.value).toBe("");
    fireEvent.click(await screen.findByRole("button", { name: "Start from my datasets" }));
    expect(area.value).toContain("FPGA Latency Benchmark Data");
  });

  it("appends formatted 2026 declarations to manuscript end-matter and saves to project answers", async () => {
    render(
      <ResearchProvider projectId="proj-step-d" initialStage="export" onStageChangeCallback={vi.fn()}>
        <AuditExportMode />
      </ResearchProvider>
    );

    await waitFor(() => {
      const dataAvailArea = screen.getByRole("textbox", {
        name: /Data Availability Statement/i,
      }) as HTMLTextAreaElement;
      expect(dataAvailArea.value).toContain("Benchmark data are available");
    });

    const appendButton = screen.getByRole("button", {
      name: /Append Declarations to Manuscript End-Matter/i,
    });
    fireEvent.click(appendButton);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-step-d",
        expect.objectContaining({
          data_availability_statement: expect.stringContaining("Benchmark data are available"),
          competing_interests_statement: expect.any(String),
          credit_statement: expect.any(String),
          ai_disclosure_statement: expect.any(String),
          manuscript_markdown: expect.stringContaining("## Declarations"),
        })
      );
      expect(
        screen.getByText(/Declarations successfully appended to manuscript end-matter!/i)
      ).toBeInTheDocument();
    });
  });

  it("renders submission layout toggles and metadata inputs", async () => {
    render(
      <ResearchProvider projectId="proj-step-d" initialStage="export" onStageChangeCallback={vi.fn()}>
        <AuditExportMode />
      </ResearchProvider>
    );

    await waitFor(() => {
      const titleInput = screen.getByLabelText(/Full Article Title/i) as HTMLInputElement;
      expect(titleInput.value).toBe("Provable Bounds in Autonomous Research Workflows");
    });

    // Layout buttons
    expect(screen.getByText(/1-Column Double-Spaced/i)).toBeInTheDocument();
    expect(screen.getByText(/2-Column Camera-Ready/i)).toBeInTheDocument();

    // Toggle to 2-Column Camera-Ready
    const twoColButton = screen.getByRole("button", { name: /2-Column Camera-Ready/i });
    fireEvent.click(twoColButton);

    // Citation style selector
    const citationSelect = screen.getByRole("combobox", {
      name: /Citation & Bibliography Style/i,
    }) as HTMLSelectElement;
    expect(citationSelect.value).toBe("apa7");
    fireEvent.change(citationSelect, { target: { value: "ieee" } });
    expect(citationSelect.value).toBe("ieee");

    // Title Page metadata inputs
    const runningHeadInput = screen.getByLabelText(/Running Head/i) as HTMLInputElement;
    expect(runningHeadInput.value).toBe("PROVABLE BOUNDS IN AUTONOMOUS WORKFLOWS");

    const authorInput = screen.getByLabelText(/Author Name\(s\)/i) as HTMLInputElement;
    expect(authorInput.value).toBe("Elena Rostova");

    const orcidInput = screen.getByLabelText(/ORCID iD/i) as HTMLInputElement;
    expect(orcidInput.value).toBe("0000-0002-1825-0097");
  });

  it("triggers 1-click downloads for DOCX manuscript, PDF manuscript, and standalone Referee Response Letter", async () => {
    const mockBlob = new Blob(["mock-docx-data"], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    vi.mocked(api.downloadProjectExportBlob).mockResolvedValue(mockBlob);
    vi.mocked(api.downloadRefereeResponseLetterBlob).mockResolvedValue(mockBlob);

    render(
      <ResearchProvider projectId="proj-step-d" initialStage="export" onStageChangeCallback={vi.fn()}>
        <AuditExportMode />
      </ResearchProvider>
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Download Journal Manuscript \(\.docx\)/i })
      ).toBeInTheDocument();
    });

    // 1. Download Journal Manuscript (.docx)
    const docxBtn = screen.getByRole("button", {
      name: /Download Journal Manuscript \(\.docx\)/i,
    });
    fireEvent.click(docxBtn);

    await waitFor(() => {
      expect(api.downloadProjectExportBlob).toHaveBeenCalledWith(
        "proj-step-d",
        "docx",
        expect.any(Object)
      );
      expect(
        screen.getByText(/Downloaded Journal Submission \(\.docx\) successfully/i)
      ).toBeInTheDocument();
    });

    // 2. Download Camera-Ready (.pdf)
    const pdfBtn = screen.getByRole("button", {
      name: /Download Camera-Ready Manuscript \(\.pdf\)/i,
    });
    fireEvent.click(pdfBtn);

    await waitFor(() => {
      expect(api.downloadProjectExportBlob).toHaveBeenCalledWith(
        "proj-step-d",
        "pdf",
        expect.any(Object)
      );
    });

    // 3. Download Point-by-Point Referee Response Letter (.docx)
    const letterBtn = screen.getByRole("button", {
      name: /Download Point-by-Point Referee Response Letter \(\.docx\)/i,
    });
    fireEvent.click(letterBtn);

    await waitFor(() => {
      expect(api.downloadRefereeResponseLetterBlob).toHaveBeenCalledWith("proj-step-d");
      expect(
        screen.getByText(/Downloaded Referee_Response_Letter\.docx successfully/i)
      ).toBeInTheDocument();
    });

    // 4. Secondary quick-export buttons (LaTeX, Typst, Markdown)
    const latexBtn = screen.getByRole("button", { name: /LaTeX \(\.tex\)/i });
    expect(latexBtn).toBeInTheDocument();
    fireEvent.click(latexBtn);

    const typstBtn = screen.getByRole("button", { name: /Typst \(\.typ\)/i });
    expect(typstBtn).toBeInTheDocument();
    fireEvent.click(typstBtn);

    const mdBtn = screen.getByRole("button", { name: /Markdown \(\.md\)/i });
    expect(mdBtn).toBeInTheDocument();
    fireEvent.click(mdBtn);
  });
});
