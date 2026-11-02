/**
 * Checks a manuscript's text for things an editor or reviewer catches by
 * reading: the same word spelt two ways, numbers in the abstract that the
 * body never states, and figures or tables mentioned out of order or with
 * gaps. Every finding quotes the text it comes from. Pure; no I/O.
 */

// US ↔ UK spellings where both forms are common in academic writing.
// "-ize" is left out on purpose: Oxford (British) spelling uses it too.
const PAIRS: Array<[us: string, uk: string]> = [
  ["analyze", "analyse"], ["analyzed", "analysed"], ["analyzing", "analysing"], ["paralyze", "paralyse"],
  ["behavior", "behaviour"], ["behaviors", "behaviours"], ["behavioral", "behavioural"], ["color", "colour"], ["colors", "colours"],
  ["favor", "favour"], ["favorable", "favourable"], ["labor", "labour"], ["neighbor", "neighbour"], ["neighborhood", "neighbourhood"],
  ["humor", "humour"], ["rumor", "rumour"], ["tumor", "tumour"], ["tumors", "tumours"], ["harbor", "harbour"], ["vigor", "vigour"],
  ["center", "centre"], ["centers", "centres"], ["fiber", "fibre"], ["fibers", "fibres"], ["liter", "litre"], ["liters", "litres"], ["theater", "theatre"],
  ["modeling", "modelling"], ["modeled", "modelled"], ["labeled", "labelled"], ["labeling", "labelling"], ["traveled", "travelled"],
  ["traveling", "travelling"], ["canceled", "cancelled"], ["signaling", "signalling"], ["fueled", "fuelled"], ["counselor", "counsellor"],
  ["defense", "defence"], ["offense", "offence"], ["license", "licence"], ["practice", "practise"],
  ["aging", "ageing"], ["pediatric", "paediatric"], ["anemia", "anaemia"], ["anesthesia", "anaesthesia"], ["hemoglobin", "haemoglobin"],
  ["estrogen", "oestrogen"], ["fetus", "foetus"], ["fetal", "foetal"], ["diarrhea", "diarrhoea"], ["edema", "oedema"], ["leukemia", "leukaemia"],
  ["orthopedic", "orthopaedic"], ["gynecology", "gynaecology"], ["hematology", "haematology"],
  ["catalog", "catalogue"], ["dialog", "dialogue"], ["analog", "analogue"], ["enroll", "enrol"], ["enrollment", "enrolment"],
  ["fulfill", "fulfil"], ["skillful", "skilful"], ["judgment", "judgement"], ["acknowledgment", "acknowledgement"],
  ["gray", "grey"], ["plow", "plough"], ["mold", "mould"], ["skeptical", "sceptical"], ["sulfur", "sulphur"], ["aluminum", "aluminium"],
];
// "practice" (noun in both) and "license" are ambiguous in UK use; only the
// spelling pair itself is reported, not which variety the author meant.
const AMBIGUOUS_FOR_VARIETY = new Set(["practice", "practise", "license", "licence", "analog", "analogue", "dialog", "dialogue", "program", "programme"]);

export interface SpellingFinding {
  us: string;
  uk: string;
  usCount: number;
  ukCount: number;
}

export interface SpellingCheck {
  /** The same word written both ways. */
  mixedWords: SpellingFinding[];
  /** Words in each variety (ignoring ambiguous pairs), to show a mix across words. */
  usWords: string[];
  ukWords: string[];
}

function countWord(lower: string, w: string): number {
  return (lower.match(new RegExp(`\\b${w}\\b`, "g")) ?? []).length;
}

export function checkSpelling(text: string): SpellingCheck {
  const lower = text.toLowerCase();
  const mixedWords: SpellingFinding[] = [];
  const usWords: string[] = [];
  const ukWords: string[] = [];
  for (const [us, uk] of PAIRS) {
    const usCount = countWord(lower, us);
    const ukCount = countWord(lower, uk);
    if (usCount && ukCount) mixedWords.push({ us, uk, usCount, ukCount });
    if (AMBIGUOUS_FOR_VARIETY.has(us)) continue;
    if (usCount) usWords.push(us);
    if (ukCount) ukWords.push(uk);
  }
  return { mixedWords, usWords, ukWords };
}

// ── Abstract numbers ────────────────────────────────────────────────────

/** The abstract's text, from a heading named Abstract to the next heading. */
export function abstractOf(markdown: string): string {
  const m = markdown.match(/(?:^|\n)#{1,6}\s*(?:§\s*)?Abstract\s*\n([\s\S]*?)(?=\n#{1,6}\s|$)/i);
  return m ? m[1].trim() : "";
}

// 1,204 · 54.3 · 12% · .81 (a leading zero dropped, as APA prints p and r).
const NUMBER = /(?<![\w.])(?:(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?|\.(\d+))(\s?%)?(?![\w])/g;

/** Numbers worth matching: decimals, percentages, and integers of 10+ that aren't years. */
function salientNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(NUMBER)) {
    const whole = m[1] ? m[1].replace(/,/g, "") : "0";
    const frac = m[2] ?? m[3];
    const isPct = Boolean(m[4]);
    const n = Number(whole);
    if (frac === undefined && !isPct && (n < 10 || (n >= 1900 && n <= 2100))) continue;
    out.push(`${whole}${frac !== undefined ? `.${frac}` : ""}${isPct ? "%" : ""}`);
  }
  return out;
}

const bare = (n: string) => n.replace(/%$/, "");

/**
 * Numbers the abstract states that appear nowhere else in the manuscript.
 * Each is either a result the body should report, or a typo.
 */
export function abstractNumbersMissingFromBody(markdown: string): string[] {
  const abs = abstractOf(markdown);
  if (!abs) return [];
  const body = markdown.replace(abs, " ");
  const bodyNums = new Set(salientNumbers(body).map(bare));
  // ".45" and "0.45" are the same number: both are read as 0.45.
  const has = (n: string) => bodyNums.has(n);
  return Array.from(new Set(salientNumbers(abs))).filter((n) => !has(bare(n)));
}

// ── Figures and tables ───────────────────────────────────────────────────

export interface NumberingFinding {
  kind: "Figure" | "Table";
  /** Numbers mentioned, in order of first mention. */
  order: number[];
  /** Numbers skipped between 1 and the highest mentioned. */
  missing: number[];
  /** First mentioned out of order (e.g. Figure 3 before Figure 2). */
  outOfOrder: number[];
}

export function checkNumbering(markdown: string): NumberingFinding[] {
  const kinds: Array<[NumberingFinding["kind"], RegExp]> = [
    ["Figure", /\b(?:Figure|Fig\.)\s*(\d+)/gi],
    ["Table", /\bTable\s+(\d+)/gi],
  ];
  const out: NumberingFinding[] = [];
  for (const [kind, re] of kinds) {
    const order: number[] = [];
    for (const m of markdown.matchAll(re)) {
      const n = Number(m[1]);
      if (!order.includes(n)) order.push(n);
    }
    if (order.length === 0) continue;
    const max = Math.max(...order);
    const missing = Array.from({ length: max }, (_, i) => i + 1).filter((n) => !order.includes(n));
    const outOfOrder = order.filter((n, i) => order.slice(0, i).some((prev) => prev > n));
    out.push({ kind, order, missing, outOfOrder });
  }
  return out;
}

// ── Phrases reviewers associate with machine-written text ───────────────

const FLAGGED_PHRASES = ["delve", "delves", "delving", "tapestry", "testament to", "game-changer", "plethora", "in the realm of", "navigating the", "it is important to note", "a nuanced understanding", "underscores", "pivotal role", "ever-evolving", "intricate interplay"];

/** Phrases present, with counts. Presence is reported, not judged. */
export function flaggedPhrases(text: string): Array<{ phrase: string; count: number }> {
  const lower = text.toLowerCase();
  return FLAGGED_PHRASES.map((phrase) => ({ phrase, count: (lower.match(new RegExp(`\\b${phrase.replace(/[-]/g, "\\-")}\\b`, "g")) ?? []).length })).filter((x) => x.count > 0);
}
