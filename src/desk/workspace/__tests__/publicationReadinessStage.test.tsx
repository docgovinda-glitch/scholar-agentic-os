// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import PublicationReadinessStage from "../stages/PublicationReadinessStage";
import type { ProjectView } from "../../types";

// Mock API
vi.mock("../../api", () => ({
  authedFetch: vi.fn().mockResolvedValue({ ok: true }),
  authedJsonFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      ok: true,
      data: {
        score: 98,
        overallStatus: "CERTIFIED_READY",
        checks: [{ rule: "Word Count < 8000", passed: true, detail: "7,850 words" }],
      },
    }),
  }),
  getDocument: vi.fn().mockResolvedValue(null),
  saveIntakeAnswers: vi.fn().mockResolvedValue({ ok: true }),
}));

import { authedJsonFetch, saveIntakeAnswers } from "../../api";

const mockProject: ProjectView = {
  projectId: "proj-readiness-01",
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
    word_count_limit: "5000",
    originality_score: "95",
    manuscript_draft: JSON.stringify([
      {
        section: "Abstract",
        content: "Autonomous reasoning architectures demonstrate reproducible variance reduction.",
      },
      {
        section: "Introduction",
        content: "Multi-agent synthesis workflows require continuous verification.",
      },
      {
        section: "Methods",
        content: "We establish Lemma 1 bounding runtime under sparse topologies.",
      },
      {
        section: "Results",
        content: "Empirical evaluation demonstrates a 94.2% fidelity rate.",
      },
      {
        section: "References",
        content: "1. Vaswani et al. (2024). Empirical Grounding.",
      },
    ]),
  },
};

describe("Stage 24: Readiness Check (PublicationReadinessStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Stage 24 header, Phase V badge, Grounding Foundation ribbon, and initial diagnostic prompt", () => {
    render(
      <PublicationReadinessStage
        stage="publication_readiness"
        projectId="proj-readiness-01"
        project={mockProject}
      />
    );

    // Header & Phase badge
    expect(screen.getByText(/Phase V: Publication • Stage 24 of 25/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /24\. Readiness Check/i })).toBeInTheDocument();

    // Grounding ribbon
    expect(screen.getByText(/Grounding Foundation:/i)).toBeInTheDocument();
    expect(screen.getByText(/Provable Provenance Bounds in Autonomous Scientific Reasoning/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Nature Machine Intelligence/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Deterministic provenance verification/i)).toBeInTheDocument();

    // Initial prompt
    expect(screen.getByText(/Ready for Final Submission Compliance Audit/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Begin Pre-Flight Compliance Audit/i })).toBeInTheDocument();
  });

  it("triggers compliance diagnostic agent with progress indicator, and DOES NOT auto-advance", async () => {
    const onAdvanceMock = vi.fn();

    render(
      <PublicationReadinessStage
        stage="publication_readiness"
        projectId="proj-readiness-01"
        project={mockProject}
        onAdvance={onAdvanceMock}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin Pre-Flight Compliance Audit/i }));

    await waitFor(() => {
      expect(screen.getByText(/Clear for Camera-Ready Export/i)).toBeInTheDocument();
    });

    // Verification HUD & Clearance banner
    expect(screen.getByText(/Manuscript Cleared for Formal Submission/i)).toBeInTheDocument();
    expect(screen.getByText(/Word Limit Compliance/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Citation Provenance/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Originality Integrity/i)).toBeInTheDocument();
    expect(screen.getByText(/Gate Criteria/i)).toBeInTheDocument();

    // Critical assertion: NO auto-advance after timeout
    await new Promise((r) => setTimeout(r, 400));
    expect(onAdvanceMock).not.toHaveBeenCalled();
  });

  it("engages local fallback diagnostic engine when endpoint fails, evaluating all 6 compliance checks", async () => {
    (authedJsonFetch as any).mockRejectedValue(new Error("Network timeout during readiness scan"));

    render(
      <PublicationReadinessStage
        stage="publication_readiness"
        projectId="proj-readiness-01"
        project={mockProject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin Pre-Flight Compliance Audit/i }));

    await waitFor(() => {
      expect(screen.getByText(/Clear for Camera-Ready Export/i)).toBeInTheDocument();
    });

    // Verify checks across categories
    expect(screen.getAllByText(/Word Limits/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Citations/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Structure/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Integrity/i).length).toBeGreaterThan(0);
  });

  it("filters compliance checklist by tab (All, Passed, Advisory)", async () => {
    render(
      <PublicationReadinessStage
        stage="publication_readiness"
        projectId="proj-readiness-01"
        project={mockProject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin Pre-Flight Compliance Audit/i }));

    await waitFor(() => {
      expect(screen.getByText(/Clear for Camera-Ready Export/i)).toBeInTheDocument();
    });

    // Tab buttons
    const passedTab = screen.getByRole("button", { name: /^Passed/i });
    fireEvent.click(passedTab);
    expect(screen.getByText(/Target Journal Mandatory Section Hierarchy/i)).toBeInTheDocument();

    const advisoryTab = screen.getByRole("button", { name: /^Advisory Notices/i });
    fireEvent.click(advisoryTab);
    expect(screen.getByText(/Figure, Table & Equation Formal Numbering/i)).toBeInTheDocument();

    const allTab = screen.getByRole("button", { name: /^All Checks/i });
    fireEvent.click(allTab);
    expect(screen.getByText(/Double-Blind Anonymization/i)).toBeInTheDocument();
  });

  it("advances to Stage 25 (export) upon deliberate user approval and persists certification to project answers", async () => {
    const onAdvanceMock = vi.fn();
    const onSavedMock = vi.fn();

    render(
      <PublicationReadinessStage
        stage="publication_readiness"
        projectId="proj-readiness-01"
        project={mockProject}
        onSaved={onSavedMock}
        onAdvance={onAdvanceMock}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin Pre-Flight Compliance Audit/i }));

    await waitFor(() => {
      expect(screen.getByText(/Clear for Camera-Ready Export/i)).toBeInTheDocument();
    });

    // Advance button in sticky dock
    const advanceBtn = screen.getByRole("button", {
      name: /Advance to Export Pipeline \(Stage 25\) →/i,
    });
    fireEvent.click(advanceBtn);

    await waitFor(() => {
      expect(saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-readiness-01",
        expect.objectContaining({
          publication_readiness: expect.any(String),
          publication_readiness_completed: "true",
          publication_readiness_status: "certified",
        })
      );
      expect(onSavedMock).toHaveBeenCalled();
      expect(onAdvanceMock).toHaveBeenCalledWith("export");
    });
  });
});
