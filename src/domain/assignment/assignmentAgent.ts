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

const clip = (s: string | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

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

export function extractPrompt(): string {
  return [
    "You read a student's assignment brief and any materials they added, and record what the assignment asks for.",
    "Quote the brief word for word for every question, requirement and marking criterion (the exact words, at least a few words long). Never add a requirement the brief does not state.",
    "List what is missing that the student must decide or ask their tutor (for example no word count, no referencing style, an unclear question), with why it matters. Do not invent answers to these.",
    "For each added material, say in one sentence what it contains, from its text only.",
    'Respond with ONLY JSON: {"task": "<one sentence: what must be produced>", "questions": [{"text": "...", "quote": "<exact words>"}], "requirements": [{"text": "...", "quote": "<exact words>", "kind": "content|format|length|referencing|submission|other"}], "objectives": ["..."], "constraints": {"wordCount": <number or omit>, "citationStyle": "...", "deadline": "...", "format": "...", "level": "..."}, "criteria": [{"criterion": "...", "weight": <percent or omit>, "quote": "<exact words>"}], "materials": [{"name": "...", "summary": "..."}], "missing": [{"question": "...", "why": "..."}]}',
  ].join("\n");
}

export function extractUserPrompt(i: ExtractInput): string {
  const parts = [`Assignment brief:\n${clip(i.brief, 12000) || "(empty)"}`];
  for (const m of (i.materials ?? []).slice(0, 6)) parts.push(`Material "${clip(m.name, 120)}":\n${clip(m.text, 4000)}`);
  if (i.clarifications?.trim()) parts.push(`The student's clarifications:\n${clip(i.clarifications, 2000)}`);
  return parts.join("\n\n");
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

export function understandPrompt(): string {
  return [
    "You are planning a piece of student coursework before any writing starts. From the brief's extraction, work out what must be produced and how.",
    "Be specific to this assignment: its subject, its question, its marking criteria. Do not state facts, findings or sources; those come from research later.",
    "knowledgeGaps are what the student must find evidence about. searchQueries are 2 to 5 short scholarly search queries (keywords, not sentences) that would find that evidence.",
    "thesisDirection is a provisional line of argument to test, phrased tentatively. blockers are things that must be settled before writing (from the missing information), or empty.",
    'Respond with ONLY JSON: {"discipline": "...", "assignmentType": "...", "produce": "<what the finished piece is>", "approach": "<how to tackle it>", "structure": "<the shape the piece should take>", "criteria": [{"criterion": "...", "howToMeet": "..."}], "knowledgeGaps": ["..."], "searchQueries": ["..."], "thesisDirection": "...", "blockers": ["..."]}',
  ].join("\n");
}

export function understandUserPrompt(e: Extraction, brief: string, extra?: { level?: string; citationStyle?: string; words?: number }): string {
  return [
    `Brief (for reference):\n${clip(brief, 6000)}`,
    `Task: ${e.task}`,
    e.questions.length ? `Questions:\n- ${e.questions.map((q) => q.text).join("\n- ")}` : "",
    e.requirements.length ? `Requirements:\n- ${e.requirements.map((r) => `${r.text} [${r.kind}]`).join("\n- ")}` : "",
    e.criteria.length ? `Marking criteria:\n- ${e.criteria.map((c) => `${c.criterion}${c.weight ? ` (${c.weight}%)` : ""}`).join("\n- ")}` : "No marking criteria were given.",
    e.missing.length ? `Missing information:\n- ${e.missing.map((m) => m.question).join("\n- ")}` : "",
    `Level: ${extra?.level || e.constraints.level || "not stated"}. Length: ${extra?.words || e.constraints.wordCount || "not stated"} words. Referencing: ${extra?.citationStyle || e.constraints.citationStyle || "not stated"}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
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
}

export function sourcesPrompt(): string {
  return [
    "You assess real search results for a student's coursework. You see each source's title, authors, year, venue and abstract only, not the full text; say nothing beyond what these show.",
    "For each source: relevance to this assignment (high, medium or low); credibility in one short phrase based on the venue, peer review and citations shown; its main point from the abstract; up to 2 pieces of evidence, each a claim with an exact quote from the abstract; and which outline sections (by id) it supports.",
    "If a source has no abstract, give no evidence and judge relevance from the title only.",
    'Respond with ONLY JSON: {"sources": [{"id": "...", "relevance": "high|medium|low", "credibility": "...", "mainPoint": "...", "evidence": [{"claim": "...", "quote": "<exact words from the abstract>"}], "sections": ["<section id>"]}]}',
  ].join("\n");
}

export function sourcesUserPrompt(task: string, sections: Array<{ id: string; title: string }>, sources: SourceForAnalysis[]): string {
  return [
    `Assignment: ${clip(task, 800)}`,
    `Outline sections:\n${sections.slice(0, 30).map((s) => `- ${s.id}: ${clip(s.title, 140)}`).join("\n") || "(none yet)"}`,
    `Sources:\n${sources
      .slice(0, 20)
      .map(
        (s) =>
          `[${s.id}] ${clip(s.title, 300)} — ${clip((s.authors ?? []).slice(0, 4).join(", "), 160)} (${s.year || "n.d."}). ${clip(s.venue, 160)}${s.peerReviewed ? ", peer-reviewed" : ""}${typeof s.citationCount === "number" ? `, cited ${s.citationCount} times` : ""}\nAbstract: ${clip(s.abstract, 1500) || "(none)"}`
      )
      .join("\n\n")}`,
  ].join("\n\n");
}

const sourceSchema = z.object({
  sources: list(
    z.object({
      id: str(200),
      relevance: z.enum(["high", "medium", "low"]).catch("low"),
      credibility: str(200).catch(""),
      mainPoint: str(500).catch(""),
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

export function reviewPrompt(): string {
  return [
    "You review a student's draft before submission against their brief. Be specific and fair; do not predict a mark.",
    "For each numbered requirement: met, partly or missing, with an exact quote from the draft that shows it (omit the quote if missing) and what to fix.",
    "unsupportedClaims: sentences stating facts or findings without a citation, quoted exactly. argument: weaknesses in reasoning or evidence use. structure: problems with order, flow or balance. language: grammar, clarity or register problems, each an exact quote and a corrected version.",
    "Every quote must be copied exactly from the draft. Give at most 8 items per list.",
    'Respond with ONLY JSON: {"summary": "<two sentences>", "requirements": [{"index": <number>, "status": "met|partly|missing", "quote": "...", "fix": "..."}], "unsupportedClaims": [{"quote": "...", "why": "..."}], "argument": [{"comment": "...", "quote": "..."}], "structure": [{"comment": "...", "quote": "..."}], "language": [{"quote": "...", "suggestion": "..."}]}',
  ].join("\n");
}

export function reviewUserPrompt(i: ReviewInput): string {
  return [
    i.question ? `Question: ${clip(i.question, 1000)}` : "",
    `Requirements:\n${i.requirements.map((r, n) => `${n + 1}. ${clip(r.text, 300)}`).join("\n") || "(none extracted)"}`,
    i.criteria.length ? `Marking criteria: ${i.criteria.map((c) => `${c.criterion}${c.weight ? ` (${c.weight}%)` : ""}`).join("; ")}` : "",
    `Referencing style: ${i.citationStyle || "not stated"}. Target length: ${i.targetWords || "not stated"} words.`,
    `Draft:\n${clip(i.draft, 30000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
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
