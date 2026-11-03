/**
 * The article's table of contents, designed by the author's AI for this
 * article (its title, gap, questions, type and journal) instead of a fixed
 * template, and revised on request ("make the literature review 1,500
 * words"). Word targets are fixed up in code so they always add up to the
 * target. Pure; no I/O.
 */
import { z } from "zod";
import { sectionKind } from "../../desk/journal/manuscriptModel";
import type { WordBudgetBlueprint } from "../../desk/workspace/types";

export interface OutlineContext {
  title: string;
  problem: string;
  questions: string[];
  articleType: string;
  journal: string;
  /** Sections the journal's guidelines require, in order. */
  requiredSections: string[];
  targetWords: number;
  /** The author's change request, when revising. */
  instruction?: string;
  /** The current outline, when revising. */
  current?: WordBudgetBlueprint | null;
}

export function outlinePrompt(): string {
  return [
    "You design the table of contents of one academic journal article.",
    "Write sections and sub-sections specific to THIS article: name sub-sections after what this study actually covers (its population, setting, variables, methods, theory), not generic labels such as 'Background' or 'Synthesis' alone.",
    "If required sections are given, use exactly those as the top-level sections, in that order, and design the sub-sections inside them.",
    "Otherwise choose the structure that suits the article type: e.g. an empirical study usually has Introduction, Methods, Results, Discussion; a review or theoretical paper does not.",
    "Give 1 to 4 sub-sections per section, each a writing unit of about 250 to 700 words. Give word targets that add up to the target total. An abstract, if any, is one sub-section of 150 to 300 words.",
    "Headings must not state results, numbers or findings the author has not reported.",
    "When the author asks for a change, apply it to the current outline and keep everything else as it is. If they ask for a new total length, set totalWords to it.",
    'Respond with ONLY JSON: {"totalWords": <number, only if the author asked for a new total>, "sections": [{"title": "...", "subsections": [{"title": "...", "words": <number>}]}]}',
  ].join("\n");
}

export function outlineUserPrompt(c: OutlineContext): string {
  const lines = [
    `Working title: ${c.title || "(not set)"}`,
    `Research gap or problem: ${c.problem || "(not set)"}`,
    c.questions.length ? `Research questions:\n${c.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}` : "Research questions: (not set)",
    `Article type: ${c.articleType || "(not set)"}`,
    `Target journal: ${c.journal || "(not set)"}`,
    c.requiredSections.length ? `Required sections, in order: ${c.requiredSections.join("; ")}` : "Required sections: none stated",
    `Target total: ${c.targetWords} words`,
  ];
  if (c.current?.sections.length) {
    lines.push(
      "Current outline:",
      ...c.current.sections.map((s) => `- ${s.sectionName} (${s.targetWords} words)${s.subSections.length ? `: ${s.subSections.map((u) => `${u.title} (${u.targetWords})`).join("; ")}` : ""}`)
    );
  }
  if (c.instruction?.trim()) lines.push(`The author asks: ${c.instruction.trim()}`);
  return lines.join("\n");
}

const raw = z.object({
  totalWords: z.number().positive().optional(),
  sections: z
    .array(
      z.object({
        title: z.string(),
        subsections: z.array(z.object({ title: z.string(), words: z.number().nonnegative().optional() })).default([]),
      })
    )
    .default([]),
});

function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return undefined;
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch {
    return undefined;
  }
}

const RESULT_NUMBER = /\d+(?:\.\d+)?\s*(?:%|percent|-?fold)|\bn\s*=\s*\d/i;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "part";
const round25 = (n: number) => Math.max(25, Math.round(n / 25) * 25);

/**
 * Scales word targets so they add up to `total` exactly, keeping each
 * unit's share. Units without a target get an equal share of what is left.
 */
export function fitWords(words: Array<number | undefined>, total: number): number[] {
  if (words.length === 0) return [];
  const given = words.map((w) => (w && w > 0 ? w : 0));
  const known = given.reduce((a, b) => a + b, 0);
  const missing = given.filter((w) => w === 0).length;
  const fill = missing ? Math.max(100, (known > 0 ? known / Math.max(1, words.length - missing) : total / words.length)) : 0;
  const raw = given.map((w) => (w > 0 ? w : fill));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  const out = raw.map((w) => round25((w / sum) * total));
  // Put the rounding difference on the largest unit.
  const diff = total - out.reduce((a, b) => a + b, 0);
  const big = out.indexOf(Math.max(...out));
  out[big] = Math.max(25, out[big] + diff);
  return out;
}

/** The new total the author asked for, only if their words name that number. */
export function requestedTotal(instruction: string | undefined, aiTotal: number | undefined): number | undefined {
  if (!instruction || !aiTotal) return undefined;
  const plain = instruction.replace(/(\d),(\d{3})/g, "$1$2");
  const nums = Array.from(plain.matchAll(/\b(\d{3,6})\b/g)).map((m) => Number(m[1]));
  const k = Array.from(plain.matchAll(/\b(\d+(?:\.\d+)?)\s*k\b/gi)).map((m) => Math.round(Number(m[1]) * 1000));
  return [...nums, ...k].includes(Math.round(aiTotal)) ? Math.round(aiTotal) : undefined;
}

/**
 * The AI's outline as the workspace's word budget. Headings that state
 * results are dropped; targets are scaled to the total. Undefined when the
 * answer has no usable sections.
 */
export function outlineFromAi(text: string, projectId: string, targetWords: number, instruction?: string): WordBudgetBlueprint | undefined {
  const parsed = raw.safeParse(parseJson(text));
  if (!parsed.success) return undefined;
  const total = requestedTotal(instruction, parsed.data.totalWords) ?? (targetWords > 0 ? targetWords : 6000);
  const sections = parsed.data.sections
    .map((s) => ({
      title: s.title.trim().replace(/\s+/g, " "),
      subs: s.subsections
        .map((u) => ({ title: u.title.trim().replace(/\s+/g, " "), words: u.words }))
        .filter((u) => u.title && u.title.length <= 160 && !RESULT_NUMBER.test(u.title)),
    }))
    .filter((s) => s.title && s.title.length <= 120 && !RESULT_NUMBER.test(s.title))
    .slice(0, 12)
    .map((s) => ({ ...s, subs: (s.subs.length ? s.subs : [{ title: s.title, words: undefined }]).slice(0, 6) }));
  if (sections.length < 2) return undefined;

  const flat = sections.flatMap((s) => s.subs.map((u) => u.words));
  const fitted = fitWords(flat, total);
  let k = 0;
  const now = new Date().toISOString();
  const bp: WordBudgetBlueprint = {
    projectId,
    template: "IMRaD",
    targetTotalWords: total,
    allocatedTotalWords: total,
    totalSubSections: flat.length,
    createdAt: now,
    updatedAt: now,
    sections: sections.map((s, i) => {
      const id = `ai-${i + 1}-${slug(s.title)}`;
      const subSections = s.subs.map((u, j) => ({
        id: `${id}-${j + 1}`,
        sectionId: id,
        title: u.title,
        targetWords: fitted[k++],
        order: j + 1,
        assignedSourceIds: [],
      }));
      return { id, sectionKey: sectionKind(s.title), sectionName: s.title, targetWords: subSections.reduce((n, u) => n + u.targetWords, 0), order: i + 1, subSections };
    }),
  };
  return bp;
}

/** The same outline at a new total, every unit keeping its share. */
export function rescaleOutline(bp: WordBudgetBlueprint, total: number): WordBudgetBlueprint {
  const flat = bp.sections.flatMap((s) => s.subSections.map((u) => u.targetWords));
  const fitted = fitWords(flat, total);
  let k = 0;
  const sections = bp.sections.map((s) => {
    const subSections = s.subSections.map((u) => ({ ...u, targetWords: fitted[k++] }));
    return { ...s, subSections, targetWords: subSections.reduce((n, u) => n + u.targetWords, 0) };
  });
  return { ...bp, sections, targetTotalWords: total, allocatedTotalWords: total, updatedAt: new Date().toISOString() };
}

export const isAiOutline = (bp: WordBudgetBlueprint | null | undefined) => Boolean(bp?.sections.length && bp.sections.every((s) => s.id.startsWith("ai-")));
