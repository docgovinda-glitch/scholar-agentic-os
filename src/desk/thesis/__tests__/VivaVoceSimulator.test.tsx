// @vitest-environment jsdom
// Rewritten for P0-10: the old tests asserted fixed demo questions from named
// fictional examiners and a word-count "AI Defense Coach" grade. The component
// now practises only questions generated from the user's thesis and never
// scores an answer.
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import VivaVoceSimulator, { type VivaPracticeQuestion } from "../components/VivaVoceSimulator";
import type { ThesisProjectData } from "../types";

const thesis: ThesisProjectData = {
  projectId: "proj-thesis-test",
  title: "Quantum Cognitive Paradigms in Autonomous Systems",
  degreeLevel: "PhD Dissertation",
  fieldOfStudy: "Computational Cognitive Science",
  targetWordCount: 50000,
  currentWordCount: 15000,
  theoreticalFramework: "Dynamic Neural Field Theory",
  researchQuestions: ["How does non-Markovian memory alter error correction?"],
  methodologicalDesign: "Simulation",
  supervisorNotes: "",
  chapters: [],
};

const questions: VivaPracticeQuestion[] = [
  {
    id: "q1",
    category: "Theory",
    examinerQuestion: "Why does non-Markovian memory matter for error correction?",
    assessmentFocus: "Conceptual grounding",
    suggestedRebuttalStructure: ["State the mechanism.", "Point to Chapter 4 evidence."],
  },
  {
    id: "q2",
    category: "Method",
    examinerQuestion: "How did you validate the simulator?",
    assessmentFocus: "",
    suggestedRebuttalStructure: [],
  },
];

describe("VivaVoceSimulator (practice room)", () => {
  it("shows an empty state and no demo questions before any are generated", () => {
    render(<VivaVoceSimulator thesisData={thesis} questions={[]} />);
    expect(screen.getByTestId("viva-practice-empty")).toBeInTheDocument();
    expect(screen.queryByText(/Eleanor Vance|Arthur Sterling|4\.2x/i)).not.toBeInTheDocument();
  });

  it("lists the generated questions and switches between them", () => {
    render(<VivaVoceSimulator thesisData={thesis} questions={questions} />);
    expect(screen.getByText(/Examiner questions \(2\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Why does non-Markovian memory matter/i).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: /How did you validate the simulator/i }));
    expect(screen.getByRole("button", { name: /How did you validate the simulator/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("lets the user draft an answer and tick the checklist, and never scores it", () => {
    render(<VivaVoceSimulator thesisData={thesis} questions={questions} />);
    fireEvent.change(screen.getByLabelText(/Your answer/i), { target: { value: "Because memory kernels persist." } });
    const box = screen.getByRole("checkbox", { name: /State the mechanism/i });
    fireEvent.click(box);
    expect(box).toBeChecked();
    expect(screen.queryByText(/\/100|Pass|Projected Defense Outcome/i)).not.toBeInTheDocument();
  });
});
