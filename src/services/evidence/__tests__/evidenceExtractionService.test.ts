import { describe, it, expect } from "vitest";
import {
  extractEvidenceFromPaper,
  calculateMetaAnalysis,
  exportEvidenceMatrixToLatex,
  type EvidenceMatrixItem,
} from "../evidenceExtractionService";

describe("evidenceExtractionService", () => {
  it("extracts empirical variables, study design, and effect metrics from papers", () => {
    const paper = {
      title: "Randomized Controlled Trial of Direct Preference Optimization in Automated Research Assistants",
      abstract: "In this double-blind RCT with a sample of 450 participants, the model yielded Cohen's d = 0.58, p < 0.01.",
      authors: ["Zheng, L.", "Chiang, W."],
      year: 2023,
      doi: "10.1000/18290",
    };

    const item = extractEvidenceFromPaper(paper, 0);

    expect(item.studyDesign).toBe("RCT");
    expect(item.sampleSizeTotal).toBe(450);
    expect(item.effectMetric).toBe("Cohen's d");
    expect(item.effectSize).toBeCloseTo(0.42, 1);
    expect(item.riskOfBias).toBe("low");
    expect(item.verbatimQuote).toBeTruthy();
    expect(item.quoteLocator).toBeTruthy();
  });

  it("calculates fixed-effect and random-effects meta-analysis on compatible studies", () => {
    const items: EvidenceMatrixItem[] = [
      {
        id: "s1",
        sourceId: "p1",
        paperTitle: "Study 1",
        authors: ["Alpha, A."],
        year: 2021,
        studyDesign: "RCT",
        population: "Students",
        intervention: "AI",
        comparison: "Control",
        primaryOutcome: "Score",
        effectMetric: "SMD",
        effectSize: 0.40,
        ciLower: 0.20,
        ciUpper: 0.60,
        standardError: 0.10,
        findingsSummary: "Significant",
        verbatimQuote: "Quote 1",
        riskOfBias: "low",
        verificationStatus: "human_verified",
        tags: [],
      },
      {
        id: "s2",
        sourceId: "p2",
        paperTitle: "Study 2",
        authors: ["Beta, B."],
        year: 2022,
        studyDesign: "RCT",
        population: "Students",
        intervention: "AI",
        comparison: "Control",
        primaryOutcome: "Score",
        effectMetric: "SMD",
        effectSize: 0.50,
        ciLower: 0.30,
        ciUpper: 0.70,
        standardError: 0.10,
        findingsSummary: "Significant",
        verbatimQuote: "Quote 2",
        riskOfBias: "low",
        verificationStatus: "human_verified",
        tags: [],
      },
      {
        id: "s3",
        sourceId: "p3",
        paperTitle: "Study 3",
        authors: ["Gamma, G."],
        year: 2023,
        studyDesign: "Cohort",
        population: "Students",
        intervention: "AI",
        comparison: "Control",
        primaryOutcome: "Score",
        effectMetric: "SMD",
        effectSize: 0.45,
        ciLower: 0.25,
        ciUpper: 0.65,
        standardError: 0.10,
        findingsSummary: "Significant",
        verbatimQuote: "Quote 3",
        riskOfBias: "low",
        verificationStatus: "human_verified",
        tags: [],
      },
    ];

    const result = calculateMetaAnalysis(items, "random");

    expect(result.isPoolable).toBe(true);
    expect(result.totalStudies).toBe(3);
    expect(result.pooledEffect).toBeCloseTo(0.45, 1);
    expect(result.ciLower).toBeLessThan(result.pooledEffect);
    expect(result.ciUpper).toBeGreaterThan(result.pooledEffect);
    expect(result.iSquared).toBeDefined();
    expect(result.cochranesQ).toBeDefined();
    expect(Object.keys(result.studyWeights)).toHaveLength(3);
  });

  it("enforces methodological safeguard: refuses to pool difference metrics with ratio metrics", () => {
    const incompatibleItems: EvidenceMatrixItem[] = [
      {
        id: "s1",
        sourceId: "p1",
        paperTitle: "Linear Study",
        authors: ["Alpha, A."],
        year: 2021,
        studyDesign: "RCT",
        population: "Adults",
        intervention: "Intervention A",
        comparison: "Control",
        primaryOutcome: "Score",
        effectMetric: "SMD",
        effectSize: 0.40,
        ciLower: 0.20,
        ciUpper: 0.60,
        findingsSummary: "Significant",
        verbatimQuote: "Quote 1",
        riskOfBias: "low",
        verificationStatus: "human_verified",
        tags: [],
      },
      {
        id: "s2",
        sourceId: "p2",
        paperTitle: "Ratio Study",
        authors: ["Beta, B."],
        year: 2022,
        studyDesign: "Cohort",
        population: "Adults",
        intervention: "Intervention B",
        comparison: "Control",
        primaryOutcome: "Disease Incidence",
        effectMetric: "Odds Ratio",
        effectSize: 1.85,
        ciLower: 1.20,
        ciUpper: 2.60,
        findingsSummary: "Significant",
        verbatimQuote: "Quote 2",
        riskOfBias: "low",
        verificationStatus: "human_verified",
        tags: [],
      },
    ];

    const result = calculateMetaAnalysis(incompatibleItems, "random");

    expect(result.isPoolable).toBe(false);
    expect(result.incompatibilityReason).toContain("Methodological Incompatibility");
    expect(result.incompatibilityReason).toContain("Cannot pool difference metrics");
  });

  it("enforces methodological safeguard: refuses to pool qualitative studies", () => {
    const qualitativeItems: EvidenceMatrixItem[] = [
      {
        id: "q1",
        sourceId: "p1",
        paperTitle: "Qualitative Inquiry",
        authors: ["Glaser, B."],
        year: 2020,
        studyDesign: "Qualitative",
        population: "Experts",
        intervention: "Interviews",
        comparison: "None",
        primaryOutcome: "Themes",
        effectMetric: "Qualitative",
        findingsSummary: "Identified 4 core themes",
        verbatimQuote: "Quote Q",
        riskOfBias: "unclear",
        verificationStatus: "human_verified",
        tags: [],
      },
      {
        id: "q2",
        sourceId: "p2",
        paperTitle: "Qualitative Study 2",
        authors: ["Strauss, A."],
        year: 2021,
        studyDesign: "Qualitative",
        population: "Clinicians",
        intervention: "Ethnography",
        comparison: "None",
        primaryOutcome: "Grounded Theory",
        effectMetric: "Qualitative",
        findingsSummary: "Grounded theory framework",
        verbatimQuote: "Quote Q2",
        riskOfBias: "unclear",
        verificationStatus: "human_verified",
        tags: [],
      },
    ];

    const result = calculateMetaAnalysis(qualitativeItems);

    expect(result.isPoolable).toBe(false);
    expect(result.incompatibilityReason).toContain("Qualitative studies cannot be mathematically synthesized");
  });

  it("exports evidence matrix to valid LaTeX booktabs table syntax", () => {
    const item: EvidenceMatrixItem = {
      id: "s1",
      sourceId: "p1",
      paperTitle: "Empirical Trial of Transformers",
      authors: ["Vaswani, A.", "Shazeer, N."],
      year: 2017,
      studyDesign: "RCT",
      population: "WMT Benchmark",
      intervention: "Multi-Head Attention",
      comparison: "Recurrent Network",
      primaryOutcome: "BLEU Score",
      effectMetric: "SMD",
      effectSize: 0.65,
      ciLower: 0.45,
      ciUpper: 0.85,
      pValue: 0.001,
      findingsSummary: "State of the art translation",
      verbatimQuote: "Significant gains",
      riskOfBias: "low",
      verificationStatus: "human_verified",
      tags: [],
    };

    const latex = exportEvidenceMatrixToLatex([item]);

    expect(latex).toContain("\\begin{table*}[t]");
    expect(latex).toContain("\\toprule");
    expect(latex).toContain("\\midrule");
    expect(latex).toContain("\\bottomrule");
    expect(latex).toContain("Vaswani (2017)");
    expect(latex).toContain("0.65 [0.45, 0.85]");
    expect(latex).toContain("\\end{table*}");
  });
});

