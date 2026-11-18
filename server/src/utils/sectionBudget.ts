import { countProseWords } from "../../../src/shared/proseBlocks.ts";

/** A complete sentence ends here: terminal punctuation plus any closing quote/bracket. */
export const SENTENCE_END = /[.!?]["'"')\]]?\s*$/;

/** Regex to find sentence boundaries (period, exclamation, or question mark followed by optional closing punctuation). */
const SENTENCE_BOUNDARY = /[.!?]["'"')\]]?(?=\s)/;

export function sectionWordRange(allocatedWords: number): { min: number; max: number } {
  const target = Math.max(50, Math.round(allocatedWords));
  // Wider tolerance for very small sections (<100 words): ±10%
  // Standard tolerance for normal sections: ±5%
  const tolerance = target < 100 ? 0.1 : 0.05;
  return {
    min: Math.floor(target * (1 - tolerance)),
    max: Math.ceil(target * (1 + tolerance)),
  };
}

/**
 * Cut a draft that overran its budget back to the last complete sentence that
 * fits, so it never ends mid-sentence or mid-word, and never at the start of a
 * paragraph. Paragraph breaks inside the kept text are preserved. Text within
 * budget is returned unchanged.
 */
export function trimToSentenceWithinWords(text: string, maxWords: number): string {
  if (countProseWords(text) <= maxWords) return text;
  const tokens = text.split(/(\s+)/);
  let words = 0;
  let cutAt = tokens.length;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].trim()) words += 1;
    if (words > maxWords) {
      cutAt = i;
      break;
    }
  }
  const head = tokens.slice(0, cutAt).join("").trimEnd();
  if (SENTENCE_END.test(head)) return head;
  // Last sentence end inside the kept words (followed by whitespace).
  const re = new RegExp(SENTENCE_BOUNDARY.source, "g");
  let lastEnd = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head))) {
    const before = head.slice(0, m.index + 1);
    // "et al." / "e.g." / an initial is not a sentence end.
    if (m[0][0] === "." && /(?:\bet al|\be\.g|\bi\.e|\bcf|\bvs|\bpp?|\b[A-Z])\.$/.test(before)) continue;
    lastEnd = m.index + m[0].length;
  }
  if (lastEnd > 0) return head.slice(0, lastEnd).trimEnd();
  return head;
}

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

/**
 * A "continuation" that restates the draft instead of extending it: its opening
 * words, or most of its sentences, already appear in the draft.
 */
export function repeatsDraft(continuation: string, draft: string): boolean {
  const d = norm(draft);
  const opening = norm(continuation).split(" ").slice(0, 8).join(" ");
  if (opening.split(" ").length >= 5 && d.includes(opening)) return true;
  const sentences = continuation.split(/(?<=[.!?])\s+/).map(norm).filter((x) => x.split(" ").length >= 5);
  if (sentences.length === 0) return false;
  const seen = sentences.filter((x) => d.includes(x)).length;
  return seen / sentences.length >= 0.5;
}
