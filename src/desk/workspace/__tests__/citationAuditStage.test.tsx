// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import CitationAuditStage from "../stages/CitationAuditStage";
import type { ProjectView } from "../../types";

// Mock API
vi.mock("../../api", () => ({
  authedStreamFetch: vi.fn(),
  saveIntakeAnswers: vi.fn().mockResolvedValue({ ok: true }),
}));

import { authedStreamFetch, saveIntakeAnswers } from "../../api";

const mockProject: ProjectView = {
  projectId: "proj-citation-audit",
  outputTypeId: "journal_article",
  intakeCompleteness: 0.95,
  hasDocument: true,
  hasJournalRequirements: true,
  authors: [],
  gates: [],
  answers: {
    working_title: "Provable Provenance Bounds in Autonomous Scientific Reasoning",
    anchor_gap_id: "gap-attr-01",
    identified_gaps: JSON.stringify([
      {
        id: "gap-attr-01",
        title: "Absence of deterministic provenance verification in multi-agent synthesis",
      },
    ]),
    selected_journal_name: "Nature Machine Intelligence",
    approved_vault_sources: JSON.stringify([
      {
        id: "v-01",
        title: "Empirical Grounding in Autonomous Academic Synthesis",
        authors: "Vaswani, A. et al.",
        year: 2024,
        doi: "10.1038/s41586-024-001",
      },
      {
        id: "v-02",
        title: "Provable Provenance Bounds in Scientific Language Generation",
        authors: "Kaplan, J. & Henighan, T.",
        year: 2023,
        doi: "10.1145/3543873",
      },
    ]),
    approved_external_sources: JSON.stringify([
      {
        id: "ext-01",
        title: "Addressing Methodological Latency in Distributed Consensus",
        authors: "Lamport, L. et al.",
        year: 2023,
        doi: "10.1145/357112",
      },
    ]),
    manuscript_draft: JSON.stringify([
      {
        section: "Introduction",
        word_count: 850,
        content: "Autonomous reasoning architectures demonstrate an average variance reduction of 28.4% when anchored to validated knowledge graphs [1].",
      },
      {
        section: "Methodology",
        word_count: 1200,
        content: "The mathematical formulation of the provenance matrix relies on deterministic bipartite claim-to-evidence projections [2].",
      },
    ]),
    journal_requirements_extracted: JSON.stringify({
      citationStyle: "Nature / Superscript",
      maxWords: 5000,
    }),
  },
};

describe("Stage 18: Citation Provenance & Claim Audit (CitationAuditStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Stage 18 header, Phase III badge, Grounding Foundation ribbon, and initial state", () => {
    render(
      <CitationAuditStage
        stage="citation_audit"
        projectId="proj-citation-audit"
        project={mockProject}
      />
    );

    // Header & phase badge
    expect(screen.getByText(/Phase III: Manuscript Drafting • Stage 18 of 25/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /18\. Citation Audit/i })).toBeInTheDocument();

    // Grounding ribbon
    expect(screen.getByText(/Grounding Foundation:/i)).toBeInTheDocument();
    expect(screen.getByText(/Provable Provenance Bounds in Autonomous Scientific Reasoning/i)).toBeInTheDocument();
    expect(screen.getByText(/Nature Machine Intelligence/i)).toBeInTheDocument();
    expect(screen.getByText(/3 Approved Sources/i)).toBeInTheDocument();

    // Ready prompt & button
    expect(screen.getByText(/Ready for Claim-to-Evidence Citation Audit/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Begin Citation Audit/i })).toBeInTheDocument();
  });

  it("triggers citation audit agent, streams verification claims, and DOES NOT auto-advance", async () => {
    const onAdvanceMock = vi.fn();

    // Setup mock streaming response
    (authedStreamFetch as any).mockImplementation(
      async (url: string, method: string, body: any, onChunk: any) => {
        onChunk("log", { message: "Mapping citations against Vault evidence..." });
        onChunk("done", {
          ok: true,
          data: [
            {
              id: "claim-01",
              claim: "Deterministic bipartite claim-to-evidence projections reduce hallucination by 28.4%.",
              section: "Methodology",
              source: "Empirical Grounding in Autonomous Academic Synthesis",
              authors: "Vaswani, A. et al.",
              year: 2024,
              doi: "10.1038/s41586-024-001",
              status: "verified",
              confidence: 0.99,
              exactQuote: "Multi-agent trials confirmed variance reduction of 28.4% (p < 0.001).",
            },
            {
              id: "claim-02",
              claim: "Uncalibrated out-of-distribution shifts exhibit heightened epistemic uncertainty.",
              section: "Discussion",
              source: "Statistical Integrity in Automated Hypothesis Testing",
              authors: "Fisher, R. & Pearl, J.",
              year: 2024,
              doi: "10.1214/23-AOS1982",
              status: "flagged",
              confidence: 0.74,
              exactQuote: "Out-of-distribution benchmarks indicate epistemic drift.",
            },
          ],
        });
      }
    );

    render(
      <CitationAuditStage
        stage="citation_audit"
        projectId="proj-citation-audit"
        project={mockProject}
        onAdvance={onAdvanceMock}
      />
    );

    const startBtn = screen.getByRole("button", { name: /Begin Citation Audit/i });
    fireEvent.click(startBtn);

    // Wait for audit completion
    await waitFor(() => {
      expect(screen.getByText(/^Claims Audited$/i)).toBeInTheDocument();
    });

    // Verify claims are rendered
    expect(
      screen.getByText(/Deterministic bipartite claim-to-evidence projections reduce hallucination by 28.4%./i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Uncalibrated out-of-distribution shifts exhibit heightened epistemic uncertainty./i)
    ).toBeInTheDocument();

    // Critical assertion: NO auto-advance after timeout
    await new Promise((r) => setTimeout(r, 400));
    expect(onAdvanceMock).not.toHaveBeenCalled();
  });

  it("engages local fallback auditing engine when stream fails and maps claims against vault corpus", async () => {
    (authedStreamFetch as any).mockRejectedValue(new Error("Network drop during citation audit stream"));

    render(
      <CitationAuditStage
        stage="citation_audit"
        projectId="proj-citation-audit"
        project={mockProject}
      />
    );

    const startBtn = screen.getByRole("button", { name: /Begin Citation Audit/i });
    fireEvent.click(startBtn);

    // Fallback activates
    await waitFor(() => {
      expect(screen.getByText(/Provenance Score/i)).toBeInTheDocument();
    });

    // Fallback synthesized claims should exist
    expect(screen.getByText(/Autonomous reasoning architectures demonstrate an average variance reduction/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Verbatim Vault Evidence Chunk:/i).length).toBeGreaterThan(0);
  });

  it("filters claims by tab (All, Verified, Needs Review) and searches by query", async () => {
    (authedStreamFetch as any).mockImplementation(
      async (_url: string, _method: string, _body: any, onChunk: any) => {
        onChunk("done", {
          ok: true,
          data: [
            {
              id: "c1",
              claim: "Alpha verified empirical observation.",
              section: "Results",
              source: "Source Alpha",
              status: "verified",
              confidence: 0.99,
            },
            {
              id: "c2",
              claim: "Beta unanchored theoretical speculation.",
              section: "Discussion",
              source: "Source Beta",
              status: "flagged",
              confidence: 0.65,
            },
          ],
        });
      }
    );

    render(
      <CitationAuditStage
        stage="citation_audit"
        projectId="proj-citation-audit"
        project={mockProject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin Citation Audit/i }));

    await waitFor(() => {
      expect(screen.getByText(/Alpha verified empirical observation/i)).toBeInTheDocument();
    });

    // Filter to Needs Review
    const needsReviewTab = screen.getByRole("button", { name: /Needs Review/i });
    fireEvent.click(needsReviewTab);

    expect(screen.getByText(/Beta unanchored theoretical speculation/i)).toBeInTheDocument();
    expect(screen.queryByText(/Alpha verified empirical observation/i)).not.toBeInTheDocument();

    // Filter to Verified
    const verifiedTab = screen.getByRole("button", { name: /^Verified/i });
    fireEvent.click(verifiedTab);

    expect(screen.getByText(/Alpha verified empirical observation/i)).toBeInTheDocument();
    expect(screen.queryByText(/Beta unanchored theoretical speculation/i)).not.toBeInTheDocument();

    // Filter back to All
    fireEvent.click(screen.getByRole("button", { name: /All Claims/i }));

    // Search filter
    const searchInput = screen.getByPlaceholderText(/Filter claims or sources/i);
    fireEvent.change(searchInput, { target: { value: "Alpha" } });

    expect(screen.getByText(/Alpha verified empirical observation/i)).toBeInTheDocument();
    expect(screen.queryByText(/Beta unanchored theoretical speculation/i)).not.toBeInTheDocument();
  });

  it("toggles manual researcher sign-off and saves custom grounding note on a claim", async () => {
    (authedStreamFetch as any).mockImplementation(
      async (_url: string, _method: string, _body: any, onChunk: any) => {
        onChunk("done", {
          ok: true,
          data: [
            {
              id: "claim-interactive",
              claim: "Attribution is strictly preserved across multi-agent handoffs.",
              section: "Results",
              source: "Source Interactive",
              status: "flagged",
              confidence: 0.7,
            },
          ],
        });
      }
    );

    render(
      <CitationAuditStage
        stage="citation_audit"
        projectId="proj-citation-audit"
        project={mockProject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin Citation Audit/i }));

    await waitFor(() => {
      expect(screen.getByText(/Attribution is strictly preserved across multi-agent handoffs/i)).toBeInTheDocument();
    });

    // Click Sign-Off button
    const signOffBtn = screen.getByRole("button", { name: /Sign-Off/i });
    fireEvent.click(signOffBtn);

    expect(screen.getByText(/Sign-Off Active/i)).toBeInTheDocument();

    // Add custom grounding note
    const addNoteBtn = screen.getByRole("button", { name: /\+ Add Grounding Note/i });
    fireEvent.click(addNoteBtn);

    const noteInput = screen.getByPlaceholderText(/Add researcher grounding clarification/i);
    fireEvent.change(noteInput, { target: { value: "Cross-verified with primary laboratory benchmarks." } });

    const saveNoteBtn = screen.getByRole("button", { name: /Save Note/i });
    fireEvent.click(saveNoteBtn);

    expect(screen.getByText(/Researcher Grounding Note:/i)).toBeInTheDocument();
    expect(screen.getByText(/Cross-verified with primary laboratory benchmarks/i)).toBeInTheDocument();
  });

  it("advances to Stage 19 (originality_check) upon deliberate user confirmation and persists report", async () => {
    const onAdvanceMock = vi.fn();
    const onSavedMock = vi.fn();

    (authedStreamFetch as any).mockImplementation(
      async (_url: string, _method: string, _body: any, onChunk: any) => {
        onChunk("done", {
          ok: true,
          data: [
            {
              id: "c-advance",
              claim: "Provenance verified claim.",
              section: "Introduction",
              source: "Vault Paper",
              status: "verified",
              confidence: 0.99,
            },
          ],
        });
      }
    );

    render(
      <CitationAuditStage
        stage="citation_audit"
        projectId="proj-citation-audit"
        project={mockProject}
        onSaved={onSavedMock}
        onAdvance={onAdvanceMock}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin Citation Audit/i }));

    await waitFor(() => {
      expect(screen.getByText(/Provenance verified claim/i)).toBeInTheDocument();
    });

    // Click the deliberate Advance button in sticky dock
    const advanceBtn = screen.getByRole("button", {
      name: /Confirm Citation Provenance & Proceed to Originality Check/i,
    });
    fireEvent.click(advanceBtn);

    await waitFor(() => {
      expect(saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-citation-audit",
        expect.objectContaining({
          citation_audit_report: expect.any(String),
          citation_audit_summary: expect.any(String),
          citation_audit_verified_at: expect.any(String),
        })
      );
      expect(onSavedMock).toHaveBeenCalled();
      expect(onAdvanceMock).toHaveBeenCalledWith("originality_check");
    });
  });
});
