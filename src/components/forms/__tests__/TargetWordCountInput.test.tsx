// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  TargetWordCountInput,
  type SectionBreakdown,
} from "../TargetWordCountInput";

describe("TargetWordCountInput Component", () => {
  it("renders with default word count and shows 10/75/15 word distribution preview", () => {
    const onChange = vi.fn();
    render(<TargetWordCountInput value={2000} onChange={onChange} />);

    // Total count input
    const input = screen.getByPlaceholderText("2000") as HTMLInputElement;
    expect(input.value).toBe("2000");

    // Subtext preview: 10% Intro = 200w, 75% Body = 1500w, 15% Concl = 300w
    expect(screen.getByText(/Intro ~200w · Body ~1500w · Concl ~300w/)).toBeDefined();
    expect(screen.getByText("Customize sections")).toBeDefined();
  });

  it("updates proportional defaults when total word count changes while uncustomized", () => {
    const onChange = vi.fn();
    render(<TargetWordCountInput value={3000} onChange={onChange} />);

    const input = screen.getByPlaceholderText("2000");
    fireEvent.change(input, { target: { value: "4000" } });

    expect(onChange).toHaveBeenCalledWith(4000, {
      isCustomized: false,
      intro: { targetWords: 400, guidelines: "" },
      body: { targetWords: 3000, guidelines: "" },
      conclusion: { targetWords: 600, guidelines: "" },
    });
  });

  it("expands and collapses the section customization panel", () => {
    const onChange = vi.fn();
    render(<TargetWordCountInput value={2000} onChange={onChange} />);

    const toggleBtn = screen.getByText("Customize sections");
    fireEvent.click(toggleBtn);

    // Header in expanded panel
    expect(screen.getByText("Section Allocations & Instructions")).toBeDefined();
    expect(screen.getByText("Close section customization")).toBeDefined();

    // Section rows
    expect(screen.getByText("Introduction")).toBeDefined();
    expect(screen.getByText("Body Paragraphs")).toBeDefined();
    expect(screen.getByText("Conclusion")).toBeDefined();

    // Close panel
    fireEvent.click(screen.getByText("Close section customization"));
    expect(screen.queryByText("Section Allocations & Instructions")).toBeNull();
  });

  it("allows editing individual section target words and marks breakdown as customized", () => {
    const onChange = vi.fn();
    render(<TargetWordCountInput value={2000} onChange={onChange} />);

    // Open panel
    fireEvent.click(screen.getByText("Customize sections"));

    // Find target inputs (intro, body, conclusion)
    const targetInputs = screen.getAllByRole("spinbutton");
    // targetInputs[0] is total, targetInputs[1] is intro, targetInputs[2] is body, targetInputs[3] is conclusion
    const introInput = targetInputs[1];
    fireEvent.change(introInput, { target: { value: "250" } });

    expect(onChange).toHaveBeenCalledWith(2000, expect.objectContaining({
      isCustomized: true,
      intro: expect.objectContaining({ targetWords: 250 }),
      body: expect.objectContaining({ targetWords: 1500 }),
      conclusion: expect.objectContaining({ targetWords: 300 }),
    }));
  });

  it("allows entering custom instructions/guidelines for sections", () => {
    const onChange = vi.fn();
    render(<TargetWordCountInput value={2000} onChange={onChange} />);

    fireEvent.click(screen.getByText("Customize sections"));

    const introTextarea = screen.getByPlaceholderText(
      "Hook, thesis statement, key objectives, or background context..."
    );
    fireEvent.change(introTextarea, {
      target: { value: "Focus on AI ethics and algorithmic governance in healthcare." },
    });

    expect(onChange).toHaveBeenCalledWith(2000, expect.objectContaining({
      isCustomized: true,
      intro: {
        targetWords: 200,
        guidelines: "Focus on AI ethics and algorithmic governance in healthcare.",
      },
    }));
  });

  it("allows resetting back to the default 10/75/15 proportional split", () => {
    const customizedSections: SectionBreakdown = {
      isCustomized: true,
      intro: { targetWords: 350, guidelines: "Intro note" },
      body: { targetWords: 1300, guidelines: "Body note" },
      conclusion: { targetWords: 350, guidelines: "Concl note" },
    };

    const onChange = vi.fn();
    render(
      <TargetWordCountInput
        value={2000}
        sections={customizedSections}
        onChange={onChange}
      />
    );

    // Open panel
    fireEvent.click(screen.getByText("Customize sections"));

    const resetBtn = screen.getByText("Reset to default split");
    fireEvent.click(resetBtn);

    expect(onChange).toHaveBeenCalledWith(2000, {
      isCustomized: false,
      intro: { targetWords: 200, guidelines: "" },
      body: { targetWords: 1500, guidelines: "" },
      conclusion: { targetWords: 300, guidelines: "" },
    });
  });

  it("displays balanced vs mismatched word count indicators", () => {
    const balancedSections: SectionBreakdown = {
      isCustomized: true,
      intro: { targetWords: 200, guidelines: "" },
      body: { targetWords: 1500, guidelines: "" },
      conclusion: { targetWords: 300, guidelines: "" },
    };

    const { rerender } = render(
      <TargetWordCountInput
        value={2000}
        sections={balancedSections}
        onChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Customize sections"));
    expect(screen.getByText("2000")).toBeDefined();

    // Mismatched
    const mismatchedSections: SectionBreakdown = {
      isCustomized: true,
      intro: { targetWords: 300, guidelines: "" },
      body: { targetWords: 1500, guidelines: "" },
      conclusion: { targetWords: 300, guidelines: "" },
    };

    rerender(
      <TargetWordCountInput
        value={2000}
        sections={mismatchedSections}
        onChange={vi.fn()}
      />
    );

    // Allocated words is 2100 / 2000 words
    expect(screen.getByText("2100")).toBeDefined();
  });

  it("accurately renders clean energy transition customized section breakdown", () => {
    const payload = {
      targetWordCount: 2000,
      sections: {
        isCustomized: true,
        intro: {
          targetWords: 250,
          guidelines: "Highlight clean energy transition barriers and thesis on regulatory policy.",
        },
        body: {
          targetWords: 1450,
          guidelines: "Evaluate solar vs wind infrastructure capEx in Section 1; regulatory hurdles in Section 2.",
        },
        conclusion: {
          targetWords: 300,
          guidelines: "Provide policy recommendations and final synthesis.",
        },
      },
    };

    render(
      <TargetWordCountInput
        value={payload.targetWordCount}
        sections={payload.sections}
        onChange={vi.fn()}
      />
    );

    // Verify subtext preview with custom targets: Intro ~250w · Body ~1450w · Concl ~300w
    expect(
      screen.getByText(/Intro ~250w · Body ~1450w · Concl ~300w/)
    ).toBeInTheDocument();

    // Expand panel and verify inputs and textareas
    fireEvent.click(screen.getByText("Customize sections"));

    expect(
      screen.getByDisplayValue("Highlight clean energy transition barriers and thesis on regulatory policy.")
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Evaluate solar vs wind infrastructure capEx in Section 1; regulatory hurdles in Section 2.")
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Provide policy recommendations and final synthesis.")
    ).toBeInTheDocument();

    // Total allocated is balanced: 2000 / 2000 words
    expect(screen.getAllByText(/2000/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Reset to default split/)).toBeInTheDocument();
  });
});
