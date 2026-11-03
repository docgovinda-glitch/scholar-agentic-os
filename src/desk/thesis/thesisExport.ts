/**
 * Thesis export: Word (.docx) built in the browser, and Markdown. Only the
 * student's own content goes in; an undrafted chapter says so.
 */
import { AlignmentType, Document, HeadingLevel, PageBreak, Paragraph, TextRun } from "docx";
import { packDocxToBlob } from "../assignment/services/assignmentExportService";
import type { ThesisProjectData } from "./thesisModel";
import { renderThesis } from "./thesisReferences";

const FONT = "Times New Roman";
const para = (text: string, opts: { italics?: boolean; size?: number } = {}) =>
  new Paragraph({ spacing: { line: 360, after: 160 }, children: [new TextRun({ text, font: FONT, size: opts.size ?? 24, italics: opts.italics })] });

/** A reference entry: its *italic* parts (journal, volume, book title) become italic runs. */
const entryPara = (text: string) =>
  new Paragraph({
    spacing: { line: 360, after: 160 },
    indent: { left: 720, hanging: 720 },
    children: text.split(/\*([^*]+)\*/).map((part, i) => new TextRun({ text: part, font: FONT, size: 24, italics: i % 2 === 1 })),
  });

/** Blocks of text separated by blank lines become paragraphs; Markdown headings keep their level. */
function bodyParagraphs(text: string): Paragraph[] {
  return text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const h = b.match(/^(#{1,4})\s+(.*)$/s);
      if (h) {
        return new Paragraph({
          heading: h[1].length <= 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
          spacing: { before: 240, after: 120 },
          children: [new TextRun({ text: h[2].trim(), font: FONT, bold: true })],
        });
      }
      return para(b.replace(/\n/g, " "));
    });
}

export function buildThesisDocx(data: ThesisProjectData): Document {
  const children: Paragraph[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 2400, after: 400 }, children: [new TextRun({ text: data.title, font: FONT, size: 44, bold: true })] }),
  ];
  const meta = [data.degreeLevel, data.fieldOfStudy].filter((x) => x && x.trim());
  if (meta.length) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: meta.join(" · "), font: FONT, size: 26, italics: true })] }));

  const rqs = data.researchQuestions.filter((q) => q.trim());
  if (rqs.length) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Research questions", font: FONT, bold: true })] }));
    rqs.forEach((q, i) => children.push(para(`RQ${i + 1}. ${q.trim()}`)));
  }

  const rendered = renderThesis(data.chapters, data.references ?? {}, data.citationStyle ?? "apa");
  for (const c of rendered.chapters) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 240 }, children: [new TextRun({ text: `Chapter ${c.chapterNumber}: ${c.title}`, font: FONT, bold: true })] }));
    if (c.content?.trim()) children.push(...bodyParagraphs(c.content));
    else children.push(para("[Not drafted yet]", { italics: true }));
    if (c.bibliography?.trim()) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 120 }, children: [new TextRun({ text: "References", font: FONT, bold: true })] }));
      children.push(...bodyParagraphs(c.bibliography.replace(/^#+\s*References\s*\n/i, "")));
    }
  }

  if (rendered.references.length) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 240 }, children: [new TextRun({ text: rendered.heading, font: FONT, bold: true })] }));
    rendered.references.forEach((e) => children.push(entryPara(e)));
  }

  return new Document({ sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children }] });
}

export const thesisDocxBlob = (data: ThesisProjectData): Promise<Blob> => packDocxToBlob(buildThesisDocx(data));

/** A file name from the title: letters, digits and dashes only. */
export function thesisFileName(title: string, ext: "docx" | "md" | "zip", fallback = "thesis"): string {
  const base = title.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || fallback;
  return `${base}.${ext}`;
}
