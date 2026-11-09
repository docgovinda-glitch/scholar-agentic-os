/**
 * A specific one-sentence "Why this source?": which question of the student's
 * assignment a paper gives evidence for, and on which terms. Built only from the
 * paper's title/abstract and the brief's own questions; never boilerplate.
 */
import type { BriefQuestionRow } from "./briefQuestions";
import { shortQuestionLabel } from "./briefQuestions";

const STOP = new Set("the and for with that this from into about between their which what when where while does your are was were have has not but can may its using use used based terms term role how why".split(" "));
const words = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w))
  );

export function explainSourceFit(
  source: { title: string; abstract?: string; venue?: string; journal?: string },
  questions: BriefQuestionRow[],
  searchPhrase?: string
): string | undefined {
  if (questions.length === 0) return undefined;
  const sw = words(`${source.title} ${source.abstract ?? ""}`);
  let best: { q: BriefQuestionRow; shared: string[] } | undefined;
  for (const q of questions) {
    const shared = [...words(q.text)].filter((w) => sw.has(w));
    if (shared.length > 0 && (!best || shared.length > best.shared.length)) best = { q, shared };
  }
  if (best) {
    const terms = best.shared.slice(0, 3).join(", ");
    return `Gives evidence for ${best.q.label} (${shortQuestionLabel(best.q.text)}): it covers ${terms}.`;
  }
  const q = questions[0];
  return searchPhrase ? `Found for the search "${searchPhrase}", drawn from ${q.label} (${shortQuestionLabel(q.text)}).` : undefined;
}
