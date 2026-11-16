/**
 * Scope Classifier Service
 * ------------------------
 * Translates raw scanner findings, ledger constraints, and brief topics into
 * clean, student-friendly plain English scope boundaries without internal regex line tags ([L0xx]).
 */

export interface ScopeBoundaries {
  included: string[];
  excluded: string[];
  summaryBanner: string;
}

/**
 * Strips line markers like [L001], [L012-L015], or regex tokens from any text.
 */
export function stripLineTags(text: string): string {
  if (!text) return "";
  return text
    .replace(/\[L\d+(?:-L\d+)?\]\s*/g, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();
}

/** Sentences in which the brief itself rules something out ("Do not …", "Avoid …", "… is out of scope"). */
function briefExclusions(briefText: string): string[] {
  const out: string[] = [];
  for (const raw of (briefText || "").split(/(?<=[.!?])\s+|\n+/)) {
    const line = stripLineTags(raw).replace(/\s+/g, " ").trim();
    if (line.length < 12 || line.length > 240) continue;
    if (/^(?:please\s+)?(?:do not|don't|avoid|you should not|you must not|exclude)\b|\b(?:is|are) (?:out of scope|not required)\b/i.test(line)) {
      if (!out.includes(line)) out.push(line);
    }
  }
  return out.slice(0, 6);
}

/**
 * The assignment's scope, from the brief only: what to cover is its questions,
 * what to avoid is what the brief itself rules out. Nothing is added when the
 * brief is silent.
 */
export function classifyScopeBoundaries(
  briefText: string,
  questions: string[] = []
): ScopeBoundaries {
  const included: string[] = [];
  for (const q of questions.slice(0, 8)) {
    const cleanQ = stripLineTags(q);
    if (cleanQ && !included.includes(cleanQ)) included.push(cleanQ);
  }
  const excluded = briefExclusions(briefText);
  const summaryBanner = included.length
    ? `Found ${included.length} question${included.length === 1 ? "" : "s"} in your brief.`
    : "No questions were found in the brief.";
  return { summaryBanner, included, excluded };
}
