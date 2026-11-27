// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DeepResearchWorkflowCard } from "../DeepResearchWorkflowCard";
import { ResearchReportHeader } from "../../ask/ResearchReportHeader";
import { renderFormattedGuideText } from "../../dashboard/guideHelper";

afterEach(cleanup);

describe("Deep Research plan card", () => {
  it("asks for the plan with editable, wrapping questions and one clear start button", () => {
    render(<DeepResearchWorkflowCard phase="plan_proposed" subQuestions={["How large is the effect of exercise on depressive symptoms in adults?"]} onApprovePlan={() => undefined} />);
    expect(screen.getByTestId("deep-research-state-badge")).toHaveTextContent("Ready to start");
    expect(screen.getByLabelText("Sub-question 1").tagName).toBe("TEXTAREA");
    expect(screen.getByRole("button", { name: /Start research/ })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Plan");
  });

  it("shows a running line, not the start button, once the run has started", () => {
    render(<DeepResearchWorkflowCard phase="searching" subQuestions={["q"]} onApprovePlan={() => undefined} />);
    expect(screen.queryByRole("button", { name: /Start research/ })).toBeNull();
    expect(screen.getByText(/Searching scholarly indexes and the web/)).toBeInTheDocument();
  });

  it("folds into 'How this was researched' once the report is ready", () => {
    render(<DeepResearchWorkflowCard phase="report_ready" subQuestions={["First question", "Second question"]} searchedCount={34} citedCount={12} onApprovePlan={() => undefined} />);
    const card = screen.getByTestId("deep-research-workflow-card");
    expect(card.tagName).toBe("DETAILS");
    expect(within(card).getByText("How this was researched")).toBeInTheDocument();
    expect(card).toHaveTextContent("2 questions · 34 sources found · 12 cited");
  });
});

describe("Deep Research report", () => {
  it("sets the 'In short' answer apart as a callout, up to the next heading", () => {
    render(<div>{renderFormattedGuideText("# Exercise and mood\n\n**In short:**\nExercise lowers depressive symptoms a little.\n\n## What the trials show\n\nMore detail.")}</div>);
    const callout = screen.getByTestId("report-in-short");
    expect(callout).toHaveTextContent("In short");
    expect(callout).toHaveTextContent("Exercise lowers depressive symptoms a little.");
    expect(callout).not.toHaveTextContent("More detail.");
    expect(screen.getByRole("heading", { level: 3, name: "Exercise and mood" })).toBeInTheDocument();
  });

  it("labels the report and says what it rests on, leaving out unknown counts", () => {
    const { rerender } = render(<ResearchReportHeader found={34} readInFull={3} cited={12} />);
    expect(screen.getByTestId("research-report-header")).toHaveTextContent("Deep Research34 sources found · 3 read in full · 12 cited");
    rerender(<ResearchReportHeader found={34} readInFull={0} />);
    expect(screen.getByTestId("research-report-header")).toHaveTextContent("Deep Research34 sources found");
    expect(screen.getByTestId("research-report-header")).not.toHaveTextContent("read in full");
  });
});
