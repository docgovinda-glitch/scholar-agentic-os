/**
 * Working-thesis options grounded in the student's own brief: its title and
 * the titles of its questions. No subject lookup tables and no invented
 * claims; the AI's own "line of argument" replaces these whenever it exists.
 */
import { deriveDocumentTitle } from "../../shared/presentationBrief";
import { groupBriefQuestions, parseBriefQuestions } from "../../utils/briefQuestions";

export interface ThesisStance {
  id: string;
  badge: string;
  title: string;
  statement: string;
  isRecommended?: boolean;
}

const shortTitle = (t: string, max = 7) => {
  const w = t.replace(/[.:;]+$/, "").split(/\s+/);
  return w.length > max ? w.slice(0, max).join(" ") : w.join(" ");
};

function listPhrase(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** What a multi-question brief is about: its title and its question titles. */
export function briefFocus(briefText: string): { title: string; topics: string[]; questionCount: number } | null {
  const groups = groupBriefQuestions(parseBriefQuestions(briefText || ""));
  if (groups.length < 2) return null;
  const docTitle = deriveDocumentTitle(briefText);
  const title = docTitle && !/^untitled/i.test(docTitle) ? docTitle : shortTitle(groups[0].title);
  return { title, topics: groups.map((g) => shortTitle(g.title)).slice(0, 3), questionCount: groups.length };
}

/** Three neutral angles on a multi-question brief, or [] when the brief has fewer than two questions. */
export function briefGroundedStances(briefText: string): ThesisStance[] {
  const focus = briefFocus(briefText);
  if (!focus) return [];
  const topics = listPhrase(focus.topics);
  return [
    {
      id: "stance-brief-balanced",
      badge: "Recommended",
      title: "Balanced Judgement",
      statement: `Across its ${focus.questionCount} questions on ${focus.title}, this report weighs the strengths of each approach against its limits, from ${topics}, and reaches a clear, evidence-based judgement on every question.`,
      isRecommended: true,
    },
    {
      id: "stance-brief-critical",
      badge: "Critical Analysis",
      title: "Evidence Under Test",
      statement: `This report argues that claims made for ${focus.title} often run ahead of the evidence, and tests each one against the sources across ${topics}.`,
    },
    {
      id: "stance-brief-applied",
      badge: "Applied",
      title: "Context Decides",
      statement: `This report argues that the value of each approach in ${focus.title} depends on context, and sets out where each works best in practice across ${topics}.`,
    },
  ];
}

/** The default working thesis for a multi-question brief, or "" when it has fewer than two questions. */
export function briefGroundedThesis(briefText: string): string {
  return briefGroundedStances(briefText)[0]?.statement ?? "";
}
