/**
 * The outline of a piece of coursework, designed by the student's AI from
 * their brief (subject, form, marking criteria, length) instead of a fixed
 * template, and revised on request ("add a section on ethics", "make it
 * 3,000 words"). The AI decides the headings, their levels (H1 sections, H2
 * and optional H3 sub-sections), each one's purpose and word budget, and
 * proposes working theses. Code keeps those decisions and only fits them
 * (`fitAiOutline`: exact total in the AI's proportions, a section for any
 * marked question it missed, notes on marks); text already written is never
 * dropped by a revision. Pure; no I/O.
 */
import { z } from "zod";
import { requestedTotal } from "../journal/aiOutline";
import { groupBriefQuestions, parseBriefQuestions } from "../../utils/briefQuestions";
import { fitAiOutline, renumberOutline } from "./aiOutlineFit";
import { allocateCleanWords } from "./outlineBudget";
import type { AssignmentDraftingSection, AssignmentMainHeading, AssignmentStructure, AssignmentSubheading, AiThesisOption } from "../../desk/assignment/types";

export interface AssignmentOutlineContext {
  brief: string;
  question?: string;
  assignmentType?: string;
  academicLevel?: string;
  discipline?: string;
  citationStyle?: string;
  targetWords: number;
  /** Marking criteria lines from the brief, if any. */
  criteria?: string[];
  /** The student's change request, when revising. */
  instruction?: string;
  /** The current outline and which sections already have text, when revising. */
  current?: AssignmentStructure | null;
  written?: string[];
  /** The agent's plan from the Understand step (approach, structure, criteria). */
  plan?: string;
  /** The questions the brief sets, with their marks when it gives them. */
  questions?: Array<{ key: string; title: string; marks?: number }>;
}

const clip = (s: string | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

const title = z.string().trim().min(1).max(160);
const purpose = z.string().trim().max(400).optional();
const dependsOn = z.array(z.string().trim().min(1).max(160)).max(6).optional();
const words = z.coerce.number().optional();
const guidance = z.string().max(600).optional();

const h3Schema = z.object({ title, words, guidance, purpose });
const h2Schema = z.object({ title, words, guidance, purpose, dependsOn, subsections: z.array(h3Schema).max(4).default([]) });

const aiOutlineSchema = z.object({
  totalWords: z.coerce.number().int().positive().optional(),
  thesis: z.string().optional(),
  thesisOptions: z
    .array(z.union([z.string().trim().min(1), z.object({ statement: z.string().trim().min(1), angle: z.string().trim().max(80).optional() })]))
    .max(5)
    .optional(),
  sections: z
    .array(
      z.object({
        title,
        words,
        purpose,
        questionRef: z.string().trim().max(40).optional(),
        dependsOn,
        subsections: z.array(h2Schema).max(8).default([]),
      })
    )
    .min(1)
    .max(10),
});

export type AiOutline = z.infer<typeof aiOutlineSchema>;

/** Up to three distinct working theses from the AI's answer. */
function thesisOptionsOf(ai: AiOutline): AiThesisOption[] {
  const raw = [...(ai.thesisOptions ?? []), ...(ai.thesis?.trim() ? [ai.thesis.trim()] : [])];
  const out: AiThesisOption[] = [];
  for (const r of raw) {
    const o = typeof r === "string" ? { statement: r.trim() } : { statement: r.statement.trim(), ...(r.angle ? { angle: r.angle } : {}) };
    if (o.statement && !out.some((x) => x.statement.toLowerCase() === o.statement.toLowerCase())) out.push(o);
  }
  return out.slice(0, 3);
}

function jsonIn(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/^\s*\d+(\.\d+)*\.?\s*/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Turns the AI's answer into an outline the workspace uses. Word targets are
 * refitted to the total; text already written in sections whose titles
 * survive is carried over, and written sections the AI dropped are kept at
 * the end rather than lost. Returns undefined when nothing usable came back.
 */
export function structureFromAi(
  text: string,
  targetWords: number,
  opts: { instruction?: string; previous?: AssignmentDraftingSection[]; briefText?: string } = {}
): AssignmentStructure | undefined {
  const parsed = aiOutlineSchema.safeParse(jsonIn(text ?? ""));
  if (!parsed.success) return undefined;
  const ai = parsed.data;
  const total = requestedTotal(opts.instruction, ai.totalWords) ?? Math.max(150, Math.round(targetWords) || 1500);

  const written = (opts.previous ?? []).filter((p) => (p.draftContent ?? "").trim().length > 0);
  const byTitle = new Map(written.map((p) => [norm(p.title), p]));
  const used = new Set<string>();

  // Ids stay stable for carried-over sections and are unique for new ones.
  const taken = new Set(written.map((p) => p.id));
  const freshId = (base: string) => {
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    taken.add(id);
    return id;
  };

  const unit = (
    headingId: string,
    base: string,
    u: { title: string; words?: number; guidance?: string; purpose?: string; dependsOn?: string[] },
    extra: Partial<AssignmentSubheading> = {}
  ): AssignmentSubheading => {
    const match = byTitle.get(norm(u.title));
    const prev = match && !used.has(match.id) ? match : undefined;
    if (prev) used.add(prev.id);
    return {
      id: prev ? prev.id : freshId(base),
      headingId,
      numberStr: "",
      title: u.title,
      targetWordCount: Number.isFinite(u.words) && (u.words ?? 0) > 0 ? Math.round(u.words as number) : 0,
      currentWordCount: prev?.currentWordCount ?? 0,
      guidance: u.guidance ?? "",
      ...(u.purpose ? { purpose: u.purpose } : {}),
      ...(u.dependsOn?.length ? { dependsOn: u.dependsOn } : {}),
      keyPoints: [],
      draftContent: prev?.draftContent ?? "",
      draftStatus: prev ? "completed" : "not_started",
      boundSourceIds: prev?.boundSourceIds ?? [],
      ...extra,
    };
  };

  const headings: AssignmentMainHeading[] = ai.sections.map((s, hIdx) => {
    const headingId = `heading-${hIdx + 1}`;
    const subheadings: AssignmentSubheading[] = [];
    if (s.subsections.length === 0) {
      // A section the AI did not divide is one writing unit under its own title.
      subheadings.push(unit(headingId, `ai-${hIdx + 1}-1`, { title: s.title, words: s.words, purpose: s.purpose, dependsOn: s.dependsOn }));
    }
    s.subsections.forEach((h2, sIdx) => {
      if (h2.subsections.length === 0) {
        subheadings.push(unit(headingId, `ai-${hIdx + 1}-${sIdx + 1}`, h2));
        return;
      }
      // An H2 divided into H3s: the H3s are the writing units, shown under it.
      h2.subsections.forEach((h3, tIdx) =>
        subheadings.push(
          unit(headingId, `ai-${hIdx + 1}-${sIdx + 1}-${tIdx + 1}`, { ...h3, words: h3.words ?? (h2.words ? h2.words / h2.subsections.length : undefined) }, { level: 3, parentTitle: h2.title })
        )
      );
    });
    return {
      id: headingId,
      number: hIdx + 1,
      title: s.title,
      targetWordCount: subheadings.reduce((a, b) => a + b.targetWordCount, 0),
      subheadings,
      ...(s.purpose ? { purpose: s.purpose } : {}),
      ...(s.questionRef ? { assignmentQuestionAddressed: s.questionRef } : {}),
      ...(s.dependsOn?.length ? { dependsOn: s.dependsOn } : {}),
    };
  });

  // The AI's budgets are kept in proportion and fitted to the exact total.
  const fitted = fitAiOutline(
    { version: 1, isConfirmed: false, targetWordCount: total, totalAllocated: total, headings } as AssignmentStructure,
    total,
    opts.briefText
  );

  const out = [...fitted.headings];
  const dropped = written.filter((p) => !used.has(p.id));
  if (dropped.length) {
    const n = out.length + 1;
    out.push({
      id: `heading-${n}`,
      number: n,
      title: "Kept from your earlier outline",
      notes: "Text you wrote under sections the new outline no longer has. Move it or delete it.",
      targetWordCount: 0,
      subheadings: dropped.map((p) => ({
        id: p.id,
        headingId: `heading-${n}`,
        numberStr: "",
        title: p.title.replace(/^\s*\d+(\.\d+)*\.?\s*/, ""),
        targetWordCount: 0,
        currentWordCount: p.currentWordCount ?? 0,
        guidance: "",
        draftContent: p.draftContent ?? "",
        draftStatus: "completed",
        boundSourceIds: p.boundSourceIds ?? [],
      })),
    });
  }

  const thesisOptions = thesisOptionsOf(ai);
  return {
    version: 1,
    isConfirmed: false,
    targetWordCount: total,
    totalAllocated: total,
    headings: renumberOutline(out),
    thesisStatement: thesisOptions[0]?.statement,
    ...(thesisOptions.length ? { thesisOptions } : {}),
    budgetNotes: fitted.budgetNotes ?? [],
    rationale: opts.instruction ? `Revised by your AI: "${clip(opts.instruction, 160)}"` : "Written by your AI from your brief.",
    source: "ai",
  };
}

/** True when the outline was written by the student's AI from their brief. */
export const isAiAssignmentOutline = (s: AssignmentStructure | null | undefined) => s?.source === "ai";

/** The questions a brief sets, with their marks, for the outline prompt. */
export function briefQuestionsForOutline(briefText: string): Array<{ key: string; title: string; marks?: number }> {
  return groupBriefQuestions(parseBriefQuestions(briefText || "")).map((g) => ({ key: g.key, title: g.stem?.text ?? g.title, ...(g.marks ? { marks: g.marks } : {}) }));
}

/**
 * One section of the outline rewritten by the AI, in place: the AI's answer is
 * one section (same shape as in the outline), fitted to the old section's word
 * budget so the total does not move. Units whose titles survive keep their
 * text; written units the AI dropped are kept at the end of the section with
 * no budget. Undefined when the answer had no usable section.
 */
export function replaceSectionFromAi(
  structure: AssignmentStructure,
  headingId: string,
  text: string,
  previous: AssignmentDraftingSection[] = []
): AssignmentStructure | undefined {
  const index = structure.headings.findIndex((h) => h.id === headingId);
  if (index < 0) return undefined;
  const old = structure.headings[index];
  const body = jsonIn(text ?? "") as { section?: unknown; sections?: unknown[] } | undefined;
  const section = body && typeof body === "object" ? (Array.isArray(body.sections) ? body.sections[0] : body.section ?? body) : undefined;
  if (!section || typeof section !== "object") return undefined;
  const words = Math.max(50, old.targetWordCount || old.subheadings.reduce((a, s) => a + (s.targetWordCount || 0), 0));
  const ownUnits = new Set(old.subheadings.map((s) => s.id));
  const written = previous.filter((p) => ownUnits.has(p.id));
  const rewritten = structureFromAi(JSON.stringify({ sections: [section] }), words, { previous: written });
  if (!rewritten || rewritten.headings.length === 0) return undefined;
  const [fresh, kept] = rewritten.headings;
  // Exactly the old section's budget, in the AI's proportions.
  const fitted = allocateCleanWords(fresh.subheadings.map((s) => s.targetWordCount || 1), words);
  const units = fresh.subheadings.map((s, i) => ({ ...s, targetWordCount: fitted[i] }));
  const heading: AssignmentMainHeading = {
    ...fresh,
    id: old.id,
    targetWordCount: words,
    subheadings: [...units, ...(kept?.subheadings ?? [])].map((s) => ({ ...s, headingId: old.id })),
  };
  const headings = [...structure.headings];
  headings[index] = heading;
  return { ...structure, version: (Number(structure.version) || 0) + 1, headings: renumberOutline(headings) };
}
