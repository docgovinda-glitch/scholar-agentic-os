// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { executeTitleLockAndProceed } from "../titleLockContract";
import { ResearchProvider, useResearchWorkspace } from "../ResearchContext";
import * as api from "../../api";
import type { ProjectView } from "../../types";
import { isResearchStage } from "../types";

vi.mock("../../api", () => ({
  saveIntakeAnswers: vi.fn(),
  getProject: vi.fn(),
  getDocument: vi.fn(),
  getRubric: vi.fn(),
  getOutputTypeSpec: vi.fn().mockResolvedValue({
    id: "OT-10",
    name: "Journal Article",
    intakeSchema: { required: [], recommended: [] },
  }),
  isSupabaseConfigured: vi.fn().mockReturnValue(false),
  getSupabaseClient: vi.fn(),
  executeAgenticLLM: vi.fn(),
  setGlobalManualModelOverride: vi.fn(),
}));

describe("Title Lock Contract & Stage Navigation System Integrity", () => {
  const mockProject: ProjectView = {
    id: "proj-test-123",
    ownerId: "user-1",
    outputTypeId: "OT-10",
    answers: {
      definition: "Core problem in quantum computing fault tolerance",
      discovered_literature: "Surveyed 25 papers",
      identified_gaps: "Real-time syndrome decoding latency",
      selected_gap: "FPGA-based decoding pipeline",
      title_options: JSON.stringify([
        { id: "1", title_text: "Low-Latency Syndrome Decoding", subtitle_text: "An FPGA Architecture", rationale: "Clear and direct" },
      ]),
      working_title: "Low-Latency Syndrome Decoding: An FPGA Architecture",
    },
    gates: [],
    hasDocument: false,
    hasRubricReport: false,
    hasClaimGraph: false,
    hasWaivers: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("executeTitleLockAndProceed (Shared Single Transition Contract)", () => {
    it("rejects an empty or whitespace title without saving or navigating", async () => {
      const onSaved = vi.fn();
      const onAdvance = vi.fn();

      await expect(
        executeTitleLockAndProceed({
          projectId: "p1",
          title: "   ",
          onSaved,
          onAdvance,
        })
      ).rejects.toThrow("Please select or enter a valid title before locking.");

      expect(api.saveIntakeAnswers).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
      expect(onAdvance).not.toHaveBeenCalled();
    });

    it("atomically persists working_title, title_locked: 'true', and current_stage: 'vault_sources'", async () => {
      const updatedMock: ProjectView = {
        ...mockProject,
        answers: {
          ...mockProject.answers,
          working_title: "Final Quantum Paper Title",
          title_locked: "true",
          current_stage: "vault_sources",
        },
      };

      vi.mocked(api.saveIntakeAnswers).mockResolvedValueOnce(updatedMock);

      const onSaved = vi.fn();
      const onAdvance = vi.fn();

      const result = await executeTitleLockAndProceed({
        projectId: mockProject.id,
        title: "Final Quantum Paper Title",
        existingAnswers: mockProject.answers,
        onSaved,
        onAdvance,
      });

      // 1. Verify atomic payload to saveIntakeAnswers
      expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
        mockProject.id,
        expect.objectContaining({
          working_title: "Final Quantum Paper Title",
          title_locked: "true",
          current_stage: "vault_sources",
        })
      );

      // 2. Verify onSaved called with updated project
      expect(onSaved).toHaveBeenCalledWith(updatedMock);

      // 3. Verify deterministic navigation to vault_sources
      expect(onAdvance).toHaveBeenCalledWith("vault_sources");
      expect(result).toEqual(updatedMock);
    });
  });

  describe("Negative regression tests & Guard against invalid stage identifiers", () => {
    it("isResearchStage rejects invalid identifiers: source_approval, evidence_review, arbitrary_strings", () => {
      expect(isResearchStage("source_approval")).toBe(false);
      expect(isResearchStage("evidence_review")).toBe(false);
      expect(isResearchStage("arbitrary_stage")).toBe(false);
      expect(isResearchStage("")).toBe(false);

      expect(isResearchStage("source_approval_vault")).toBe(true);
      expect(isResearchStage("source_approval_external")).toBe(true);
      expect(isResearchStage("external_research")).toBe(true);
      expect(isResearchStage("vault_sources")).toBe(true);
    });

    it("ResearchProvider blocks navigation to invalid stages and emits structured error", async () => {
      vi.mocked(api.getProject).mockResolvedValue(mockProject);

      const onStageChange = vi.fn();
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      function Consumer() {
        const { advanceStage, setStage, error } = useResearchWorkspace();
        return (
          <div>
            <button onClick={() => advanceStage("source_approval" as any)}>Advance Invalid</button>
            <button onClick={() => setStage("evidence_review" as any)}>SetStage Invalid</button>
            {error && <span data-testid="error-banner">{error}</span>}
          </div>
        );
      }

      render(
        <ResearchProvider
          projectId={mockProject.id}
          initialStage="definition"
          onStageChangeCallback={onStageChange}
        >
          <Consumer />
        </ResearchProvider>
      );

      await waitFor(() => {
        expect(api.getProject).toHaveBeenCalledWith(mockProject.id);
      });

      // Clear any initial stage call
      onStageChange.mockClear();

      // Trigger advanceStage with invalid stage "source_approval"
      fireEvent.click(screen.getByText("Advance Invalid"));

      // MUST NOT NAVIGATE
      expect(onStageChange).not.toHaveBeenCalled();
      expect(api.saveIntakeAnswers).not.toHaveBeenCalled();

      // MUST LOG STRUCTURED ERROR
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ResearchNavigation] Blocked invalid stage advance to: "source_approval"')
      );

      // MUST SURFACE ERROR TO USER
      await waitFor(() => {
        expect(screen.getByTestId("error-banner")).toHaveTextContent(
          'Blocked invalid stage advance to: "source_approval"'
        );
      });

      // Trigger setStage with invalid stage "evidence_review"
      fireEvent.click(screen.getByText("SetStage Invalid"));
      expect(onStageChange).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ResearchNavigation] Blocked invalid stage navigation to: "evidence_review"')
      );

      consoleErrorSpy.mockRestore();
    });

    it("Reconciles and reverts stage on persistence failure rather than leaving silent false state", async () => {
      vi.mocked(api.getProject).mockResolvedValue(mockProject);
      vi.mocked(api.saveIntakeAnswers).mockRejectedValueOnce(new Error("Network timeout saving stage"));

      const onStageChange = vi.fn();
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      function Consumer() {
        const { currentStage, advanceStage, error } = useResearchWorkspace();
        return (
          <div>
            <span data-testid="current-stage">{currentStage}</span>
            <button onClick={() => advanceStage("literature")}>Advance to Literature</button>
            {error && <span data-testid="error-banner">{error}</span>}
          </div>
        );
      }

      render(
        <ResearchProvider
          projectId={mockProject.id}
          initialStage="definition"
          onStageChangeCallback={onStageChange}
        >
          <Consumer />
        </ResearchProvider>
      );

      await waitFor(() => {
        expect(api.getProject).toHaveBeenCalledWith(mockProject.id);
      });

      onStageChange.mockClear();

      // Click advance
      fireEvent.click(screen.getByText("Advance to Literature"));

      // Wait for async persistence to fail and reconcile
      await waitFor(() => {
        expect(screen.getByTestId("error-banner")).toHaveTextContent(
          'Failed to advance to stage "literature". Reverted to "definition".'
        );
      });

      // Verification: State reverted to definition
      expect(onStageChange).toHaveBeenLastCalledWith("definition");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[ResearchNavigation] Failed to persist stage progression, reconciling state:"),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it("Prevents stale remote state from overwriting in-flight selected stage", async () => {
      const staleProject: ProjectView = {
        ...mockProject,
        answers: {
          ...mockProject.answers,
          current_stage: "definition", // Stale remote answers say definition
        },
      };

      vi.mocked(api.getProject).mockResolvedValue(staleProject);

      const onStageChange = vi.fn();

      function Consumer() {
        const { currentStage, project } = useResearchWorkspace();
        return (
          <div>
            <span data-testid="current-stage">{currentStage}</span>
            <span data-testid="project-stage">{project?.answers?.["current_stage"]}</span>
          </div>
        );
      }

      render(
        <ResearchProvider
          projectId={mockProject.id}
          initialStage="vault_sources" // User navigated to vault_sources
          onStageChangeCallback={onStageChange}
        >
          <Consumer />
        </ResearchProvider>
      );

      await waitFor(() => {
        expect(api.getProject).toHaveBeenCalled();
      });

      // Even though staleProject had current_stage = "definition", latestStageRef preserved "vault_sources"
      expect(screen.getByTestId("current-stage")).toHaveTextContent("vault_sources");
      expect(screen.getByTestId("project-stage")).toHaveTextContent("vault_sources");
    });
  });
});
