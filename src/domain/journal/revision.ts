/**
 * A revision round from the journal's real reviews: the decision letter split
 * into numbered comments per reviewer, the author's reply to each, the
 * manuscript sections changed since the reviews arrived, and the response
 * letter built only from what the author wrote. Pure; no I/O.
 */
import { z } from "zod";

export const revisionCommentSchema = z.object({
  id: z.string(),
  /** "Reviewer 1", "Editor", … as the letter names them. */
  reviewer: z.string(),
  number: z.number().int(),
  text: z.string(),
  response: z.string().default(""),
  status: z.enum(["open", "revised", "answered", "declined"]).default("open"),
  /** Section titles the author says the change is in. */
  sections: z.array(z.string()).default([]),
});
export type RevisionComment = z.infer<typeof revisionCommentSchema>;

export const revisionRoundSchema = z.object({
  round: z.number().int().min(1),
  importedAt: z.string(),
  /** Section title → text at import, to show what changed since. */
  baseline: z.record(z.string(), z.string()),
  comments: z.array(revisionCommentSchema),
});
export type RevisionRound = z.infer<typeof revisionRoundSchema>;

export function parseRevisionRound(raw: unknown): RevisionRound | null {
  let v = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const r = revisionRoundSchema.safeParse(v);
  return r.success ? r.data : null;
}

// ── Splitting a decision letter ──────────────────────────────────────────

const HEADER = /^\s*(?:#+\s*)?(?:\*\*)?\s*((?:Reviewer|Referee)\s*[#:]?\s*(\d+|[A-Z]\b)|(?:Associate |Academic |Handling )?Editor(?:'s)?(?:\s+comments)?)\s*(?:\*\*)?\s*[:.\-–—]?\s*(?:\*\*)?\s*(?:comments?\s*(?:to\s+(?:the\s+)?authors?)?\s*:?)?\s*(.*)$/i;
const SIGN_OFF = /^\s*(?:(?:kind|best|warm|with best)\s+regards|regards|sincerely|yours (?:sincerely|faithfully|truly)|best wishes)\b/i;
const LABEL_ONLY = /^\s*(?:comments?\s+(?:to|for)\s+(?:the\s+)?(?:authors?|editor)|reviewer comments?|reviewers'? comments?)\s*:?\s*$/i;
const POINT = /^\s*(?:\(?(\d{1,3})[.)]|(?:Comment|Point|Issue|Q)\s*#?\s*(\d{1,3})\s*[:.)\-–—]|[-•*])\s+(.*)$/i;

function reviewerName(match: RegExpMatchArray): string {
  if (match[2]) return `Reviewer ${match[2].toUpperCase()}`;
  return /editor/i.test(match[1]) ? "Editor" : match[1].trim();
}

/**
 * Splits pasted reviews into comments. A "Reviewer 2" / "Referee #2" /
 * "Editor" line starts a reviewer; numbered or bulleted points start
 * comments; a reviewer with no points becomes one comment per paragraph.
 * Wording is kept as written.
 */
export function splitReviews(letter: string): Array<{ reviewer: string; number: number; text: string }> {
  const lines = letter.replace(/\r\n/g, "\n").split("\n");
  type Block = { reviewer: string; lines: string[] };
  const blocks: Block[] = [];
  let current: Block | null = null;
  for (const line of lines) {
    const h = line.match(HEADER);
    if (h && line.trim().length < 120) {
      current = { reviewer: reviewerName(h), lines: [] };
      blocks.push(current);
      if (h[3]?.trim()) current.lines.push(h[3].trim());
      continue;
    }
    if (!current) continue; // text before the first reviewer (greetings, decision) is not a comment
    if (SIGN_OFF.test(line)) {
      current = null; // the sign-off and anything after it belong to no reviewer
      continue;
    }
    if (LABEL_ONLY.test(line)) continue;
    current.lines.push(line);
  }

  const out: Array<{ reviewer: string; number: number; text: string }> = [];
  for (const b of blocks) {
    // Numbered or bulleted points are comments; so is any paragraph outside
    // them (opening remarks, a note after the list), so nothing is dropped.
    const items: string[] = [];
    let open: string[] | null = null;
    let para: string[] = [];
    let prevBlank = false;
    const flushPara = () => {
      if (para.join(" ").trim()) items.push(para.join(" "));
      para = [];
    };
    const flushOpen = () => {
      if (open) items.push(open.join(" "));
      open = null;
    };
    for (const line of b.lines) {
      const p = line.match(POINT);
      if (p) {
        flushPara();
        flushOpen();
        open = [p[3].trim()];
      } else if (!line.trim()) {
        if (!open) flushPara();
      } else if (open && !prevBlank) {
        open.push(line.trim());
      } else {
        flushOpen();
        para.push(line.trim());
      }
      prevBlank = !line.trim();
    }
    flushOpen();
    flushPara();
    items
      .map((t) => t.replace(/\s+/g, " ").trim())
      .filter((t) => t.length > 0)
      .forEach((text, i) => out.push({ reviewer: b.reviewer, number: i + 1, text }));
  }
  return out;
}

// ── What changed since the reviews arrived ───────────────────────────────

/** "### § Title" (or ## Title) sections of the manuscript, title → text. */
export function sectionsOf(markdown: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = markdown.split(/\n(?=#{2,3}\s)/);
  for (const part of parts) {
    const m = part.match(/^#{2,3}\s+(?:§\s*)?(.+)\n?([\s\S]*)$/);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

export interface SectionChange {
  title: string;
  kind: "changed" | "added" | "removed";
  wordsBefore: number;
  wordsAfter: number;
}

const words = (s: string | undefined) => (s ?? "").split(/\s+/).filter(Boolean).length;

export function changedSections(baseline: Record<string, string>, markdown: string): SectionChange[] {
  const now = sectionsOf(markdown);
  const out: SectionChange[] = [];
  for (const [title, text] of Object.entries(now)) {
    if (!(title in baseline)) out.push({ title, kind: "added", wordsBefore: 0, wordsAfter: words(text) });
    else if (baseline[title].replace(/\s+/g, " ").trim() !== text.replace(/\s+/g, " ").trim())
      out.push({ title, kind: "changed", wordsBefore: words(baseline[title]), wordsAfter: words(text) });
  }
  for (const title of Object.keys(baseline)) if (!(title in now)) out.push({ title, kind: "removed", wordsBefore: words(baseline[title]), wordsAfter: 0 });
  return out;
}

// ── The response letter ──────────────────────────────────────────────────

const STATUS_TEXT: Record<RevisionComment["status"], string> = {
  open: "",
  revised: "Revised",
  answered: "Answered without a change to the manuscript",
  declined: "Not changed (reason given)",
};

export function revisionProgress(comments: RevisionComment[]) {
  const open = comments.filter((c) => c.status === "open" || !c.response.trim());
  return { total: comments.length, done: comments.length - open.length, open };
}

/**
 * The point-by-point response as Markdown: each comment quoted as the
 * reviewer wrote it, the author's reply, and where the manuscript changed.
 * Comments without a reply are listed as such, never answered for them.
 */
export function responseLetter(round: RevisionRound, meta: { title: string; journal?: string; manuscriptId?: string }): string {
  const lines: string[] = [];
  lines.push(`# Response to reviewers`);
  lines.push("");
  lines.push(`**Manuscript:** ${meta.title}`);
  if (meta.journal) lines.push(`**Journal:** ${meta.journal}`);
  if (meta.manuscriptId) lines.push(`**Manuscript ID:** ${meta.manuscriptId}`);
  lines.push(`**Revision:** ${round.round}`);
  lines.push("");
  const reviewers = Array.from(new Set(round.comments.map((c) => c.reviewer)));
  for (const r of reviewers) {
    lines.push(`## ${r}`);
    lines.push("");
    for (const c of round.comments.filter((x) => x.reviewer === r)) {
      lines.push(`**Comment ${c.number}.** ${c.text.split("\n").join(" ")}`);
      lines.push("");
      lines.push(c.response.trim() ? `**Response.** ${c.response.trim()}` : `**Response.** _Not yet written._`);
      const where = c.sections.length ? `Changed in: ${c.sections.join("; ")}.` : "";
      const status = STATUS_TEXT[c.status];
      if (c.response.trim() && (where || status)) lines.push("", `_${[status, where].filter(Boolean).join(". ")}_`);
      lines.push("");
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
