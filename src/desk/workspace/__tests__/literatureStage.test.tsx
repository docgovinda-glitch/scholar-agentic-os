// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LiteratureStage from "../stages/LiteratureStage";
import * as api from "../../api";
import type { ProjectView } from "../../types";

vi.mock("../../api", () => ({
  saveIntakeAnswers: vi.fn(),
  executeAgenticLLM: vi.fn(),
}));

const mockProjectWithLit: ProjectView = {
  projectId: "proj-lit-202",
  outputTypeId: "OT-10",
  answers: {
    working_title: "Fault-Tolerant Distributed Consensus in Edge Clusters",
    research_area: "Distributed Systems & Machine Learning",
    discovered_literature: JSON.stringify([
      {
        id: "lit-1",
        doi: "10.1145/3318464.3389700",
        title: "Byzantine Fault-Tolerant Consensus at Scale",
        authors: ["Lamport, L.", "Castro, M."],
        year: 2024,
        journal: "ACM Transactions on Computer Systems",
        source: "external",
        relevanceScore: 94,
        themes: ["bft-consensus", "fault-tolerance"],
        abstract: "We introduce an asynchronous consensus protocol providing sub-second finality.",
        isLandmark: false,
      },
      {
        id: "lit-2",
        doi: "10.1109/TSE.2023.1000",
        title: "Formal Verification of Gossip Protocols",
        authors: ["Gao, X.", "Miller, D."],
        year: 2023,
        journal: "IEEE Transactions on Software Engineering",
        source: "vault",
        relevanceScore: 88,
        themes: ["formal-verification", "gossip-protocols"],
        abstract: "A mechanized proof of safety and liveness in heterogeneous edge networks.",
        isLandmark: true,
      },
    ]),
  },
  authors: [],
  intakeCompleteness: 1,
  hasDocument: false,
  hasJournalRequirements: false,
  gates: [],
};

describe("Stage 2: Literature Discovery (LiteratureStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.saveIntakeAnswers as any).mockImplementation((_id: string, answers: any) =>
      Promise.resolve({ ...mockProjectWithLit, answers })
    );
  });

  it("renders literature cards with metadata, DOI links, and relevance scores", () => {
    render(
      <LiteratureStage
        stage="literature"
        projectId="proj-lit-202"
        project={mockProjectWithLit}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getByText(/Byzantine Fault-Tolerant Consensus at Scale/i)).toBeInTheDocument();
    expect(screen.getByText(/Formal Verification of Gossip Protocols/i)).toBeInTheDocument();
    expect(screen.getByText("94%")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument();
    expect(screen.getByText(/⭐ Landmark Paper/i)).toBeInTheDocument();
  });

  it("switches to Thematic Clusters view and groups by themes", () => {
    render(
      <LiteratureStage
        stage="literature"
        projectId="proj-lit-202"
        project={mockProjectWithLit}
        onAdvance={vi.fn()}
      />
    );

    const themesViewBtn = screen.getByRole("button", { name: /Thematic Clusters/i });
    fireEvent.click(themesViewBtn);

    expect(screen.getAllByText(/#bft-consensus/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/#formal-verification/i).length).toBeGreaterThanOrEqual(1);
  });

  it("switches to Table Matrix view", () => {
    render(
      <LiteratureStage
        stage="literature"
        projectId="proj-lit-202"
        project={mockProjectWithLit}
        onAdvance={vi.fn()}
      />
    );

    const tableViewBtn = screen.getByRole("button", { name: /Table Matrix/i });
    fireEvent.click(tableViewBtn);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText(/ACM Transactions on Computer Systems/i)).toBeInTheDocument();
  });

  it("filters literature using the live search query", () => {
    render(
      <LiteratureStage
        stage="literature"
        projectId="proj-lit-202"
        project={mockProjectWithLit}
        onAdvance={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Search literature by title/i);
    fireEvent.change(searchInput, { target: { value: "Byzantine" } });

    expect(screen.getByText(/Byzantine Fault-Tolerant Consensus at Scale/i)).toBeInTheDocument();
    expect(screen.queryByText(/Formal Verification of Gossip Protocols/i)).not.toBeInTheDocument();
  });

  it("toggles landmark status and persists to project answers", async () => {
    render(
      <LiteratureStage
        stage="literature"
        projectId="proj-lit-202"
        project={mockProjectWithLit}
        onAdvance={vi.fn()}
      />
    );

    // Click landmark toggle on the first paper
    const starButtons = screen.getAllByTitle(/Star as Landmark Paper|Unmark Landmark/i);
    fireEvent.click(starButtons[0]);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-lit-202",
        expect.objectContaining({
          current_stage: "literature",
        })
      );
    });
  });

  it("adds a manual source into the corpus", async () => {
    render(
      <LiteratureStage
        stage="literature"
        projectId="proj-lit-202"
        project={mockProjectWithLit}
        onAdvance={vi.fn()}
      />
    );

    // Open manual add modal
    const addBtn = screen.getByRole("button", { name: /Add Source/i });
    fireEvent.click(addBtn);

    const titleInput = screen.getByPlaceholderText(/Attention Is All You Need/i);
    fireEvent.change(titleInput, { target: { value: "A New Theory of Consensus" } });

    const submitBtn = screen.getByText("Add to Corpus");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("A New Theory of Consensus")).toBeInTheDocument();
      expect(api.saveIntakeAnswers).toHaveBeenCalled();
    });
  });

  it("opens the Export References modal with BibTeX format", () => {
    render(
      <LiteratureStage
        stage="literature"
        projectId="proj-lit-202"
        project={mockProjectWithLit}
        onAdvance={vi.fn()}
      />
    );

    const exportBtn = screen.getByText("Export References");
    fireEvent.click(exportBtn);

    expect(screen.getByText("Export Literature References")).toBeInTheDocument();
    expect(screen.getByText(/@article{/i)).toBeInTheDocument();
  });

  it("navigates to gap_identification when clicking proceed", () => {
    const onAdvance = vi.fn();
    render(
      <LiteratureStage
        stage="literature"
        projectId="proj-lit-202"
        project={mockProjectWithLit}
        onAdvance={onAdvance}
      />
    );

    const proceedButtons = screen.getAllByText(/Proceed to Gap Identification/i);
    fireEvent.click(proceedButtons[0]);

    expect(onAdvance).toHaveBeenCalledWith("gap_identification");
  });

  it("never shows synthesized papers: literature comes only from the scholarly indexes", async () => {
    // Rewritten 2026-10-29: this used to assert locally synthesized papers
    // ("Architectural Principles and Empirical Benchmarks…") when AI failed.
    // The stage no longer uses an LLM to find literature at all.
    (api.executeAgenticLLM as any).mockRejectedValue(new Error("AI service unavailable or quota exceeded"));

    const emptyProject: ProjectView = {
      projectId: "proj-lit-empty",
      outputTypeId: "OT-10",
      answers: {
        working_title: "Integrating Rta and Rashi in Computational Astronomy",
        research_area: "Computational Astronomy & Archaeoastronomy",
      },
      authors: [],
      intakeCompleteness: 1,
      hasDocument: false,
      hasJournalRequirements: false,
      gates: [],
    };

    render(
      <LiteratureStage
        stage="literature"
        projectId="proj-lit-empty"
        project={emptyProject}
        onAdvance={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Start Literature Discovery/i }));

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalled();
    });
    expect(api.executeAgenticLLM).not.toHaveBeenCalled();
    expect(screen.queryByText(/Architectural Principles and Empirical Benchmarks/i)).not.toBeInTheDocument();
  });
});
