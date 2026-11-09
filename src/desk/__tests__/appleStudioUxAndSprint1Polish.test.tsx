/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  AppleStudioHeader,
  APPLE_STUDIO_STAGES,
  type AppleStudioPhaseId,
} from "../../components/ui/AppleStudioShell";
import ProposalWorkspace from "../proposal/ProposalWorkspace";
import ThesisWorkspace from "../thesis/ThesisWorkspace";
import assignmentRouter, {
  deriveHeuristicTitle,
  healCorruptedProjectStructure,
} from "../../../server/routes/project/assignment";
import {
  registerProjectRoutes,
  projectView,
  recomputeG2,
  recomputeG4,
  recomputeG6,
} from "../../../server/routes/project";

describe("Apple-Grade Studio UX Unification & Sprint 1 Production Polish", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          projectId: "proj-empty-1",
          outputTypeId: "OT-15",
          version: 1,
          title: "",
          answers: {},
          gates: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
  });

  describe("1. Unified <AppleStudioHeader /> & 5-Stage Cognitive Progression", () => {
    it("renders all 5 cognitive stage pills (Blueprint, Evidence, Studio, Review, Delivery), Zen Mode toggle, Inspector toggle, and Autosave badge", () => {
      const onPhaseSelect = vi.fn();
      const onToggleZenMode = vi.fn();
      const onToggleInspector = vi.fn();
      const onBack = vi.fn();
      const onProjectTitleChange = vi.fn();

      render(
        <AppleStudioHeader
          deliverableCode="OT-10"
          deliverableLabel="Journal Article"
          projectTitle="Empirical Verification of Multi-Agent Systems"
          onProjectTitleChange={onProjectTitleChange}
          activePhase="studio"
          onPhaseSelect={onPhaseSelect}
          onBack={onBack}
          metricLabel="3,240 / 8,000 words"
          aiModelLabel="Claude 3.7 Sonnet"
          autosaveStatus="saved"
          projectVersion={4}
          zenMode={false}
          onToggleZenMode={onToggleZenMode}
          inspectorOpen={false}
          onToggleInspector={onToggleInspector}
        />
      );

      expect(screen.getByTestId("apple-studio-header")).toBeInTheDocument();
      expect(screen.getByTestId("studio-deliverable-badge")).toHaveTextContent("OT-10");
      expect(screen.getByTestId("studio-project-title")).toHaveTextContent(
        "Empirical Verification of Multi-Agent Systems"
      );

      // Verify all 5 stage pills exist inside role="tablist"
      const tablist = screen.getByRole("tablist", { name: /Studio cognitive stages/i });
      expect(tablist).toBeInTheDocument();
      expect(APPLE_STUDIO_STAGES).toHaveLength(5);

      const expectedLabels: Array<{ id: AppleStudioPhaseId; label: string }> = [
        { id: "blueprint", label: "Blueprint" },
        { id: "evidence", label: "Evidence" },
        { id: "studio", label: "Studio" },
        { id: "review", label: "Review" },
        { id: "delivery", label: "Delivery" },
      ];

      for (const item of expectedLabels) {
        const pill = screen.getByTestId(`apple-stage-pill-${item.id}`);
        expect(pill).toHaveTextContent(item.label);
        fireEvent.click(pill);
        expect(onPhaseSelect).toHaveBeenCalledWith(item.id);
      }

      // Verify Studio pill is aria-selected
      expect(screen.getByTestId("apple-stage-pill-studio")).toHaveAttribute(
        "aria-selected",
        "true"
      );

      // Verify Zen Mode toggle, Inspector toggle, and WorkspaceAutosaveBadge
      const zenBtn = screen.getByTestId("zen-mode-toggle");
      fireEvent.click(zenBtn);
      expect(onToggleZenMode).toHaveBeenCalledTimes(1);

      const inspectorBtn = screen.getByTestId("inspector-toggle");
      fireEvent.click(inspectorBtn);
      expect(onToggleInspector).toHaveBeenCalledTimes(1);

      const autosaveBadge = screen.getByTestId("autosave-status");
      expect(autosaveBadge).toHaveTextContent(/All changes saved/i);
      expect(autosaveBadge).toHaveTextContent("v4");

      // Verify inline title editing
      fireEvent.click(screen.getByTestId("studio-project-title"));
      const input = screen.getByTestId("studio-project-title-input");
      fireEvent.change(input, { target: { value: "Renamed Apple Studio Manuscript" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onProjectTitleChange).toHaveBeenCalledWith("Renamed Apple Studio Manuscript");
    });
  });

  describe("2. Zero-Ghost Overhaul for ProposalWorkspace (OT-15) & ThesisWorkspace (OT-07)", () => {
    it("renders ProposalWorkspace (OT-15) with an empty project and zero occurrences of 'Autonomous Verification' or 'Quantum Cognitive', offering 3 empty aims", () => {
      const { container } = render(<ProposalWorkspace projectId="proj-empty-proposal" />);

      const htmlText = container.textContent || "";
      expect(htmlText).not.toMatch(/Autonomous Verification/i);
      expect(htmlText).not.toMatch(/Quantum Cognitive/i);

      const blueprintBtn = screen.getByTestId("generate-structured-blueprint-btn");
      expect(blueprintBtn).toHaveTextContent(/Set up 3 aims to fill in/i);

      // Clicking the button sets up three empty aims (no wording written for the applicant)
      fireEvent.click(blueprintBtn);
      expect(screen.getByText(/0 of 3 aims written/i)).toBeInTheDocument();
    });

    it("renders ThesisWorkspace (OT-07) with an empty project and zero occurrences of 'Quantum Cognitive' or 'Autonomous Verification', offering a 5-chapter structure", () => {
      const { container } = render(<ThesisWorkspace projectId="proj-empty-thesis" />);

      const htmlText = container.textContent || "";
      expect(htmlText).not.toMatch(/Quantum Cognitive/i);
      expect(htmlText).not.toMatch(/Autonomous Verification/i);

      const blueprintBtn = screen.getByTestId("generate-structured-blueprint-btn");
      expect(blueprintBtn).toHaveTextContent(/Set up a 5-chapter structure/i);

      // Clicking the button sets up the 5-chapter structure (and writes no research questions)
      fireEvent.click(blueprintBtn);
      expect(screen.getByText(/5 Chapters Planned/i)).toBeInTheDocument();
      expect(container.textContent).not.toMatch(/RQ1: What are the foundational/i);
    });
  });

  describe("3. Modularized Backend Routers (assignment.ts & project.ts)", () => {
    it("exports assignmentRouter and helper functions from modularized server/routes/project/assignment.ts", () => {
      expect(assignmentRouter).toBeDefined();
      expect(typeof assignmentRouter).toBe("function");
      expect(typeof deriveHeuristicTitle).toBe("function");
      expect(typeof healCorruptedProjectStructure).toBe("function");
      expect(deriveHeuristicTitle("CS 7015: Distributed Consensus Protocols")).toContain("CS7015");
    });

    it("exports registerProjectRoutes and gate recomputers from modularized server/routes/project.ts", () => {
      expect(typeof registerProjectRoutes).toBe("function");
      expect(typeof projectView).toBe("function");
      expect(typeof recomputeG2).toBe("function");
      expect(typeof recomputeG4).toBe("function");
      expect(typeof recomputeG6).toBe("function");
    });
  });
});

