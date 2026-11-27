/** @vitest-environment jsdom */
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ResearchActivityFeed } from "../ResearchActivityFeed";

const items = [
  { kind: "search" as const, text: "sleep memory consolidation" },
  { kind: "read" as const, text: "Sleep-Dependent Learning · Neuron" },
  { kind: "check" as const, text: "18 sources for agreement, contradictions and gaps" },
];

afterEach(cleanup);

describe("ResearchActivityFeed", () => {
  it("lists the real steps as they arrive, newest last", () => {
    render(<ResearchActivityFeed items={items} writing={false} />);
    const rows = screen.getByTestId("research-activity-feed").querySelectorAll("li");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Searching “sleep memory consolidation”");
    expect(rows[1]).toHaveTextContent("Reading Sleep-Dependent Learning · Neuron");
    expect(rows[2]).toHaveTextContent("Checking 18 sources for agreement");
  });

  it("folds into one line of counts once the report is being written, and shows nothing with no steps", () => {
    const { rerender } = render(<ResearchActivityFeed items={items} writing />);
    expect(screen.getByTestId("research-activity-summary")).toHaveTextContent("Researched with 1 search and 1 source read");
    rerender(<ResearchActivityFeed items={[]} writing={false} />);
    expect(screen.queryByTestId("research-activity-feed")).toBeNull();
  });
});
