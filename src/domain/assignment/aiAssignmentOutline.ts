/**
 * The outline of a piece of coursework, designed by the student's AI from
 * their brief (subject, form, marking criteria, length) instead of a fixed
 * template, and revised on request ("add a section on ethics", "make it
 * 3,000 words"). Word targets are fixed up in code so they always add up to
 * the target, and text already written is never dropped by a revision.
 * Pure; no I/O.
 */
import { z } from "zod";
import { fitWords, requestedTotal } from "../journal/aiOutline";
import { applyMarksBudget } from "./outlineBudget";
import type { AssignmentDraftingSection, AssignmentMainHeading, AssignmentStructure, AssignmentSubheading } from "../../desk/assignment/types";

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
}

const clip = (s: string | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

const aiOutlineSchema = z.object({
  totalWords: z.coerce.number().int().positive().optional(),
  thesis: z.string().optional(),
  sections: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        subsections: z
          .array(
            z.object({
              title: z.string().trim().min(1).max(160),
              words: z.coerce.number().optional(),
              guidance: z.string().max(600).optional(),
            })
          )
          .max(8)
          .default([]),
      })
    )
    .min(1)
    .max(10),
});

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

  const flat = ai.sections.flatMap((s, h) =>
    (s.subsections.length ? s.subsections : [{ title: "Key points and evidence", words: undefined, guidance: undefined }]).map((sub) => ({ h, sub }))
  );
  const words = fitWords(flat.map((f) => f.sub.words), total);

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

  let k = 0;
  const headings: AssignmentMainHeading[] = ai.sections.map((s, hIdx) => {
    const headingId = `heading-${hIdx + 1}`;
    const subs = flat.filter((f) => f.h === hIdx);
    const subheadings: AssignmentSubheading[] = subs.map((f, sIdx) => {
      const w = words[k++];
      const match = byTitle.get(norm(f.sub.title));
      const prev = match && !used.has(match.id) ? match : undefined;
      if (prev) used.add(prev.id);
      return {
        id: prev ? prev.id : freshId(`ai-${hIdx + 1}-${sIdx + 1}`),
        headingId,
        numberStr: `${hIdx + 1}.${sIdx + 1}`,
        title: f.sub.title,
        targetWordCount: w,
        currentWordCount: prev?.currentWordCount ?? 0,
        guidance: f.sub.guidance ?? "",
        keyPoints: [],
        draftContent: prev?.draftContent ?? "",
        draftStatus: prev ? "completed" : "not_started",
        boundSourceIds: prev?.boundSourceIds ?? [],
      };
    });
    return {
      id: headingId,
      number: hIdx + 1,
      title: s.title,
      targetWordCount: subheadings.reduce((a, b) => a + b.targetWordCount, 0),
      subheadings,
    };
  });

  // The AI's own word counts are suggestions: re-budget by the brief's marks, clean multiples, exact sum.
  const budgeted = applyMarksBudget(
    { version: 1, isConfirmed: false, targetWordCount: total, totalAllocated: total, headings } as AssignmentStructure,
    opts.briefText
  );
  headings.splice(0, headings.length, ...budgeted.headings);

  const dropped = written.filter((p) => !used.has(p.id));
  if (dropped.length) {
    const n = headings.length + 1;
    headings.push({
      id: `heading-${n}`,
      number: n,
      title: "Kept from your earlier outline",
      notes: "Text you wrote under sections the new outline no longer has. Move it or delete it.",
      targetWordCount: 0,
      subheadings: dropped.map((p, i) => ({
        id: p.id,
        headingId: `heading-${n}`,
        numberStr: `${n}.${i + 1}`,
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

  return {
    version: 1,
    isConfirmed: false,
    targetWordCount: total,
    totalAllocated: total,
    headings,
    thesisStatement: ai.thesis?.trim() || undefined,
    rationale: opts.instruction ? `Revised by your AI: "${clip(opts.instruction, 160)}"` : "Written by your AI from your brief.",
    source: "ai",
  };
}

/** True when the outline was written by the student's AI from their brief. */
export const isAiAssignmentOutline = (s: AssignmentStructure | null | undefined) => s?.source === "ai";
