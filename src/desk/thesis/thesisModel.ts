/**
 * Thesis workspace data and pure helpers: chapter editing, word counts and
 * the plain-text export. No React, no I/O, so every rule here is unit-tested.
 */

export type ChapterStatus = "not_started" | "drafting" | "reviewed" | "completed";

export interface ThesisChapter {
  chapterNumber: number;
  title: string;
  wordCount: number;
  targetWordCount: number;
  status: ChapterStatus;
  /** The chapter text the student writes (or accepts from an AI draft). */
  content?: string;
  /** References the AI draft cited, as Markdown. */
  bibliography?: string;
}

export interface LiteratureMatrix {
  foundations: string;
  debates: string;
  gap: string;
}

export type DegreeLevel = "Undergraduate Capstone" | "Master's Thesis" | "PhD Dissertation";

export interface ThesisProjectData {
  id: string;
  projectId: string;
  title: string;
  degreeLevel: DegreeLevel;
  fieldOfStudy: string;
  targetWordCount: number;
  currentWordCount: number;
  researchQuestions: string[];
  theoreticalFramework: string;
  methodologicalDesign: string;
  supervisorNotes: string;
  literatureMatrix: LiteratureMatrix;
  chapters: ThesisChapter[];
}

export const UNTITLED_THESIS = "Untitled Thesis & Dissertation";

export const emptyLiteratureMatrix = (): LiteratureMatrix => ({ foundations: "", debates: "", gap: "" });

export function countWords(text: string | undefined): number {
  return (text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

/** The thesis total is always the sum of its chapters. */
export function totalWords(chapters: ThesisChapter[]): number {
  return chapters.reduce((sum, c) => sum + (c.content !== undefined ? countWords(c.content) : c.wordCount), 0);
}

const renumber = (chapters: ThesisChapter[]): ThesisChapter[] =>
  chapters.map((c, i) => ({ ...c, chapterNumber: i + 1 }));

export function addChapter(chapters: ThesisChapter[], targetWordCount = 10_000): ThesisChapter[] {
  return renumber([...chapters, { chapterNumber: 0, title: `Chapter ${chapters.length + 1}`, wordCount: 0, targetWordCount, status: "not_started", content: "" }]);
}

export function removeChapter(chapters: ThesisChapter[], index: number): ThesisChapter[] {
  return renumber(chapters.filter((_, i) => i !== index));
}

export function moveChapter(chapters: ThesisChapter[], index: number, delta: -1 | 1): ThesisChapter[] {
  const to = index + delta;
  if (to < 0 || to >= chapters.length) return chapters;
  const next = [...chapters];
  [next[index], next[to]] = [next[to], next[index]];
  return renumber(next);
}

/** Updates one chapter; editing its text keeps its word count and status in step. */
export function updateChapter(chapters: ThesisChapter[], index: number, patch: Partial<ThesisChapter>): ThesisChapter[] {
  return chapters.map((c, i) => {
    if (i !== index) return c;
    const next = { ...c, ...patch };
    if (patch.content !== undefined) {
      next.wordCount = countWords(patch.content);
      if (next.status === "not_started" && next.wordCount > 0) next.status = "drafting";
    }
    return next;
  });
}

/**
 * A conventional five-chapter structure sized to the word budget. Only the
 * structure: the student's title, questions and framework are never filled in.
 */
export function standardChapters(budget: number): ThesisChapter[] {
  const total = budget > 0 ? budget : 60_000;
  const plan: Array<[string, number]> = [
    ["Introduction", 0.12],
    ["Literature Review", 0.25],
    ["Methodology", 0.2],
    ["Results", 0.25],
    ["Discussion and Conclusion", 0.18],
  ];
  return plan.map(([title, share], i) => ({
    chapterNumber: i + 1, title, wordCount: 0, targetWordCount: Math.round(total * share), status: "not_started", content: "",
  }));
}

/** What still blocks a useful AI step, in plain words (empty when nothing does). */
export function missingForViva(data: Pick<ThesisProjectData, "title" | "researchQuestions">): string[] {
  const missing: string[] = [];
  if (!data.title.trim() || data.title === UNTITLED_THESIS) missing.push("a thesis title");
  if (data.researchQuestions.filter((q) => q.trim()).length === 0) missing.push("at least one research question");
  return missing;
}

/** The whole thesis as Markdown: title page details, then each chapter and its references. */
export function thesisToMarkdown(data: ThesisProjectData): string {
  const out: string[] = [`# ${data.title}`, ""];
  const meta = [data.degreeLevel, data.fieldOfStudy].filter((x) => x && x.trim());
  if (meta.length) out.push(`*${meta.join(" · ")}*`, "");
  const rqs = data.researchQuestions.filter((q) => q.trim());
  if (rqs.length) {
    out.push("## Research questions", "", ...rqs.map((q, i) => `${i + 1}. ${q.trim()}`), "");
  }
  for (const c of data.chapters) {
    out.push(`## Chapter ${c.chapterNumber}: ${c.title}`, "");
    out.push(c.content?.trim() ? c.content.trim() : "_[Not drafted yet]_", "");
    if (c.bibliography?.trim()) out.push("### References", "", c.bibliography.trim(), "");
  }
  return out.join("\n").trimEnd() + "\n";
}
