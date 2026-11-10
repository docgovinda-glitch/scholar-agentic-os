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

/**
 * Cut a draft that overran its budget back to the last complete sentence that
 * fits, so it never ends mid-sentence. Text within budget is returned unchanged.
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
  const lastEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf(".\n"), head.lastIndexOf("? "), head.lastIndexOf("! "), /[.?!][)\]]?$/.test(head) ? head.length - 1 : -1);
  if (lastEnd > head.length * 0.5) {
    const end = /[)\]]/.test(head[lastEnd + 1] ?? "") ? lastEnd + 2 : lastEnd + 1;
    return head.slice(0, end).trimEnd();
  }
  return head;
}
