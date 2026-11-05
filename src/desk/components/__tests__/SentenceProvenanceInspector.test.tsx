// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import SentenceProvenanceInspector, { extractGroundedClaims } from "../SentenceProvenanceInspector";

describe("SentenceProvenanceInspector & Grounding Verification (Phase 4)", () => {
  afterEach(() => {
    cleanup();
  });

  const CITATIONS = [
    {
      title: "Attention Is All You Need",
      authors: ["Vaswani, A."],
      year: 2017,
      venue: "NeurIPS",
      url: "https://doi.org/10.48550/arXiv.1706.03762",
      snippet: "Transformer architecture replaces recurrence with multi-head attention.",
      sourceType: "scholarly" as const,
    },
    {
      title: "Direct Preference Optimization",
      authors: ["Rafailov, R."],
      year: 2023,
      venue: "NeurIPS",
      url: "https://doi.org/10.48550/arXiv.2305.18290",
      snippet: "DPO eliminates the need for complex RL training loops.",
      sourceType: "scholarly" as const,
    },
  ];

  const SAMPLE_TEXT =
    "Transformers establish foundational sequence representations through multi-head self-attention mechanisms [1]. Furthermore, Direct Preference Optimization optimizes language models directly from pairwise preferences without an explicit reward model [2].";

  it("extracts grounded claim sentences and associates them with citations", () => {
    const claims = extractGroundedClaims(SAMPLE_TEXT, CITATIONS);
    expect(claims.length).toBe(2);
    expect(claims[0].claimSentence).toContain("Transformers establish foundational sequence representations");
    expect(claims[0].citationIndex).toBe(1);
    expect(claims[0].citation?.title).toBe("Attention Is All You Need");
    expect(claims[0].verbatimExcerpt).toContain("Transformer architecture replaces recurrence");
    expect(claims[0].confidenceScore).toBeGreaterThanOrEqual(85);

    expect(claims[1].claimSentence).toContain("Direct Preference Optimization optimizes language models");
    expect(claims[1].citationIndex).toBe(2);
    expect(claims[1].citation?.title).toBe("Direct Preference Optimization");
  });

  it("renders modal dialog, claim cards, confidence badges, and handles actions", () => {
    const handleClose = vi.fn();
    const handleAddToEvidence = vi.fn();

    render(
      <SentenceProvenanceInspector
        isOpen={true}
        onClose={handleClose}
        responseText={SAMPLE_TEXT}
        citations={CITATIONS}
        onAddToEvidence={handleAddToEvidence}
      />
    );

    expect(screen.getByTestId("sentence-provenance-inspector-modal")).toBeInTheDocument();
    expect(screen.getByText("Sentence-Level Provenance & Grounding Inspector")).toBeInTheDocument();
    expect(screen.getByText("2 Claims Verified")).toBeInTheDocument();

    const claimCards = screen.getAllByTestId("grounded-claim-card");
    expect(claimCards.length).toBe(2);

    expect(screen.getByText(/Transformer architecture replaces recurrence/i)).toBeInTheDocument();
    expect(screen.getByText(/DPO eliminates the need for complex RL/i)).toBeInTheDocument();

    // Add to Evidence Matrix
    const addBtns = screen.getAllByText("Add to Evidence Matrix");
    fireEvent.click(addBtns[0]);
    expect(handleAddToEvidence).toHaveBeenCalledWith(CITATIONS[0]);

    // Close button
    fireEvent.click(screen.getByLabelText("Close Inspector"));
    expect(handleClose).toHaveBeenCalled();
  });

  it("returns null when isOpen is false", () => {
    const { container } = render(
      <SentenceProvenanceInspector
        isOpen={false}
        onClose={vi.fn()}
        responseText={SAMPLE_TEXT}
        citations={CITATIONS}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});

