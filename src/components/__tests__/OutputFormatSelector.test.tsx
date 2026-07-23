// @vitest-environment jsdom
//
// OutputFormatSelector.tsx — Stage 4 (target-workflow.md) output-format picker.
// Shown immediately after workspace launch, before any Stage 5 research-input
// fields. Pure presentational component: renders the 7 configured formats and
// reports the chosen one via onSelect — no project/service dependencies.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import OutputFormatSelector from "../OutputFormatSelector";
import { OUTPUT_FORMAT_OPTIONS } from "../../config/outputFormats";

afterEach(() => {
  cleanup();
});

describe("OutputFormatSelector", () => {
  it("renders all 7 configured output formats", () => {
    render(<OutputFormatSelector onSelect={vi.fn()} />);
    expect(OUTPUT_FORMAT_OPTIONS).toHaveLength(7);
    for (const option of OUTPUT_FORMAT_OPTIONS) {
      expect(screen.getByText(option.label)).toBeInTheDocument();
    }
  });

  it("calls onSelect with the correct format id when a card is clicked", () => {
    const onSelect = vi.fn();
    render(<OutputFormatSelector onSelect={onSelect} />);

    fireEvent.click(screen.getByText("Newspaper Article"));
    expect(onSelect).toHaveBeenCalledWith("newspaper-article");

    fireEvent.click(screen.getByText("Research Proposal"));
    expect(onSelect).toHaveBeenCalledWith("research-proposal");
  });
});
