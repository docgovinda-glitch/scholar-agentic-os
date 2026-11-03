// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ProjectView } from "../../types";

const api = vi.hoisted(() => ({ saveIntakeAnswers: vi.fn() }));
vi.mock("../../api", () => api);

const { default: ResearchDefinitionPanel } = await import("../ResearchDefinitionPanel");

const project = {
  projectId: "p1",
  answers: { objectives: "Old goal", target_word_count: "6000", topic: "Quantum" },
} as unknown as ProjectView;

describe("ResearchDefinitionPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves only the three definition fields and hands the server's project to onSaved", async () => {
    const serverProject = { ...project, answers: { ...project.answers, objectives: "New goal", questions: "Q1", methodology: "Survey" } };
    api.saveIntakeAnswers.mockResolvedValue(serverProject);
    const onSaved = vi.fn();
    render(<ResearchDefinitionPanel projectId="p1" project={project} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText("Research Objectives"), { target: { value: "New goal" } });
    fireEvent.change(screen.getByLabelText("Core Questions"), { target: { value: "Q1" } });
    fireEvent.change(screen.getByLabelText("Methodology & Approach"), { target: { value: "Survey" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Definition/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(serverProject));
    expect(api.saveIntakeAnswers).toHaveBeenCalledTimes(1);
    const [id, patch] = api.saveIntakeAnswers.mock.calls[0];
    expect(id).toBe("p1");
    expect(patch).toEqual({ objectives: "New goal", questions: "Q1", methodology: "Survey" });
    expect(Object.keys(patch).sort()).toEqual(["methodology", "objectives", "questions"]);
  });

  it("shows an error and does not call onSaved when saving fails", async () => {
    api.saveIntakeAnswers.mockRejectedValue(new Error("Network down"));
    const onSaved = vi.fn();
    render(<ResearchDefinitionPanel projectId="p1" project={project} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: /Save Definition/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save: Network down");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("never shows canned AI feedback", async () => {
    api.saveIntakeAnswers.mockResolvedValue(project);
    render(<ResearchDefinitionPanel projectId="p1" project={{ ...project, answers: { objectives: "a", questions: "b", methodology: "c" } } as ProjectView} onSaved={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Validate/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save Definition/ }));
    await waitFor(() => expect(api.saveIntakeAnswers).toHaveBeenCalled());
    expect(screen.queryByText(/Strong foundation/)).not.toBeInTheDocument();
    expect(screen.queryByText(/AI Research Architect/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Research Question 2/)).not.toBeInTheDocument();
  });
});
