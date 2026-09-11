/**
 * Literature Matrix Service — Comparative Synthesis Engine
 *
 * Transforms multiple selected Vault sources into a structured comparative
 * matrix (Author/Year, Research Question, Methodology, Key Findings, Limitations)
 * and generates publication-ready synthesized literature review narratives.
 */

import type { VaultItem } from "../vaultContents";
import { formatVaultCitation } from "./citationService";

export interface LiteratureMatrixRow {
  sourceId: string;
  title: string;
  authors: string[];
  year: string;
  journal?: string;
  citation: string;
  sourceType: string;
  researchQuestion: string;
  methodology: string;
  keyFindings: string[];
  limitations: string[];
  projectRelevance: string;
  tags: string[];
}

export interface LiteratureMatrixSummary {
  totalSources: number;
  yearSpan: { earliest: string; latest: string };
  commonThemes: string[];
  methodologyBreakdown: Record<string, number>;
  synthesizedNarrative: string;
}

export interface LiteratureMatrixData {
  rows: LiteratureMatrixRow[];
  summary: LiteratureMatrixSummary;
}

/**
 * Infer methodology category from text and metadata cues
 */
function inferMethodology(item: VaultItem): string {
  const text = `${item.title} ${item.content} ${(item.tags || []).join(" ")}`.toLowerCase();
  if (text.includes("meta-analysis") || text.includes("systematic review")) {
    return "Systematic Review / Meta-Analysis";
  }
  if (text.includes("randomized") || text.includes("clinical trial") || text.includes("rct")) {
    return "Randomized Controlled Trial (RCT)";
  }
  if (text.includes("survey") || text.includes("questionnaire") || text.includes("cross-sectional")) {
    return "Quantitative Survey / Cross-Sectional";
  }
  if (text.includes("interview") || text.includes("qualitative") || text.includes("thematic analysis") || text.includes("case study")) {
    return "Qualitative / Case Study";
  }
  if (text.includes("experiment") || text.includes("empirical") || text.includes("quasi-experimental")) {
    return "Empirical Experiment";
  }
  if (text.includes("benchmark") || text.includes("dataset") || text.includes("machine learning") || text.includes("deep learning")) {
    return "Computational / Algorithmic Evaluation";
  }
  if (item.sourceType === "web" || (item.sourceType as string) === "website") {
    return "Web Report / Industry Analysis";
  }
  return "Theoretical / Conceptual Framework";
}

/**
 * Extract or formulate the core research focus / question
 */
function inferResearchQuestion(item: VaultItem): string {
  if (item.metadata?.notes?.whySaved?.trim()) {
    return item.metadata.notes.whySaved.trim();
  }
  if (item.metadata?.whySaved?.trim()) {
    return item.metadata.whySaved.trim();
  }
  const keyPoints = item.metadata?.keyPoints || item.metadata?.notes?.keyPoints || [];
  if (keyPoints.length > 0) {
    return keyPoints[0];
  }
  // Synthesize from title
  return `Investigating ${item.title.replace(/\.$/, "")}.`;
}

/**
 * Extract limitations, caveats, or scope constraints
 */
function inferLimitations(item: VaultItem): string[] {
  const customLimitations = item.metadata?.notes?.limitations || item.metadata?.limitations;
  if (Array.isArray(customLimitations) && customLimitations.length > 0) {
    return customLimitations;
  }
  const content = item.content || "";
  const limitations: string[] = [];

  const sentences = content.split(/(?<=[.?!])\s+/);
  for (const s of sentences) {
    const lower = s.toLowerCase();
    if (
      lower.includes("limitation") ||
      lower.includes("constraint") ||
      lower.includes("caveat") ||
      lower.includes("future research is needed") ||
      lower.includes("small sample size") ||
      lower.includes("generalizability")
    ) {
      if (s.trim().length > 15 && s.trim().length < 250) {
        limitations.push(s.trim());
      }
    }
  }

  if (limitations.length === 0) {
    limitations.push("Findings contingent on contextual sample; broader cross-domain replication advised.");
  }

  return limitations.slice(0, 3);
}

/**
 * Formats a short in-text citation e.g. "Smith et al. (2024)" or "(Smith, 2024)"
 */
export function formatInTextCitation(row: { authors: string[]; year: string }): string {
  const year = row.year || "n.d.";
  if (!row.authors || row.authors.length === 0) {
    return `(${year})`;
  }
  const firstAuthor = row.authors[0].trim().split(" ").pop() || row.authors[0];
  if (row.authors.length === 1) {
    return `${firstAuthor} (${year})`;
  }
  if (row.authors.length === 2) {
    const secondAuthor = row.authors[1].trim().split(" ").pop() || row.authors[1];
    return `${firstAuthor} & ${secondAuthor} (${year})`;
  }
  return `${firstAuthor} et al. (${year})`;
}

/**
 * Generates a cohesive publication-ready synthesized literature review narrative
 */
export function generateSynthesizedReviewNarrative(matrix: LiteratureMatrixData): string {
  if (matrix.rows.length === 0) {
    return "No sources available for literature synthesis.";
  }

  const { rows, summary } = matrix;
  const inTextList = rows.map((r) => formatInTextCitation(r)).join(", ");

  let narrative = `### Thematic Synthesis & Literature Overview\n\n`;
  narrative += `The reviewed literature spanning from ${summary.yearSpan.earliest} to ${summary.yearSpan.latest} includes ${rows.length} critical contributions: ${inTextList}.\n\n`;

  // Themes and methodologies
  const themesStr = summary.commonThemes.slice(0, 5).join(", ");
  if (themesStr) {
    narrative += `Primary thematic convergence centers around **${themesStr}**. `;
  }

  const methodsList = Object.entries(summary.methodologyBreakdown)
    .map(([method, count]) => `${count} study utilizing ${method.toLowerCase()}`)
    .join("; ");
  if (methodsList) {
    narrative += `Methodologically, the corpus exhibits diversity with ${methodsList}.\n\n`;
  }

  // Synthesis per study
  narrative += `#### Key Comparative Findings:\n`;
  for (const r of rows) {
    const cite = formatInTextCitation(r);
    const mainTakeaway = r.keyFindings[0] || r.researchQuestion;
    narrative += `- **${cite}**: ${mainTakeaway}`;
    if (r.limitations.length > 0) {
      narrative += ` *Note on limitations:* ${r.limitations[0]}`;
    }
    narrative += `\n`;
  }

  narrative += `\n#### Synthesis & Emerging Research Gaps:\n`;
  narrative += `While consensus exists across ${rows.map((r) => r.authors[0]?.split(" ").pop() || "the authors").join(", ")} regarding foundational principles, divergence persists regarding operational boundary conditions. Future empirical study is indicated to synthesize these methodologies into a unified evidentiary framework.`;

  return narrative;
}

/**
 * Builds the complete Literature Matrix from a list of VaultItems
 */
export function generateLiteratureMatrix(
  items: VaultItem[],
  activeProject?: string
): LiteratureMatrixData {
  if (!items || items.length === 0) {
    return {
      rows: [],
      summary: {
        totalSources: 0,
        yearSpan: { earliest: "n.d.", latest: "n.d." },
        commonThemes: [],
        methodologyBreakdown: {},
        synthesizedNarrative: "",
      },
    };
  }

  const rows: LiteratureMatrixRow[] = items.map((item) => {
    const rawKeyPoints = item.metadata?.keyPoints || item.metadata?.notes?.keyPoints || [];
    const keyQuote = item.metadata?.notes?.keyQuote || item.metadata?.keyQuote;
    const keyFindings = [...rawKeyPoints];
    if (keyQuote && !keyFindings.includes(keyQuote)) {
      keyFindings.push(`"${keyQuote}"`);
    }
    if (keyFindings.length === 0 && item.content) {
      keyFindings.push(item.content.slice(0, 140) + (item.content.length > 140 ? "…" : ""));
    }

    const citation = item.citation || formatVaultCitation(item, "apa7");
    const year = item.year ? String(item.year) : "n.d.";
    const authors = item.authors || [];
    const projects = item.projects || item.metadata?.projects || (item.collection ? [item.collection] : []);

    let projectRelevance = projects.length > 0 ? projects.join(", ") : "Unassigned";
    if (activeProject && projects.some((p: string) => p.toLowerCase().includes(activeProject.toLowerCase()))) {
      projectRelevance = `Primary Evidence for ${activeProject}`;
    }

    return {
      sourceId: item.id,
      title: item.title,
      authors,
      year,
      journal: item.journal,
      citation,
      sourceType: item.sourceType || "file",
      researchQuestion: inferResearchQuestion(item),
      methodology: inferMethodology(item),
      keyFindings,
      limitations: inferLimitations(item),
      projectRelevance,
      tags: item.tags || item.metadata?.tags || [],
    };
  });

  // Calculate year span
  const numericYears = rows
    .map((r) => parseInt(r.year, 10))
    .filter((y) => !isNaN(y))
    .sort((a, b) => a - b);
  const earliest = numericYears.length > 0 ? String(numericYears[0]) : "n.d.";
  const latest = numericYears.length > 0 ? String(numericYears[numericYears.length - 1]) : "n.d.";

  // Calculate themes
  const tagCounts: Record<string, number> = {};
  rows.forEach((r) => {
    r.tags.forEach((t) => {
      const normalized = t.toLowerCase().trim();
      if (normalized) {
        tagCounts[normalized] = (tagCounts[normalized] || 0) + 1;
      }
    });
  });
  const commonThemes = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);

  // Methodology breakdown
  const methodologyBreakdown: Record<string, number> = {};
  rows.forEach((r) => {
    methodologyBreakdown[r.methodology] = (methodologyBreakdown[r.methodology] || 0) + 1;
  });

  const matrixData: LiteratureMatrixData = {
    rows,
    summary: {
      totalSources: rows.length,
      yearSpan: { earliest, latest },
      commonThemes,
      methodologyBreakdown,
      synthesizedNarrative: "",
    },
  };

  matrixData.summary.synthesizedNarrative = generateSynthesizedReviewNarrative(matrixData);
  return matrixData;
}

/**
 * Exports the Literature Matrix to GitHub Flavored Markdown table
 */
export function exportMatrixToMarkdown(matrix: LiteratureMatrixData): string {
  if (matrix.rows.length === 0) return "*No sources in literature matrix.*";

  let md = `## Literature Review Synthesis Matrix\n\n`;
  md += `| Source & Year | Research Question / Focus | Methodology | Key Findings / Claims | Limitations & Gaps |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- |\n`;

  for (const r of matrix.rows) {
    const authorYear = formatInTextCitation(r);
    const titleClean = r.title.replace(/\|/g, "\\|");
    const sourceCell = `**${authorYear}**<br/>*${titleClean}*`;
    const rqCell = r.researchQuestion.replace(/\|/g, "\\|").replace(/\n/g, " ");
    const methCell = r.methodology.replace(/\|/g, "\\|");
    const findingsCell = r.keyFindings
      .slice(0, 3)
      .map((f) => `• ${f.replace(/\|/g, "\\|").replace(/\n/g, " ")}`)
      .join("<br/>");
    const limitationsCell = r.limitations
      .slice(0, 2)
      .map((l) => `• ${l.replace(/\|/g, "\\|").replace(/\n/g, " ")}`)
      .join("<br/>");

    md += `| ${sourceCell} | ${rqCell} | ${methCell} | ${findingsCell} | ${limitationsCell} |\n`;
  }

  md += `\n---\n\n`;
  md += matrix.summary.synthesizedNarrative;
  return md;
}

/**
 * Exports the Literature Matrix to standard CSV format
 */
export function exportMatrixToCSV(matrix: LiteratureMatrixData): string {
  if (matrix.rows.length === 0) return "";

  function escapeCSV(val: string): string {
    const str = (val || "").replace(/\r?\n/g, " ").replace(/"/g, '""');
    return `"${str}"`;
  }

  const headers = [
    "Source Citation",
    "Title",
    "Authors",
    "Year",
    "Journal/Venue",
    "Research Question",
    "Methodology",
    "Key Findings",
    "Limitations",
    "Project Relevance",
  ];

  const lines = [headers.map(escapeCSV).join(",")];

  for (const r of matrix.rows) {
    const row = [
      r.citation,
      r.title,
      r.authors.join("; "),
      r.year,
      r.journal || "",
      r.researchQuestion,
      r.methodology,
      r.keyFindings.join(" | "),
      r.limitations.join(" | "),
      r.projectRelevance,
    ];
    lines.push(row.map(escapeCSV).join(","));
  }

  return lines.join("\r\n");
}
