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
 * Margins/font/line-spacing default to the per-format template's sensible
 * academic values (1" margins, 12pt Times New Roman-equivalent,
 * double-spaced), overridden by complianceRules.layoutOverrides when set
 * (see resolveLayout() below and that field's comment in types.ts).
 * layoutOverrides is intentionally separate from the free-text
 * formattingRules string array (e.g. "Double spaced, 12pt Times New Roman,
 * margins") — formattingRules still isn't parsed, since doing so would risk
 * the same invented-from-unstructured-text pattern this project has fixed
 * elsewhere; layoutOverrides is only ever set from a known-good source (a
 * hardcoded journal template value or direct user input), never derived from
 * it. complianceRules.sectionStructure IS structured (a real ordered
 * array), so it genuinely does drive section order/naming below.
 *
 * References are built from project.dataSources with status === "approved"
 * only — the same gate aiService.ts's buildApprovedDataSourcesContext uses —
 * never from unapproved/pending sources, and never from a drafted
 * "References"/"Bibliography" section's free text (which this deliberately
 * ignores in favor of the structured, gated data).
 */

import { PaperProject } from "../types";
import type { Paragraph as ParagraphT } from "docx";
import { getDocumentTemplate, DocumentLayout } from "../config/documentTemplates";

// Bundle code-splitting (production-readiness pass, 2026-07-24): docx and
// pdfmake (plus its standard-font containers) were static top-level imports,
// pulling both libraries into the main bundle even for users who never
// export a document — a real, measured contributor to the 3.25MB unsplit
// bundle flagged in HANDOVER.md. buildExportDocumentModel (below) needs
// neither library — only exportToDocx/exportToPdf actually do — so each
// loads its own dependency lazily, on first real use, instead of at app
// startup. vi.mock() in documentExportService.test.ts intercepts these the
// same way regardless of static vs. dynamic import syntax, so this doesn't
// change how the existing tests mock docx/pdfmake.
async function loadDocx() {
  return import("docx");
}

async function loadPdfMake() {
  const [{ default: pdfMake }, { default: timesFontContainer }, { default: helveticaFontContainer }] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    // pdfmake's browser build doesn't bundle standard-14 AFM metrics by
    // default (only Roboto, in build/fonts) — these separate modules supply
    // the actual vfs entries + font-family mapping pdfmake needs to lay out
    // Times/Helvetica text. Without registering the right one, createPdf()
    // throws "File 'data/Times-Bold.afm' not found in virtual file system"
    // (or the Helvetica equivalent) the first time a run in that font is
    // measured.
    // @ts-ignore — pdfmake fonts don't have type declarations
    import("pdfmake/build/standard-fonts/Times.js"),
    // @ts-ignore — pdfmake fonts don't have type declarations
    import("pdfmake/build/standard-fonts/Helvetica.js"),
  ]);
  return { pdfMake, timesFontContainer, helveticaFontContainer };
}

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
  /** Stage 7 per-format page layout (margins/font/spacing) — see src/config/documentTemplates.ts. */
  layout: DocumentLayout;
  /** Stage 7 — whether this format conventionally includes a References section (false for newspaper-article). */
  hasReferences: boolean;
  /** Stage 8 — citation-style-appropriate heading ("Works Cited" for MLA, "Bibliography" for Chicago, "References" otherwise). */
  referencesHeading: string;
  /** Stage 8 — real word-count target from complianceRules.wordCountMin/Max, or null when not set. Display-only — never enforced at export time. */
  wordCountTarget: { min?: number; max?: number } | null;
}

/**
 * Citation-style-appropriate heading for the reference list. This is the
 * honest limit of what "citation style affects formatting" can mean here:
 * DiscoveredDataSource carries no structured author/year metadata (just
 * name/url/type/relevance/reliability/limitations), so per-entry citation
 * formatting (e.g. real APA author-date format) isn't derivable without
 * fabricating structure that doesn't exist — only the section's own heading
 * name genuinely differs by convention (MLA's "Works Cited" vs. Chicago's
 * "Bibliography" vs. everything else's "References").
 */
function referencesHeadingFor(citationStyle: string | undefined): string {
  const s = (citationStyle || "").toLowerCase();
  if (s.includes("mla")) return "Works Cited";
  if (s.includes("chicago")) return "Bibliography";
  return "References";
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

// Stage 8/12 — applies complianceRules.layoutOverrides (structured, never
// parsed from free text — see that field's comment in types.ts) on top of
// the per-format template default. Any override left unset falls through
// to the template's value, same as before this field existed.
function resolveLayout(project: PaperProject, template: DocumentLayout): DocumentLayout {
  const overrides = project.complianceRules?.layoutOverrides;
  if (!overrides) return template;
  return {
    marginInches: overrides.marginInches ?? template.marginInches,
    fontSizePt: overrides.fontSizePt ?? template.fontSizePt,
    lineSpacing: overrides.lineSpacing ?? template.lineSpacing,
    docxFontFamily: overrides.fontFamily ?? template.docxFontFamily,
    pdfFontFamily: overrides.fontFamily ? (overrides.fontFamily === "Arial" ? "Helvetica" : "Times") : template.pdfFontFamily,
  };
}

export function buildExportDocumentModel(project: PaperProject): ExportDocumentModel {
  const template = getDocumentTemplate(project.outputFormat);
  const sectionStructure = project.complianceRules?.sectionStructure?.length
    ? project.complianceRules.sectionStructure
    : template.sectionStructure;

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
    layout: resolveLayout(project, template.layout),
    hasReferences: template.hasReferences,
    referencesHeading: referencesHeadingFor(project.complianceRules?.citationStyle),
    wordCountTarget:
      project.complianceRules?.wordCountMin != null || project.complianceRules?.wordCountMax != null
        ? { min: project.complianceRules?.wordCountMin, max: project.complianceRules?.wordCountMax }
        : null,
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
// Margins/font/spacing now come from model.layout (Stage 7 per-format
// template) rather than a single hardcoded academic default.

export async function exportToDocx(project: PaperProject): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await loadDocx();

  const model = buildExportDocumentModel(project);
  const { layout } = model;
  const marginTwips = layout.marginInches * 1440; // twips = 1/1440 inch
  const fontHalfPoints = layout.fontSizePt * 2; // docx `size` is in half-points
  const spacing = layout.lineSpacing === "double" ? { line: 480, lineRule: "auto" as const } : { line: 240, lineRule: "auto" as const };

  const bodyRun = (text: string) => new TextRun({ text, font: layout.docxFontFamily, size: fontHalfPoints });

  const paragraphsFor = (text: string): ParagraphT[] =>
    text
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => new Paragraph({ children: [bodyRun(line)], spacing }));

  const heading = (text: string, pageBreakBefore = true) =>
    new Paragraph({
      children: [new TextRun({ text, font: layout.docxFontFamily, bold: true, size: fontHalfPoints })],
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore,
      spacing,
    });

  const children: ParagraphT[] = [];

  // Title page
  children.push(
    new Paragraph({
      children: [new TextRun({ text: model.title, font: layout.docxFontFamily, bold: true, size: fontHalfPoints + 8 })],
      alignment: AlignmentType.CENTER,
      spacing,
    })
  );
  if (model.authorsLine) {
    children.push(new Paragraph({ children: [bodyRun(model.authorsLine)], alignment: AlignmentType.CENTER, spacing }));
  }
  if (model.field) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: model.field, italics: true, font: layout.docxFontFamily, size: fontHalfPoints })],
        alignment: AlignmentType.CENTER,
        spacing,
      })
    );
  }

  // Research overview (raw intake fields — always shown, distinct from any
  // fully drafted "Methodology" section that may also appear in bodySections)
  children.push(heading("Research Overview"));
  if (model.researchQuestions) {
    children.push(new Paragraph({ children: [new TextRun({ text: "Research Questions", bold: true, font: layout.docxFontFamily, size: fontHalfPoints })], spacing }));
    children.push(...paragraphsFor(model.researchQuestions));
  }
  if (model.methodology) {
    children.push(new Paragraph({ children: [new TextRun({ text: "Methodology", bold: true, font: layout.docxFontFamily, size: fontHalfPoints })], spacing }));
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

  // References — omitted entirely for formats that don't conventionally
  // include one (e.g. newspaper-article), per the format's own template.
  if (model.hasReferences) {
    children.push(heading(model.referencesHeading));
    if (model.references.length > 0) {
      for (const ref of model.references) {
        children.push(new Paragraph({ children: [bodyRun(`${ref.name} — ${ref.url}`)], spacing }));
      }
    } else {
      children.push(new Paragraph({ children: [bodyRun("No approved sources yet.")], spacing }));
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: marginTwips, right: marginTwips, bottom: marginTwips, left: marginTwips },
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
// Margins/font/spacing now come from model.layout (Stage 7 per-format
// template) rather than a single hardcoded academic default.

export async function exportToPdf(project: PaperProject): Promise<Blob> {
  const { pdfMake, timesFontContainer, helveticaFontContainer } = await loadPdfMake();

  const model = buildExportDocumentModel(project);
  const { layout } = model;

  // Standard-14 PDF fonts (built into every PDF reader, no embedding needed) —
  // chosen over pdfmake's bundled default (Roboto) to match the format's
  // real font without shipping a Microsoft-licensed font file.
  // addFontContainer merges in both the AFM-metrics vfs entries and the
  // font-family mapping for whichever standard font this format's template
  // specifies (Times for academic formats, Helvetica for reports/newspaper).
  const fontContainer = layout.pdfFontFamily === "Helvetica" ? helveticaFontContainer : timesFontContainer;
  (pdfMake as any).addFontContainer(fontContainer);

  const marginPoints: [number, number, number, number] = [
    layout.marginInches * 72,
    layout.marginInches * 72,
    layout.marginInches * 72,
    layout.marginInches * 72,
  ];
  const lineHeight = layout.lineSpacing === "double" ? 2 : 1;

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

  if (model.hasReferences) {
    content.push({ text: model.referencesHeading, style: "heading1", pageBreak: "before" });
    if (model.references.length > 0) {
      content.push({ ul: model.references.map((r) => `${r.name} — ${r.url}`) });
    } else {
      content.push({ text: "No approved sources yet." });
    }
  }

  const docDefinition = {
    content,
    pageMargins: marginPoints,
    defaultStyle: { font: layout.pdfFontFamily, fontSize: layout.fontSizePt, lineHeight },
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
