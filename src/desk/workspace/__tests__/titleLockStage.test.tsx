// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TitleLockStage from "../stages/TitleLockStage";
import * as api from "../../api";
import type { ProjectView } from "../../types";

vi.mock("../../api", () => ({
  saveIntakeAnswers: vi.fn(),
  executeAgenticLLM: vi.fn(),
}));

const mockProjectUnlocked: ProjectView = {
  projectId: "proj-lock-101",
  outputTypeId: "OT-10",
  answers: {
    working_title: "Sub-Second Byzantine Agreement Under Asymmetric Partitions",
    primary_research_question: "How do dynamic quorum adjustments preserve throughput during WAN splits?",
    research_area: "Distributed Systems",
    article_type: "Original Research",
    study_design: "Empirical Benchmarking & Formal Proofs",
    reporting_guideline: "ACM SIGMETRICS 2023",
    target_journal: "ACM Transactions on Computer Systems",
    title_rationale: "Maximizes indexing discoverability and clearly articulates the mechanism.",
    identified_gaps: JSON.stringify([
      {
        id: "gap-1",
        title: "Sub-Second Byzantine Agreement Under Asymmetric Partitions",
        gap_type: "empirical",
        description: "Existing BFT benchmarks assume symmetric network partitions.",
        importance_score: 95,
        feasibility_score: 88,
        grounding_sources: ["Lamport & Castro (2024)"],
      },
    ]),
    selected_gaps: JSON.stringify(["gap-1"]),
    anchor_gap_id: "gap-1",
    selected_gap: "gap-1",
    discovered_literature: JSON.stringify([
      { id: "lit-1", title: "Byzantine Fault-Tolerant Consensus", isLandmark: true },
      { id: "lit-2", title: "Formal Verification of Gossip", isLandmark: false },
    ]),
    authors: JSON.stringify([
      {
        id: "a-1",
        name: "Dr. Elena Rostova",
        affiliation: "Distributed Systems Lab",
        isCorresponding: true,
        creditRoles: ["Conceptualization", "Methodology", "Writing - original draft"],
      },
    ]),
    title_locked: "false",
  },
  authors: [],
  intakeCompleteness: 0.9,
  hasDocument: false,
  hasJournalRequirements: false,
  gates: [],
};

const mockProjectLocked: ProjectView = {
  ...mockProjectUnlocked,
  projectId: "proj-lock-202",
  answers: {
    ...mockProjectUnlocked.answers,
    title_locked: "true",
  },
};

describe("Stage 6: Title Finalization / Lock (TitleLockStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.saveIntakeAnswers as any).mockImplementation((_id: string, answers: any) =>
      Promise.resolve({ ...mockProjectUnlocked, answers })
    );
  });

  it("renders the Executive Research Charter with all Phase I sections", () => {
    render(
      <TitleLockStage
        stage="title_lock"
        projectId="proj-lock-101"
        project={mockProjectUnlocked}
        onAdvance={vi.fn()}
      />
    );

    // Section I: Title
    expect(screen.getAllByText(/Sub-Second Byzantine Agreement Under Asymmetric Partitions/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Maximizes indexing discoverability/i)).toBeInTheDocument();

    // Section II: Methodological Architecture & Venue
    expect(screen.getByText(/ACM Transactions on Computer Systems/i)).toBeInTheDocument();
    expect(screen.getByText(/ACM SIGMETRICS 2023/i)).toBeInTheDocument();
    expect(screen.getByText(/How do dynamic quorum adjustments preserve throughput during WAN splits\?/i)).toBeInTheDocument();

    // Section III: Anchored Knowledge Void
    expect(screen.getByText(/PRIMARY ANCHOR \(EMPIRICAL\)/i)).toBeInTheDocument();
    expect(screen.getByText(/95%/i)).toBeInTheDocument();
    expect(screen.getByText(/Lamport & Castro \(2024\)/i)).toBeInTheDocument();

    // Section IV: Authorship
    expect(screen.getByText(/Dr. Elena Rostova/i)).toBeInTheDocument();
    expect(screen.getByText(/Corresponding/i)).toBeInTheDocument();
    expect(screen.getByText(/Conceptualization/i)).toBeInTheDocument();
  });

  it("renders Phase I Integrity Verification Audit checklist with verified checkpoints", () => {
    render(
      <TitleLockStage
        stage="title_lock"
        projectId="proj-lock-101"
        project={mockProjectUnlocked}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getByText(/Phase I Integrity Verification Audit/i)).toBeInTheDocument();
    expect(screen.getByText(/1. Definition & Scope/i)).toBeInTheDocument();
    expect(screen.getByText(/2. Literature Corpus/i)).toBeInTheDocument();
    expect(screen.getByText(/2 Sources \(1 Landmark\)/i)).toBeInTheDocument();
    expect(screen.getByText(/3. Knowledge Void/i)).toBeInTheDocument();
    expect(screen.getByText(/4. Publication Title/i)).toBeInTheDocument();
  });

  it("allows inline editing of the title before locking", async () => {
    render(
      <TitleLockStage
        stage="title_lock"
        projectId="proj-lock-101"
        project={mockProjectUnlocked}
        onAdvance={vi.fn()}
      />
    );

    const editBtn = screen.getByRole("button", { name: /✎ Edit Title/i });
    fireEvent.click(editBtn);

    const titleTextarea = screen.getByRole("textbox");
    fireEvent.change(titleTextarea, {
      target: { value: "Adaptive Quorum Consensus Under Partitions" },
    });

    const saveEditBtn = screen.getByRole("button", { name: /Save Edits/i });
    fireEvent.click(saveEditBtn);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-lock-101",
        expect.objectContaining({
          working_title: "Adaptive Quorum Consensus Under Partitions",
          current_stage: "title_lock",
        })
      );
    });
  });

  it("locks title and advances to Phase II when clicking Lock Snapshot & Proceed", async () => {
    const onAdvanceMock = vi.fn();
    render(
      <TitleLockStage
        stage="title_lock"
        projectId="proj-lock-101"
        project={mockProjectUnlocked}
        onAdvance={onAdvanceMock}
      />
    );

    const lockButtons = screen.getAllByRole("button", { name: /Lock Snapshot & Proceed/i });
    expect(lockButtons.length).toBeGreaterThan(0);

    fireEvent.click(lockButtons[0]);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-lock-101",
        expect.objectContaining({
          title_locked: "true",
          current_stage: "vault_sources",
        })
      );
      expect(onAdvanceMock).toHaveBeenCalledWith("vault_sources");
    });
  });

  it("renders sealed banner when locked and advances to vault_sources directly", () => {
    const onAdvanceMock = vi.fn();
    render(
      <TitleLockStage
        stage="title_lock"
        projectId="proj-lock-202"
        project={mockProjectLocked}
        onAdvance={onAdvanceMock}
      />
    );

    expect(screen.getByText(/Phase I Research Charter Sealed & Locked/i)).toBeInTheDocument();
    expect(screen.getByText(/LOCKED GROUND TRUTH/i)).toBeInTheDocument();

    const proceedButtons = screen.getAllByRole("button", { name: /Proceed to Evidence \(Phase II\) →/i });
    expect(proceedButtons.length).toBeGreaterThan(0);

    fireEvent.click(proceedButtons[0]);
    expect(onAdvanceMock).toHaveBeenCalledWith("vault_sources");
  });

  it("opens unlock modal and allows unlocking the research snapshot", async () => {
    render(
      <TitleLockStage
        stage="title_lock"
        projectId="proj-lock-202"
        project={mockProjectLocked}
        onAdvance={vi.fn()}
      />
    );

    const unlockBtn = screen.getByRole("button", { name: /Unlock to Edit/i });
    fireEvent.click(unlockBtn);

    expect(screen.getByText(/Unlock Research Snapshot\?/i)).toBeInTheDocument();

    const confirmUnlockBtn = screen.getByRole("button", { name: /Confirm Unlock/i });
    fireEvent.click(confirmUnlockBtn);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-lock-202",
        expect.objectContaining({
          title_locked: "false",
          current_stage: "title_lock",
        })
      );
    });
  });
});
