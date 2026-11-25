/**
 * Honest, measured facts about one Ask Scholar answer: what was retrieved,
 * what was cited, how much was read in full, and which parts of the question
 * the retrieved evidence mentions. No scores, no verdicts.
 */

export interface TelemetrySource {
  title?: string;
  snippet?: string;
  venue?: string;
  /** True when a full-text (open access) copy is linked. */
  fullText?: boolean;
}

export interface AnswerTelemetry {
  retrieved: number;
  cited: number;
  fullText: number;
  abstractOnly: number;
  covered: string[];
  missing: string[];
  looksTruncated: boolean;
}

const STOP = new Set([
  "about", "between", "compare", "comparing", "contrast", "across", "which", "their", "there", "these", "those",
  "would", "should", "could", "where", "while", "within", "using", "based", "regarding", "analyse", "analyze",
  "explain", "discuss", "describe", "evaluate", "literature", "research", "studies", "study", "recent", "papers",
  "paper", "review", "effects", "effect", "impact", "role", "what", "when", "does", "with", "from", "that", "this",
  "have", "been", "into", "than", "then", "them", "they", "your", "give", "show", "find", "tell",
]);

/** Distinct topics, entities and names the question asks about. */
export function extractQueryTopics(prompt: string, max = 8): string[] {
  const topics: string[] = [];
  const seen = new Set<string>();
  const add = (t: string) => {
    const clean = t.trim().replace(/[?.,;:]+$/, "");
    const key = clean.toLowerCase();
    if (clean.length < 3 || seen.has(key) || STOP.has(key)) return;
    seen.add(key);
    topics.push(clean);
  };

  for (const m of prompt.matchAll(/["“]([^"”]{3,60})["”]/g)) add(m[1]);

  // Capitalised runs that are not at a sentence start: theorists, regions, theories.
  const words = prompt.split(/\s+/);
  let run: string[] = [];
  const flush = () => {
    if (run.length) add(run.join(" "));
    run = [];
  };
  words.forEach((w, i) => {
    const bare = w.replace(/^[("']+|[)"'?.,;:]+$/g, "");
    const startsSentence = i === 0 || /[.?!]$/.test(words[i - 1] || "");
    if (/^[A-Z][\p{L}'-]+$/u.test(bare) && !(startsSentence && STOP.has(bare.toLowerCase()))) run.push(bare);
    else if (/^(of|de|van|von|al)$/i.test(bare) && run.length) run.push(bare);
    else flush();
  });
  flush();

  if (topics.length < 3) {
    for (const w of prompt.toLowerCase().match(/[a-z][a-z-]{5,}/g) || []) add(w);
  }
  return topics.slice(0, max);
}

export function buildAnswerTelemetry(input: {
  prompt: string;
  answerText: string;
  retrieved: TelemetrySource[];
  cited: TelemetrySource[];
}): AnswerTelemetry {
  const haystack = input.retrieved
    .map((s) => `${s.title || ""} ${s.snippet || ""} ${s.venue || ""}`)
    .join(" ")
    .toLowerCase();
  const covered: string[] = [];
  const missing: string[] = [];
  for (const topic of extractQueryTopics(input.prompt)) {
    const t = topic.toLowerCase();
    const parts = t.split(/\s+/).filter((p) => p.length > 2 && !/^(of|and|the)$/.test(p));
    const hit = haystack.includes(t) || (parts.length > 1 && parts.some((p) => p.length > 4 && haystack.includes(p)));
    (hit ? covered : missing).push(topic);
  }
  const fullText = input.retrieved.filter((s) => s.fullText).length;
  const trimmed = input.answerText.trim();
  return {
    retrieved: input.retrieved.length,
    cited: input.cited.length,
    fullText,
    abstractOnly: input.retrieved.length - fullText,
    covered,
    missing,
    looksTruncated: looksTruncated(trimmed),
  };
}

/** True only when the last prose line stops on a word or comma (no list item, URL, table or reference list). */
export function looksTruncated(answer: string): boolean {
  const text = answer.trim();
  if (!text) return false;
  const last = text.split("\n").map((l) => l.trim()).filter(Boolean).pop() || "";
  if (/^([-*•#>|]|\d+[.)]\s|```)/.test(last)) return false;
  if (/(https?:\/\/\S+|doi:\S+|10\.\d{4,}\/\S+)$/i.test(last)) return false;
  if (/\n#{0,4}\s*\**(references|bibliography|works cited|sources)\b/i.test(text)) return false;
  return /[\p{L}\p{N},;:]$/u.test(last) && !/[.!?]["')\]]*$/.test(last);
}
