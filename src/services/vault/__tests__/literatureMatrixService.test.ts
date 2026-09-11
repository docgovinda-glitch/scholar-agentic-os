import { describe, it, expect } from "vitest";
import type { VaultItem } from "../../vaultContents";
import {
  generateLiteratureMatrix,
  exportMatrixToMarkdown,
  exportMatrixToCSV,
  formatInTextCitation,
  generateSynthesizedReviewNarrative,
} from "../literatureMatrixService";
import { generateBatchBibTeX, generateBatchBibliography } from "../batchExportHelper";

describe("literatureMatrixService", () => {
  const sampleItems: VaultItem[] = [
    {
      id: "v-1",
      title: "Deep Reinforcement Learning in Clinical Trials",
      content: "This randomized controlled trial investigates DRL agents in clinical dosing.",
      authors: ["Alice Walker", "David Chen"],
      year: "2024",
      journal: "Lancet Digital Health",
      sourceType: "file",
      citation: "Walker, A., & Chen, D. (2024). Deep Reinforcement Learning in Clinical Trials.",
      tags: ["AI", "Healthcare", "RCT"],
      projects: ["Thesis-Chapter-2"],
      metadata: {
        keyPoints: [
          "DRL models reduced dosing variance by 24%.",
          "High patient compliance was observed across trials.",
        ],
        notes: {
          whySaved: "Foundational clinical benchmark for dissertation.",
          limitations: ["Small cohort size (N=42); multi-center validation pending."],
        },
      },
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "v-2",
      title: "Systematic Review of Medical Agent Architectures",
      content: "A systematic review and meta-analysis of agentic workflows.",
      authors: ["Bob Miller", "Elena Rostova", "Frank Zhang"],
      year: "2023",
      journal: "Nature Machine Intelligence",
      sourceType: "file",
      citation: "Miller, B., et al. (2023). Systematic Review of Medical Agent Architectures.",
      tags: ["AI", "Architecture", "Review"],
      projects: ["Thesis-Chapter-2"],
      metadata: {
        keyPoints: [
          "Surveyed 120 papers across 5 medical subfields.",
          "Identified hallucination and provenance as top bottlenecks.",
        ],
        whySaved: "Comprehensive architecture survey.",
      },
      createdAt: "2026-01-02T00:00:00.000Z",
    },
  ];

  it("generates structured matrix rows and statistical summary", () => {
    const matrix = generateLiteratureMatrix(sampleItems, "Thesis-Chapter-2");
    expect(matrix.rows).toHaveLength(2);
    expect(matrix.summary.totalSources).toBe(2);
    expect(matrix.summary.yearSpan.earliest).toBe("2023");
    expect(matrix.summary.yearSpan.latest).toBe("2024");
    expect(matrix.summary.commonThemes).toContain("ai");

    // Row 1 assertions
    const r1 = matrix.rows[0];
    expect(r1.title).toBe("Deep Reinforcement Learning in Clinical Trials");
    expect(r1.methodology).toContain("Randomized Controlled Trial");
    expect(r1.keyFindings).toContain("DRL models reduced dosing variance by 24%.");
    expect(r1.limitations[0]).toContain("Small cohort size");
    expect(r1.projectRelevance).toContain("Primary Evidence for Thesis-Chapter-2");

    // Row 2 assertions
    const r2 = matrix.rows[1];
    expect(r2.methodology).toContain("Systematic Review");
    expect(r2.keyFindings).toContain("Surveyed 120 papers across 5 medical subfields.");
  });

  it("formats standard academic in-text citations", () => {
    expect(formatInTextCitation({ authors: ["Alice Walker"], year: "2024" })).toBe("Walker (2024)");
    expect(formatInTextCitation({ authors: ["Alice Walker", "Bob Smith"], year: "2024" })).toBe("Walker & Smith (2024)");
    expect(formatInTextCitation({ authors: ["Alice Walker", "Bob Smith", "Carol Doe"], year: "2024" })).toBe("Walker et al. (2024)");
  });

  it("generates a synthesized literature review narrative with in-text citations", () => {
    const matrix = generateLiteratureMatrix(sampleItems);
    const narrative = generateSynthesizedReviewNarrative(matrix);
    expect(narrative).toContain("Thematic Synthesis & Literature Overview");
    expect(narrative).toContain("Walker & Chen (2024)");
    expect(narrative).toContain("Miller et al. (2023)");
    expect(narrative).toContain("DRL models reduced dosing variance by 24%");
  });

  it("exports literature matrix as a clean markdown table", () => {
    const matrix = generateLiteratureMatrix(sampleItems);
    const md = exportMatrixToMarkdown(matrix);
    expect(md).toContain("| Source & Year | Research Question / Focus | Methodology | Key Findings / Claims | Limitations & Gaps |");
    expect(md).toContain("Walker & Chen (2024)");
    expect(md).toContain("Miller et al. (2023)");
  });

  it("exports literature matrix as standard RFC-4180 CSV", () => {
    const matrix = generateLiteratureMatrix(sampleItems);
    const csv = exportMatrixToCSV(matrix);
    expect(csv).toContain('"Source Citation","Title","Authors","Year","Journal/Venue"');
    expect(csv).toContain("Deep Reinforcement Learning in Clinical Trials");
    expect(csv).toContain("Systematic Review of Medical Agent Architectures");
  });

  it("batch generates BibTeX and bibliographies", () => {
    const bibtex = generateBatchBibTeX(sampleItems);
    expect(bibtex).toContain("@article");
    expect(bibtex).toContain("Deep Reinforcement Learning in Clinical Trials");

    const biblio = generateBatchBibliography(sampleItems, "apa7");
    expect(biblio).toContain("Walker");
    expect(biblio).toContain("Miller");
  });
});
