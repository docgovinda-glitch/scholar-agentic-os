/**
 * A plain, subject-neutral academic outline the student can insert when the AI
 * outline did not arrive. It is the student's own starting point (saved as
 * `source: "starter"`, never presented as AI output) and carries no subject
 * content, theories or sources: only the usual shape of an essay.
 */
import { allocateCleanWords } from "../../../domain/assignment/outlineBudget";
import type { AssignmentMainHeading, AssignmentStructure } from "../types";

const SECTIONS: Array<{ title: string; weight: number; guidance: string }> = [
  { title: "Introduction", weight: 10, guidance: "Introduce the question, state your position and outline how the essay proceeds." },
  { title: "Literature and Context", weight: 20, guidance: "Set out the background and the key sources that frame the question." },
  { title: "Theoretical and Critical Analysis", weight: 30, guidance: "Analyse the question with the concepts or theory that fit it, using evidence." },
  { title: "Evaluation and Discussion", weight: 25, guidance: "Weigh the arguments and evidence, consider counter-arguments and limits." },
  { title: "Conclusion", weight: 15, guidance: "Answer the question directly and draw the argument together." },
];

export function buildDefaultAcademicOutline(targetWordCount: number): AssignmentStructure {
  const total = Math.max(300, Number(targetWordCount) || 2000);
  const words = allocateCleanWords(SECTIONS.map((s) => s.weight), total);
  const headings: AssignmentMainHeading[] = SECTIONS.map((s, i) => {
    const n = i + 1;
    const headingId = `heading-default-${n}`;
    return {
      id: headingId,
      number: n,
      title: s.title,
      notes: "",
      targetWordCount: words[i],
      subheadings: [
        {
          id: `sub-${n}-1`,
          headingId,
          numberStr: `${n}.1`,
          title: s.title,
          targetWordCount: words[i],
          currentWordCount: 0,
          notes: "",
          guidance: s.guidance,
          keyPoints: [],
          researchStatus: "not_researched",
          sourcesCount: 0,
          boundSourceIds: [],
          draftContent: "",
          draftStatus: "not_started",
        },
      ],
    };
  });
  return {
    version: 1,
    isConfirmed: false,
    targetWordCount: total,
    totalAllocated: words.reduce((a, b) => a + b, 0),
    headings,
    source: "starter",
    rationale: "A standard academic outline (not written by AI). Rename, reorder and re-budget the sections to fit your brief.",
  };
}
