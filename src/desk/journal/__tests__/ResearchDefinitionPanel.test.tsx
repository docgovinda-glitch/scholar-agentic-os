// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ProjectView } from "../../types";

const saveIntakeAnswersMock = vi.fn();
vi.mock("../../api", () => ({
  saveIntakeAnswers: (...args: unknown[]) => saveIntakeAnswersMock(...args),
}));

import ResearchDefinitionPanel from "../ResearchDefinitionPanel";

function makeProject(answers: Record<string, string> = {}): ProjectView {
  return {
    projectId: "proj-journal-1",
    outputTypeId: "OT-02",
    answers: { title: "Existing Journal Title", ...answers },
    intakeCompleteness: 0.5,
    hasDocument: false,
    gates: [],
  };
}

describe("ResearchDefinitionPanel", () => {
  beforeEach(() => {
    saveIntakeAnswersMock.mockReset();
  });

  it("persists objectives, questions, and methodology via saveIntakeAnswers", async () => {
    const project = makeProject({ objectives: "Initial obj" });
    const serverProject: ProjectView = {
      ...project,
      answers: {
        ...project.answers,
        objectives: "Evaluate X under Y",
        questions: "1. Does X improve Y?",
        methodology: "Randomized controlled trial",
      },
    };
    saveIntakeAnswersMock.mockResolvedValueOnce(serverProject);
    const onSaved = vi.fn();

    render(<ResearchDefinitionPanel projectId="proj-journal-1" project={project} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText(/Research Objectives/i), {
      target: { value: "Evaluate X under Y" },
    });
    fireEvent.change(screen.getByLabelText(/Core Questions/i), {
      target: { value: "1. Does X improve Y?" },
    });
    fireEvent.change(screen.getByLabelText(/Methodology & Approach/i), {
      target: { value: "Randomized controlled trial" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Save Definition/i }));

    await waitFor(() => {
      expect(saveIntakeAnswersMock).toHaveBeenCalledWith("proj-journal-1", {
        objectives: "Evaluate X under Y",
        questions: "1. Does X improve Y?",
        methodology: "Randomized controlled trial",
      });
    });
    expect(onSaved).toHaveBeenCalledWith(serverProject);
    expect(screen.getByRole("status")).toHaveTextContent("Definition saved.");
  });

  it("surfaces an alert and does not call onSaved when the save request fails", async () => {
    const project = makeProject();
    saveIntakeAnswersMock.mockRejectedValueOnce(new Error("Network error: 500"));
    const onSaved = vi.fn();

    render(<ResearchDefinitionPanel projectId="proj-journal-1" project={project} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole("button", { name: /Save Definition/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Network error: 500");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("does not render a fake Validate Design button or canned AI feedback", () => {
    const project = makeProject({
      objectives: "Obj",
      questions: "Q1",
      methodology: "Meth",
    });

    render(<ResearchDefinitionPanel projectId="proj-journal-1" project={project} onSaved={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /Validate Design/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/AI Research Architect/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Research Question 2/i)).not.toBeInTheDocument();
  });
});

