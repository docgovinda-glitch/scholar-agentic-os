/**
 * Mode 1 discovery funnel: from a broad interest to a research gap grounded in
 * real recent papers, then questions and titles, then journals that publish
 * on the topic. The AI reasons only over papers the registries returned, and
 * every gap must quote the papers it rests on: a gap whose quote is not in
 * the paper is dropped. Journal facts come from the index; nothing a public
 * index does not record (word limits, citation style) is guessed. Pure.
 */
import { z } from "zod";

// ── Papers the scout found ───────────────────────────────────────────────

export interface ScoutPaper {
  /** Short key the AI cites: "p1", "p2", … */
  key: string;
  title: string;
  year?: number;
  venue?: string;
  doi?: string;
  url?: string;
  authors: string[];
  /** Abstract text; may be empty when the registry has none. */
  abstract: string;
  source: "openalex" | "crossref";
}

/** OpenAlex stores abstracts as word → positions; this rebuilds the text. */
export function abstractFromInvertedIndex(index: Record<string, number[]> | null | undefined): string {
  if (!index) return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) for (const p of positions) words[p] = word;
  return words.filter((w) => w !== undefined).join(" ");
}

/** "AI &amp; Society" → "AI & Society": registries sometimes send names HTML-encoded. */
export const decodeEntities = (s: string | undefined) =>
  (s ?? "")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Crossref abstracts are JATS XML; this keeps the text. */
export const stripJats = (s: string | undefined) => decodeEntities((s ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/[^a-z0-9'"%.\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// ── Gaps ─────────────────────────────────────────────────────────────────

export const GAP_TYPES = ["empirical", "theoretical", "methodological", "contextual", "population"] as const;
export type GapType = (typeof GAP_TYPES)[number];

export interface GapEvidence {
  paperKey: string;
  /** Words copied from the paper's title or abstract. */
  quote: string;
}

export interface GroundedGap {
  id: string;
  type: GapType;
  statement: string;
  whyItMatters: string;
  evidence: GapEvidence[];
}

export function gapPrompt(): string {
  return [
    "You find research gaps for a researcher, using ONLY the recent papers supplied (each has a key such as p3).",
    "Propose 3 to 5 concrete, answerable gaps: what these papers leave unstudied, untested, unexplained or unmeasured (a population, setting, method, theory or outcome).",
    "Every gap must cite 1 to 3 of the supplied papers by key, each with a short quote (5 to 25 words) copied EXACTLY from that paper's title or abstract that shows what the paper did or what it says is missing or limited.",
    "Do not cite any paper that is not in the list. Do not invent statistics, sample sizes, percentages or results. Do not give importance scores.",
    'Respond with ONLY JSON: {"gaps": [{"type": "empirical|theoretical|methodological|contextual|population", "statement": "<one or two sentences>", "whyItMatters": "<one sentence>", "evidence": [{"paper": "p3", "quote": "<exact words>"}]}]}',
  ].join("\n");
}

export function gapUserPrompt(interest: string, papers: ScoutPaper[]): string {
  const list = papers
    .map((p) => `[${p.key}] ${p.title}${p.year ? ` (${p.year})` : ""}${p.venue ? `, ${p.venue}` : ""}\n${p.abstract ? `Abstract: ${p.abstract.slice(0, 1200)}` : "Abstract: (none in the registry)"}`)
    .join("\n\n");
  return `Research interest: ${interest}\n\nRecent papers:\n\n${list}`;
}

const rawGapsSchema = z.object({
  gaps: z
    .array(
      z.object({
        type: z.string().optional(),
        statement: z.string(),
        whyItMatters: z.string().optional(),
        evidence: z.array(z.object({ paper: z.string(), quote: z.string() })).default([]),
      })
    )
    .default([]),
});

export function parseJsonObject(text: string): unknown {
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/**
 * Keeps each gap's evidence only where the quote really is in the cited
 * paper's title or abstract, and drops gaps left with no evidence. Returns
 * at most five, plus how many were dropped.
 */
export function groundGaps(aiText: string, papers: ScoutPaper[]): { gaps: GroundedGap[]; dropped: number } {
  const parsed = rawGapsSchema.safeParse(parseJsonObject(aiText));
  if (!parsed.success) return { gaps: [], dropped: 0 };
  const byKey = new Map(papers.map((p) => [p.key.toLowerCase(), p]));
  const gaps: GroundedGap[] = [];
  let dropped = 0;
  for (const g of parsed.data.gaps) {
    const evidence: GapEvidence[] = [];
    for (const e of g.evidence) {
      const paper = byKey.get(e.paper.trim().toLowerCase());
      const quote = e.quote.trim().replace(/^["“']|["”']$/g, "");
      if (!paper || norm(quote).split(" ").length < 3) continue;
      if (!norm(`${paper.title} ${paper.abstract}`).includes(norm(quote))) continue;
      if (!evidence.some((x) => x.paperKey === paper.key)) evidence.push({ paperKey: paper.key, quote });
    }
    const statement = g.statement.trim();
    if (!statement || evidence.length === 0) {
      dropped++;
      continue;
    }
    const type = (GAP_TYPES as readonly string[]).includes((g.type ?? "").toLowerCase()) ? ((g.type ?? "").toLowerCase() as GapType) : "empirical";
    gaps.push({ id: `gap-${gaps.length + 1}`, type, statement, whyItMatters: (g.whyItMatters ?? "").trim(), evidence });
    if (gaps.length === 5) break;
  }
  return { gaps, dropped };
}

// ── Questions and titles ─────────────────────────────────────────────────

export function questionsPrompt(): string {
  return [
    "You help a researcher turn a research gap into a study.",
    "Write 3 specific, answerable research questions that address the gap (each one sentence, ending with '?'), and 3 article title candidates suitable for a peer-reviewed journal.",
    "Do not state findings or results in a title or question, and do not include statistics, sample sizes or percentages.",
    'Respond with ONLY JSON: {"questions": ["..."], "titles": ["..."]}',
  ].join("\n");
}

export function questionsUserPrompt(interest: string, gap: { statement: string; whyItMatters?: string }): string {
  return `Research interest: ${interest}\nGap: ${gap.statement}${gap.whyItMatters ? `\nWhy it matters: ${gap.whyItMatters}` : ""}`;
}

const rawQuestionsSchema = z.object({ questions: z.array(z.string()).default([]), titles: z.array(z.string()).default([]) });

/** Numbers that read as results ("42%", "n = 300", "3.5-fold") are not allowed in a proposal. */
const RESULT_NUMBER = /\d+(?:\.\d+)?\s*(?:%|percent|-?fold)|\bn\s*=\s*\d/i;

export function parseQuestions(aiText: string): { questions: string[]; titles: string[] } {
  const parsed = rawQuestionsSchema.safeParse(parseJsonObject(aiText));
  if (!parsed.success) return { questions: [], titles: [] };
  const clean = (xs: string[], max: number) =>
    Array.from(new Set(xs.map((x) => x.trim().replace(/\s+/g, " ")).filter((x) => x.length >= 10 && x.length <= 300 && !RESULT_NUMBER.test(x)))).slice(0, max);
  return {
    questions: clean(parsed.data.questions, 5).map((q) => (q.endsWith("?") ? q : `${q}?`)),
    titles: clean(parsed.data.titles, 5),
  };
}

// ── Journals ─────────────────────────────────────────────────────────────

export interface VenueWork {
  title: string;
  year?: number;
  venue?: string;
  venueId?: string;
  issn?: string;
  publisher?: string;
}

export interface VenueMatch {
  id: string;
  name: string;
  publisher?: string;
  issn?: string;
  homepage?: string;
  isOpenAccess?: boolean;
  /** Recent works on the topic this venue published, among those searched. */
  matchingWorks: number;
  searchedWorks: number;
  sampleTitles: string[];
  source: "openalex" | "crossref";
}

/** Venues ranked by how many of the topic's recent works they published. */
export function rankVenues(works: VenueWork[], source: VenueMatch["source"], limit = 6): VenueMatch[] {
  const byId = new Map<string, VenueMatch>();
  for (const w of works) {
    const name = w.venue?.trim();
    // Conference proceedings are sometimes indexed as journal articles; they are not journals.
    if (!name || /^proceedings\b|\bconference\b|\bsymposium\b/i.test(name)) continue;
    const id = w.venueId || name.toLowerCase().replace(/\s+/g, " ");
    const v = byId.get(id) ?? { id, name, publisher: w.publisher, issn: w.issn, matchingWorks: 0, searchedWorks: works.length, sampleTitles: [], source };
    v.matchingWorks++;
    if (!v.publisher && w.publisher) v.publisher = w.publisher;
    if (!v.issn && w.issn) v.issn = w.issn;
    if (v.sampleTitles.length < 3 && w.title) v.sampleTitles.push(w.title);
    byId.set(id, v);
  }
  return [...byId.values()].sort((a, b) => b.matchingWorks - a.matchingWorks || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Why a journal is suggested, in words that only restate what was counted. */
export function scopeRationale(v: VenueMatch, fromYear: number): string {
  const share = `${v.matchingWorks} of the ${v.searchedWorks} most relevant articles on this topic since ${fromYear}`;
  return `Published ${share}${v.sampleTitles[0] ? `, e.g. “${v.sampleTitles[0]}”` : ""}.`;
}

// ── Structure and readiness ──────────────────────────────────────────────

export type StructureTemplate = "IMRaD" | "Theoretical" | "SystematicReview";

export const ARTICLE_TYPES: Array<{ id: string; label: string; template: StructureTemplate }> = [
  { id: "empirical", label: "Original research (empirical study)", template: "IMRaD" },
  { id: "theoretical", label: "Theoretical or conceptual article", template: "Theoretical" },
  { id: "review", label: "Systematic review or meta-analysis", template: "SystematicReview" },
];

export const templateForArticleType = (id: string | undefined): StructureTemplate =>
  ARTICLE_TYPES.find((a) => a.id === id)?.template ?? "IMRaD";

/** Spelling the guidelines ask for, only when they name it. */
export function spellingFromGuidelines(text: string): "British / Oxford English (-ise/-our/-re)" | "US English" | undefined {
  const t = text.toLowerCase();
  const uk = /\b(british|uk) (english|spelling)\b|\boxford spelling\b/.test(t);
  const us = /\b(american|us|u\.s\.) (english|spelling)\b/.test(t);
  if (uk && !us) return "British / Oxford English (-ise/-our/-re)";
  if (us && !uk) return "US English";
  return undefined;
}

/** Review model the guidelines name, only when they name one. */
export function reviewFormatFromGuidelines(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/double[- ](?:blind|anonymi[sz]ed)/.test(t)) return "Double-anonymised peer review";
  if (/single[- ](?:blind|anonymi[sz]ed)/.test(t)) return "Single-anonymised peer review";
  if (/open peer review|transparent peer review/.test(t)) return "Open peer review";
  return undefined;
}

export interface BlueprintState {
  journal: string;
  problem: string;
  questions: string[];
  title: string;
  hasBudget: boolean;
}

/** What still stands between the blueprint and Mode 2, in plain words. */
export function missingForLock(s: BlueprintState): string[] {
  const missing: string[] = [];
  if (!s.problem.trim()) missing.push("a research gap or problem statement");
  if (!s.questions.some((q) => q.trim())) missing.push("at least one research question");
  if (!s.title.trim()) missing.push("a working title");
  if (!s.journal.trim()) missing.push("a target journal");
  if (!s.hasBudget) missing.push("a table of contents");
  return missing;
}
