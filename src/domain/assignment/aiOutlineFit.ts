/**
 * Fitting an AI-written outline to the brief without replacing the AI's
 * decisions. The AI chooses the headings, their levels and their word
 * budgets; code only:
 *   - makes the budgets add up to the target exactly, keeping the AI's
 *     proportions (rounded to clean multiples of 5, or 10 from 1,000 words);
 *   - adds a section for a marked question of the brief the AI left out,
 *     titled with the brief's own words (never renaming the AI's headings);
 *   - notes, without changing anything, where a section's share of the words
 *     is far from its question's share of the marks.
 * Every change or observation is listed in `budgetNotes`. Pure; no I/O.
 */
import { groupBriefQuestions, parseBriefQuestions } from "../../utils/briefQuestions";
import type { AssignmentMainHeading, AssignmentStructure, AssignmentSubheading } from "../../desk/assignment/types";
import { allocateCleanWords, matchHeadingsToQuestions } from "./outlineBudget";

/** How far the AI's total may be from the target before it is called out (2%). */
const TOTAL_TOLERANCE = 0.02;
/** How far a section's share of words may be from its marks share before it is noted (20%). */
const MARKS_TOLERANCE = 0.2;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const strip = (t: string) => t.replace(/^\s*\d+(?:\.\d+)*\.?\s+/, "").trim();

/** Numbers headings 1..n and their units n.1.. (a level-3 unit n.p.k under its H2). */
export function renumberOutline(headings: AssignmentMainHeading[]): AssignmentMainHeading[] {
  return headings.map((h, i) => {
    const n = i + 1;
    let h2 = 0;
    let h3 = 0;
    let lastParent: string | undefined;
    const subheadings = (h.subheadings ?? []).map((s) => {
      if (s.level === 3 && s.parentTitle) {
        if (s.parentTitle !== lastParent) {
          h2 += 1;
          h3 = 0;
          lastParent = s.parentTitle;
        }
        h3 += 1;
        return { ...s, headingId: h.id, numberStr: `${n}.${h2}.${h3}` };
      }
      lastParent = undefined;
      h2 += 1;
      return { ...s, headingId: h.id, numberStr: `${n}.${h2}` };
    });
    return { ...h, number: n, subheadings };
  });
}

/** Sections for marked questions the outline has none for, titled from the brief. */
function addMissingQuestions(structure: AssignmentStructure, briefText: string | undefined, notes: string[]): AssignmentStructure {
  if (!briefText) return structure;
  const groups = groupBriefQuestions(parseBriefQuestions(briefText));
  // Only real, marked questions are guaranteed a section; an unmarked numbered
  // list is often requirements or bullet points, not questions.
  if (groups.length < 2 || !groups.some((g) => g.marks)) return structure;
  const matched = matchHeadingsToQuestions(structure, structure.headings.map((_, i) => i), briefText);
  const answered = new Set([...matched.values()].map((g) => g.key));
  // A section may answer several questions and say so ("Q3, Q4" in its question reference).
  const named = structure.headings.map((h) => h.assignmentQuestionAddressed ?? "").join(" ");
  for (const g of groups) {
    const n = g.key.replace(/\D/g, "");
    if (n && new RegExp(`\\bq(?:uestion)?\\s*${n}(?![\\da-z])`, "i").test(named)) answered.add(g.key);
  }
  const missing = groups.filter((g) => !answered.has(g.key));
  if (missing.length === 0) return structure;

  // Words for an added section: the words per mark the AI gave the questions it did plan.
  let matchedWords = 0;
  let matchedMarks = 0;
  for (const [i, g] of matched) {
    matchedWords += structure.headings[i].subheadings.reduce((a, s) => a + (s.targetWordCount || 0), 0);
    matchedMarks += g.marks || 0;
  }
  const totalMarks = groups.reduce((a, g) => a + (g.marks || 0), 0);
  const perMark = matchedMarks > 0 && matchedWords > 0 ? matchedWords / matchedMarks : structure.targetWordCount / Math.max(1, totalMarks);

  const headings = [...structure.headings];
  for (const g of missing) {
    const id = `heading-${g.key.toLowerCase()}-added`;
    const title = strip(g.stem?.text ?? g.title);
    const words = Math.max(50, Math.round((g.marks || 1) * perMark));
    const focus = [g.stem?.text, ...g.parts.map((p) => `(${p.label.slice(-1)}) ${p.text}`)].filter(Boolean).join(" ");
    headings.push({
      id,
      number: headings.length + 1,
      title,
      assignmentQuestionAddressed: g.key,
      targetWordCount: words,
      subheadings: [
        { id: `${id}-1`, headingId: id, numberStr: "", title, targetWordCount: words, currentWordCount: 0, guidance: focus, keyPoints: [], draftStatus: "not_started", boundSourceIds: [] },
      ],
    });
    notes.push(`The AI's outline had no section for ${g.key}; one was added at the end, titled from the brief.`);
  }
  return { ...structure, headings };
}

/** Budgets that add up to `total`, in the AI's proportions. */
function fitTotals(structure: AssignmentStructure, total: number, notes: string[]): AssignmentStructure {
  const units = structure.headings.flatMap((h, hi) => h.subheadings.map((s, si) => ({ hi, si, words: s.targetWordCount })));
  if (units.length === 0 || !(total > 0)) return structure;
  const given = units.map((u) => (Number.isFinite(u.words) && u.words > 0 ? u.words : 0));
  const known = given.filter((w) => w > 0);
  const average = known.length ? known.reduce((a, b) => a + b, 0) / known.length : total / units.length;
  const weights = given.map((w) => (w > 0 ? w : average));
  const aiTotal = given.reduce((a, b) => a + b, 0);
  if (known.length < units.length) {
    notes.push(`The AI gave no word target for ${units.length - known.length} section(s); they were given the average of the others.`);
  }
  if (aiTotal > 0 && Math.abs(aiTotal - total) / total > TOTAL_TOLERANCE) {
    notes.push(`The AI's word targets added up to ${aiTotal.toLocaleString("en-GB")}; they were scaled to the ${total.toLocaleString("en-GB")}-word target, keeping its proportions.`);
  }
  const words = allocateCleanWords(weights, total);
  const headings = structure.headings.map((h, hi) => {
    const subheadings: AssignmentSubheading[] = h.subheadings.map((s, si) => ({ ...s, targetWordCount: words[units.findIndex((u) => u.hi === hi && u.si === si)] }));
    return { ...h, subheadings, targetWordCount: subheadings.reduce((a, s) => a + s.targetWordCount, 0) };
  });
  return { ...structure, headings, targetWordCount: total, totalAllocated: total };
}

/** Where a section's share of the words is far from its question's share of the marks. */
function marksNotes(structure: AssignmentStructure, briefText: string | undefined, notes: string[]): void {
  if (!briefText) return;
  // The marks the brief states (a question without marks is left out).
  const stated = new Map(groupBriefQuestions(parseBriefQuestions(briefText)).filter((g) => (g.marks || 0) > 0).map((g) => [g.key, g.marks as number]));
  const matched = matchHeadingsToQuestions(structure, structure.headings.map((_, i) => i), briefText);
  const rows = [...matched.entries()].filter(([, g]) => stated.has(g.key));
  if (rows.length < 2) return;
  const words = rows.map(([i]) => structure.headings[i].targetWordCount);
  const marks = rows.map(([, g]) => stated.get(g.key) as number);
  const sumW = words.reduce((a, b) => a + b, 0);
  const sumM = marks.reduce((a, b) => a + b, 0);
  if (!(sumW > 0 && sumM > 0)) return;
  rows.forEach(([i, g], k) => {
    const shareW = words[k] / sumW;
    const shareM = marks[k] / sumM;
    if (Math.abs(shareW - shareM) > MARKS_TOLERANCE * shareM) {
      notes.push(`"${strip(structure.headings[i].title)}" has ${pct(shareW)} of the words for the brief's questions; ${g.key} carries ${pct(shareM)} of the marks.`);
    }
  });
}

/**
 * The AI's outline with exact totals, every marked question covered and notes
 * on what was changed or noticed. Headings, levels, order and proportions stay
 * the AI's.
 */
export function fitAiOutline(structure: AssignmentStructure, total: number, briefText?: string): AssignmentStructure {
  const notes: string[] = [];
  const covered = addMissingQuestions(structure, briefText, notes);
  const fitted = fitTotals(covered, total, notes);
  marksNotes(fitted, briefText, notes);
  return { ...fitted, headings: renumberOutline(fitted.headings), budgetNotes: notes };
}
