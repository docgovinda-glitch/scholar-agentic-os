/**
 * Where a journal manuscript lives in the project answers, and the one way to
 * read it, write it and count it. Pure: no React, no I/O; shared by the
 * browser (Writing Studio, Review, Delivery, the header) and the server
 * (polish, review, export, citation support).
 *
 * `manuscript_markdown` is the canonical assembled text. `manuscript_sections`
 * (owned by the Writing Studio) holds the same text per section.
 * `full_text_markdown`, `assembled_draft` and `manuscript_draft` are older
 * names: they are read only when the canonical key is empty, and every write
 * blanks them so they can never shadow the current text again.
 */
import { countProseWords } from "../../shared/proseBlocks";
import { safeParseAnswerField } from "../../shared/projectStateSchema";

export const MANUSCRIPT_KEY = "manuscript_markdown";
export const LEGACY_MANUSCRIPT_KEYS = ["full_text_markdown", "assembled_draft", "manuscript_draft"] as const;
export const DEFAULT_TARGET_WORDS = 6000;

type Answers = Record<string, unknown> | null | undefined;

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** A legacy per-section draft (`[{ section, content }]`) as markdown; "" when it is not one. */
function sectionsArrayToMarkdown(raw: unknown): string {
  const parsed = safeParseAnswerField<unknown>(raw, null);
  if (!Array.isArray(parsed)) return "";
  return parsed
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
    .map((s) => {
      const title = str(s.section) || str(s.section_name) || "Section";
      const body = str(s.content).trim();
      return body ? `## ${title}\n\n${body}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

/** The manuscript as markdown: the canonical key, else the newest legacy one that has text. */
export function readManuscriptMarkdown(answers: Answers): string {
  const a = answers ?? {};
  const canonical = str(a[MANUSCRIPT_KEY]);
  if (canonical.trim()) return canonical;
  for (const key of LEGACY_MANUSCRIPT_KEYS) {
    const raw = a[key];
    const asSections = sectionsArrayToMarkdown(raw);
    if (asSections.trim()) return asSections;
    const text = str(raw);
    // A JSON array that held no text is not a manuscript.
    if (text.trim() && !/^\s*\[/.test(text)) return text;
  }
  return "";
}

/**
 * The answers to save for a new manuscript text: the canonical key, plus a
 * blank for every legacy key that still holds something, so no reader can
 * pick up an older copy.
 */
export function manuscriptAnswerPatch(markdown: string, answers?: Answers): Record<string, string> {
  const patch: Record<string, string> = { [MANUSCRIPT_KEY]: markdown };
  for (const key of LEGACY_MANUSCRIPT_KEYS) {
    const v = answers?.[key];
    if (v !== undefined && v !== null && v !== "") patch[key] = "";
  }
  return patch;
}

/** The article's word target: the word budget blueprint's, else `target_word_count`, else 6,000. */
export function journalTargetWords(answers: Answers): number {
  const bp = safeParseAnswerField<{ targetTotalWords?: unknown } | null>(answers?.["word_budget_blueprint"], null);
  if (bp && typeof bp.targetTotalWords === "number" && bp.targetTotalWords > 0) return bp.targetTotalWords;
  const n = parseInt(String(answers?.["target_word_count"] ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TARGET_WORDS;
}

/**
 * Words as a reader will count them: markup is ignored, a citation token is
 * not a word (its printed form depends on the style), and a figure or table
 * reference is two ("Figure 1"). The `##` / `###` headings the manuscript
 * assembler writes are not counted, so the assembled text and the sum of its
 * sections give the same number.
 */
export function countManuscriptWords(text: string | undefined): number {
  const plain = (text ?? "")
    .replace(/[ \t]*\[CITE:[^\]]+\]/g, "")
    .replace(/[ \t]*\[(?:FIG|TAB):[^\]]+\]/g, " Figure N")
    // The section and sub-section headings the assembler writes are not body words.
    .replace(/^#{2,3}\s.*$/gm, "");
  return countProseWords(plain);
}

/**
 * How deep each Markdown heading sits in this manuscript, for structured
 * exports: the shallowest headings are sections (0), the next level are
 * sub-sections (1), and so on. Relative, so a manuscript written with `##`
 * sections and `###` sub-sections nests the same way as one that starts at
 * `###`. A title-level `#` is a section like the shallowest of the rest.
 */
export function headingDepthOf(markdown: string): (hashes: number) => number {
  const levels = new Set<number>();
  for (const block of markdown.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const b = block.trim();
    const m = !b.includes("\n") ? b.match(/^(#{1,6})\s+/) : null;
    if (m && m[1].length >= 2) levels.add(m[1].length);
  }
  const ordered = [...levels].sort((a, b) => a - b);
  return (hashes) => (hashes <= 1 ? 0 : Math.max(0, ordered.indexOf(hashes)));
}
