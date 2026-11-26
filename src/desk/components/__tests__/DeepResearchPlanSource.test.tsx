// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DeepResearchWorkflowCard } from "../DeepResearchWorkflowCard";

describe("DeepResearchWorkflowCard plan origin", () => {
  it("says when the plan was drafted by AI", () => {
    render(<DeepResearchWorkflowCard phase="plan_proposed" subQuestions={["How did X change?"]} planSource="ai" onApprovePlan={vi.fn()} />);
    expect(screen.getByTestId("deep-research-plan-source")).toHaveTextContent(/Drafted by AI/);
  });

  it("labels the starter plan as not written by AI", () => {
    render(<DeepResearchWorkflowCard phase="plan_proposed" subQuestions={["How did X change?"]} planSource="starter" onApprovePlan={vi.fn()} />);
    expect(screen.getByTestId("deep-research-plan-source")).toHaveTextContent(/not written by AI/);
  });

  it("states the real report budget, not 100–300 sources", () => {
    render(<DeepResearchWorkflowCard phase="plan_proposed" subQuestions={["How did X change?"]} onApprovePlan={vi.fn()} />);
    expect(screen.getByText("Up to 40 sources go into the report")).toBeInTheDocument();
    expect(screen.queryByText(/candidates retrieved/)).toBeNull();
  });
});
