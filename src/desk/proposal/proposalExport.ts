/** Proposal export to Word (.docx), built in the browser from the applicant's own content. */
import { AlignmentType, Document, HeadingLevel, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { packDocxToBlob } from "../assignment/services/assignmentExportService";
import { NARRATIVE_SECTIONS, budgetTotal, type NarrativeKey, type ProposalProjectData } from "./proposalModel";

const FONT = "Arial";
const para = (text: string, opts: { italics?: boolean; bold?: boolean } = {}) =>
  new Paragraph({ spacing: { line: 300, after: 140 }, children: [new TextRun({ text, font: FONT, size: 22, italics: opts.italics, bold: opts.bold })] });
const heading = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1) =>
  new Paragraph({ heading: level, spacing: { before: 280, after: 120 }, children: [new TextRun({ text, font: FONT, bold: true })] });
const blocks = (text: string): Paragraph[] =>
  text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b) => para(b.replace(/^#+\s*/, "").replace(/\n/g, " ")));
const cell = (text: string, bold = false) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, font: FONT, size: 20, bold })] })] });

export function buildProposalDocx(d: ProposalProjectData): Document {
  const children: Array<Paragraph | Table> = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: d.title, font: FONT, size: 36, bold: true })] }),
  ];
  const meta = [d.fundingAgency, d.mechanism, d.durationMonths ? `${d.durationMonths} months` : ""].filter((x) => x && String(x).trim());
  if (meta.length) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: meta.join(" · "), font: FONT, size: 22, italics: true })] }));

  children.push(heading("Specific Aims"));
  if (d.overarchingHypothesis.trim()) children.push(para(`Central hypothesis. ${d.overarchingHypothesis.trim()}`));
  const aims = d.specificAims.filter((a) => a.trim());
  if (aims.length) aims.forEach((a, i) => children.push(para(`Aim ${i + 1}. ${a.trim()}`)));
  else children.push(para("[Not written yet]", { italics: true }));

  for (const key of ["significanceStatement", "innovationStatement", "preliminaryStudiesSummary", "approachStrategy", "broaderImpacts"] as NarrativeKey[]) {
    children.push(heading(NARRATIVE_SECTIONS[key].title));
    children.push(...(d[key].trim() ? blocks(d[key]) : [para("[Not written yet]", { italics: true })]));
  }

  children.push(heading("Budget"));
  const items = d.budgetItems.filter((i) => i.amount > 0 || i.description.trim());
  if (items.length) {
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: [cell("Category", true), cell("Item", true), cell("Amount (USD)", true)] }),
        ...items.map((i) => new TableRow({ children: [cell(i.category), cell(i.description || "—"), cell(Math.round(i.amount).toLocaleString("en-US"))] })),
        new TableRow({ children: [cell("Total", true), cell(""), cell(Math.round(budgetTotal(items)).toLocaleString("en-US"), true)] }),
      ],
    }));
  } else children.push(para("[No budget items yet]", { italics: true }));
  if (d.budgetJustification.trim()) {
    children.push(heading("Budget Justification", HeadingLevel.HEADING_2));
    children.push(...blocks(d.budgetJustification));
  }

  return new Document({ sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children }] });
}

export const proposalDocxBlob = (d: ProposalProjectData): Promise<Blob> => packDocxToBlob(buildProposalDocx(d));
