// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DeepResearchWorkflowCard } from "../DeepResearchWorkflowCard";

afterEach(cleanup);

describe("Deep Research plan source preview", () => {
  const sources = [
    { title: "Social Theory of International Politics", authors: ["Wendt, A."], year: 1999, choice: "pinned" as const },
    { title: "Offensive Realism Revisited", authors: ["Mearsheimer, J."], year: 2014, choice: "excluded" as const },
  ];

  it("lists discovered sources with pin and exclude controls and reports clicks", () => {
    const onChoice = vi.fn();
    render(
      <DeepResearchWorkflowCard
        phase="plan_proposed"
        subQuestions={["What does Wendt argue?"]}
        previewSources={sources}
        previewStatus="ready"
        onSetSourceChoice={onChoice}
        onApprovePlan={() => undefined}
      />
    );
    expect(screen.getByTestId("plan-source-preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pin Social Theory of International Politics" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Exclude Offensive Realism Revisited" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Exclude Social Theory of International Politics" }));
    expect(onChoice).toHaveBeenCalledWith(0, "excluded");
  });

  it("says when the preview failed and the run will still search", () => {
    render(<DeepResearchWorkflowCard phase="plan_proposed" subQuestions={["q"]} previewStatus="failed" onApprovePlan={() => undefined} />);
    expect(screen.getByText(/Source preview unavailable/)).toBeInTheDocument();
  });
});
