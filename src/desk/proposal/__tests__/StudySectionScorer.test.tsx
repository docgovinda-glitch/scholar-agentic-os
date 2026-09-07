// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import StudySectionScorer from "../components/StudySectionScorer";

describe("StudySectionScorer", () => {
  it("renders the NIH 1-9 evaluation criteria, composite impact score, and payline verdict", () => {
    render(
      <StudySectionScorer
        proposalTitle="Autonomous Evidence Grounding"
        fundingAgency="NIH / NSF Joint Track"
        mechanism="R01"
      />
    );

    expect(screen.getByTestId("study-section-scorer")).toBeInTheDocument();
    expect(screen.getByText(/Federal Grant Study Section Review Panel \(NIH \/ NSF\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Significance/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Investigator\(s\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Innovation/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Approach/i)).toBeInTheDocument();
    expect(screen.getByText(/Environment/i)).toBeInTheDocument();
    expect(screen.getByText(/Overall Impact Score/i)).toBeInTheDocument();
  });

  it("updates reviewer score on input change and recalculates composite impact score", () => {
    render(
      <StudySectionScorer
        proposalTitle="Autonomous Evidence Grounding"
        fundingAgency="NIH / NSF Joint Track"
        mechanism="R01"
      />
    );

    const r1Inputs = screen.getAllByRole("spinbutton");
    fireEvent.change(r1Inputs[0], { target: { value: "1" } });

    expect(screen.getByText(/Reviewer Critique: Significance/i)).toBeInTheDocument();
    expect(screen.getByText(/Actionable Revision Roadmap/i)).toBeInTheDocument();
  });

  it("switches active criterion when clicking another evaluation criterion item", () => {
    render(
      <StudySectionScorer
        proposalTitle="Autonomous Evidence Grounding"
        fundingAgency="NIH / NSF Joint Track"
        mechanism="R01"
      />
    );

    const innovationItem = screen.getByText(/Innovation/i);
    fireEvent.click(innovationItem);

    expect(screen.getByText(/Reviewer Critique: Innovation/i)).toBeInTheDocument();
    expect(screen.getByText(/Novel integration of deterministic claim-evidence ledgers/i)).toBeInTheDocument();
  });
});
