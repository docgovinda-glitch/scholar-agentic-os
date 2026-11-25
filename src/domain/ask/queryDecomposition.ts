import { extractQueryTopics } from "./answerTelemetry";

export interface DecomposedQuery {
  queries: string[];
  /** Earliest publication year the question asks for, if any. */
  yearFrom?: number;
  decomposed: boolean;
}

const FILLER = /\b(compare|comparing|contrast|versus|vs\.?|between|and|the|their|of|in|on|for|with|across|since|from|to|how|what|does|do|is|are|a|an)\b/gi;

export function parseYearFrom(prompt: string): number | undefined {
  const range = prompt.match(/\b(19\d{2}|20\d{2})\s*(?:[-–—]|to)\s*(19\d{2}|20\d{2})\b/);
  if (range) return Math.min(Number(range[1]), Number(range[2]));
  const since = prompt.match(/\b(?:since|after|from|post)\s+(19\d{2}|20\d{2})\b/i);
  return since ? Number(since[1]) : undefined;
}

/**
 * Splits a comparative / multi-entity / dated question into up to 3 focused
 * searches (one per concept, plus a recent-synthesis query). A simple question
 * stays one search.
 */
export function decomposeQuery(prompt: string): DecomposedQuery {
  const text = prompt.replace(/\s+/g, " ").trim();
  const yearFrom = parseYearFrom(text);
  const entities = extractQueryTopics(text, 6).filter((t) => !/^\d/.test(t));
  const comparative = /\b(compare|comparing|contrast|versus|vs\.?|between|differ|difference)\b/i.test(text);

  if (entities.length < 2 || (!comparative && !yearFrom)) {
    return { queries: [text], yearFrom, decomposed: false };
  }

  const context = text
    .replace(/\b(19|20)\d{2}\s*(?:[-–—]|to)\s*(19|20)\d{2}\b/g, " ")
    .split(" ")
    .filter((w) => !entities.some((e) => e.toLowerCase().split(" ").includes(w.replace(/[^\p{L}-]/gu, "").toLowerCase())))
    .join(" ")
    .replace(FILLER, " ")
    .replace(/[?.,;:()"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 5)
    .join(" ");

  const [a, b] = entities;
  const queries = [`${a} ${context}`.trim(), `${b} ${context}`.trim()];
  if (yearFrom) queries.push(`${entities.slice(0, 3).join(" ")} ${context} ${yearFrom}`.replace(/\s+/g, " ").trim());
  else if (entities.length >= 3) queries.push(entities.slice(0, 3).join(" "));
  return { queries: Array.from(new Set(queries)).slice(0, 3), yearFrom, decomposed: true };
}

/** Round-robin merge so every concept keeps representation; stops at `limit`. */
export function interleaveResults<T>(lists: T[][], limit: number): T[] {
  const out: T[] = [];
  for (let i = 0; out.length < limit; i++) {
    let any = false;
    for (const l of lists) {
      if (i < l.length) {
        out.push(l[i]);
        any = true;
        if (out.length >= limit) break;
      }
    }
    if (!any) break;
  }
  return out;
}
