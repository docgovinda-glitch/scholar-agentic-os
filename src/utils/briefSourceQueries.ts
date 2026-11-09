/**
 * Turns an assignment brief into a handful of clean academic search phrases.
 * The raw brief (department banners, module codes, marks) must never reach a
 * scholarly index: it matches nothing. Pure and deterministic; every word in a
 * query comes from the brief itself.
 */
import { parseBriefQuestions, removeCourseCodes } from "./briefQuestions";

const STOP = new Set(
  (
    "a an the and or of in on at to for from by with without into onto over under between among about across through during " +
    "is are was were be been being as that this these those it its their there then than so such not no nor can could may might must shall should will would " +
    "which who whom whose what when where why how any each every both either neither some most more less least other another own same very " +
    "using use used based terms term regard respect given provide providing include including consider considering " +
    "explain describe discuss compare contrast evaluate evaluates evaluation analyse analyze analysis assess assessment examine critically critical " +
    "derive show demonstrate demonstrates justify propose recommend explore investigate identify outline define apply develop design calculate state " +
    "role extent key main major your you answer question questions marks mark words word count essay report assignment coursework module " +
    "department university school faculty college institute following above below also thus hence however whether"
  ).split(/\s+/)
);

const METADATA_LINE =
  /^(?:department|faculty|school|university|college|institute|module|course|unit|programme|program|assessment|assignment|advanced assessment|word\s*count|marks?|submission|deadline|due|date|student|name|id|referencing|reference style|citation|level|semester|term|academic year)\b/i;

function isBannerLine(line: string): boolean {
  const letters = line.replace(/[^A-Za-z]/g, "");
  if (letters.length < 8) return false;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length > 0.7 && !line.trim().endsWith("?");
}

function contentWords(text: string): string[] {
  const cleaned = removeCourseCodes(text)
    .replace(/\[?\(?\s*\d+\s*marks?\)?\]?/gi, " ")
    .replace(/[’']s\b/g, "")
    .replace(/[^\p{L}\p{N}\-\s]/gu, " ");
  const out: string[] = [];
  for (const raw of cleaned.split(/\s+/)) {
    const w = raw.replace(/^-+|-+$/g, "");
    if (w.length < 3) continue;
    const lower = w.toLowerCase();
    if (STOP.has(lower) || /^\d+$/.test(w)) continue;
    out.push(w);
  }
  return out;
}

function phraseFrom(text: string, maxWords: number): string {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const w of contentWords(text)) {
    const k = w.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    words.push(w);
    if (words.length >= maxWords) break;
  }
  return words.join(" ");
}

function overlap(a: string, b: string): number {
  const sa = new Set(a.toLowerCase().split(" "));
  const sb = new Set(b.toLowerCase().split(" "));
  const inter = [...sa].filter((x) => sb.has(x)).length;
  return inter / Math.max(1, Math.min(sa.size, sb.size));
}

/** 3–5 high-signal keyword phrases (3–6 words each) drawn from the brief's questions or topic. */
export function buildSourceSearchQueries(briefOrQuestion: string, max = 5): string[] {
  const text = (briefOrQuestion || "").slice(0, 60000);
  if (!text.trim()) return [];

  let sources: string[] = parseBriefQuestions(text).map((q) => q.text);

  if (sources.length === 0) {
    // No numbered questions: use the substantive sentences, not banners/metadata.
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !isBannerLine(l) && !METADATA_LINE.test(l));
    sources = lines.join(" ").split(/(?<=[.?!])\s+/).filter((s) => s.length > 15).slice(0, 6);
    if (sources.length === 0) sources = lines.slice(0, 3);
  }

  const queries: string[] = [];
  for (const s of sources) {
    const phrase = phraseFrom(s, 6);
    if (phrase.split(" ").length < 2) continue;
    if (queries.some((q) => overlap(q, phrase) > 0.6)) continue;
    queries.push(phrase);
    if (queries.length >= max) break;
  }
  return queries;
}
