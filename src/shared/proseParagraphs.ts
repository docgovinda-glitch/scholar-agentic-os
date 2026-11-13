/**
 * Paragraph structure for AI-written academic prose.
 *
 * Model output sometimes arrives as one long block (or had its blank lines
 * collapsed further down the pipeline). These helpers keep paragraphs that
 * exist, and split a long single block into readable paragraphs of three to
 * four sentences, preferring a break where a sentence opens with a transition.
 *
 * Pure string logic, shared by the server (before a draft is streamed) and the
 * browser (rendering, HTML export). No DOM APIs.
 */

/** A single block longer than this is split into paragraphs. */
export const LONG_BLOCK_WORDS = 120;

const ABBREVIATIONS = new Set([
  "al", "e.g", "i.e", "etc", "cf", "vs", "dr", "prof", "fig", "figs", "no", "nos", "pp", "p", "vol", "eds", "ed", "approx", "st", "mr", "mrs", "ms", "ch", "sec", "eq", "u.s", "u.k",
]);

const TRANSITION_OPENERS =
  /^(?:However|Furthermore|Moreover|In contrast|By contrast|Conversely|Consequently|Therefore|Thus|Hence|Additionally|In addition|Nevertheless|Nonetheless|Overall|In summary|To summarise|To summarize|Similarly|Likewise|Finally|First(?:ly)?|Second(?:ly)?|Third(?:ly)?|Meanwhile|Accordingly|Notably|Taken together|For example|For instance|Crucially|Importantly|Yet|Ultimately)\b/;

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Split a block of prose into sentences without breaking at "et al.", "e.g.",
 * decimals or initials. Whitespace inside a sentence is kept as written.
 */
export function splitIntoSentences(block: string): string[] {
  const text = block.replace(/\s+/g, " ").trim();
  if (!text) return [];
  const sentences: string[] = [];
  let start = 0;
  const re = /[.!?]["'”’)\]]*(?=\s+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const endIdx = m.index + m[0].length;
    const before = text.slice(start, m.index + 1);
    const lastToken = (before.match(/([A-Za-z.]+)\.$/)?.[1] ?? "").toLowerCase();
    // Abbreviation ("et al.", "e.g.") or a single initial ("J.") is not a sentence end.
    if (m[0][0] === "." && (ABBREVIATIONS.has(lastToken) || /^[a-z]$/i.test(lastToken))) continue;
    const rest = text.slice(endIdx).trimStart();
    // A new sentence starts with a capital, a digit, a quote or an opening bracket.
    if (!/^[A-Z0-9"'“‘([]/.test(rest)) continue;
    sentences.push(text.slice(start, endIdx).trim());
    start = endIdx;
  }
  const tail = text.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

/** Group a long block's sentences into paragraphs of 3-4 sentences. */
function regroupLongBlock(block: string): string[] {
  const sentences = splitIntoSentences(block);
  if (sentences.length <= 4) return [sentences.join(" ")];
  const paragraphs: string[][] = [];
  let current: string[] = [];
  for (const sentence of sentences) {
    const startsTransition = TRANSITION_OPENERS.test(sentence);
    if (current.length >= 4 || (current.length >= 3 && startsTransition)) {
      paragraphs.push(current);
      current = [];
    }
    current.push(sentence);
  }
  if (current.length) {
    // Never leave a one-sentence paragraph dangling at the end.
    if (current.length === 1 && paragraphs.length) paragraphs[paragraphs.length - 1].push(...current);
    else paragraphs.push(current);
  }
  return paragraphs.map((p) => p.join(" "));
}

/**
 * Paragraphs of a draft: split on blank lines; a single block over
 * {@link LONG_BLOCK_WORDS} words is regrouped every 3-4 sentences.
 * Markdown headings stay as their own paragraph.
 */
export function splitProseIntoParagraphs(text: string): string[] {
  if (!text || !text.trim()) return [];
  const blocks = text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const block of blocks) {
    if (/^#{1,6}\s/.test(block) || /^[-*]\s/.test(block) || /^\d+\.\s/.test(block)) {
      out.push(block);
      continue;
    }
    if (countWords(block) > LONG_BLOCK_WORDS) out.push(...regroupLongBlock(block));
    else out.push(block.replace(/[ \t]*\n[ \t]*/g, " "));
  }
  return out;
}

/** The same text with paragraphs separated by exactly one blank line. */
export function ensureParagraphBreaks(text: string): string {
  return splitProseIntoParagraphs(text).join("\n\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Inline Markdown emphasis → HTML, after escaping. */
function inlineHtml(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_([^_\n]+)_(?![_\w])/g, "$1<em>$2</em>");
}

/**
 * Prose → HTML with one `<p>` per paragraph (headings become `<h3>`/`<h4>`).
 * Used for rich-text editors (`setContent`) and HTML/DOCX export.
 */
export function formatProseToParagraphHtml(text: string): string {
  return splitProseIntoParagraphs(text)
    .map((para) => {
      const heading = /^(#{1,6})\s+(.*)$/.exec(para);
      if (heading) {
        const level = Math.min(6, heading[1].length + 1);
        return `<h${level}>${inlineHtml(heading[2].trim())}</h${level}>`;
      }
      return `<p>${inlineHtml(para)}</p>`;
    })
    .join("");
}
