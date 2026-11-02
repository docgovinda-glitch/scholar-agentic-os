/**
 * Figures and tables as objects: each has its own caption, alt text and
 * content (an image, or a table's rows), and the text refers to it with
 * [FIG:id] or [TAB:id]. Numbers follow the order of first mention, as
 * journals require, so they never go out of sequence. Pure; no I/O.
 */
import { z } from "zod";

export const figureSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]+$/),
  kind: z.enum(["figure", "table"]),
  caption: z.string().default(""),
  /** Describes the image for readers who can't see it (figures). */
  altText: z.string().default(""),
  /** Figures: a data: URL of the image the author uploaded. */
  image: z.string().optional(),
  /** Tables: the header row and body rows as the author typed them. */
  rows: z.array(z.array(z.string())).optional(),
  /** Source or permission note, e.g. "Reproduced from … with permission." */
  credit: z.string().optional(),
});
export type ManuscriptFigure = z.infer<typeof figureSchema>;

export function parseFigures(raw: unknown): ManuscriptFigure[] {
  let v = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  return v.map((f) => figureSchema.safeParse(f)).filter((r) => r.success).map((r) => r.data!);
}

export const figureToken = (f: Pick<ManuscriptFigure, "id" | "kind">) => `[${f.kind === "table" ? "TAB" : "FIG"}:${f.id}]`;
const REF = /\[(FIG|TAB):([A-Za-z0-9_-]+)\]/g;

export interface Numbering {
  /** id → "Figure 2" / "Table 1". */
  label: Record<string, string>;
  /** In numbered order. */
  figures: ManuscriptFigure[];
  tables: ManuscriptFigure[];
  /** Objects the text never mentions (journals require every one cited). */
  unmentioned: ManuscriptFigure[];
  /** Tokens in the text with no object behind them. */
  missing: string[];
}

/** Numbers figures and tables separately, by first mention in the text. */
export function numberFigures(markdown: string, all: ManuscriptFigure[]): Numbering {
  const byId = new Map(all.map((f) => [f.id, f]));
  const order: ManuscriptFigure[] = [];
  const missing: string[] = [];
  for (const m of markdown.matchAll(REF)) {
    const f = byId.get(m[2]);
    if (!f || f.kind !== (m[1] === "TAB" ? "table" : "figure")) {
      if (!missing.includes(m[0])) missing.push(m[0]);
    } else if (!order.includes(f)) order.push(f);
  }
  const figures = order.filter((f) => f.kind === "figure");
  const tables = order.filter((f) => f.kind === "table");
  const label: Record<string, string> = {};
  figures.forEach((f, i) => (label[f.id] = `Figure ${i + 1}`));
  tables.forEach((f, i) => (label[f.id] = `Table ${i + 1}`));
  return { label, figures, tables, unmentioned: all.filter((f) => !order.includes(f)), missing };
}

/** Replaces each reference with its label ("Figure 2"); unknown ones stay as written. */
export function labelReferences(markdown: string, n: Numbering): string {
  return markdown.replace(REF, (tok, _k, id) => n.label[id] ?? tok);
}

const mdCell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** A table's rows as a Markdown pipe table. */
export function tableMarkdown(rows: string[][]): string {
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => mdCell(r[i] ?? ""));
  return [`| ${pad(rows[0]).join(" | ")} |`, `| ${Array(width).fill("---").join(" | ")} |`, ...rows.slice(1).map((r) => `| ${pad(r).join(" | ")} |`)].join("\n");
}

/** "Name | Age\nAda | 36" or tab-separated paste → rows. */
export function parseTableText(text: string): string[][] {
  const lines = text.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  const sep = lines.some((l) => l.includes("\t")) ? "\t" : lines.some((l) => l.includes("|")) ? "|" : ",";
  return lines
    .filter((l) => !/^\|?\s*:?-{2,}/.test(l))
    .map((l) => l.replace(/^\||\|$/g, "").split(sep).map((c) => c.trim()));
}

/**
 * The manuscript with references labelled and every mentioned figure and
 * table placed in a "Figures and tables" section at the end, in numbered
 * order, with its caption: the layout most journals ask for at submission.
 */
export function placeFigures(markdown: string, all: ManuscriptFigure[]): { markdown: string; numbering: Numbering } {
  const n = numberFigures(markdown, all);
  const body = labelReferences(markdown, n);
  const items = [...n.figures, ...n.tables];
  if (!items.length) return { markdown: body, numbering: n };
  const blocks = items.map((f) => {
    const caption = `**${n.label[f.id]}.** ${f.caption.trim()}${f.credit?.trim() ? ` ${f.credit.trim()}` : ""}`.trim();
    if (f.kind === "table") return `${caption}\n\n${tableMarkdown(f.rows ?? [])}`;
    // Images travel as separate files (journals ask for them that way); the text names the file.
    return f.image ? `${caption} _(Image file: ${figureFile(f, n.label[f.id])}.)_` : `${caption} _(No image uploaded yet.)_`;
  });
  return { markdown: `${body.trimEnd()}\n\n## Figures and tables\n\n${blocks.join("\n\n")}\n`, numbering: n };
}

/** File name a figure gets inside a LaTeX package. */
export const figureFile = (f: ManuscriptFigure, label: string) => `${label.toLowerCase().replace(" ", "")}.${/^data:image\/(png)/.test(f.image ?? "") ? "png" : "jpg"}`;

/** Image bytes from the stored data: URL. */
export function imageBytes(dataUrl: string): Uint8Array | null {
  const m = dataUrl.match(/^data:image\/(?:png|jpe?g);base64,(.+)$/);
  if (!m) return null;
  const bin = typeof atob === "function" ? atob(m[1]) : Buffer.from(m[1], "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
