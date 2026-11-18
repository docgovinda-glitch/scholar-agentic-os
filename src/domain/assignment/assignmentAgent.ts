/**
 * The coursework agent's steps, as pure functions: what the student's AI is
 * asked at each step, and how its answer is checked before anything is kept.
 *
 *   Extract     the brief and materials -> task, questions, requirements,
 *               constraints, and what is missing
 *   Understand  -> subject, what to produce, approach, criteria, gaps, searches
 *   Sources     real search results -> relevance, credibility, evidence, use
 *   Review      the draft -> requirement by requirement, unsupported claims,
 *               argument, structure, language
 *
 * Anything that claims to come from a text (the brief, an abstract, the
 * draft) must quote it word for word; items whose quote is not found are
 * dropped, so nothing invented reaches the student. Pure; no I/O.
 */
import { z } from "zod";

/* ----------------------------- shared helpers ---------------------------- */


/** Lower-cased, punctuation-light form used to compare quotes with texts. */
export function normalizeForQuote(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/[^a-z0-9%'".,;:()\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the quote (at least 12 characters) appears in the text. */
export function quotedIn(quote: string | undefined, text: string): boolean {
  const q = normalizeForQuote(quote ?? "").replace(/^["']+|["'.,;:]+$/g, "").trim();
  if (q.length < 12) return false;
  return normalizeForQuote(text).includes(q);
}

export function jsonIn(text: string): unknown {
  const fence = (text ?? "").match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : text ?? "";
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

const str = (max: number) => z.string().trim().max(max);
const optStr = (max: number) => z.string().trim().max(max).optional().catch(undefined);
const list = <T extends z.ZodTypeAny>(item: T, max: number) => z.array(z.unknown()).catch([]).transform((arr) => arr.slice(0, max).map((x) => item.safeParse(x)).filter((r) => r.success).map((r) => (r as { data: z.infer<T> }).data));

/* --------------------------------- Extract -------------------------------- */

export interface ExtractInput {
  brief: string;
  /** Text of other files the student added (readings, slides, rubric). */
  materials?: Array<{ name: string; text: string }>;
  /** The student's answers to earlier "missing information" questions. */
  clarifications?: string;
}

export const REQUIREMENT_KINDS = ["content", "format", "length", "referencing", "submission", "other"] as const;

export interface Extraction {
  task: string;
  questions: Array<{ text: string; quote: string }>;
  requirements: Array<{ text: string; quote: string; kind: (typeof REQUIREMENT_KINDS)[number] }>;
  objectives: string[];
  constraints: { wordCount?: number; citationStyle?: string; deadline?: string; format?: string; level?: string };
  criteria: Array<{ criterion: string; weight?: number; quote: string }>;
  materials: Array<{ name: string; summary: string }>;
  missing: Array<{ question: string; why: string }>;
}

const extractSchema = z.object({
  task: str(400).catch(""),
  questions: list(z.object({ text: str(600), quote: str(800) }), 12),
  requirements: list(z.object({ text: str(400), quote: str(800), kind: z.enum(REQUIREMENT_KINDS).catch("other") }), 30),
  objectives: list(str(300), 10),
  constraints: z
    .object({
      wordCount: z.coerce.number().int().positive().max(100000).optional().catch(undefined),
      citationStyle: optStr(60),
      deadline: optStr(80),
      format: optStr(160),
      level: optStr(60),
    })
    .catch({}),
  criteria: list(z.object({ criterion: str(200), weight: z.coerce.number().min(0).max(100).optional().catch(undefined), quote: str(600) }), 15),
  materials: list(z.object({ name: str(160), summary: str(400) }), 8),
  missing: list(z.object({ question: str(300), why: str(300).catch("") }), 6),
});

/** The AI's extraction, keeping only items whose quotes are in the brief or materials. */
export function parseExtraction(text: string, input: ExtractInput): Extraction | undefined {
  const parsed = extractSchema.safeParse(jsonIn(text));
  if (!parsed.success) return undefined;
  const corpus = [input.brief, input.clarifications ?? "", ...(input.materials ?? []).map((m) => m.text)].join("\n");
  const d = parsed.data;
  const out: Extraction = {
    task: d.task,
    questions: d.questions.filter((q) => quotedIn(q.quote, corpus)),
    requirements: d.requirements.filter((r) => quotedIn(r.quote, corpus)),
    objectives: d.objectives,
    constraints: d.constraints,
    criteria: d.criteria.filter((c) => quotedIn(c.quote, corpus)),
    materials: d.materials.filter((m) => (input.materials ?? []).some((x) => x.name === m.name)),
    missing: d.missing,
  };
  if (!out.task && out.requirements.length === 0 && out.questions.length === 0) return undefined;
  return out;
}

/* ------------------------------- Understand ------------------------------- */

export interface Understanding {
  discipline: string;
  assignmentType: string;
  produce: string;
  approach: string;
  structure: string;
  criteria: Array<{ criterion: string; howToMeet: string }>;
  knowledgeGaps: string[];
  searchQueries: string[];
  thesisDirection: string;
  blockers: string[];
}

const understandSchema = z.object({
  discipline: str(120).catch(""),
  assignmentType: str(120).catch(""),
  produce: str(600).catch(""),
  approach: str(1200).catch(""),
  structure: str(1200).catch(""),
  criteria: list(z.object({ criterion: str(200), howToMeet: str(600) }), 12),
  knowledgeGaps: list(str(300), 10),
  searchQueries: list(str(160), 6),
  thesisDirection: str(600).catch(""),
  blockers: list(str(300), 6),
});

export function parseUnderstanding(text: string): Understanding | undefined {
  const p = understandSchema.safeParse(jsonIn(text));
  if (!p.success) return undefined;
  const d = p.data;
  if (!d.produce && !d.approach && d.searchQueries.length === 0) return undefined;
  return { ...d, searchQueries: Array.from(new Set(d.searchQueries.map((q) => q.trim()).filter((q) => q.length >= 3))).slice(0, 5) };
}

/* --------------------------------- Sources -------------------------------- */

export interface SourceForAnalysis {
  id: string;
  title: string;
  authors?: string[];
  year?: string;
  venue?: string;
  abstract?: string;
  peerReviewed?: boolean | null;
  citationCount?: number;
}

export interface SourceAnalysis {
  id: string;
  relevance: "high" | "medium" | "low";
  credibility: string;
  mainPoint: string;
  evidence: Array<{ claim: string; quote: string }>;
  sections: string[];
  /** One sentence on what this source does for this assignment and thesis. */
  fit?: string;
}

const sourceSchema = z.object({
  sources: list(
    z.object({
      id: str(200),
      relevance: z.enum(["high", "medium", "low"]).catch("low"),
      credibility: str(200).catch(""),
      mainPoint: str(500).catch(""),
      fit: str(300).catch("").optional(),
      evidence: list(z.object({ claim: str(400), quote: str(800) }), 3),
      sections: list(str(120), 6),
    }),
    30
  ),
});

/** Analyses for known sources only; evidence must quote that source's abstract; sections must exist. */
export function parseSourceAnalysis(text: string, sources: SourceForAnalysis[], sectionIds: string[]): SourceAnalysis[] | undefined {
  const p = sourceSchema.safeParse(jsonIn(text));
  if (!p.success || p.data.sources.length === 0) return undefined;
  const byId = new Map(sources.map((s) => [s.id, s]));
  const known = new Set(sectionIds);
  const seen = new Set<string>();
  const out: SourceAnalysis[] = [];
  for (const a of p.data.sources) {
    const src = byId.get(a.id);
    if (!src || seen.has(a.id)) continue;
    seen.add(a.id);
    out.push({
      id: a.id,
      relevance: a.relevance,
      credibility: a.credibility,
      mainPoint: a.mainPoint,
      ...(a.fit ? { fit: a.fit } : {}),
      evidence: a.evidence.filter((e) => quotedIn(e.quote, src.abstract ?? "")).slice(0, 2),
      sections: a.sections.filter((id) => known.has(id)),
    });
  }
  return out.length ? out : undefined;
}

/* --------------------------------- Review --------------------------------- */

export interface ReviewInput {
  draft: string;
  requirements: Array<{ text: string; kind?: string }>;
  criteria: Array<{ criterion: string; weight?: number }>;
  question?: string;
  citationStyle?: string;
  targetWords?: number;
}

export interface DraftReview {
  requirements: Array<{ index: number; requirement: string; status: "met" | "partly" | "missing"; quote?: string; fix?: string }>;
  unsupportedClaims: Array<{ quote: string; why: string }>;
  argument: Array<{ comment: string; quote?: string }>;
  structure: Array<{ comment: string; quote?: string }>;
  language: Array<{ quote: string; suggestion: string }>;
  summary: string;
}

const reviewSchema = z.object({
  summary: str(800).catch(""),
  requirements: list(z.object({ index: z.coerce.number().int(), status: z.enum(["met", "partly", "missing"]).catch("partly"), quote: optStr(800), fix: optStr(500) }), 40),
  unsupportedClaims: list(z.object({ quote: str(800), why: str(300).catch("") }), 8),
  argument: list(z.object({ comment: str(500), quote: optStr(800) }), 8),
  structure: list(z.object({ comment: str(500), quote: optStr(800) }), 8),
  language: list(z.object({ quote: str(500), suggestion: str(600) }), 8),
});

/** The review, with every quote checked against the draft; quotes not found are removed. */
export function parseReview(text: string, input: ReviewInput): DraftReview | undefined {
  const p = reviewSchema.safeParse(jsonIn(text));
  if (!p.success) return undefined;
  const d = p.data;
  const inDraft = (q?: string) => (q && quotedIn(q, input.draft) ? q : undefined);
  const reqs = d.requirements
    .filter((r) => r.index >= 1 && r.index <= input.requirements.length)
    .map((r) => {
      const quote = inDraft(r.quote);
      // "met" must be shown in the draft; without a quote it is at most "partly".
      const status = r.status === "met" && !quote ? "partly" : r.status;
      return { index: r.index, requirement: input.requirements[r.index - 1].text, status, quote, fix: r.fix };
    });
  const review: DraftReview = {
    summary: d.summary,
    requirements: Array.from(new Map(reqs.map((r) => [r.index, r])).values()).sort((a, b) => a.index - b.index),
    unsupportedClaims: d.unsupportedClaims.filter((c) => inDraft(c.quote)),
    argument: d.argument.map((a) => ({ comment: a.comment, quote: inDraft(a.quote) })),
    structure: d.structure.map((a) => ({ comment: a.comment, quote: inDraft(a.quote) })),
    language: d.language.filter((l) => inDraft(l.quote)),
  };
  if (!review.summary && review.requirements.length === 0 && review.argument.length === 0) return undefined;
  return review;
}

/* ------------------------- Evidence from an upload ------------------------- */

export interface EvidencePassage {
  location: string;
  text: string;
}

export interface EvidenceInput {
  question: string;
  title: string;
  sourceType: string;
  passages: EvidencePassage[];
}

export interface EvidenceExtraction {
  title?: string;
  author?: string;
  year?: string;
  mainFinding?: string;
  excerpts: Array<{ excerpt: string; context?: string; sourceLocation?: string; claim?: string }>;
}

const EvidenceSchema = z.object({
  title: optStr(300),
  author: optStr(200),
  year: z.union([z.string(), z.number()]).optional().catch(undefined),
  mainFinding: optStr(600),
  excerpts: list(
    z.object({ excerpt: str(1200), context: optStr(1200), sourceLocation: optStr(120), claim: optStr(400) }),
    6
  ),
});

/**
 * The AI's reading of an uploaded document, kept only where it can be checked:
 * an excerpt must appear word for word in the passages it was given, and a year
 * must be a plain four-digit year. Nothing else is filled in.
 */
export function parseEvidenceExtraction(text: string, input: EvidenceInput): EvidenceExtraction | null {
  const parsed = EvidenceSchema.safeParse(jsonIn(text));
  if (!parsed.success) return null;
  const all = input.passages.map((p) => p.text).join("\n\n");
  const year = parsed.data.year !== undefined ? String(parsed.data.year).trim() : "";
  const blank = (s?: string) => (s && s.trim() && !/^(null|unknown|n\/?a)$/i.test(s.trim()) ? s.trim() : undefined);
  return {
    title: blank(parsed.data.title),
    author: blank(parsed.data.author),
    year: /^(1[5-9]|20)\d{2}$/.test(year) ? year : undefined,
    mainFinding: blank(parsed.data.mainFinding),
    excerpts: parsed.data.excerpts.filter((e) => quotedIn(e.excerpt, all)).slice(0, 4),
  };
}
