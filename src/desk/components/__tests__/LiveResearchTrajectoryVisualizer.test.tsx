// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import LiveResearchTrajectoryVisualizer, {
  RESEARCH_PIPELINE_STEPS,
} from "../LiveResearchTrajectoryVisualizer";

describe("LiveResearchTrajectoryVisualizer (Phase 5)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders 5-stage research trajectory in completed state", () => {
    render(
      <LiveResearchTrajectoryVisualizer
        isLive={false}
        query="CRISPR gene therapy efficacy"
        defaultExpanded={true}
      />
    );

    expect(screen.getByTestId("research-trajectory-visualizer")).toBeInTheDocument();
    expect(
      screen.getByText(/Autonomous Deep Research Trajectory/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Inquiry: "CRISPR gene therapy efficacy"/i)).toBeInTheDocument();

    // Verify all 5 stages are present
    RESEARCH_PIPELINE_STEPS.forEach((step) => {
      expect(screen.getByText(new RegExp(step.label, "i"))).toBeInTheDocument();
    });
  });

  it("toggles collapse and expand when header button is clicked", () => {
    render(
      <LiveResearchTrajectoryVisualizer
        isLive={false}
        defaultExpanded={false}
      />
    );

    // Initially collapsed: pipeline steps should not be visible
    expect(screen.queryByText(/Stage 1: Query Decomposition/i)).not.toBeInTheDocument();

    // Click header to expand
    const headerBtn = screen.getByRole("button");
    fireEvent.click(headerBtn);

    expect(screen.getByText(/Stage 1: Query Decomposition/i)).toBeInTheDocument();

    // Click again to collapse
    fireEvent.click(headerBtn);
    expect(screen.queryByText(/Stage 1: Query Decomposition/i)).not.toBeInTheDocument();
  });

  it("renders live progress state when isLive is true", () => {
    render(
      <LiveResearchTrajectoryVisualizer
        isLive={true}
        currentStep="searching"
        foundCount={14}
        defaultExpanded={true}
      />
    );

    expect(
      screen.getByText(/Querying external academic indices and OpenAlex metadata.../i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Active/i)).toBeInTheDocument();
  });

  it("renders decomposed sub-questions when research plan is provided", () => {
    const plan = [
      "Analyze viral vector delivery mechanisms in clinical trials",
      "Evaluate off-target cleavage frequency across long-term cohorts",
      "Synthesize regulatory benchmarks from FDA/EMA guidance",
    ];

    render(
      <LiveResearchTrajectoryVisualizer
        isLive={false}
        plan={plan}
        defaultExpanded={true}
      />
    );

    expect(
      screen.getByText(/Decomposed Sub-Questions & Search Trajectory/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Analyze viral vector delivery mechanisms in clinical trials/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Evaluate off-target cleavage frequency across long-term cohorts/i)
    ).toBeInTheDocument();
  });
});

