// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import PresentationWorkspace from "../PresentationWorkspace";

describe("PresentationWorkspace", () => {
  it("renders presentation title, duration, and interactive slide preview", () => {
    render(<PresentationWorkspace projectId="proj-pres-1" />);

    expect(screen.getAllByText(/Autonomous Knowledge Grounding in Multi-Agent Scientific Synthesis/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Interactive Slide Deck Studio/i)).toBeInTheDocument();
    expect(screen.getByText(/Speaker Notes & Delivery Script/i)).toBeInTheDocument();
  });

  it("navigates between slides with Next and Prev buttons", async () => {
    render(<PresentationWorkspace projectId="proj-pres-1" />);

    expect(screen.getByText(/Slide 1 of 5/i)).toBeInTheDocument();
    const nextBtn = screen.getByRole("button", { name: /Next →/i });
    fireEvent.click(nextBtn);

    expect(await screen.findByText(/Slide 2 of 5/i)).toBeInTheDocument();
    expect(await screen.findByText(/The Reproducibility Bottleneck/i)).toBeInTheDocument();
  });

  it("switches to Timing & Constraints stage and allows duration adjustment", async () => {
    render(<PresentationWorkspace projectId="proj-pres-1" />);

    const timingBtn = screen.getByRole("button", { name: /1\. Timing & Constraints/i });
    fireEvent.click(timingBtn);

    expect(await screen.findByText(/Talk Timing, Audience & Constraints/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate AI Slide Deck & Scripts →/i })).toBeInTheDocument();
  });

  it("switches to Speaker Script stage and displays full pacing guide", async () => {
    render(<PresentationWorkspace projectId="proj-pres-1" />);

    const scriptBtn = screen.getByRole("button", { name: /4\. Speaker Script & Notes/i });
    fireEvent.click(scriptBtn);

    expect(await screen.findByText(/Full Speaker Script & Pacing Guide/i)).toBeInTheDocument();
    expect(screen.getByText(/The Reproducibility Bottleneck in AI Research/i)).toBeInTheDocument();
  });

  it("switches to Q&A simulator stage and triggers rehearsal generation", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        qaScenarios: [
          {
            questionId: "qa-1",
            audienceType: "Senior Conference Referee",
            questionText: "How do you mitigate contradictory evidence?",
            probingIntent: "Testing edge-case robustness.",
            suggestedAnswer: "We use Bayesian consensus weighting.",
          },
        ],
      }),
    });

    render(<PresentationWorkspace projectId="proj-pres-1" />);

    const qaBtn = screen.getByRole("button", { name: /6\. Q&A & Defense Simulator/i });
    fireEvent.click(qaBtn);

    expect(await screen.findByText(/Conference Q&A & Referee Defense Simulator/i)).toBeInTheDocument();
    const simBtn = screen.getByRole("button", { name: /Simulate Audience Q&A →/i });
    fireEvent.click(simBtn);

    expect(await screen.findByText(/How do you mitigate contradictory evidence\?/i)).toBeInTheDocument();
    expect(screen.getByText(/Senior Conference Referee/i)).toBeInTheDocument();
  });
});
