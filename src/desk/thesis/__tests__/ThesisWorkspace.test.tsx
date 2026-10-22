// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import ThesisWorkspace from "../ThesisWorkspace";

describe("ThesisWorkspace", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/thesis/chapter-audit")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            audit: {
              totalChapters: 5,
              alignmentScore: 96,
              coherenceStatus: "Exceptional Doctoral Alignment",
              crossChapterChecks: [
                {
                  check: "Research Question Propagation",
                  status: "passed",
                  details: "Directly mapped to Chapter 4 findings.",
                },
              ],
            },
          }),
        };
      }
      if (urlStr.includes("/thesis/viva-simulate")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            title: "Quantum Cognitive Paradigms in Autonomous Agent Systems",
            examinerPersona: "Prof. Eleanor Vance (Empirical Cognitive Systems Chair)",
            examinerRigorScore: "Extreme (Postdoctoral Defense)",
            questions: [
              {
                id: "q-1",
                category: "Methodological Epistemology",
                examinerQuestion: "How do you defend non-Markovian state spaces against classical Bayesian critiques?",
                assessmentFocus: "High-dimensional convergence guarantees",
                suggestedRebuttalStructure: [
                  "Re-ground in empirical benchmarks",
                  "Demonstrate bounded empirical error rates",
                ],
              },
            ],
          }),
        };
      }
      if (urlStr.includes("/intake")) {
        return {
          ok: true,
          json: async () => ({ success: true, version: 2 }),
        };
      }
      if (urlStr.includes("/api/projects/proj-thesis-1") || urlStr.includes("/api/project/proj-thesis-1")) {
        return {
          ok: true,
          json: async () => ({
            project: {
              id: "proj-thesis-1",
              title: "Quantum Cognitive Paradigms in Autonomous Agent Systems",
              version: 1,
              intakeAnswers: {
                degreeLevel: "PhD Dissertation",
                fieldOfStudy: "Computational Cognitive Science",
              },
            },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ success: true }),
      };
    });
  });

  it("renders thesis title, degree level, and chapters progression", async () => {
    render(<ThesisWorkspace projectId="proj-thesis-1" />);

    expect(await screen.findByText(/Quantum Cognitive Paradigms/i)).toBeInTheDocument();
    expect(screen.getAllByText("PhD Dissertation").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Dissertation Milestones/i)).toBeInTheDocument();
    expect(screen.getByText("1. Proposal & Framing")).toBeInTheDocument();
    expect(screen.getByTestId("autosave-status")).toHaveTextContent("All changes saved");
  });

  it("switches to Literature Matrix stage and displays paradigm clusters", async () => {
    render(<ThesisWorkspace projectId="proj-thesis-1" />);

    const litBtn = screen.getByRole("button", { name: /2\. Literature Matrix/i });
    fireEvent.click(litBtn);

    expect(await screen.findByText(/Chapter 2: Thematic Literature Matrix/i)).toBeInTheDocument();
    expect(screen.getByText(/Paradigm 1: Classical Computationalism/i)).toBeInTheDocument();
    expect(screen.getByText(/The Scholarly Tension \(Gap\)/i)).toBeInTheDocument();
  });

  it("switches to Methodology stage and displays mixed-methods design", async () => {
    render(<ThesisWorkspace projectId="proj-thesis-1" />);

    const methBtn = screen.getByRole("button", { name: /3\. Methodology & IRB/i });
    fireEvent.click(methBtn);

    expect(await screen.findByText(/Chapter 3: Methodology & Epistemological Design/i)).toBeInTheDocument();
    expect(screen.getByText(/Methodological Architecture/i)).toBeInTheDocument();
  });

  it("triggers cross-chapter audit with alignment score", async () => {
    render(<ThesisWorkspace projectId="proj-thesis-1" />);

    const discBtn = screen.getByRole("button", { name: /5\. Critical Discussion/i });
    fireEvent.click(discBtn);

    expect(await screen.findByText(/Chapter 5: Critical Discussion & Cross-Chapter Audit/i)).toBeInTheDocument();
    const auditBtn = screen.getByRole("button", { name: /Run Cross-Chapter Audit →/i });
    fireEvent.click(auditBtn);

    expect(await screen.findByText(/96% · Exceptional Doctoral Alignment/i)).toBeInTheDocument();
    expect(screen.getByText(/Research Question Propagation:/i)).toBeInTheDocument();
  });

  it("switches to Viva / Defense simulator stage and runs simulation", async () => {
    render(<ThesisWorkspace projectId="proj-thesis-1" />);

    const vivaNavBtn = screen.getByRole("button", { name: /7\. Viva \/ Defense Simulator/i });
    fireEvent.click(vivaNavBtn);

    expect(await screen.findByText(/Doctoral Viva Voce & Oral Defense Committee Simulator/i)).toBeInTheDocument();
    const simBtn = screen.getByRole("button", { name: /Launch Examiner Simulation →/i });
    fireEvent.click(simBtn);

    await waitFor(() => {
      expect(screen.getByText(/Simulated Examiner Persona/i)).toBeInTheDocument();
      expect(screen.getByText(/Extreme \(Postdoctoral Defense\)/i)).toBeInTheDocument();
    });
  });
});
