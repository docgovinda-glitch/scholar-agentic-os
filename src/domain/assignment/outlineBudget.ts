/**
 * Word budgets for an outline: proportional to the marks the brief states,
 * rounded to clean multiples of 5 (10 for 1,000+ word pieces), with the
 * rounding remainder placed on the largest body section so the sections sum to
 * exactly the target word count. Pure; no I/O.
 */
import { parseBriefQuestions, groupBriefQuestions } from "../../utils/briefQuestions";
import type { AssignmentMainHeading, AssignmentStructure, AssignmentSubheading } from "../../desk/assignment/types";

export function cleanWordStep(total: number): number {
  return total >= 1000 ? 10 : 5;
}

/**
 * Split `total` across `weights`, each share a multiple of the clean step, and
 * the whole summing to `total` exactly. The remainder goes to `remainderIndex`
 * (default: the largest share).
 */
export function allocateCleanWords(weights: number[], total: number, remainderIndex?: number, stepOverride?: number): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const step = stepOverride ?? cleanWordStep(total);
  const safe = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sum = safe.reduce((a, b) => a + b, 0);
  const shares = sum > 0 ? safe.map((w) => w / sum) : safe.map(() => 1 / n);
  const words = shares.map((s) => Math.max(step, Math.round((s * total) / step) * step));
  const largest = remainderIndex ?? words.indexOf(Math.max(...words));
  const drift = total - words.reduce((a, b) => a + b, 0);
  words[largest] = Math.max(step, words[largest] + drift);
  // If the floor pushed the sum over, take the excess from the largest share.
  const over = words.reduce((a, b) => a + b, 0) - total;
  if (over !== 0) words[largest] -= over;
  return words;
}

const STOP = new Set("the and for with that this from into about between their which what when where while does your are was were have has not but can may its".split(" "));
const tokens = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w))
  );

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / Math.min(a.size, b.size);
}

export interface QuestionGroup {
  key: string;
  marks: number;
  words: Set<string>;
}

function questionGroups(briefText: string): QuestionGroup[] {
  // A stem's marks cover its sub-parts: never add both.
  const groups = groupBriefQuestions(parseBriefQuestions(briefText));
  const known = groups.filter((g) => g.marks);
  const avg = known.reduce((n, g) => n + (g.marks ?? 0), 0) / Math.max(1, known.length) || 1;
  return groups.map((g) => {
    const words = new Set<string>();
    for (const r of [g.stem, ...g.parts]) if (r) for (const w of tokens(r.text)) words.add(w);
    return { key: g.key, marks: g.marks ?? avg, words };
  });
}

const headingText = (h: AssignmentMainHeading) =>
  [h.title, h.notes, h.purpose, h.assignmentQuestionAddressed, ...(h.subheadings ?? []).flatMap((s) => [s.title, s.guidance, s.assignmentQuestionAddressed])]
    .filter(Boolean)
    .join(" ");

/** Which heading answers which main question of the brief (by Q-label or wording overlap). */
export function matchHeadingsToQuestions(
  structure: AssignmentStructure,
  headingIndexes: number[],
  briefText?: string
): Map<number, QuestionGroup> {
  const groups = briefText ? questionGroups(briefText) : [];
  const matched = new Map<number, QuestionGroup>();
  const usedGroups = new Set<string>();
  if (groups.length === 0) return matched;
  const candidates: Array<{ i: number; g: QuestionGroup; score: number }> = [];
  for (const i of headingIndexes) {
    const text = headingText(structure.headings[i]);
    const ht = tokens(text);
    for (const g of groups) {
      const labelHit = new RegExp(`\\bq(?:uestion)?\\s*${g.key.replace(/\D/g, "")}(?![\\da-z])`, "i").test(text);
      const ov = overlap(ht, g.words);
      if (labelHit || ov >= 0.4) candidates.push({ i, g, score: (labelHit ? 1 : 0) + ov });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates) {
    if (matched.has(c.i) || usedGroups.has(c.g.key)) continue;
    matched.set(c.i, c.g);
    usedGroups.add(c.g.key);
  }
  return matched;
}

/**
 * The student set word counts per question: those numbers stay exactly as
 * typed on the matching sections; any other section shares what is left.
 */
export function applyQuestionWordTargets(
  structure: AssignmentStructure,
  targets: Array<{ label: string; words: number }>,
  briefText?: string
): AssignmentStructure {
  const byKey = new Map<string, number>();
  for (const t of targets) {
    const key = t.label.replace(/[a-z]$/, "");
    byKey.set(key, (byKey.get(key) ?? 0) + Math.max(0, Math.round(t.words)));
  }
  const all = structure.headings.map((_, i) => i);
  const matched = matchHeadingsToQuestions(structure, all, briefText);
  if (matched.size === 0) return structure;
  const total = Math.round(structure.targetWordCount);
  const fixedSum = [...matched.values()].reduce((n, g) => n + (byKey.get(g.key) ?? 0), 0);
  const free = all.filter((i) => !matched.has(i) && (structure.headings[i].targetWordCount ?? 0) > 0);
  const freeWords = free.length
    ? allocateCleanWords(free.map((i) => structure.headings[i].targetWordCount || 1), Math.max(free.length * 5, total - fixedSum), undefined, cleanWordStep(total))
    : [];
  const headings = structure.headings.map((h, i) => {
    const g = matched.get(i);
    const hw = g ? byKey.get(g.key) ?? h.targetWordCount : freeWords[free.indexOf(i)];
    if (hw === undefined) return h;
    const subs = h.subheadings ?? [];
    if (subs.length === 0) return { ...h, targetWordCount: hw };
    const subWords = allocateCleanWords(subs.map((x) => x.targetWordCount || 1), hw, undefined, 5);
    return { ...h, targetWordCount: hw, subheadings: subs.map((x, k) => ({ ...x, targetWordCount: subWords[k] })) };
  });
  const allocated = headings.reduce((n, h) => n + (h.targetWordCount || 0), 0);
  return { ...structure, headings, totalAllocated: allocated };
}

/**
 * Re-budget an outline (typically AI-written) so section words follow the
 * brief's marks and sum to `structure.targetWordCount` exactly. Without usable
 * marks in the brief, the AI's own proportions are kept but still rounded clean
 * and summed exactly.
 */
/**
 * Never drop a question: any main question of the brief that no heading answers
 * gets its own section appended (e.g. an AI outline that left out Q7).
 */
export function ensureEveryQuestionHasSection(structure: AssignmentStructure, briefText?: string): AssignmentStructure {
  if (!briefText) return structure;
  const groups = groupBriefQuestions(parseBriefQuestions(briefText));
  // Only real, marked questions are guaranteed a section; unmarked numbered lists
  // are often requirements or bullet points, not questions.
  if (groups.length < 2 || !groups.some((g) => g.marks)) return structure;
  const matched = matchHeadingsToQuestions(structure, structure.headings.map((_, i) => i), briefText);
  const answered = new Set([...matched.values()].map((g) => g.key));
  const missing = groups.filter((g) => !answered.has(g.key));
  if (missing.length === 0) return structure;
  const headings = [...structure.headings];
  for (const g of missing) {
    const n = headings.length + 1;
    const id = `heading-${g.key.toLowerCase()}-${n}`;
    const focus = [g.stem?.text, ...g.parts.map((p) => `(${p.label.slice(-1)}) ${p.text}`)].filter(Boolean).join(" ");
    headings.push({
      id,
      number: n,
      title: `${n}.0 ${g.stem?.text ?? g.title}`,
      notes: g.stem?.text,
      targetWordCount: 100,
      subheadings: [
        { id: `${id}-1`, headingId: id, numberStr: `${n}.1`, title: "Key points and evidence", targetWordCount: 100, currentWordCount: 0, guidance: `Focus: ${focus}`, keyPoints: [] },
      ],
    } as AssignmentMainHeading);
  }
  return { ...structure, headings };
}

export function applyMarksBudget(structureIn: AssignmentStructure, briefText?: string): AssignmentStructure {
  const structure = ensureEveryQuestionHasSection(structureIn, briefText);
  const total = Math.round(structure.targetWordCount);
  const live = structure.headings.map((h, i) => ({ h, i })).filter(({ h }) => (h.subheadings ?? []).some((s) => (s.targetWordCount ?? 0) > 0) || (h.targetWordCount ?? 0) > 0);
  if (live.length === 0 || !(total > 0)) return structure;

  const matched = matchHeadingsToQuestions(structure, live.map(({ i }) => i), briefText);

  let headingWeights: number[];
  let remainderPos: number | undefined;
  if (matched.size > 0) {
    const avgMarks = [...matched.values()].reduce((s, g) => s + g.marks, 0) / matched.size;
    headingWeights = live.map(({ i }) => matched.get(i)?.marks ?? avgMarks * 0.4);
    const bodyIdx = live.map((_, p) => p).filter((p) => matched.has(live[p].i));
    remainderPos = bodyIdx.reduce((best, p) => (headingWeights[p] > headingWeights[best] ? p : best), bodyIdx[0]);
  } else {
    headingWeights = live.map(({ h }) => (h.subheadings ?? []).reduce((s, x) => s + (x.targetWordCount || 0), 0) || h.targetWordCount || 1);
  }

  const headingWords = allocateCleanWords(headingWeights, total, remainderPos);
  const byIndex = new Map(live.map(({ i }, p) => [i, headingWords[p]]));

  const headings: AssignmentMainHeading[] = structure.headings.map((h, i) => {
    const hw = byIndex.get(i);
    if (hw === undefined) return h;
    const subs = h.subheadings ?? [];
    if (subs.length === 0) return { ...h, targetWordCount: hw };
    const subWords = allocateCleanWords(subs.map((s) => s.targetWordCount || 1), hw, undefined, cleanWordStep(total));
    const subheadings: AssignmentSubheading[] = subs.map((s, k) => ({ ...s, targetWordCount: subWords[k] }));
    return { ...h, targetWordCount: hw, subheadings };
  });

  return { ...structure, targetWordCount: total, totalAllocated: total, headings };
}
