// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
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

    expect(await screen.findByText(/Chapter 3: Methodology & Epistemological Rigor/i)).toBeInTheDocument();
    expect(screen.getByText(/Quantitative Phase: Empirical Benchmarks/i)).toBeInTheDocument();
  });

  it("triggers cross-chapter audit with alignment score", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        audit: {
          alignmentScore: 96,
          coherenceStatus: "Exceptional Doctoral Alignment",
          crossChapterChecks: [
            { check: "Research Question Propagation", details: "Directly mapped to Chapter 4 findings." },
          ],
        },
      }),
    });

    render(<ThesisWorkspace projectId="proj-thesis-1" />);

    const discBtn = screen.getByRole("button", { name: /5\. Critical Discussion/i });
    fireEvent.click(discBtn);

    expect(await screen.findByText(/Chapter 5: Critical Discussion & Cross-Chapter Audit/i)).toBeInTheDocument();
    const auditBtn = screen.getByRole("button", { name: /Run Cross-Chapter Audit →/i });
    fireEvent.click(auditBtn);

    expect(await screen.findByText(/96% · Exceptional Doctoral Alignment/i)).toBeInTheDocument();
    expect(screen.getByText(/Research Question Propagation:/i)).toBeInTheDocument();
  });

  it("switches to Viva / Defense simulator stage when clicked", async () => {
    render(<ThesisWorkspace projectId="proj-thesis-1" />);

    const vivaNavBtn = screen.getByRole("button", { name: /7\. Viva \/ Defense Simulator/i });
    fireEvent.click(vivaNavBtn);

    expect(await screen.findByText(/Doctoral Viva Voce & Oral Defense Committee Simulator/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Launch Examiner Simulation →/i })).toBeInTheDocument();
  });
});
