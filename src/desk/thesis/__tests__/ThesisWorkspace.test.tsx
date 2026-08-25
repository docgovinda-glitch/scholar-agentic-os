// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import ThesisWorkspace from "../ThesisWorkspace";

describe("ThesisWorkspace", () => {
  it("renders thesis title, degree level, and chapters progression", () => {
    render(<ThesisWorkspace projectId="proj-thesis-1" />);

    expect(screen.getByText(/Quantum Cognitive Paradigms/i)).toBeInTheDocument();
    expect(screen.getByText("PhD Dissertation")).toBeInTheDocument();
    expect(screen.getByText(/Dissertation Milestones/i)).toBeInTheDocument();
    expect(screen.getByText("1. Proposal & Framing")).toBeInTheDocument();
  });

  it("switches to Viva / Defense simulator stage when clicked", async () => {
    render(<ThesisWorkspace projectId="proj-thesis-1" />);

    const vivaNavBtn = screen.getByRole("button", { name: /7\. Viva \/ Defense Simulator/i });
    fireEvent.click(vivaNavBtn);

    expect(await screen.findByText(/Viva Voce & Oral Defense Simulator/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Launch Examiner Simulation →/i })).toBeInTheDocument();
  });
});
