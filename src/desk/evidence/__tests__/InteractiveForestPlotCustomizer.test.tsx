// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import InteractiveForestPlot, {
  FOREST_PLOT_THEMES,
} from "../InteractiveForestPlot";
import type { EvidenceMatrixItem } from "../../../services/evidence/evidenceExtractionService";

describe("InteractiveForestPlot Customizer & Subgroup Analysis (Phase 6)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const SAMPLE_ITEMS: EvidenceMatrixItem[] = [
    {
      id: "study-1",
      sourceId: "p1",
      paperTitle: "Efficacy of Adaptive Retrieval Systems",
      authors: ["Zhang, Wei", "Chen, Liu"],
      year: 2021,
      studyDesign: "RCT",
      population: "Graduate researchers",
      intervention: "Multi-step agent",
      comparison: "Standard keyword search",
      primaryOutcome: "Discovery precision",
      effectMetric: "SMD",
      effectSize: 0.35,
      ciLower: 0.15,
      ciUpper: 0.55,
      sampleSizeTotal: 240,
      riskOfBias: "low",
      verificationStatus: "human_verified",
      tags: [],
    },
    {
      id: "study-2",
      sourceId: "p2",
      paperTitle: "Evaluation of Iterative Citation Networks",
      authors: ["Alvarez, Maria"],
      year: 2023,
      studyDesign: "Cohort",
      population: "Faculty researchers",
      intervention: "Snowball sampling",
      comparison: "Manual reference lists",
      primaryOutcome: "Citation recall",
      effectMetric: "SMD",
      effectSize: 0.82,
      ciLower: 0.50,
      ciUpper: 1.14,
      sampleSizeTotal: 120,
      riskOfBias: "low",
      verificationStatus: "human_verified",
      tags: [],
    },
    {
      id: "study-3",
      sourceId: "p3",
      paperTitle: "Meta-Analytic Trial on Grounded AI Provenance",
      authors: ["Kovacs, David", "Smith, John"],
      year: 2020,
      studyDesign: "RCT",
      population: "Doctoral students",
      intervention: "Provenance inspector",
      comparison: "Ungrounded LLM",
      primaryOutcome: "Factual accuracy",
      effectMetric: "SMD",
      effectSize: 0.55,
      ciLower: 0.30,
      ciUpper: 0.80,
      sampleSizeTotal: 310,
      riskOfBias: "low",
      verificationStatus: "human_verified",
      tags: [],
    },
  ];

  it("renders forest plot with customizer controls (subgroup, sort, theme, export)", () => {
    render(<InteractiveForestPlot items={SAMPLE_ITEMS} />);

    expect(screen.getByTestId("interactive-forest-plot")).toBeInTheDocument();
    expect(screen.getByTestId("forest-subgroup-select")).toBeInTheDocument();
    expect(screen.getByTestId("forest-sort-select")).toBeInTheDocument();
    expect(screen.getByTestId("forest-theme-select")).toBeInTheDocument();

    // Export buttons
    expect(screen.getByRole("button", { name: /SVG/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PNG \(300 DPI\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /CSV/i })).toBeInTheDocument();
  });

  it("sorts studies dynamically when sort option changes", () => {
    render(<InteractiveForestPlot items={SAMPLE_ITEMS} />);

    const sortSelect = screen.getByTestId("forest-sort-select");

    // Change sort to effect size descending (Alvarez: 0.82 should be first)
    fireEvent.change(sortSelect, { target: { value: "effect-desc" } });

    const textElements = screen.getAllByText(/\(\d{4}\)/i);
    expect(textElements[0]).toHaveTextContent("Alvarez (2023)");

    // Change sort to year descending (newest first: Alvarez 2023)
    fireEvent.change(sortSelect, { target: { value: "year-desc" } });
    expect(screen.getAllByText(/\(\d{4}\)/i)[0]).toHaveTextContent("Alvarez (2023)");

    // Change sort to year ascending (oldest first: Kovacs 2020)
    fireEvent.change(sortSelect, { target: { value: "year-asc" } });
    expect(screen.getAllByText(/\(\d{4}\)/i)[0]).toHaveTextContent("Kovacs (2020)");
  });

  it("filters by subgroup (study design) and recomputes meta-analysis", () => {
    render(<InteractiveForestPlot items={SAMPLE_ITEMS} />);

    const subgroupSelect = screen.getByTestId("forest-subgroup-select");

    // All designs: shows 3 studies
    expect(screen.getByText(/3 Studies/i)).toBeInTheDocument();

    // Filter to RCT only: should show 2 studies (Zhang and Kovacs)
    fireEvent.change(subgroupSelect, { target: { value: "RCT" } });

    expect(screen.getByText(/2 Studies/i)).toBeInTheDocument();
    expect(screen.queryByText(/Alvarez \(2023\)/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Zhang \(2021\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Kovacs \(2020\)/i)).toBeInTheDocument();
  });

  it("switches theme and updates styling colors", () => {
    render(<InteractiveForestPlot items={SAMPLE_ITEMS} />);

    const themeSelect = screen.getByTestId("forest-theme-select");

    // Switch to Nature theme
    fireEvent.change(themeSelect, { target: { value: "nature" } });

    // The pooled diamond polygon should reflect Nature's emerald fill
    const polygon = document.querySelector("polygon");
    expect(polygon).toHaveAttribute("fill", FOREST_PLOT_THEMES.nature.diamondFill);

    // Switch to Lancet theme
    fireEvent.change(themeSelect, { target: { value: "lancet" } });
    expect(polygon).toHaveAttribute("fill", FOREST_PLOT_THEMES.lancet.diamondFill);

    // Switch to Monochrome theme
    fireEvent.change(themeSelect, { target: { value: "monochrome" } });
    expect(polygon).toHaveAttribute("fill", FOREST_PLOT_THEMES.monochrome.diamondFill);
  });

  it("triggers CSV and SVG export clicks without errors", () => {
    // Mock URL.createObjectURL and URL.revokeObjectURL
    const createObjectURLMock = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURLMock = vi.fn();
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;

    render(<InteractiveForestPlot items={SAMPLE_ITEMS} />);

    const svgBtn = screen.getByRole("button", { name: /SVG/i });
    fireEvent.click(svgBtn);
    expect(createObjectURLMock).toHaveBeenCalled();

    const csvBtn = screen.getByRole("button", { name: /CSV/i });
    fireEvent.click(csvBtn);
    expect(createObjectURLMock).toHaveBeenCalledTimes(2);
  });
});

