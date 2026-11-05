import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  generateLatexProjectFiles,
  packageLatexProjectZip,
  type ResearchProjectExportData,
} from "../researchLatexExportService";
import { type EvidenceMatrixItem } from "../../evidence/evidenceExtractionService";

describe("researchLatexExportService", () => {
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
    {
      id: "item-2",
      sourceId: "p2",
      paperTitle: "Direct Preference Optimization",
      authors: ["Rafailov, Rafael", "Sharma, Archit"],
      year: 2023,
      journal: "NeurIPS",
      studyDesign: "RCT",
      population: "General Reasoning Benchmarks",
      sampleSizeTotal: 1800,
      intervention: "Implicit Reward Optimization",
      comparison: "PPO Policy Optimization",
      primaryOutcome: "Human Win Rate",
      effectMetric: "SMD",
      effectSize: 0.54,
      ciLower: 0.38,
      ciUpper: 0.70,
      pValue: 0.002,
      findingsSummary: "DPO optimizes policy directly without RL training instability.",
      verbatimQuote: "DPO avoids training a separate reward model or sampling during fine-tuning.",
      quoteLocator: "Section 4.2, p. 5",
      riskOfBias: "low",
      verificationStatus: "human_verified",
      tags: ["SMD", "RCT"],
    },
  ];

  const exportData: ResearchProjectExportData = {
    title: "Empirical Advancements in Deep Autonomous Alignment Architectures",
    inquiryQuery: "How do modern preference alignment models perform empirically against baselines?",
    abstract: "A rigorous empirical synthesis evaluating transformer architectures and preference optimization.",
    keywords: ["Transformers", "DPO", "Meta-Analysis", "Alignment"],
    evidenceItems: sampleItems,
  };

  it("generates complete, compilable, modular LaTeX project files", () => {
    const files = generateLatexProjectFiles(exportData);

    // Verify all core files exist
    expect(files["main.tex"]).toBeDefined();
    expect(files["sections/introduction.tex"]).toBeDefined();
    expect(files["sections/literature_review.tex"]).toBeDefined();
    expect(files["sections/methodology.tex"]).toBeDefined();
    expect(files["sections/findings.tex"]).toBeDefined();
    expect(files["sections/discussion.tex"]).toBeDefined();
    expect(files["sections/conclusion.tex"]).toBeDefined();
    expect(files["tables/evidence_matrix.tex"]).toBeDefined();
    expect(files["tables/statistical_results.tex"]).toBeDefined();
    expect(files["references.bib"]).toBeDefined();
    expect(files["README.md"]).toBeDefined();

    // Verify main.tex structure
    expect(files["main.tex"]).toContain("\\documentclass[11pt,a4paper]{article}");
    expect(files["main.tex"]).toContain("\\input{sections/introduction.tex}");
    expect(files["main.tex"]).toContain("\\bibliography{references}");

    // Verify references.bib structure
    expect(files["references.bib"]).toContain("@article{Vaswani2017,");
    expect(files["references.bib"]).toContain("@article{Rafailov2023,");

    // Verify literature_review citations match keys
    expect(files["sections/literature_review.tex"]).toContain("\\citet{Vaswani2017}");

    // Verify tables
    expect(files["tables/evidence_matrix.tex"]).toContain("\\begin{table*}[t]");
    expect(files["tables/evidence_matrix.tex"]).toContain("\\toprule");
    expect(files["tables/statistical_results.tex"]).toContain("DerSimonian--Laird Random-Effects");
  });

  it("packages all files into an Overleaf-compatible ZIP archive", async () => {
    const zipBlob = await packageLatexProjectZip(exportData);

    expect(zipBlob).toBeDefined();
    expect(zipBlob.size).toBeGreaterThan(500);

    // Unpack ZIP to verify all files are present and uncorrupted
    const unzipped = await JSZip.loadAsync(zipBlob);
    expect(unzipped.file("main.tex")).not.toBeNull();
    expect(unzipped.file("sections/introduction.tex")).not.toBeNull();
    expect(unzipped.file("tables/evidence_matrix.tex")).not.toBeNull();
    expect(unzipped.file("references.bib")).not.toBeNull();
    expect(unzipped.file("README.md")).not.toBeNull();

    const mainTexContent = await unzipped.file("main.tex")?.async("string");
    expect(mainTexContent).toContain("Empirical Advancements in Deep Autonomous Alignment Architectures");
  });
});

