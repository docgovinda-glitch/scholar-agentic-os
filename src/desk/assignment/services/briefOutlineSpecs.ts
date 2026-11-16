import { isNonQuestionBriefLine, parseBriefQuestions, groupBriefQuestions } from "../../../utils/briefQuestions";
import { extractBriefInquiriesAndConcepts, clipWords, shortHeading, formatAcademicTopicTitle } from "./briefSemantics";

export interface HeadingSpec {
  title: string;
  notes?: string;
  subheadings: {
    title: string;
    ratio: number;
    guidance: string;
    keyPoints: string[];
  }[];
}
/** Max top-level sections an outline may be expanded to (human-scale outlines). */
export const MAX_OUTLINE_SECTIONS = 8;
/**
 * Construct truly brief-specific, non-generic heading specifications directly mirroring
 * extracted inquiries, explicit brief sub-tasks, questions, and domain concepts.
 */

export function buildBriefSpecificSpecs(
  question: string,
  briefText: string | undefined,
  assignmentType: string,
  targetFrameworks: string[],
  targetWordCount?: number
): HeadingSpec[] {
  const inquiries = extractBriefInquiriesAndConcepts(question, briefText);
  const directTasks = [...inquiries.extractedTasks, ...inquiries.subQuestions]
    .filter((t) => !isNonQuestionBriefLine(t))
    .slice(0, MAX_OUTLINE_SECTIONS);
  const concepts = inquiries.keyConcepts;

  // The brief states its own questions and marks: one section per main question,
  // budgets proportional to the marks, Focus lines quoting the brief itself.
  const markedRows = parseBriefQuestions(briefText || question || "");
  if (markedRows.length >= 2 && markedRows.some((r) => r.marks)) {
    // One section per main question: the stem and its sub-parts stay together and
    // no question is ever dropped, however many there are.
    const groups = groupBriefQuestions(markedRows);
    const known = groups.filter((g) => g.marks);
    const avgMarks = known.reduce((t, g) => t + (g.marks ?? 0), 0) / Math.max(1, known.length);
    const weights = groups.map((g) => g.marks ?? avgMarks);
    const totalWeight = weights.reduce((t, w) => t + w, 0) || 1;
    return groups.map((g, i) => {
      const n = i + 1;
      const heading = g.stem ? clipWords(g.stem.text, 12) : shortHeading(g.title, 10);
      const focus = [g.stem?.text, ...g.parts.map((p) => `(${p.label.slice(-1)}) ${p.text}`)].filter(Boolean).join(" ");
      const partWeights = g.parts.map((p) => p.marks ?? 1);
      const partTotal = partWeights.reduce((t, w) => t + w, 0) || 1;
      return {
        title: `${n}.0 ${heading}`,
        // The full question stem stays with its section (shown as a quiet subtitle, never in the heading).
        notes: g.stem?.text ?? `Answers ${g.key} from the brief.`,
        // Sub-parts get their own short titles; a single prompt gets one neutral
        // sub-section, never a copy of the parent title.
        subheadings: g.parts.length > 0
          ? g.parts.map((p, k) => ({
            title: `${n}.${k + 1} ${shortHeading(p.text)}`,
            ratio: (weights[i] / totalWeight) * (partWeights[k] / partTotal),
            guidance: `Focus: (${p.label.slice(-1)}) ${p.text}`,
            keyPoints: [] as string[],
          }))
          : [
            {
              title: `${n}.1 Key points and evidence`,
              ratio: weights[i] / totalWeight,
              guidance: `Focus: ${focus}`,
              keyPoints: [] as string[],
            },
          ],
      };
    });
  }

  // Two or more tasks or questions in the brief: one section each, in its own words.
  if (directTasks.length >= 2) {
    const ratio = 1 / directTasks.length;
    return directTasks.map((task, tIdx) => ({
      title: `${tIdx + 1}.0 ${taskHeading(task)}`,
      notes: `Answer: "${task}".`,
      subheadings: [
        {
          title: `${tIdx + 1}.1 Key points and evidence`,
          ratio,
          guidance: `Focus: ${task}`,
          keyPoints: [] as string[],
        },
      ],
    }));
  }

  // One question (or none): introduction, a section per concept the brief names, conclusion.
  // Nothing beyond the brief's own words and the frameworks the student or AI chose.
  const focus = (briefText || question || "").replace(/\s+/g, " ").trim().slice(0, 300);
  const named = concepts.filter((c) => c && c.length >= 3).slice(0, 3);
  const bodyTopics = named.length ? named : [shortHeading(question || focus || "Main discussion", 10) || "Main discussion"];
  const frameworkNote = targetFrameworks.length ? ` Use ${targetFrameworks.slice(0, 2).join(" and ")} where it fits.` : "";
  const bodyShare = 0.8 / bodyTopics.length;
  const specs: HeadingSpec[] = [
    {
      title: "1.0 Introduction",
      subheadings: [{ title: "1.1 The question and how the answer is organised", ratio: 0.1, guidance: `Focus: ${focus}`, keyPoints: [] }],
    },
    ...bodyTopics.map((topic, i) => ({
      title: `${i + 2}.0 ${formatAcademicTopicTitle(topic)}`,
      subheadings: [
        {
          title: `${i + 2}.1 Key points and evidence`,
          ratio: bodyShare,
          guidance: `Focus: ${topic}, as it bears on the question: "${clipWords(question || focus, 40)}".${frameworkNote}`,
          keyPoints: [] as string[],
        },
      ],
    })),
    {
      title: `${bodyTopics.length + 2}.0 Conclusion`,
      subheadings: [
        {
          title: `${bodyTopics.length + 2}.1 Answer to the question`,
          ratio: 0.1,
          guidance: "Focus: Answer the question directly, drawing on the points made above.",
          keyPoints: [],
        },
      ],
    },
  ];
  return specs;
}

/** A section title from a task: its command verb dropped, cut at a clean word. */
function taskHeading(task: string): string {
  return formatAcademicTopicTitle(
    shortHeading(
      task
        .replace(/^(?:critically\s+evaluate|evaluate|critically\s+analy[sz]e|analy[sz]e|critically\s+assess|assess|examine|investigate|discuss|explore|propose|detail|explain|describe)\s+/i, "")
        .replace(/[?:.]+$/, "")
        .trim(),
      12
    )
  );
}
