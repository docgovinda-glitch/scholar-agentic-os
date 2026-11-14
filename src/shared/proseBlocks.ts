/**
 * A section's stored text as blocks, for every renderer (editor preview, .docx,
 * PDF, print view). The text is light Markdown: paragraphs separated by blank
 * lines, "#### " sub-headings, "- " / "1. " lists, "> " block quotes and pipe
 * tables ("| a | b |" with a "| --- | --- |" header separator). Inline
 * formatting (**bold**, *italic*, <u>underline</u>) is left in the text for
 * inlineMarkdownRuns. Pure; no DOM.
 */
import { splitProseIntoParagraphs } from "./proseParagraphs";

export type ProseBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "numbered"; items: string[] }
  | { kind: "table"; rows: string[][]; header: boolean };

const HEADING = /^#{1,6}\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const ORDERED = /^\d+\.\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEP = /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/;

/** "| a | b \| c |" -> ["a", "b | c"] */
export function splitTableRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "\\" && inner[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (c === "|") {
      cells.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

const escapeCell = (t: string) => t.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();

/** Rows to a pipe table; the first row is the header row. */
export function tableToMarkdown(rows: string[][]): string {
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((r) => r.length), 1);
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => escapeCell(r[i] ?? ""));
  const line = (r: string[]) => `| ${pad(r).join(" | ")} |`;
  return [line(rows[0]), `| ${Array.from({ length: width }, () => "---").join(" | ")} |`, ...rows.slice(1).map(line)].join("\n");
}

export function parseProseBlocks(text: string): ProseBlock[] {
  const raw = (text ?? "").replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.replace(/^\n+|\n+$/g, "")).filter((b) => b.trim());
  const out: ProseBlock[] = [];
  const pendingProse: string[] = [];
  const flushProse = () => {
    if (!pendingProse.length) return;
    // Plain prose keeps the paragraph regrouping (a single long block is split).
    for (const p of splitProseIntoParagraphs(pendingProse.join("\n\n"))) if (p.trim()) out.push({ kind: "paragraph", text: p.trim() });
    pendingProse.length = 0;
  };
  for (const b of raw) {
    const lines = b.split("\n");
    if (lines.length === 1 && HEADING.test(lines[0])) {
      flushProse();
      out.push({ kind: "heading", text: lines[0].replace(HEADING, "$1").trim() });
    } else if (lines.every((l) => QUOTE.test(l))) {
      flushProse();
      out.push({ kind: "quote", text: lines.map((l) => l.replace(QUOTE, "$1")).join("\n").trim() });
    } else if (lines.length >= 2 && lines.every((l) => TABLE_ROW.test(l))) {
      flushProse();
      const header = TABLE_SEP.test(lines[1]);
      const body = lines.filter((l, i) => !(header && i === 1));
      out.push({ kind: "table", rows: body.map(splitTableRow), header });
    } else if (lines.every((l) => BULLET.test(l))) {
      flushProse();
      out.push({ kind: "bullets", items: lines.map((l) => l.replace(BULLET, "$1")) });
    } else if (lines.every((l) => ORDERED.test(l))) {
      flushProse();
      out.push({ kind: "numbered", items: lines.map((l) => l.replace(ORDERED, "$1")) });
    } else {
      pendingProse.push(b);
    }
  }
  flushProse();
  return out;
}

/** Plain words of a block list (tables, quotes and lists included; no markup). */
export function proseBlocksPlainText(blocks: ProseBlock[]): string {
  return blocks
    .map((b) =>
      b.kind === "table" ? b.rows.map((r) => r.join(" ")).join("\n") : b.kind === "bullets" || b.kind === "numbered" ? b.items.join("\n") : b.text
    )
    .join("\n\n")
    .replace(/<\/?u>/g, "")
    .replace(/\*+/g, "");
}

/** Words in a section's stored text, not counting markup (pipes, table rules, tags, list and quote markers). */
export function countProseWords(text: string): number {
  const plain = (text ?? "")
    .split("\n")
    .filter((l) => !TABLE_SEP.test(l))
    .map((l) => l.replace(/^\s*(?:#{1,6}|>|[-*]|\d+\.)\s+/, ""))
    .join("\n")
    .replace(/<\/?u>/g, "")
    .replace(/\|/g, " ")
    .replace(/\*+/g, "");
  const t = plain.trim();
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}
