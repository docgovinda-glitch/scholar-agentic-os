// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import FinalEditorStage from "../stages/FinalEditorStage";
import type { ProjectView } from "../../types";

// Mock API
vi.mock("../../api", () => ({
  authedFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: [] }),
  }),
  authedJsonFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: [] }),
  }),
  saveIntakeAnswers: vi.fn().mockResolvedValue({ ok: true }),
}));

import { authedFetch, saveIntakeAnswers } from "../../api";

const mockProject: ProjectView = {
  projectId: "proj-editor-01",
  outputTypeId: "journal_article",
  intakeCompleteness: 0.99,
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
        title: "Deterministic provenance verification in multi-agent synthesis",
      },
    ]),
    selected_journal_name: "Nature Machine Intelligence",
    assembled_draft: `# Provable Provenance Bounds in Autonomous Scientific Reasoning

## Abstract
Autonomous reasoning architectures demonstrate reproducible variance reduction across multi-agent benchmarks. However, established formalisms fail to guarantee deterministic convergence bounds in decentralized synthesis—inducing systemic failure modes under adversarial epistemic divergence. We introduce a deterministic verification operator that bounds latency and preserves provenance across distributed reasoning nodes.

## 1. Introduction
Multi-agent synthesis workflows require continuous verification to prevent cumulative hallucination cascade. In this paper, we formulate provable provenance bounds that guarantee convergence under bounded communication regimes.

## 2. Methodology & Formal Bounds
To substantiate tractability, we establish Lemma 1: Under symmetric sparse communication topologies, the bipartite matching operator terminates in O(V · E log V) steps, strictly bounding computational overhead and preventing algorithmic stall.

## 3. Empirical Results
Empirical evaluation against standard multi-agent benchmarks demonstrates a 94.2% fidelity rate (95% CI: [92.8%, 95.6%], p < 0.001). Runtime overhead remained bounded under 42ms per decision cycle up to n=128 participating agents.

## 4. Discussion & Validity Threats
Threats to Validity & Boundary Conditions: While our proofs hold under bounded Byzantine failure regimes (f < n/3), stochastic packet loss exceeding 35% induces graceful latency degradation rather than catastrophic divergence.

## 5. References
1. Vaswani, A. et al. (2024). Empirical Grounding in Autonomous Academic Synthesis. Journal of AI Research, 45(2), 112-128.
2. Lamport, L. et al. (2023). Addressing Methodological Latency in Distributed Consensus. Distributed Systems Review, 19(4), 401-419.`,
  },
};

describe("Stage 23: Final Editor (FinalEditorStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Stage 23 header, Phase V badge, Grounding Foundation ribbon, live stats HUD, and initial studio", () => {
    render(
      <FinalEditorStage
        stage="final_editor"
        projectId="proj-editor-01"
        project={mockProject}
      />
    );

    // Header & Phase badge
    expect(screen.getByText(/Phase V: Publication • Stage 23 of 25/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /23\. Final Editor/i })).toBeInTheDocument();

    // Grounding ribbon
    expect(screen.getByText(/Grounding Foundation:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Provable Provenance Bounds in Autonomous Scientific Reasoning/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Nature Machine Intelligence/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Revisions Integrated/i)).toBeInTheDocument();

    // Live Stats HUD
    expect(screen.getAllByText(/words/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/chars/i)).toBeInTheDocument();
    expect(screen.getByText(/min read/i)).toBeInTheDocument();
    expect(screen.getByText(/Post-Grad/i)).toBeInTheDocument();

    // Textarea editor
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue(mockProject.answers.assembled_draft);
  });

  it("supports academic toolbar formatting buttons (bold, italic, citation, math)", () => {
    render(
      <FinalEditorStage
        stage="final_editor"
        projectId="proj-editor-01"
        project={mockProject}
      />
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    // Click Bold button
    const boldBtn = screen.getByTitle(/Bold \(\*\*text\*\*\)/i);
    fireEvent.click(boldBtn);
    expect(textarea.value).toContain("**bold text**");

    // Click Cite button
    const citeBtn = screen.getByTitle(/Insert Citation Tag/i);
    fireEvent.click(citeBtn);
    expect(textarea.value).toContain("[@CitationRef2024]");

    // Click Math button
    const mathBtn = screen.getByTitle(/Insert Math \/ Equation/i);
    fireEvent.click(mathBtn);
    expect(textarea.value).toContain("$$ E = mc^2 $$");
  });

  it("renders outline sidebar and allows jumping to sections and toggling sidebar", () => {
    render(
      <FinalEditorStage
        stage="final_editor"
        projectId="proj-editor-01"
        project={mockProject}
      />
    );

    // Outline headings
    expect(screen.getByText(/Manuscript Outline/i)).toBeInTheDocument();
    expect(screen.getByText(/^Abstract$/i)).toBeInTheDocument();
    expect(screen.getByText(/^1\. Introduction$/i)).toBeInTheDocument();
    expect(screen.getByText(/^2\. Methodology & Formal Bounds$/i)).toBeInTheDocument();

    // Toggle outline
    const toggleOutlineBtn = screen.getByRole("button", { name: /Hide Outline/i });
    fireEvent.click(toggleOutlineBtn);
    expect(screen.queryByText(/Manuscript Outline/i)).not.toBeInTheDocument();

    // Restore outline
    const showOutlineBtn = screen.getByRole("button", { name: /Show Outline/i });
    fireEvent.click(showOutlineBtn);
    expect(screen.getByText(/Manuscript Outline/i)).toBeInTheDocument();
  });

  it("switches view modes between Split, Editor only, and Typeset Preview", () => {
    render(
      <FinalEditorStage
        stage="final_editor"
        projectId="proj-editor-01"
        project={mockProject}
      />
    );

    // Default split view: both Markdown Editor header and Typeset Preview header exist
    expect(screen.getByText(/^Markdown Editor$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Typeset Manuscript Preview$/i)).toBeInTheDocument();

    // Switch to Editor only
    const editorTab = screen.getByRole("button", { name: /^Editor$/i });
    fireEvent.click(editorTab);
    expect(screen.getByText(/^Markdown Editor$/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Typeset Manuscript Preview$/i)).not.toBeInTheDocument();

    // Switch to Typeset Preview only
    const previewTab = screen.getByRole("button", { name: /^Typeset Preview$/i });
    fireEvent.click(previewTab);
    expect(screen.queryByText(/^Markdown Editor$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/^Typeset Manuscript Preview$/i)).toBeInTheDocument();

    // Switch back to Split
    const splitTab = screen.getByRole("button", { name: /^Split$/i });
    fireEvent.click(splitTab);
    expect(screen.getByText(/^Markdown Editor$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Typeset Manuscript Preview$/i)).toBeInTheDocument();
  });

  it("advances deliberately to Stage 24 (publication_readiness) upon user approval, persisting assembled draft and DOES NOT auto-advance", async () => {
    const onAdvanceMock = vi.fn();
    const onSavedMock = vi.fn();

    render(
      <FinalEditorStage
        stage="final_editor"
        projectId="proj-editor-01"
        project={mockProject}
        onSaved={onSavedMock}
        onAdvance={onAdvanceMock}
      />
    );

    // Verify NO auto-advance after timeout
    await new Promise((r) => setTimeout(r, 400));
    expect(onAdvanceMock).not.toHaveBeenCalled();

    // Deliberate user action
    const advanceBtn = screen.getByRole("button", {
      name: /Approve Manuscript & Proceed to Readiness Gate →/i,
    });
    fireEvent.click(advanceBtn);

    await waitFor(() => {
      expect(saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-editor-01",
        expect.objectContaining({
          assembled_draft: expect.any(String),
          manuscript_draft: expect.any(String),
          final_editor_completed: "true",
          final_editor_status: "approved",
        })
      );
      expect(onSavedMock).toHaveBeenCalled();
      expect(onAdvanceMock).toHaveBeenCalledWith("publication_readiness");
    });
  });
});
