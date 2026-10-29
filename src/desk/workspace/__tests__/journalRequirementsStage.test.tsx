// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import JournalRequirementsStage from "../stages/JournalRequirementsStage";
import * as api from "../../api";
import type { ProjectView } from "../../types";

vi.mock("../../api", () => ({
  authedStreamFetch: vi.fn(),
  saveIntakeAnswers: vi.fn(),
}));

const mockProjectWithTargetJournal: ProjectView = {
  projectId: "proj-rules-1601",
  outputTypeId: "OT-10",
  answers: {
    working_title: "Sub-Second Byzantine Agreement Under Asymmetric Partitions",
    primary_research_question: "How do dynamic quorum adjustments preserve throughput during WAN splits?",
    research_area: "Computer Science & Distributed Systems",
    article_type: "Original Research",
    study_design: "Empirical Benchmarking",
    target_journal: "IEEE Transactions on Dependable and Secure Computing",
    identified_gaps: JSON.stringify([
      {
        id: "gap-1",
        title: "Sub-Second Byzantine Agreement Under Asymmetric Partitions",
        gap_type: "empirical",
      },
    ]),
    anchor_gap_id: "gap-1",
    approved_vault_sources: JSON.stringify([
      { id: "v-src-1", title: "PBFT and Proactive Recovery" },
    ]),
    approved_external_sources: JSON.stringify([
      { id: "ext-1", title: "Dynamic Partitions in Wide-Area Consensus Networks" },
    ]),
    primary_datasets: JSON.stringify([
      { id: "ds-1", name: "wan_partition_benchmarks.csv", rowCount: 154200 },
    ]),
    evidence_matrix: JSON.stringify([
      {
        id: "cluster-1",
        theme: "Throughput Collapse in Static Byzantine Quorums",
        strength: "Very High",
      },
    ]),
  },
  authors: [],
  intakeCompleteness: 0.9,
  hasDocument: false,
  hasJournalRequirements: false,
  gates: [],
};

describe("Stage 16: Journal Rules & Requirements (JournalRequirementsStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.saveIntakeAnswers as any).mockImplementation(
      async (id: string, answers: Record<string, string>) => ({
        ...mockProjectWithTargetJournal,
        answers: { ...mockProjectWithTargetJournal.answers, ...answers },
      })
    );
  });

  it("renders Stage 16 header, Grounding Foundation ribbon, and initial extraction state", () => {
    render(
      <JournalRequirementsStage
        stage="journal_requirements"
        projectId="proj-rules-1601"
        project={mockProjectWithTargetJournal}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: /^Journal Rules$/i })).toBeInTheDocument();
    expect(screen.getByText(/Phase III: Drafting • Stage 16 of 25/i)).toBeInTheDocument();
    expect(screen.getAllByText(/IEEE Transactions on Dependable and Secure Computing/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Sub-Second Byzantine Agreement Under Asymmetric Partitions/i)).toBeInTheDocument();
    expect(screen.getByText(/Citations/i)).toBeInTheDocument();
    expect(screen.getByText(/Datasets/i)).toBeInTheDocument();
    expect(screen.getByText(/Clusters/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Extract Constraints/i })).toBeInTheDocument();
  });

  it("triggers guideline extraction agent and renders 4-pillar rubric matrix", async () => {
    (api.authedStreamFetch as any).mockImplementation(
      async (url: string, method: string, body: any, onEvent: any) => {
        onEvent("log", { message: "Reading IEEE author guidelines..." });
        onEvent("chunk", { chunk: "Distilling section limits and bibliography standards..." });
        onEvent("done", {
          data: {
            max_words: 9500,
            abstract_limit_words: 250,
            citation_style: "IEEE Transactions Numerical",
            citation_bracket_format: "[1]",
            bibliography_ordering: "order_of_appearance",
            required_sections: [
              "Abstract",
              "Introduction",
              "System Model",
              "Evaluation",
              "Conclusion",
            ],
            formatting_rules: [
              "Two-column IEEE standard",
              "300 DPI vector figures",
            ],
            blind_review_model: "Double-Blind",
            data_availability_policy: "Mandatory Zenodo replication package",
            code_repository_policy: "Artifact evaluation badge eligible",
          },
        });
      }
    );

    render(
      <JournalRequirementsStage
        stage="journal_requirements"
        projectId="proj-rules-1601"
        project={mockProjectWithTargetJournal}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    const extractBtn = screen.getByRole("button", { name: /Extract Constraints/i });
    fireEvent.click(extractBtn);

    await waitFor(() => {
      expect(screen.getByText(/9,500 words/i)).toBeInTheDocument();
      expect(screen.getByText(/250 words/i)).toBeInTheDocument();
      expect(screen.getAllByText(/IEEE Transactions Numerical/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/System Model/i)).toBeInTheDocument();
      expect(screen.getByText(/Mandatory Zenodo replication package/i)).toBeInTheDocument();
      expect(screen.getByText(/Two-column IEEE standard/i)).toBeInTheDocument();
    });
  });

  it("fills in nothing and says so when extraction fails", async () => {
    // Rewritten 2026-10-29: this used to assert rules invented from the
    // journal's name ("10,000 words", "Theoretical Byzantine Formulation").
    (api.authedStreamFetch as any).mockRejectedValue(new Error("Timeout reaching OpenRouter"));

    render(
      <JournalRequirementsStage
        stage="journal_requirements"
        projectId="proj-rules-1601"
        project={mockProjectWithTargetJournal}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Extract Constraints/i }));

    await waitFor(() => {
      expect(screen.getByText(/Requirements extraction unavailable: nothing was filled in/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Theoretical Byzantine Formulation/i)).not.toBeInTheDocument();
  });

  it("allows interactive section taxonomy editing (adding, reordering, removing sections)", async () => {
    const projectWithSavedConstraints: ProjectView = {
      ...mockProjectWithTargetJournal,
      answers: {
        ...mockProjectWithTargetJournal.answers,
        journal_constraints: JSON.stringify({
          max_words: 8000,
          citation_style: "IEEE Transactions Numerical",
          required_sections: ["Abstract", "Introduction", "Empirical Evaluation", "Conclusion"],
          formatting_rules: ["Standard double column"],
        }),
      },
    };

    render(
      <JournalRequirementsStage
        stage="journal_requirements"
        projectId="proj-rules-1601"
        project={projectWithSavedConstraints}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getByText(/Empirical Evaluation/i)).toBeInTheDocument();

    // 1. Add new section
    const appendBtn = screen.getByRole("button", { name: /Append Section/i });
    fireEvent.click(appendBtn);

    const input = screen.getByPlaceholderText(/System Model & Assumptions/i);
    fireEvent.change(input, { target: { value: "Security Proofs & Quorums" } });

    const addBtn = screen.getByRole("button", { name: /^Add$/i });
    fireEvent.click(addBtn);

    expect(screen.getByText(/Security Proofs & Quorums/i)).toBeInTheDocument();

    // 2. Remove section
    const removeBtn = screen.getByRole("button", { name: /Remove Empirical Evaluation/i });
    fireEvent.click(removeBtn);

    expect(screen.queryByText(/Empirical Evaluation/i)).not.toBeInTheDocument();

    // 3. Move section
    const moveDownBtn = screen.getByRole("button", { name: /Move Abstract down/i });
    fireEvent.click(moveDownBtn);
  });

  it("opens customization modal and updates rubric parameters", async () => {
    const projectWithSavedConstraints: ProjectView = {
      ...mockProjectWithTargetJournal,
      answers: {
        ...mockProjectWithTargetJournal.answers,
        journal_constraints: JSON.stringify({
          max_words: 8000,
          abstract_limit_words: 250,
          citation_style: "APA 7th Edition",
          required_sections: ["Abstract", "Introduction", "Conclusion"],
          formatting_rules: ["Single column standard"],
        }),
      },
    };

    render(
      <JournalRequirementsStage
        stage="journal_requirements"
        projectId="proj-rules-1601"
        project={projectWithSavedConstraints}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    const customizeBtn = screen.getByRole("button", { name: /Customize Rubric/i });
    fireEvent.click(customizeBtn);

    expect(screen.getByText(/Customize Submission Constraints/i)).toBeInTheDocument();

    // Update word limit
    const wordInput = screen.getByDisplayValue("8000");
    fireEvent.change(wordInput, { target: { value: "11500" } });

    // Update citation style
    const citationInput = screen.getByDisplayValue("APA 7th Edition");
    fireEvent.change(citationInput, { target: { value: "ACM Reference Format (Numerical)" } });

    const applyBtn = screen.getByRole("button", { name: /Apply Rubric Changes/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(screen.getByText(/11,500 words/i)).toBeInTheDocument();
      expect(screen.getAllByText(/ACM Reference Format \(Numerical\)/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it("locks submission rubric and advances to Stage 17 (draft)", async () => {
    const onAdvanceMock = vi.fn();
    const projectWithSavedConstraints: ProjectView = {
      ...mockProjectWithTargetJournal,
      answers: {
        ...mockProjectWithTargetJournal.answers,
        journal_constraints: JSON.stringify({
          max_words: 9000,
          citation_style: "IEEE Transactions Numerical",
          required_sections: ["Abstract", "Introduction", "Methods", "Results", "Conclusion"],
          formatting_rules: ["IEEE format"],
        }),
      },
    };

    render(
      <JournalRequirementsStage
        stage="journal_requirements"
        projectId="proj-rules-1601"
        project={projectWithSavedConstraints}
        onSaved={vi.fn()}
        onAdvance={onAdvanceMock}
      />
    );

    const lockBtn = screen.getByRole("button", {
      name: /Lock Submission Rubric & Proceed to AI Drafting/i,
    });
    fireEvent.click(lockBtn);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-rules-1601",
        expect.objectContaining({
          journal_requirements_completed: "true",
        })
      );
      expect(onAdvanceMock).toHaveBeenCalledWith("draft");
    });
  });
});
