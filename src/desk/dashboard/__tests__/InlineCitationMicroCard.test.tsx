// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { InlineCitationBadge, renderFormattedGuideText } from "../guideHelper";

describe("InlineCitationBadge & Academic Citation Micro-Card (Phase 2)", () => {
  afterEach(() => {
    cleanup();
  });

  const SAMPLE_CITATION = {
    title: "Attention Is All You Need",
    authors: ["Vaswani, A.", "Shazeer, N."],
    year: 2017,
    venue: "NeurIPS",
    url: "https://doi.org/10.48550/arXiv.1706.03762",
    snippet: "Transformer architecture replaces recurrence with multi-head attention.",
    sourceType: "scholarly" as const,
  };

  it("renders inline citation and micro-card with metadata, tags, and DOI link", () => {
    render(
      <InlineCitationBadge
        num={1}
        label="[1]"
        citation={SAMPLE_CITATION}
      />
    );

    expect(screen.getByText("[1]")).toBeInTheDocument();
    const microCard = screen.getByTestId("citation-micro-card");
    expect(microCard).toBeInTheDocument();
    expect(screen.getByText("Attention Is All You Need")).toBeInTheDocument();
    expect(screen.getByText("NeurIPS")).toBeInTheDocument();
    expect(screen.getByText("2017")).toBeInTheDocument();
    expect(screen.getByText("Peer Reviewed")).toBeInTheDocument();
    expect(screen.getByText("Open Access")).toBeInTheDocument();
    expect(screen.getByText("Vaswani, A., Shazeer, N.")).toBeInTheDocument();
    expect(screen.getByText(/Transformer architecture replaces recurrence/i)).toBeInTheDocument();
    expect(screen.getByText("Read DOI")).toBeInTheDocument();
  });

  it("triggers onAddToEvidence and onFocusInGraph callbacks on action button clicks", () => {
    const handleAddToEvidence = vi.fn();
    const handleFocusInGraph = vi.fn();

    render(
      <InlineCitationBadge
        num={1}
        label="[1]"
        citation={SAMPLE_CITATION}
        onAddToEvidence={handleAddToEvidence}
        onFocusInGraph={handleFocusInGraph}
      />
    );

    const matrixBtn = screen.getByText("+ Matrix");
    fireEvent.click(matrixBtn);
    expect(handleAddToEvidence).toHaveBeenCalledWith(SAMPLE_CITATION);

    const graphBtn = screen.getByText("Graph ↗");
    fireEvent.click(graphBtn);
    expect(handleFocusInGraph).toHaveBeenCalledWith(SAMPLE_CITATION);
  });

  it("renderFormattedGuideText propagates onAddToEvidence and onFocusInGraph to inline citations", () => {
    const handleAddToEvidence = vi.fn();
    const handleFocusInGraph = vi.fn();

    render(
      <div>
        {renderFormattedGuideText(
          "Transformers [1] revolutionized machine learning.",
          [SAMPLE_CITATION],
          "apa",
          handleAddToEvidence,
          handleFocusInGraph
        )}
      </div>
    );

    expect(screen.getByText(/Transformers/i)).toBeInTheDocument();
    const matrixBtn = screen.getByText("+ Matrix");
    fireEvent.click(matrixBtn);
    expect(handleAddToEvidence).toHaveBeenCalledWith(SAMPLE_CITATION);
  });
});
