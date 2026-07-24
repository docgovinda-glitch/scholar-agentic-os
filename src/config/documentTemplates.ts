/**
 * Stage 7/12 (target-workflow.md) — per-output-format document templates.
 *
 * Static, researched-per-format section structures and page layouts,
 * consumed by documentExportService.ts to replace the single hardcoded
 * journal-shaped structure it previously applied to every format
 * (including term papers, reports, and newspaper articles, which don't
 * follow journal-article conventions at all).
 *
 * Not a sample-document-upload-and-learn system (that's the V2 capability,
 * explicitly out of scope here) — these are fixed templates based on real,
 * documented conventions for each format type, researched before writing
 * this file rather than invented:
 * - Journal article / research paper / research proposal: IMRAD-derived
 *   structure (Introduction, Methods, Results, Discussion), the standard
 *   convention across STEM/social-science journals and funding-agency
 *   proposal guidelines (NIH/NSF-style: background, literature review,
 *   research design, timeline — proposals omit Results/Discussion since the
 *   research hasn't been conducted yet, consistent with the Stage 6 decision
 *   that research-proposal projects skip primary data collection).
 * - Term paper: a simpler course-assignment structure (introduction, body,
 *   conclusion, references) — no abstract, no results/methods section,
 *   since most term papers are synthesis/argument-driven rather than
 *   original empirical research (matches `outputFormats.ts`'s own framing).
 * - Book chapter: introduction, literature review/theoretical foundations,
 *   main discussion, conclusion — broader synthesis rather than a single
 *   reported experiment, per academic-publishing guidance on book chapters
 *   vs. journal articles.
 * - Report: executive summary in place of an abstract, findings/body,
 *   recommendations — the standard business/institutional report shape,
 *   distinct from an academic essay's continuous single-narrative structure.
 * - Newspaper article: inverted-pyramid structure (headline, lede, body in
 *   descending order of importance) — the opposite of academic structure,
 *   where the conclusion/most-newsworthy fact leads rather than follows.
 *
 * Layout conventions: academic formats (journal article, research paper,
 * term paper, book chapter, research proposal) use the traditional
 * double-spaced 12pt Times New Roman / 1" margins manuscript format. Reports
 * and newspaper articles conventionally use a single-spaced sans-serif
 * layout instead — a real, documented distinction, not an arbitrary
 * variation.
 */

import { OutputFormat } from "../types";

export interface DocumentLayout {
  marginInches: number;
  /** docx font family name (referenced, not embedded — same as the existing academic default). */
  docxFontFamily: "Times New Roman" | "Arial";
  /** pdfmake standard-14 font key — must have a matching module in pdfmake/build/standard-fonts/ (see documentExportService.ts's addFontContainer usage). */
  pdfFontFamily: "Times" | "Helvetica";
  fontSizePt: number;
  lineSpacing: "single" | "double";
}

export interface DocumentTemplate {
  /** Ordered section headings — the default structure when project.complianceRules.sectionStructure isn't set. */
  sectionStructure: string[];
  layout: DocumentLayout;
  /** Whether this format conventionally includes a standalone abstract (as opposed to e.g. a report's executive summary). */
  hasAbstract: boolean;
  hasReferences: boolean;
  defaultCitationStyle: string;
}

const ACADEMIC_LAYOUT: DocumentLayout = {
  marginInches: 1,
  docxFontFamily: "Times New Roman",
  pdfFontFamily: "Times",
  fontSizePt: 12,
  lineSpacing: "double",
};

const REPORT_STYLE_LAYOUT: DocumentLayout = {
  marginInches: 1,
  docxFontFamily: "Arial",
  pdfFontFamily: "Helvetica",
  fontSizePt: 11,
  lineSpacing: "single",
};

export const DOCUMENT_TEMPLATES: Record<OutputFormat, DocumentTemplate> = {
  "journal-article": {
    sectionStructure: [
      "Title Page",
      "Abstract & Keywords",
      "Introduction",
      "Literature Review / Related Work",
      "Conceptual / Ethical Framework",
      "Methodology / Methods",
      "Results / Analysis",
      "Discussion (including ethical implications and limitations)",
      "Conclusion",
      "Declarations (Funding, Conflicts of Interest, Ethical Approval, Consent, Data Availability)",
      "References",
      "Appendices (if applicable)",
    ],
    layout: ACADEMIC_LAYOUT,
    hasAbstract: true,
    hasReferences: true,
    defaultCitationStyle: "APA 7th",
  },
  "research-paper": {
    sectionStructure: [
      "Title Page",
      "Abstract & Keywords",
      "Introduction",
      "Literature Review / Related Work",
      "Methodology / Methods",
      "Results / Analysis",
      "Discussion",
      "Conclusion",
      "References",
    ],
    layout: ACADEMIC_LAYOUT,
    hasAbstract: true,
    hasReferences: true,
    defaultCitationStyle: "APA 7th",
  },
  "term-paper": {
    sectionStructure: ["Title Page", "Introduction", "Body / Discussion", "Conclusion", "References"],
    layout: ACADEMIC_LAYOUT,
    hasAbstract: false,
    hasReferences: true,
    defaultCitationStyle: "APA 7th",
  },
  "book-chapter": {
    sectionStructure: [
      "Title Page",
      "Introduction",
      "Literature Review / Theoretical Foundations",
      "Main Discussion",
      "Conclusion / Future Directions",
      "References",
    ],
    layout: ACADEMIC_LAYOUT,
    hasAbstract: false,
    hasReferences: true,
    defaultCitationStyle: "Chicago",
  },
  "report": {
    sectionStructure: [
      "Title Page",
      "Executive Summary",
      "Introduction",
      "Body / Findings",
      "Recommendations",
      "Conclusion",
      "References",
      "Appendices (if applicable)",
    ],
    layout: REPORT_STYLE_LAYOUT,
    hasAbstract: false,
    hasReferences: true,
    defaultCitationStyle: "APA 7th",
  },
  "research-proposal": {
    sectionStructure: [
      "Title Page",
      "Introduction / Background",
      "Literature Review",
      "Research Questions / Objectives",
      "Research Design / Methodology",
      "Timeline",
      "References",
    ],
    layout: ACADEMIC_LAYOUT,
    hasAbstract: false,
    hasReferences: true,
    defaultCitationStyle: "APA 7th",
  },
  "newspaper-article": {
    sectionStructure: ["Headline", "Lede", "Body (Inverted Pyramid)"],
    layout: REPORT_STYLE_LAYOUT,
    hasAbstract: false,
    hasReferences: false,
    defaultCitationStyle: "",
  },
};

const FALLBACK_TEMPLATE: DocumentTemplate = DOCUMENT_TEMPLATES["journal-article"];

/** Returns the template for a format, falling back to the journal-article template for an unset/unrecognized format — preserves prior export behavior when outputFormat hasn't been chosen yet. */
export function getDocumentTemplate(outputFormat: OutputFormat | ""): DocumentTemplate {
  return outputFormat && DOCUMENT_TEMPLATES[outputFormat] ? DOCUMENT_TEMPLATES[outputFormat] : FALLBACK_TEMPLATE;
}
