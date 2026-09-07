// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import LiveSlidePlayer from "../components/LiveSlidePlayer";
import type { PresentationProjectData } from "../types";

const mockDeck: PresentationProjectData = {
  projectId: "test-deck-1",
  title: "Empirical Grounding in AI Systems",
  durationMinutes: 15,
  targetAudience: "Academic Conference",
  narrativeHook: "Overcoming citation hallucinations.",
  coreInsight: "Bayesian evidence graphs ensure 100% precision.",
  slides: [
    {
      slideNumber: 1,
      type: "title",
      title: "Empirical Grounding in AI Systems",
      subtitle: "A Zero-Hallucination Framework",
      visualFocus: "Title slide banner",
      keyPoints: ["Presenter: Scholar Core", "15 Min Keynote"],
      speakerNotes: "Welcome everyone to this keynote presentation.",
      targetDurationSeconds: 60,
    },
    {
      slideNumber: 2,
      type: "results",
      title: "Empirical Evaluation",
      subtitle: "1000 Manuscripts Tested",
      visualFocus: "Bar chart with confidence intervals",
      keyPoints: ["100% precision", "Zero hallucinations"],
      speakerNotes: "Here are the benchmark results showing statistically significant gains.",
      targetDurationSeconds: 180,
    },
  ],
};

describe("LiveSlidePlayer", () => {
  it("renders audience slide canvas by default and responds to keyboard arrow keys", () => {
    const onClose = vi.fn();
    render(<LiveSlidePlayer deckData={mockDeck} onClose={onClose} />);

    expect(screen.getByTestId("live-slide-player")).toBeInTheDocument();
    expect(screen.getByTestId("audience-slide-canvas")).toBeInTheDocument();
    expect(screen.getAllByText(/Empirical Grounding in AI Systems/i).length).toBeGreaterThanOrEqual(1);

    // Advance with ArrowRight
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getAllByText(/Empirical Evaluation/i).length).toBeGreaterThanOrEqual(1);

    // Go back with ArrowLeft
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText(/A Zero-Hallucination Framework/i)).toBeInTheDocument();
  });

  it("toggles Presenter Mode and renders speaker rehearsal timer and notes", () => {
    const onClose = vi.fn();
    render(<LiveSlidePlayer deckData={mockDeck} onClose={onClose} />);

    const toggleBtn = screen.getByRole("button", { name: /Audience Mode/i });
    fireEvent.click(toggleBtn);

    // Presenter mode active
    expect(screen.getByText(/Presenter Mode \(Active\)/i)).toBeInTheDocument();
    expect(screen.getByTestId("speaker-rehearsal-timer")).toBeInTheDocument();
    expect(screen.getByText(/Welcome everyone to this keynote presentation/i)).toBeInTheDocument();
    expect(screen.getByText(/Up Next: Slide 2/i)).toBeInTheDocument();
  });

  it("calls onClose when Escape key is pressed or exit button is clicked", () => {
    const onClose = vi.fn();
    render(<LiveSlidePlayer deckData={mockDeck} onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
