// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ResearchExportWorkspace from "../export/ResearchExportWorkspace";
import { type EvidenceMatrixItem } from "../../services/evidence/evidenceExtractionService";

describe("ResearchExportWorkspace", () => {
  const sampleItems: EvidenceMatrixItem[] = [
    {
      id: "item-1",
      sourceId: "p1",
      paperTitle: "Attention Is All You Need",
      authors: ["Vaswani, Ashish", "Shazeer, Noam"],
      year: 2017,
      journal: "NeurIPS",
      studyDesign: "RCT",
      population: "WMT Machine Translation Cohort",
      sampleSizeTotal: 2500,
      intervention: "Multi-Head Attention",
      comparison: "Recurrent Neural Networks",
      primaryOutcome: "BLEU Score",
      effectMetric: "SMD",
      effectSize: 0.72,
      ciLower: 0.56,
      ciUpper: 0.88,
      pValue: 0.001,
      findingsSummary: "Self-attention replaces recurrent models with superior translation accuracy.",
      verbatimQuote: "The Transformer achieves 28.4 BLEU on the WMT 2014 English-to-German translation task.",
      quoteLocator: "Section 5, p. 7",
      riskOfBias: "low",
      verificationStatus: "human_verified",
      tags: ["SMD", "RCT"],
    },
  ];

  it("renders ResearchExportWorkspace with file tree and code viewer", () => {
    render(
      <ResearchExportWorkspace
        projectTitle="Deep Empirical Inquiry"
        evidenceItems={sampleItems}
      />
    );

    expect(screen.getByText("Research Export & Publishing Workspace")).toBeInTheDocument();
    expect(screen.getByText(/Layer D · LaTeX & Overleaf/i)).toBeInTheDocument();
    expect(screen.getByText("Download Overleaf ZIP")).toBeInTheDocument();
    expect(screen.getAllByText("main.tex").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("references.bib")).toBeInTheDocument();
  });

  it("switches active file content when selecting from the file tree", () => {
    render(
      <ResearchExportWorkspace
        projectTitle="Deep Empirical Inquiry"
        evidenceItems={sampleItems}
      />
    );

    // Click references.bib in sidebar
    const bibFileBtn = screen.getByText("references.bib");
    fireEvent.click(bibFileBtn);

    // Code viewer should now display @article
    expect(screen.getByText(/@article\{Vaswani2017,/i)).toBeInTheDocument();
  });

  it("updates document class when selecting from the dropdown", () => {
    render(
      <ResearchExportWorkspace
        projectTitle="Deep Empirical Inquiry"
        evidenceItems={sampleItems}
      />
    );

    const docClassSelect = screen.getByDisplayValue(/article \(Standard Academic Article\)/i);
    fireEvent.change(docClassSelect, { target: { value: "IEEEtran" } });

    // main.tex code viewer should now contain IEEEtran
    expect(screen.getByText(/\\documentclass\[11pt,a4paper\]\{IEEEtran\}/i)).toBeInTheDocument();
  });
});
