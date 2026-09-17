// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TitleSelectionStage from "../stages/TitleSelectionStage";
import * as api from "../../api";
import type { ProjectView } from "../../types";

vi.mock("../../api", () => ({
  saveIntakeAnswers: vi.fn(),
  executeAgenticLLM: vi.fn(),
}));

const mockProjectEmpty: ProjectView = {
  projectId: "proj-title-101",
  outputTypeId: "OT-10",
  answers: {
    working_title: "",
    selected_gap_title: "Sub-Second Byzantine Agreement Under Asymmetric Partitions",
    target_journal: "ACM Transactions on Computer Systems",
  },
  authors: [],
  intakeCompleteness: 0.5,
  hasDocument: false,
  hasJournalRequirements: false,
  gates: [],
};

const mockProjectWithTitles: ProjectView = {
  projectId: "proj-title-202",
  outputTypeId: "OT-10",
  answers: {
    working_title: "Sub-Second Byzantine Agreement Under Partitions",
    selected_gap_title: "Sub-Second Byzantine Agreement Under Asymmetric Partitions",
    selected_gap_description: "Real-world edge nodes suffer intermittent disconnects.",
    selected_gaps: JSON.stringify(["gap-1", "gap-2"]),
    target_journal: "ACM Transactions on Computer Systems",
    generated_titles: JSON.stringify([
      {
        id: "title-1",
        title_text: "Sub-Second Byzantine Agreement Under Asymmetric Partitions",
        subtitle_text: "An Adaptive Quorum Architecture for Edge Networks",
        archetype: "compound",
        rationale: "Clearly pairs the breakthrough with the operational mechanism.",
        status: "proposed",
      },
      {
        id: "title-2",
        title_text: "Accelerating Byzantine Consensus Across Partial Network Splits",
        subtitle_text: null,
        archetype: "declarative",
        rationale: "Action-oriented declarative title maximizing search discoverability.",
        status: "proposed",
      },
      {
        id: "title-3",
        title_text: "A Mechanized Protocol for Dynamic Membership in Partitioned Clusters",
        subtitle_text: null,
        archetype: "methodological",
        rationale: "Focuses on formal proofs and engineering architecture.",
        status: "proposed",
      },
    ]),
  },
  authors: [],
  intakeCompleteness: 0.8,
  hasDocument: false,
  hasJournalRequirements: false,
  gates: [],
};

describe("Stage 5: Title Suggestions (TitleSelectionStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.saveIntakeAnswers as any).mockImplementation((_id: string, answers: any) =>
      Promise.resolve({ ...mockProjectWithTitles, answers })
    );
  });

  it("renders hero prompt when no titles have been generated yet", () => {
    render(
      <TitleSelectionStage
        stage="title_selection"
        projectId="proj-title-101"
        project={mockProjectEmpty}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getByText(/Synthesize Publication-Ready Titles/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate Title Proposals/i })).toBeInTheDocument();
  });

  it("displays grounding foundation banner with anchor gap and target journal", () => {
    render(
      <TitleSelectionStage
        stage="title_selection"
        projectId="proj-title-202"
        project={mockProjectWithTitles}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getByText(/Grounding Foundation:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Sub-Second Byzantine Agreement Under Asymmetric Partitions/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/ACM Transactions on Computer Systems/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/\+1 Supporting/i)).toBeInTheDocument();
  });

  it("renders candidate titles with archetypes and editorial rationales", () => {
    render(
      <TitleSelectionStage
        stage="title_selection"
        projectId="proj-title-202"
        project={mockProjectWithTitles}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getByText(/Colon Compound Archetype/i)).toBeInTheDocument();
    expect(screen.getByText(/Declarative Archetype/i)).toBeInTheDocument();
    expect(screen.getByText(/Methodological Archetype/i)).toBeInTheDocument();

    expect(screen.getByText(/Clearly pairs the breakthrough with the operational mechanism/i)).toBeInTheDocument();
    expect(screen.getByText(/An Adaptive Quorum Architecture for Edge Networks/i)).toBeInTheDocument();
  });

  it("calculates real-time word and character metrics for active title", () => {
    render(
      <TitleSelectionStage
        stage="title_selection"
        projectId="proj-title-202"
        project={mockProjectWithTitles}
        onAdvance={vi.fn()}
      />
    );

    // "Sub-Second Byzantine Agreement Under Partitions" has 5 space-delimited words
    expect(screen.getByText(/5 words/i)).toBeInTheDocument();
    expect(screen.getByText(/chars/i)).toBeInTheDocument();
  });

  it("allows adopting a candidate title and marks it adopted", async () => {
    render(
      <TitleSelectionStage
        stage="title_selection"
        projectId="proj-title-202"
        project={mockProjectWithTitles}
        onAdvance={vi.fn()}
      />
    );

    const adoptButtons = screen.getAllByRole("button", { name: /Adopt Title/i });
    expect(adoptButtons.length).toBeGreaterThan(0);

    // Adopt the second title
    fireEvent.click(adoptButtons[1]);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-title-202",
        expect.objectContaining({
          working_title: "Accelerating Byzantine Consensus Across Partial Network Splits",
          current_stage: "title_selection",
        })
      );
    });
  });

  it("advances to Stage 6 (title_lock) when clicking Review & Finalize Title", async () => {
    const onAdvanceMock = vi.fn();
    render(
      <TitleSelectionStage
        stage="title_selection"
        projectId="proj-title-202"
        project={mockProjectWithTitles}
        onAdvance={onAdvanceMock}
      />
    );

    const finalizeBtn = screen.getByRole("button", { name: /Review & Finalize Title \(Stage 6\)/i });
    fireEvent.click(finalizeBtn);

    await waitFor(() => {
      expect(onAdvanceMock).toHaveBeenCalledWith("title_lock");
    });
  });

  it("executes title lock and advances to Phase II when clicking Lock Title & Advance", async () => {
    const onAdvanceMock = vi.fn();
    render(
      <TitleSelectionStage
        stage="title_selection"
        projectId="proj-title-202"
        project={mockProjectWithTitles}
        onAdvance={onAdvanceMock}
      />
    );

    const lockBtn = screen.getByRole("button", { name: /Lock Title & Advance/i });
    fireEvent.click(lockBtn);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-title-202",
        expect.objectContaining({
          title_locked: "true",
          current_stage: "vault_sources",
        })
      );
      expect(onAdvanceMock).toHaveBeenCalledWith("vault_sources");
    });
  });
});
