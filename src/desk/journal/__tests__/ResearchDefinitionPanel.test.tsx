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
  answers: { objectives: "Old goal", target_word_count: "6000", journal_name: "J Test" },
} as unknown as ProjectView;

describe("ResearchDefinitionPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves only the three definition fields through the API and passes back the server's project", async () => {
    const serverProject = {
      ...project,
      answers: { ...project.answers, objectives: "New goal", questions: "Q1", methodology: "Survey" },
    } as unknown as ProjectView;
    api.saveIntakeAnswers.mockResolvedValue(serverProject);
    const onSaved = vi.fn();
    render(<ResearchDefinitionPanel projectId="p1" project={project} onSaved={onSaved} />);

    fireEvent.change(screen.getByDisplayValue("Old goal"), { target: { value: "New goal" } });
    fireEvent.change(screen.getByPlaceholderText(/How does X impact Y/), { target: { value: "Q1" } });
    fireEvent.change(screen.getByPlaceholderText(/intended methodology/), { target: { value: "Survey" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Definition/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(serverProject));
    expect(api.saveIntakeAnswers).toHaveBeenCalledTimes(1);
    const [id, patch] = api.saveIntakeAnswers.mock.calls[0];
    expect(id).toBe("p1");
    expect(patch).toEqual({ objectives: "New goal", questions: "Q1", methodology: "Survey" });
    expect(Object.keys(patch).sort()).toEqual(["methodology", "objectives", "questions"]);
  });

  it("shows an error and does not report a save when the API fails", async () => {
    api.saveIntakeAnswers.mockRejectedValue(new Error("Network down"));
    const onSaved = vi.fn();
    render(<ResearchDefinitionPanel projectId="p1" project={project} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole("button", { name: /Save Definition/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Network down");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("shows no canned AI feedback and offers no fake validation", async () => {
    api.saveIntakeAnswers.mockResolvedValue(project);
    render(<ResearchDefinitionPanel projectId="p1" project={project} onSaved={vi.fn()} />);
    for (const value of ["Q1", "Survey"]) {
      const box = screen.getAllByRole("textbox").find((t) => (t as HTMLTextAreaElement).value === "")!;
      fireEvent.change(box, { target: { value } });
    }

    expect(screen.queryByRole("button", { name: /Validate/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save Definition/ }));
    await screen.findByRole("status");

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/Strong foundation/);
    expect(text).not.toMatch(/align well with the methodology/);
    expect(text).not.toMatch(/AI Research Architect/);
  });
});
