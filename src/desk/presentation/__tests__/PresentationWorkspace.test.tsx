// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
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
});
