// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import EvidenceSynthesisWorkspace from "../evidence/EvidenceSynthesisWorkspace";
import InteractiveForestPlot from "../evidence/InteractiveForestPlot";
import { type EvidenceMatrixItem } from "../../services/evidence/evidenceExtractionService";

describe("EvidenceSynthesisWorkspace & InteractiveForestPlot", () => {
  const sampleItems: EvidenceMatrixItem[] = [
    {
      id: "item-1",
      sourceId: "p1",
      paperTitle: "Controlled Trial of RLHF Algorithms",
      authors: ["Christiano, P.", "Leike, J."],
      year: 2021,
      journal: "NeurIPS",
      studyDesign: "RCT",
      population: "Expert Evaluators",
      sampleSizeTotal: 450,
      intervention: "RLHF Policy",
      comparison: "SFT Baseline",
      primaryOutcome: "Alignment Accuracy",
      effectMetric: "SMD",
      effectSize: 0.52,
      ciLower: 0.36,
      ciUpper: 0.68,
      pValue: 0.001,
      standardError: 0.08,
      findingsSummary: "Statistically significant improvement",
      verbatimQuote: "The policy achieved a standardized mean difference of 0.52.",
      quoteLocator: "Section 4.1, p. 112",
      riskOfBias: "low",
      verificationStatus: "human_verified",
      tags: ["RCT", "SMD"],
    },
    {
      id: "item-2",
      sourceId: "p2",
      paperTitle: "Preference Optimization Benchmarking",
      authors: ["Rafailov, R.", "Sharma, A."],
      year: 2023,
      journal: "NeurIPS",
      studyDesign: "RCT",
      population: "General Benchmarks",
      sampleSizeTotal: 600,
      intervention: "DPO",
      comparison: "PPO",
      primaryOutcome: "Win Rate",
      effectMetric: "SMD",
      effectSize: 0.44,
      ciLower: 0.28,
      ciUpper: 0.60,
      pValue: 0.002,
      standardError: 0.08,
      findingsSummary: "Higher win rate with lower variance",
      verbatimQuote: "DPO outperformed PPO across all evaluated test distributions.",
      quoteLocator: "Section 5.2, p. 8",
      riskOfBias: "low",
      verificationStatus: "ai_extracted",
      tags: ["RCT", "SMD"],
    },
  ];

  it("renders EvidenceSynthesisWorkspace with matrix table and items", () => {
    render(
      <EvidenceSynthesisWorkspace
        projectId="test-proj"
        initialItems={sampleItems}
      />
    );

    expect(screen.getByText("Evidence Synthesis Workspace")).toBeInTheDocument();
    expect(screen.getByText(/Layer C · Matrix & Forest Plots/i)).toBeInTheDocument();
    expect(screen.getByText("Christiano (2021)")).toBeInTheDocument();
    expect(screen.getByText("Rafailov (2023)")).toBeInTheDocument();
    expect(screen.getByText("SMD: 0.52")).toBeInTheDocument();
  });

  it("switches to the Interactive Forest Plot tab and renders SVG plot and statistics", () => {
    render(
      <EvidenceSynthesisWorkspace
        projectId="test-proj"
        initialItems={sampleItems}
      />
    );

    const forestTab = screen.getByText("Interactive Forest Plot");
    fireEvent.click(forestTab);

    expect(screen.getByText(/Meta-Analytic Forest Plot/i)).toBeInTheDocument();
    expect(screen.getByText("Fixed-Effect")).toBeInTheDocument();
    expect(screen.getByText("Random-Effects (D-L)")).toBeInTheDocument();
    expect(screen.getByText(/Total N:/i)).toBeInTheDocument();
    expect(screen.getByText(/Heterogeneity \(I²\):/i)).toBeInTheDocument();
  });

  it("toggles verification status between AI Extracted and Verified", () => {
    render(
      <EvidenceSynthesisWorkspace
        projectId="test-proj"
        initialItems={sampleItems}
      />
    );

    // Rafailov is ai_extracted initially
    const extractedBadge = screen.getByText("AI Extracted");
    fireEvent.click(extractedBadge);

    // Should now show 2 Verified buttons
    const verifiedBadges = screen.getAllByText("Verified");
    expect(verifiedBadges.length).toBe(2);
  });

  it("calls onOpenPublishingExport when export button is clicked", () => {
    const onOpenPublishingExport = vi.fn();
    render(
      <EvidenceSynthesisWorkspace
        projectId="test-proj"
        initialItems={sampleItems}
        onOpenPublishingExport={onOpenPublishingExport}
      />
    );

    const exportBtn = screen.getByText("Export LaTeX & Overleaf Package");
    fireEvent.click(exportBtn);

    expect(onOpenPublishingExport).toHaveBeenCalledTimes(1);
    expect(onOpenPublishingExport.mock.calls[0][0]).toHaveLength(2);
  });

  it("InteractiveForestPlot renders standalone with null-effect line and pooled diamond", () => {
    render(<InteractiveForestPlot items={sampleItems} />);

    expect(screen.getByText(/Meta-Analytic Forest Plot/i)).toBeInTheDocument();
    expect(screen.getByText("Pooled Effect (Random-Effects)")).toBeInTheDocument();
    expect(screen.getByText(/Favours Control/i)).toBeInTheDocument();
    expect(screen.getByText(/Favours Intervention/i)).toBeInTheDocument();
  });
});

