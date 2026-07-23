/**
 * Stage 12 (target-workflow.md) — real document export. Generates an actual
 * OOXML .docx (via `docx`) and a real, selectable-text PDF (via `pdfmake`'s
 * declarative layout engine — deliberately not jsPDF+html2canvas, which
 * rasterizes text into an image and breaks copy/search/accessibility).
 *
 * Both formats are built from the same plain document model
 * (buildExportDocumentModel), so the two renderers never duplicate the
 * "which fields come from where" logic.
 *
 * Margins/font/line-spacing default to sensible academic values (1" margins,
 * 12pt Times New Roman-equivalent, double-spaced) because project.complianceRules
 * has no structured numeric field for any of these today — only a free-text
 * formattingRules string array (e.g. "Double spaced, 12pt Times New Roman,
 * margins") that isn't safe to parse for an exact value without risking the
 * same invented-from-unstructured-text pattern this project has fixed
 * elsewhere. complianceRules.sectionStructure IS structured (a real ordered
 * array), so it genuinely does drive section order/naming below.
 *
 * References are built from project.dataSources with status === "approved"
 * only — the same gate aiService.ts's buildApprovedDataSourcesContext uses —
 * never from unapproved/pending sources, and never from a drafted
 * "References"/"Bibliography" section's free text (which this deliberately
 * ignores in favor of the structured, gated data).
 */

import { PaperProject } from "../types";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import pdfMake from "pdfmake/build/pdfmake";
// pdfmake's browser build doesn't bundle standard-14 AFM metrics by default
// (only Roboto, in build/fonts) — this separate module supplies the actual
// vfs entries + font-family mapping pdfmake needs to lay out "Times" text.
// Without registering it, createPdf() throws "File 'data/Times-Bold.afm' not
// found in virtual file system" the first time a Times run is measured.
import timesFontContainer from "pdfmake/build/standard-fonts/Times.js";

// ─── Shared document model ───────────────────────────────────────────────

const DEFAULT_SECTION_STRUCTURE = [
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
];

export interface ExportBodySection {
  heading: string;
  content: string;
}

export interface ExportReference {
  name: string;
  url: string;
}

export interface ExportDocumentModel {
  title: string;
  authorsLine: string;
  field: string;
  researchQuestions: string;
  methodology: string;
  abstract: string | null;
  bodySections: ExportBodySection[];
  references: ExportReference[];
  /** Stage 9 confirmed AI-use disclosure text, or null if not yet confirmed — never included unconfirmed. */
  disclosureText: string | null;
}

function isTitlePageKey(key: string): boolean {
  return key.toLowerCase().startsWith("title");
}

function isAbstractKey(key: string): boolean {
  return key.toLowerCase().startsWith("abstract");
}

function isReferencesKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes("reference") || lower.includes("bibliography");
}

function buildAuthorsLine(project: PaperProject): string {
  const primary = [project.authorName, project.authorAffiliation].filter(Boolean).join(", ");
  const co = [project.coAuthorName, project.coAuthorAffiliation].filter(Boolean).join(", ");
  return [primary, co].filter(Boolean).join("; ") || project.authorDetails || "";
}

export function buildExportDocumentModel(project: PaperProject): ExportDocumentModel {
  const sectionStructure = project.complianceRules?.sectionStructure?.length
    ? project.complianceRules.sectionStructure
    : DEFAULT_SECTION_STRUCTURE;

  const sections = project.sections || {};
  const sectionKeys = Object.keys(sections);

  const abstractKey = sectionKeys.find((k) => isAbstractKey(k));
  const abstract = abstractKey && sections[abstractKey]?.trim() ? sections[abstractKey] : null;

  // Body sections: ordered per complianceRules.sectionStructure (real Stage 8
  // data when present), excluding the title page, abstract, and references —
  // each of those is handled by its own dedicated block above/below.
  const orderedKeys = sectionStructure.filter(
    (name) => sections[name]?.trim() && !isTitlePageKey(name) && !isAbstractKey(name) && !isReferencesKey(name)
  );
  // Any drafted section not named in sectionStructure still gets included,
  // appended after the ordered ones, rather than silently dropped.
  const remainingKeys = sectionKeys.filter(
    (k) => sections[k]?.trim() && !orderedKeys.includes(k) && !isTitlePageKey(k) && !isAbstractKey(k) && !isReferencesKey(k)
  );

  const bodySections: ExportBodySection[] = [...orderedKeys, ...remainingKeys].map((key) => ({
    heading: key,
    content: sections[key],
  }));

  const references: ExportReference[] = (project.dataSources || [])
    .filter((s) => s.status === "approved")
    .map((s) => ({ name: s.name, url: s.url }));

  return {
    title: project.title || "Untitled Manuscript",
    authorsLine: buildAuthorsLine(project),
    field: project.field || "",
    researchQuestions: project.researchQuestions || "",
    methodology: project.methodology || "",
    abstract,
    bodySections,
    references,
    disclosureText: project.aiUseDisclosure?.confirmedAt ? project.aiUseDisclosure.disclosureText : null,
  };
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function filenameFor(title: string, extension: string): string {
  return `${(title || "manuscript").toLowerCase().replace(/[^a-z0-9]+/g, "_")}.${extension}`;
}

// ─── .docx export ─────────────────────────────────────────────────────────

const ACADEMIC_MARGIN_TWIPS = 1440; // 1 inch
const ACADEMIC_FONT = "Times New Roman";
const ACADEMIC_FONT_HALF_POINTS = 24; // 12pt, docx `size` is in half-points
const DOUBLE_SPACING = { line: 480, lineRule: "auto" as const }; // 2x single-spacing baseline

export async function exportToDocx(project: PaperProject): Promise<Blob> {
  const model = buildExportDocumentModel(project);

  const bodyRun = (text: string) => new TextRun({ text, font: ACADEMIC_FONT, size: ACADEMIC_FONT_HALF_POINTS });

  const paragraphsFor = (text: string): Paragraph[] =>
    text
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => new Paragraph({ children: [bodyRun(line)], spacing: DOUBLE_SPACING }));

  const heading = (text: string, pageBreakBefore = true) =>
    new Paragraph({
      children: [new TextRun({ text, font: ACADEMIC_FONT, bold: true, size: ACADEMIC_FONT_HALF_POINTS })],
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore,
      spacing: DOUBLE_SPACING,
    });

  const children: InstanceType<typeof Paragraph>[] = [];

  // Title page
  children.push(
    new Paragraph({
      children: [new TextRun({ text: model.title, font: ACADEMIC_FONT, bold: true, size: ACADEMIC_FONT_HALF_POINTS + 8 })],
      alignment: AlignmentType.CENTER,
      spacing: DOUBLE_SPACING,
    })
  );
  if (model.authorsLine) {
    children.push(new Paragraph({ children: [bodyRun(model.authorsLine)], alignment: AlignmentType.CENTER, spacing: DOUBLE_SPACING }));
  }
  if (model.field) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: model.field, italics: true, font: ACADEMIC_FONT, size: ACADEMIC_FONT_HALF_POINTS })],
        alignment: AlignmentType.CENTER,
        spacing: DOUBLE_SPACING,
      })
    );
  }

  // Research overview (raw intake fields — always shown, distinct from any
  // fully drafted "Methodology" section that may also appear in bodySections)
  children.push(heading("Research Overview"));
  if (model.researchQuestions) {
    children.push(new Paragraph({ children: [new TextRun({ text: "Research Questions", bold: true, font: ACADEMIC_FONT, size: ACADEMIC_FONT_HALF_POINTS })], spacing: DOUBLE_SPACING }));
    children.push(...paragraphsFor(model.researchQuestions));
  }
  if (model.methodology) {
    children.push(new Paragraph({ children: [new TextRun({ text: "Methodology", bold: true, font: ACADEMIC_FONT, size: ACADEMIC_FONT_HALF_POINTS })], spacing: DOUBLE_SPACING }));
    children.push(...paragraphsFor(model.methodology));
  }

  // Abstract
  if (model.abstract) {
    children.push(heading("Abstract"));
    children.push(...paragraphsFor(model.abstract));
  }

  // Body sections
  for (const section of model.bodySections) {
    children.push(heading(section.heading));
    children.push(...paragraphsFor(section.content));
  }

  // AI-use disclosure (Stage 9) — placed immediately before references, per
  // Elsevier's published convention for this declaration's placement.
  if (model.disclosureText) {
    children.push(heading("AI-Use Disclosure"));
    children.push(...paragraphsFor(model.disclosureText));
  }

  // References
  children.push(heading("References"));
  if (model.references.length > 0) {
    for (const ref of model.references) {
      children.push(new Paragraph({ children: [bodyRun(`${ref.name} — ${ref.url}`)], spacing: DOUBLE_SPACING }));
    }
  } else {
    children.push(new Paragraph({ children: [bodyRun("No approved sources yet.")], spacing: DOUBLE_SPACING }));
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: ACADEMIC_MARGIN_TWIPS, right: ACADEMIC_MARGIN_TWIPS, bottom: ACADEMIC_MARGIN_TWIPS, left: ACADEMIC_MARGIN_TWIPS },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}

export async function downloadDocx(project: PaperProject): Promise<void> {
  const blob = await exportToDocx(project);
  triggerBlobDownload(blob, filenameFor(project.title, "docx"));
}

// ─── PDF export ────────────────────────────────────────────────────────────

const PDF_MARGIN_POINTS: [number, number, number, number] = [72, 72, 72, 72]; // 1 inch = 72pt

export async function exportToPdf(project: PaperProject): Promise<Blob> {
  // Standard-14 PDF fonts (built into every PDF reader, no embedding needed) —
  // "Times-Roman" is the base-14 equivalent of Times New Roman, chosen over
  // pdfmake's bundled default (Roboto) to match the requested academic font
  // without shipping a Microsoft-licensed font file. addFontContainer merges
  // in both the AFM-metrics vfs entries and the "Times" family mapping.
  (pdfMake as any).addFontContainer(timesFontContainer);

  const model = buildExportDocumentModel(project);
  const content: Record<string, unknown>[] = [];

  content.push({ text: model.title, style: "title", alignment: "center" });
  if (model.authorsLine) content.push({ text: model.authorsLine, alignment: "center", margin: [0, 4, 0, 0] });
  if (model.field) content.push({ text: model.field, italics: true, alignment: "center", margin: [0, 4, 0, 20] });

  content.push({ text: "Research Overview", style: "heading1", pageBreak: "before" });
  if (model.researchQuestions) {
    content.push({ text: "Research Questions", style: "heading2" });
    content.push({ text: model.researchQuestions });
  }
  if (model.methodology) {
    content.push({ text: "Methodology", style: "heading2" });
    content.push({ text: model.methodology });
  }

  if (model.abstract) {
    content.push({ text: "Abstract", style: "heading1", pageBreak: "before" });
    content.push({ text: model.abstract });
  }

  for (const section of model.bodySections) {
    content.push({ text: section.heading, style: "heading1", pageBreak: "before" });
    content.push({ text: section.content });
  }

  if (model.disclosureText) {
    content.push({ text: "AI-Use Disclosure", style: "heading1", pageBreak: "before" });
    content.push({ text: model.disclosureText });
  }

  content.push({ text: "References", style: "heading1", pageBreak: "before" });
  if (model.references.length > 0) {
    content.push({ ul: model.references.map((r) => `${r.name} — ${r.url}`) });
  } else {
    content.push({ text: "No approved sources yet." });
  }

  const docDefinition = {
    content,
    pageMargins: PDF_MARGIN_POINTS,
    defaultStyle: { font: "Times", fontSize: 12, lineHeight: 2 },
    styles: {
      title: { fontSize: 18, bold: true, margin: [0, 0, 0, 8] },
      heading1: { fontSize: 14, bold: true, margin: [0, 0, 0, 8] },
      heading2: { fontSize: 12, bold: true, margin: [0, 8, 0, 4] },
    },
  };

  // pdfmake 0.3.x's getBlob()/getBuffer() are async methods returning a
  // Promise, not the callback-style API of older pdfmake versions — passing
  // a callback here is silently ignored (the callback param goes unused) and
  // the returned Promise is never awaited, so the export hangs forever.
  return (pdfMake as any).createPdf(docDefinition).getBlob();
}

export async function downloadPdf(project: PaperProject): Promise<void> {
  const blob = await exportToPdf(project);
  triggerBlobDownload(blob, filenameFor(project.title, "pdf"));
}
