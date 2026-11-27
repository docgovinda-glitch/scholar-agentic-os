// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import LiveResearchTrajectoryVisualizer, { RESEARCH_PIPELINE_STEPS, pipelineStepsFor } from "../LiveResearchTrajectoryVisualizer";

describe("LiveResearchTrajectoryVisualizer", () => {
  afterEach(() => {
    cleanup();
  });

  it("while live, shows the step the server reports (its 7 stages fold into 5), with the server's own detail in plain words", () => {
    render(
      <LiveResearchTrajectoryVisualizer
        isLive
        mode="deep-research"
        liveDetail="Stage 5/7: Searching again to fill 2 gaps in the evidence…"
        activeStage={{ id: "iteration", stageNumber: 5, label: "Fill the gaps", status: "running", detail: "" } as never}
      />
    );
    expect(screen.getByText("Researching your question")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/^Searching again to fill 2 gaps in the evidence…$/);
    const current = screen.getByRole("listitem", { current: "step" });
    expect(current).toHaveTextContent("Check");
  });

  it("has a real Stop button (not nested in another control), and shows the activity feed inside the card", () => {
    const onStop = vi.fn();
    render(
      <LiveResearchTrajectoryVisualizer isLive currentStep="searching" onStop={onStop}>
        <p>Reading a paper</p>
      </LiveResearchTrajectoryVisualizer>
    );
    const stop = screen.getByRole("button", { name: "Stop" });
    expect(stop.closest("button")?.parentElement?.closest("button")).toBeNull();
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalled();
    expect(screen.getByText("Reading a paper")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Search");
  });

  it("afterwards, folds into 'How this was researched' and lists the stages the run recorded", () => {
    render(
      <LiveResearchTrajectoryVisualizer
        isLive={false}
        query="CRISPR gene therapy efficacy"
        stages={[
          { id: "planning", stageNumber: 1, label: "Plan the questions", status: "completed", detail: "Broke the question into 4 sub-questions to search." },
          { id: "analysis", stageNumber: 4, label: "Check the evidence", status: "skipped", detail: "The sources were not compared by the AI." },
        ] as never}
      />
    );
    const toggle = screen.getByRole("button", { name: /How this was researched/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Broke the question/)).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByText(/Broke the question into 4 sub-questions/)).toBeInTheDocument();
    expect(screen.getByText("(not run)")).toBeInTheDocument();
  });

  it("with no recorded stages, shows the research trail it was given", () => {
    render(<LiveResearchTrajectoryVisualizer isLive={false} plan={["Analyze viral vector delivery", "Evaluate off-target cleavage"]} defaultExpanded />);
    expect(screen.getByText("Research trail")).toBeInTheDocument();
    expect(screen.getByText("Analyze viral vector delivery")).toBeInTheDocument();
  });
});

describe("pipelineStepsFor", () => {
  it("names the checking step by discipline, with PICO only for clinical questions", () => {
    const label = (q: string) => pipelineStepsFor(q).find((s) => s.id === "extraction")!.label;
    expect(label("CRISPR gene therapy efficacy in patients")).toMatch(/PICO/);
    expect(label("Compare Wendt and Mearsheimer on regional security in East Asia")).not.toMatch(/PICO/);
    expect(RESEARCH_PIPELINE_STEPS.map((s) => s.short)).toEqual(["Plan", "Search", "Read", "Check", "Write"]);
  });
});
