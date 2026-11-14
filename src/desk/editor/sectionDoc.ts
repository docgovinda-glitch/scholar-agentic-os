/**
 * A section's stored text (light Markdown: paragraphs, "- " and "1. " lists,
 * "#### " sub-headings, **bold**, *italic*, <u>underline</u>, [CITE:id]
 * citations and, with richBlocks, "> " block quotes, pipe tables and paragraph
 * alignment (<p align="center|right|justify">…</p>)) to and
 * from the editor's document. Anything else stays as the text it was. The round trip is exact up to blank-line spacing, so saving
 * from the editor never changes what the author did not touch.
 * Pure; no React.
 */

export interface PMMark {
  type: "bold" | "italic" | "underline";
}
export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: PMMark[];
}

import { splitTableRow, tableToMarkdown, unwrapAlign, wrapAlign } from "../../shared/proseBlocks";


/** Inline text → text nodes with bold/italic/underline marks, citation nodes and hard breaks. */
function parseInline(src: string, inherited: PMMark[] = []): PMNode[] {
  const out: PMNode[] = [];
  const push = (text: string, marks: PMMark[]) => {
    if (!text) return;
    text.split("\n").forEach((line, i) => {
      if (i > 0) out.push({ type: "hardBreak" });
      if (line) out.push(marks.length ? { type: "text", text: line, marks } : { type: "text", text: line });
    });
  };
  const withMark = (type: PMMark["type"]) => (inherited.some((m) => m.type === type) ? inherited : [...inherited, { type }]);
  // Tokenise: citations, <u>underline</u>, **bold**, *italic*; the rest is plain text.
  const re = /\[CITE:([A-Za-z0-9_.:-]+)\]|<u>([\s\S]+?)<\/u>|\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    push(src.slice(last, m.index), inherited);
    if (m[1]) out.push({ type: "citation", attrs: { id: m[1] } });
    else if (m[2] !== undefined) out.push(...parseInline(m[2], withMark("underline")));
    else if (m[3] !== undefined) out.push(...parseInline(m[3], withMark("bold")));
    else if (m[4] !== undefined) out.push(...parseInline(m[4], withMark("italic")));
    last = re.lastIndex;
  }
  push(src.slice(last), inherited);
  return out;
}

const BULLET = /^[-*] (.*)$/;
const ORDERED = /^\d+\. (.*)$/;
const HEADING = /^#{1,6} (.*)$/;
const QUOTE = /^> ?(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEP = /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/;

export interface TextToDocOptions {
  /** Block quotes ("> ") and pipe tables become real blocks; otherwise they stay as text. */
  richBlocks?: boolean;
}

export function textToDoc(text: string, options: TextToDocOptions = {}): PMNode {
  const blocks = (text ?? "").replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.replace(/^\n+|\n+$/g, "")).filter((b) => b.trim().length);
  const content: PMNode[] = [];
  for (const b of blocks) {
    if (options.richBlocks) {
      const aligned = unwrapAlign(b);
      if (aligned.align) {
        const inner = aligned.text.trim();
        if (HEADING.test(inner) && !inner.includes("\n")) {
          content.push({ type: "heading", attrs: { level: 4, textAlign: aligned.align }, content: parseInline(inner.replace(HEADING, "$1")) });
        } else {
          content.push({ type: "paragraph", attrs: { textAlign: aligned.align }, content: parseInline(inner) });
        }
        continue;
      }
    }
    const lines = b.split("\n");
    if (lines.length === 1 && HEADING.test(lines[0])) {
      content.push({ type: "heading", attrs: { level: 4 }, content: parseInline(lines[0].replace(HEADING, "$1")) });
    } else if (options.richBlocks && lines.every((l) => QUOTE.test(l))) {
      content.push({ type: "blockquote", content: lines.map((l) => ({ type: "paragraph", content: parseInline(l.replace(QUOTE, "$1")) })) });
    } else if (options.richBlocks && lines.length >= 2 && lines.every((l) => TABLE_ROW.test(l))) {
      const header = TABLE_SEP.test(lines[1]);
      const rows = lines.filter((_, i) => !(header && i === 1)).map(splitTableRow);
      const width = Math.max(...rows.map((r) => r.length));
      content.push({
        type: "table",
        content: rows.map((r, ri) => ({
          type: "tableRow",
          content: Array.from({ length: width }, (_, ci) => ({
            type: header && ri === 0 ? "tableHeader" : "tableCell",
            content: [{ type: "paragraph", content: parseInline(r[ci] ?? "") }],
          })),
        })),
      });
    } else if (lines.every((l) => BULLET.test(l))) {
      content.push({ type: "bulletList", content: lines.map((l) => ({ type: "listItem", content: [{ type: "paragraph", content: parseInline(l.replace(BULLET, "$1")) }] })) });
    } else if (lines.every((l) => ORDERED.test(l))) {
      content.push({ type: "orderedList", content: lines.map((l) => ({ type: "listItem", content: [{ type: "paragraph", content: parseInline(l.replace(ORDERED, "$1")) }] })) });
    } else {
      content.push({ type: "paragraph", content: parseInline(b) });
    }
  }
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

function inlineText(nodes: PMNode[] | undefined): string {
  // Marks stay open across citations and line breaks inside them, so a bold
  // sentence with a citation in it is written back as one bold run.
  const keyOf = (n: PMNode) => {
    const has = (t: PMMark["type"]) => Boolean(n.marks?.some((m) => m.type === t));
    return `${has("underline") ? "u" : ""}${has("bold") ? "b" : ""}${has("italic") ? "i" : ""}`;
  };
  const opener = (k: string) => `${k.includes("u") ? "<u>" : ""}${k.includes("b") && k.includes("i") ? "***" : k.includes("b") ? "**" : k.includes("i") ? "*" : ""}`;
  const closer = (k: string) => `${k.includes("b") && k.includes("i") ? "***" : k.includes("b") ? "**" : k.includes("i") ? "*" : ""}${k.includes("u") ? "</u>" : ""}`;
  const list = nodes ?? [];
  let out = "";
  let open = "";
  list.forEach((n, i) => {
    if (n.type === "text") {
      const want = keyOf(n);
      if (want !== open) {
        out += closer(open) + opener(want);
        open = want;
      }
      out += n.text ?? "";
      return;
    }
    // A citation or break keeps the current marks only if the next text has them too.
    const nextText = list.slice(i + 1).find((x) => x.type === "text");
    if (open && (!nextText || keyOf(nextText) !== open)) {
      out += closer(open);
      open = "";
    }
    out += n.type === "hardBreak" ? "\n" : n.type === "citation" ? `[CITE:${String(n.attrs?.id ?? "")}]` : "";
  });
  return out + closer(open);
}

function listText(list: PMNode, ordered: boolean): string {
  return (list.content ?? [])
    .map((item, i) => {
      const body = (item.content ?? []).map((p) => (p.type === "paragraph" ? inlineText(p.content) : docToText({ type: "doc", content: [p] }))).join(" ");
      return `${ordered ? `${i + 1}.` : "-"} ${body}`;
    })
    .join("\n");
}

export function docToText(doc: PMNode): string {
  const parts: string[] = [];
  for (const b of doc.content ?? []) {
    const align = typeof b.attrs?.textAlign === "string" ? b.attrs.textAlign : null;
    if (b.type === "paragraph") {
      const t = inlineText(b.content);
      if (t.trim()) parts.push(wrapAlign(t, align));
    } else if (b.type === "heading") parts.push(wrapAlign(`#### ${inlineText(b.content)}`, align));
    else if (b.type === "bulletList") parts.push(listText(b, false));
    else if (b.type === "orderedList") parts.push(listText(b, true));
    else if (b.type === "blockquote") {
      const t = (b.content ?? [])
        .map((p) => (p.type === "paragraph" ? inlineText(p.content) : docToText({ type: "doc", content: [p] })))
        .filter((x) => x.trim())
        .flatMap((x) => x.split("\n"))
        .map((line) => `> ${line}`)
        .join("\n");
      if (t.trim()) parts.push(t);
    } else if (b.type === "table") {
      const rows = (b.content ?? []).map((row) =>
        (row.content ?? []).map((cell) => (cell.content ?? []).map((p) => (p.type === "paragraph" ? inlineText(p.content) : "")).join(" "))
      );
      if (rows.length) parts.push(tableToMarkdown(rows));
    }
    else if (b.content) {
      const t = docToText({ type: "doc", content: b.content });
      if (t.trim()) parts.push(t);
    }
  }
  return parts.join("\n\n");
}

/** The form the round trip preserves: blank-line spacing collapsed, ends trimmed. */
export function normalizeSectionText(text: string): string {
  return (text ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.replace(/^\n+|\n+$/g, ""))
    .filter((b) => b.trim().length)
    .join("\n\n");
}
