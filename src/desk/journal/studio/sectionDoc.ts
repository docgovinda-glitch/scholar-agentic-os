/**
 * A section's stored text (light Markdown: paragraphs, "- " and "1. " lists,
 * "#### " sub-headings, **bold**, *italic*, [CITE:id] citations) to and from
 * the editor's document. Anything else, such as a pasted table, stays as the
 * text it was. The round trip is exact up to blank-line spacing, so saving
 * from the editor never changes what the author did not touch.
 * Pure; no React.
 */

export interface PMMark {
  type: "bold" | "italic";
}
export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: PMMark[];
}

const CITE = /\[CITE:([A-Za-z0-9_.:-]+)\]/;

/** Inline text → text nodes with bold/italic marks, citation nodes and hard breaks. */
function parseInline(src: string): PMNode[] {
  const out: PMNode[] = [];
  const push = (text: string, marks: PMMark[]) => {
    if (!text) return;
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (i > 0) out.push({ type: "hardBreak" });
      if (line) out.push(marks.length ? { type: "text", text: line, marks } : { type: "text", text: line });
    });
  };
  // Tokenise: citations, **bold**, *italic*; the rest is plain text.
  const re = /\[CITE:([A-Za-z0-9_.:-]+)\]|\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    push(src.slice(last, m.index), []);
    if (m[1]) out.push({ type: "citation", attrs: { id: m[1] } });
    else if (m[2]) pushMarked(m[2], [{ type: "bold" }]);
    else if (m[3]) pushMarked(m[3], [{ type: "italic" }]);
    last = re.lastIndex;
  }
  push(src.slice(last), []);
  return out;

  function pushMarked(text: string, marks: PMMark[]) {
    // Citations inside bold or italic keep their own node.
    const parts = text.split(/(\[CITE:[A-Za-z0-9_.:-]+\])/);
    for (const p of parts) {
      const c = p.match(CITE);
      if (c && c[0] === p) out.push({ type: "citation", attrs: { id: c[1] } });
      else push(p, marks);
    }
  }
}

const BULLET = /^[-*] (.*)$/;
const ORDERED = /^\d+\. (.*)$/;
const HEADING = /^#{1,6} (.*)$/;

export function textToDoc(text: string): PMNode {
  const blocks = (text ?? "").replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.replace(/^\n+|\n+$/g, "")).filter((b) => b.trim().length);
  const content: PMNode[] = [];
  for (const b of blocks) {
    const lines = b.split("\n");
    if (lines.length === 1 && HEADING.test(lines[0])) {
      content.push({ type: "heading", attrs: { level: 4 }, content: parseInline(lines[0].replace(HEADING, "$1")) });
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
  // Bold/italic stay open across citations and line breaks inside them, so a
  // bold sentence with a citation in it is written back as one bold run.
  const markOf = (n: PMNode) => {
    const bold = n.marks?.some((m) => m.type === "bold");
    const italic = n.marks?.some((m) => m.type === "italic");
    return bold && italic ? "***" : bold ? "**" : italic ? "*" : "";
  };
  const list = nodes ?? [];
  let out = "";
  let open = "";
  list.forEach((n, i) => {
    if (n.type === "text") {
      const want = markOf(n);
      if (want !== open) {
        out += open + want;
        open = want;
      }
      out += n.text ?? "";
      return;
    }
    // A citation or break keeps the current mark only if the next text has it too.
    const nextText = list.slice(i + 1).find((x) => x.type === "text");
    if (open && (!nextText || markOf(nextText) !== open)) {
      out += open;
      open = "";
    }
    out += n.type === "hardBreak" ? "\n" : n.type === "citation" ? `[CITE:${String(n.attrs?.id ?? "")}]` : "";
  });
  return out + open;
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
    if (b.type === "paragraph") {
      const t = inlineText(b.content);
      if (t.trim()) parts.push(t);
    } else if (b.type === "heading") parts.push(`#### ${inlineText(b.content)}`);
    else if (b.type === "bulletList") parts.push(listText(b, false));
    else if (b.type === "orderedList") parts.push(listText(b, true));
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
