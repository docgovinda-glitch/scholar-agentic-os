import { countExactWords } from "./wordBudgetAllocator.ts";

/** Words allowed either side of a section's allocated budget. */
export const SECTION_BUDGET_TOLERANCE = 0.05;

export function sectionWordRange(allocatedWords: number): { min: number; max: number } {
  const target = Math.max(50, Math.round(allocatedWords));
  return {
    min: Math.floor(target * (1 - SECTION_BUDGET_TOLERANCE)),
    max: Math.ceil(target * (1 + SECTION_BUDGET_TOLERANCE)),
  };
}

/** A complete sentence ends here: terminal punctuation plus any closing quote/bracket. */
export const SENTENCE_END = /[.!?]["'”’)\]]?\s*$/;

/**
 * Cut a draft that overran its budget back to the last complete sentence that
 * fits, so it never ends mid-sentence or mid-word, and never at the start of a
 * paragraph. Paragraph breaks inside the kept text are preserved. Text within
 * budget is returned unchanged.
 */
export function trimToSentenceWithinWords(text: string, maxWords: number): string {
  if (countExactWords(text) <= maxWords) return text;
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
  const re = /[.!?]["'”’)\]]?(?=\s)/g;
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
