// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DefinitionStage from "../stages/DefinitionStage";
import * as api from "../../api";
import type { ProjectView } from "../../types";

vi.mock("../../api", () => ({
  saveIntakeAnswers: vi.fn(),
  saveAuthors: vi.fn(),
  getOutputTypeSpec: vi.fn().mockResolvedValue({
    id: "OT-10",
    label: "Journal Article",
    family: "article",
    intakeSchema: { required: [], recommended: [], optional: [] },
  }),
  executeAgenticLLM: vi.fn(),
}));

describe("Stage 1: Research Definition (DefinitionStage)", () => {
  const mockProject: ProjectView = {
    projectId: "proj-definition-101",
    outputTypeId: "OT-10",
    answers: {
      working_title: "Multi-Agent Coordination in Distributed Edge Systems",
      research_area: "Distributed Systems & Machine Learning",
      article_type: "Original Research",
      study_design: "Experimental",
      primary_research_question: "How does asynchronous gossip convergence scale in edge clusters?",
      human_subjects: "No",
    },
    authors: [
      {
        id: "auth-1",
        firstName: "Ada",
        surname: "Lovelace",
        email: "ada@computing.ac.uk",
        isCorresponding: true,
        creditRoles: ["Conceptualization", "Methodology"],
      },
    ],
    intakeCompleteness: 1,
    hasDocument: false,
    hasJournalRequirements: false,
    gates: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.saveIntakeAnswers as any).mockImplementation((_id: string, answers: any) =>
      Promise.resolve({ ...mockProject, answers })
    );
    (api.saveAuthors as any).mockImplementation((_id: string, authors: any) =>
      Promise.resolve({ ...mockProject, authors })
    );
  });

  it("renders the 4 segmented workbench tabs", () => {
    render(
      <DefinitionStage
        projectId="proj-definition-101"
        project={mockProject}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getByText(/1\. Inquiry & Scope/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Methodological Architecture/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Authorship & CRediT/i)).toBeInTheDocument();
    expect(screen.getByText(/4\. Governance & Integrity/i)).toBeInTheDocument();
  });

  it("displays the high-readiness score when core parameters are populated", () => {
    render(
      <DefinitionStage
        projectId="proj-definition-101"
        project={mockProject}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    // With title (20), area (15), article type (15), authors (20), governance (10), prq (10), study design (5) -> >= 95%
    expect(screen.getByText(/Readiness: (95|90|100)%/i)).toBeInTheDocument();
  });

  it("dynamically shows reporting guideline badge when selecting study design", async () => {
    render(
      <DefinitionStage
        projectId="proj-definition-101"
        project={{
          ...mockProject,
          answers: {
            ...mockProject.answers,
            study_design: "Randomized Controlled Trial",
          },
        }}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    // Switch to Methodological Architecture tab
    fireEvent.click(screen.getByText(/2\. Methodological Architecture/i));

    await waitFor(() => {
      expect(screen.getByText(/CONSORT 2010/i)).toBeInTheDocument();
      expect(screen.getByText(/Consolidated Standards of Reporting Trials/i)).toBeInTheDocument();
    });
  });

  it("applies CRediT role presets to author", async () => {
    render(
      <DefinitionStage
        projectId="proj-definition-101"
        project={mockProject}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    // Switch to Authorship & CRediT tab
    fireEvent.click(screen.getByText(/3\. Authorship & CRediT/i));

    expect(screen.getByText(/Ada Lovelace/i)).toBeInTheDocument();

    // Click Lead Author preset
    const leadPresetBtn = screen.getByText(/🔬 Lead Author/i);
    fireEvent.click(leadPresetBtn);

    // Writing – original draft should now be selected
    await waitFor(() => {
      const draftChip = screen.getByText("Writing – original draft");
      expect(draftChip).toBeInTheDocument();
    });
  });

  it("saves and proceeds to literature stage when clicking proceed", async () => {
    const onAdvance = vi.fn();
    const onSaved = vi.fn();

    render(
      <DefinitionStage
        projectId="proj-definition-101"
        project={mockProject}
        onSaved={onSaved}
        onAdvance={onAdvance}
      />
    );

    const proceedBtn = screen.getByText(/Proceed to Literature Discovery/i);
    fireEvent.click(proceedBtn);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-definition-101",
        expect.objectContaining({
          working_title: "Multi-Agent Coordination in Distributed Edge Systems",
        })
      );
      expect(onAdvance).toHaveBeenCalledWith("literature");
    });
  });

  it("blocks advancing and reports error if required working title is missing", async () => {
    const onAdvance = vi.fn();

    render(
      <DefinitionStage
        projectId="proj-definition-101"
        project={{
          ...mockProject,
          answers: {
            ...mockProject.answers,
            working_title: "",
          },
        }}
        onSaved={vi.fn()}
        onAdvance={onAdvance}
      />
    );

    const proceedBtn = screen.getByText(/Proceed to Literature Discovery/i);
    fireEvent.click(proceedBtn);

    await waitFor(() => {
      expect(screen.getByText(/Please specify a Working Title before proceeding/i)).toBeInTheDocument();
      expect(onAdvance).not.toHaveBeenCalled();
    });
  });

  it("synchronizes working_title with title and research_area with research_domain upon save", async () => {
    const onAdvance = vi.fn();
    const onSaved = vi.fn();

    render(
      <DefinitionStage
        projectId="proj-definition-101"
        project={mockProject}
        onSaved={onSaved}
        onAdvance={onAdvance}
      />
    );

    const proceedBtn = screen.getByText(/Proceed to Literature Discovery/i);
    fireEvent.click(proceedBtn);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-definition-101",
        expect.objectContaining({
          working_title: "Multi-Agent Coordination in Distributed Edge Systems",
          title: "Multi-Agent Coordination in Distributed Edge Systems",
          research_area: "Distributed Systems & Machine Learning",
          research_domain: "Distributed Systems & Machine Learning",
        })
      );
    });
  });

  it("shows no FINER scores and says so when the AI assessment fails", async () => {
    // Rewritten 2026-10-29: this used to assert locally invented FINER
    // scores ("Heuristic Appraisal Active") on AI failure.
    (api.executeAgenticLLM as any).mockRejectedValue(new Error("AI quota exhausted or offline"));

    render(
      <DefinitionStage
        projectId="proj-definition-101"
        project={mockProject}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /AI Architect & FINER/i }));

    await waitFor(() => {
      expect(screen.getByText(/FINER assessment unavailable: nothing was scored/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Composite FINER Score/i)).not.toBeInTheDocument();
  });

  it("synthesizes PICO parameters into research question using heuristic fallback when AI throws", async () => {
    (api.executeAgenticLLM as any).mockRejectedValue(new Error("AI offline"));

    render(
      <DefinitionStage
        projectId="proj-definition-101"
        project={mockProject}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    const picoBtn = screen.getByRole("button", { name: /🎯 PICO Assistant/i });
    fireEvent.click(picoBtn);

    const popInput = screen.getByPlaceholderText(/Adult ICU patients/i);
    const intInput = screen.getByPlaceholderText(/Early prone positioning/i);
    const outInput = screen.getByPlaceholderText(/28-day all-cause mortality/i);

    fireEvent.change(popInput, { target: { value: "Distributed edge nodes" } });
    fireEvent.change(intInput, { target: { value: "Adaptive gossip clustering" } });
    fireEvent.change(outInput, { target: { value: "Consensus latency" } });

    const compileBtn = screen.getByRole("button", { name: /Compile Question & Title/i });
    fireEvent.click(compileBtn);

    await waitFor(() => {
      const prqTextarea = screen.getByPlaceholderText(/To what extent does active claim-evidence grounding/i) as HTMLTextAreaElement;
      expect(prqTextarea.value).toContain("Adaptive gossip clustering");
    });
  });
});
