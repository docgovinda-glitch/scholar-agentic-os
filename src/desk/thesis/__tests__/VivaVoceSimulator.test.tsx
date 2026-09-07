// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import VivaVoceSimulator from "../components/VivaVoceSimulator";
import type { ThesisProjectData } from "../types";

const mockThesis: ThesisProjectData = {
  projectId: "proj-thesis-test",
  title: "Quantum Cognitive Paradigms in Autonomous Systems",
  degreeLevel: "PhD Dissertation",
  fieldOfStudy: "Computational Cognitive Science",
  targetWordCount: 50000,
  currentWordCount: 15000,
  theoreticalFramework: "Dynamic Neural Field Theory",
  researchQuestions: ["How does non-Markovian memory alter error correction?"],
  methodologicalDesign: "Triangulated Empirical Benchmarking",
  supervisorNotes: "Focus on formalizing Chapter 3.",
  chapters: [],
};

describe("VivaVoceSimulator", () => {
  it("renders committee archetypes, questions list, and defense drafter", () => {
    render(<VivaVoceSimulator thesisData={mockThesis} />);

    expect(screen.getByTestId("viva-voce-simulator")).toBeInTheDocument();
    expect(screen.getByText(/Doctoral Viva Voce & Oral Defense Committee Simulator/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Prof\. Eleanor Vance/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Active Committee Questions/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Structure your defense/i)).toBeInTheDocument();
  });

  it("filters questions by examiner archetype", () => {
    render(<VivaVoceSimulator thesisData={mockThesis} />);

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "contrarian" } });

    expect(screen.getAllByText(/Prof\. Arthur Sterling/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/If we remove the non-Markovian memory component/i)).toBeInTheDocument();
  });

  it("enters defense response and evaluates with AI Defense Coach", async () => {
    render(<VivaVoceSimulator thesisData={mockThesis} />);

    const textarea = screen.getByPlaceholderText(/Structure your defense/i);
    fireEvent.change(textarea, {
      target: { value: "In Chapter 3, we mitigated bias by employing double-blind empirical benchmarking with ground truth data." },
    });

    const evalBtn = screen.getByRole("button", { name: /Evaluate Defense Response →/i });
    fireEvent.click(evalBtn);

    expect(await screen.findByText(/Projected Defense Outcome/i)).toBeInTheDocument();
    expect(screen.getByText(/Defense Strengths:/i)).toBeInTheDocument();
    expect(screen.getByText(/Rebuttal Refinements:/i)).toBeInTheDocument();
  });
});
