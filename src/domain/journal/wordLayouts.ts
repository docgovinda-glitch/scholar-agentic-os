/**
 * Word layouts for submission. Two layouts cover what journals ask for:
 * a single-column review copy (12 pt, double-spaced, usually with line
 * numbers so reviewers can point to lines) and a two-column camera-ready
 * page (10 pt Times, single-spaced), the IEEE Transactions style. They are
 * described by what they do, not as any publisher's official template.
 * Pure; no I/O.
 */

export type WordLayoutId = "review" | "two_column";

export interface WordLayout {
  id: WordLayoutId;
  font: string;
  /** Body text size in points. */
  sizePt: number;
  /** Line spacing multiple. */
  lineSpacing: 1 | 1.15 | 1.5 | 2;
  columns: 1 | 2;
  /** Default for line numbering; the author can turn it on or off. */
  lineNumbers: boolean;
}

export const WORD_LAYOUTS: Record<WordLayoutId, WordLayout> = {
  review: { id: "review", font: "Times New Roman", sizePt: 12, lineSpacing: 2, columns: 1, lineNumbers: true },
  two_column: { id: "two_column", font: "Times New Roman", sizePt: 10, lineSpacing: 1, columns: 2, lineNumbers: false },
};

/** The layout that usually fits the chosen LaTeX class (itself suggested from the journal). */
export function suggestWordLayout(latexTemplate: string): WordLayoutId {
  return latexTemplate === "ieeetran" ? "two_column" : "review";
}

/** Twips per line for a spacing multiple (Word: 240 = single). */
export const lineTwips = (spacing: number) => Math.round(240 * spacing);

/** A layout from untrusted input (a request body), with line numbering as asked. */
export function layoutFrom(raw: unknown, lineNumbers?: unknown): WordLayout | undefined {
  if (raw !== "review" && raw !== "two_column") return undefined;
  const base = WORD_LAYOUTS[raw];
  return typeof lineNumbers === "boolean" ? { ...base, lineNumbers } : base;
}
