// @vitest-environment jsdom
// Rewritten for P0-10: the old tests asserted pre-filled demo reviewer scores,
// praise text and a payline verdict. The worksheet now starts blank and shows
// only the mean of the scores the user enters.
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import StudySectionScorer, { meanCriterionScore, STUDY_SECTION_CRITERIA } from "../components/StudySectionScorer";

describe("StudySectionScorer (self-review worksheet)", () => {
  it("starts blank, with every review criterion and no invented verdict", () => {
    render(<StudySectionScorer proposalTitle="Autonomous Evidence Grounding" fundingAgency="NIH" mechanism="R01" />);
    for (const c of STUDY_SECTION_CRITERIA) {
      expect(screen.getByLabelText(`${c} score`)).toHaveValue(null);
    }
    expect(screen.getByTestId("self-score-mean")).toHaveTextContent("—");
    expect(screen.queryByText(/percentile|payline|Likely Funded|top-tier/i)).not.toBeInTheDocument();
  });

  it("shows the mean of the scores the user enters, clamped to 1-9", () => {
    render(<StudySectionScorer proposalTitle="P" fundingAgency="" mechanism="" />);
    fireEvent.change(screen.getByLabelText("Significance score"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Approach score"), { target: { value: "12" } });
    expect(screen.getByLabelText("Approach score")).toHaveValue(9);
    expect(screen.getByTestId("self-score-mean")).toHaveTextContent("5.5");
    expect(screen.getByText(/2 of 5 scored/i)).toBeInTheDocument();
  });

  it("meanCriterionScore ignores unscored criteria", () => {
    expect(meanCriterionScore([])).toBeNull();
    expect(
      meanCriterionScore([
        { criterion: "Significance", score: 3, notes: "" },
        { criterion: "Innovation", score: null, notes: "" },
      ])
    ).toBe(3);
  });
});
