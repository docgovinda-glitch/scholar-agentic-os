import type { AssignmentStructure, AskScholarOutlineResponse, AssignmentSubheading, AssignmentMainHeading } from "../types";
import { isGenericPlaceholderTitle } from "./briefSemantics";
import { deconstructQuestionSemantics } from "./briefSemantics";


/**
 * Convert internal AssignmentStructure to AskScholar structured outline tree format.
 */

export function assignmentStructureToOutlineTree(structure: AssignmentStructure): AskScholarOutlineResponse {
  return {
    thesis_statement: structure.thesisStatement || "",
    target_frameworks: structure.targetFrameworks || [],
    targetWordCount: structure.targetWordCount,
    writingTone: structure.writingTone,
    academicLevel: (structure as AssignmentStructure & { academicLevel?: string }).academicLevel,
    sections: structure.headings.map((h) => ({
      level: "h1" as const,
      title: h.title,
      guidance: h.notes,
      targetWordCount: h.targetWordCount,
      children: (h.subheadings || []).map((sub) => ({
        level: "h2" as const,
        title: sub.title,
        guidance: sub.guidance,
        targetWordCount: sub.targetWordCount,
        children: (sub.keyPoints || []).map((pt) => ({
          level: "h3" as const,
          title: pt,
        })),
      })),
    })),
  };
}
/**
 * Convert AskScholar structured outline tree format back to internal AssignmentStructure.
 */

export function outlineTreeToAssignmentStructure(
  data: AskScholarOutlineResponse,
  targetWordCount: number = 2000
): AssignmentStructure {
  const total = Math.max(300, Number(data.targetWordCount || targetWordCount) || 2000);
  const rawSections = Array.isArray(data.sections) ? data.sections : [];

  const h1Sections = rawSections.filter((s) => s.level === "h1" || !s.level);

  let allocatedSoFar = 0;
  const headings: AssignmentMainHeading[] = (h1Sections.length > 0
    ? h1Sections
    : [{ level: "h1" as const, title: "Foundational Inquiry & Core Dimension", guidance: "", children: [] }]
  ).map((h1, hIdx) => {
    const headingId = `heading-${hIdx + 1}`;
    const headingNumber = hIdx + 1;
    const h2Sections = Array.isArray(h1.children)
      ? h1.children.filter((s) => s.level === "h2" || !s.level)
      : [];

    const subheadings: AssignmentSubheading[] = (h2Sections.length > 0
      ? h2Sections
      : [{ level: "h2" as const, title: `${h1.title} - Investigation`, guidance: h1.guidance, children: [] }]
    ).map((h2, sIdx) => {
      const subId = `sub-${headingNumber}-${sIdx + 1}`;
      const subNumberStr = `${headingNumber}.${sIdx + 1}`;
      const keyPoints = Array.isArray(h2.children)
        ? h2.children.map((c) => (typeof c === "string" ? c : c.title)).filter(Boolean)
        : (h2 as { keyPoints?: string[] }).keyPoints || [];

      const words = h2.targetWordCount ||
        Math.round(total / (h1Sections.length * (h2Sections.length || 1)));
      allocatedSoFar += words;

      return {
        id: subId,
        headingId,
        numberStr: subNumberStr,
        title: h2.title,
        targetWordCount: words,
        currentWordCount: 0,
        notes: "",
        guidance: h2.guidance || "",
        keyPoints: keyPoints.length > 0
          ? keyPoints
          : [
            "Empirical evidence and primary case observations",
            "Theoretical mechanism and framework application",
            "Methodological limitations and scope boundaries",
          ],
        researchStatus: "not_researched" as const,
        sourcesCount: 0,
        boundSourceIds: [],
        draftContent: "",
        draftStatus: "not_started" as const,
      };
    });

    const headingTotal = subheadings.reduce((sum, s) => sum + s.targetWordCount, 0);

    return {
      id: headingId,
      number: headingNumber,
      title: h1.title,
      notes: h1.guidance || "",
      targetWordCount: headingTotal,
      subheadings,
    };
  });

  const totalAllocated = headings.reduce((sum, h) => sum + h.targetWordCount, 0);

  return {
    version: 1,
    isConfirmed: false,
    targetWordCount: total,
    totalAllocated,
    headings,
    thesisStatement: data.thesis_statement || "",
    targetFrameworks: Array.isArray(data.target_frameworks) ? data.target_frameworks : [],
    writingTone: data.writingTone || "formal_academic",
    rationale: "Synthesized from AskScholar structured outline tree.",
  };
}
/**
 * Gives placeholder headings ("Body Paragraph 1", "Section 2", "Overview") the
 * brief's own topic. "Introduction" and "Conclusion" are real headings and stay.
 * No template wording is added.
 */
const KEEP_AS_IS = /^(?:[\d.]+\s*)?(introduction|conclusions?)$/i;

export function sanitizeOutlineHeadings(
  headings: AssignmentMainHeading[],
  question: string,
  _assignmentType?: string
): AssignmentMainHeading[] {
  const deconstructed = deconstructQuestionSemantics(question);
  const topics = [deconstructed.subjectFormattedA, deconstructed.subjectFormattedB].filter((t): t is string => Boolean(t));
  const topicFor = (i: number) => topics[i % Math.max(1, topics.length)] || "Main discussion";

  let placeholderIndex = 0;
  return headings.map((h, hIdx) => {
    const sanitizedH1Title =
      isGenericPlaceholderTitle(h.title) && !KEEP_AS_IS.test(h.title.trim()) ? topicFor(placeholderIndex++) : h.title;
    const sanitizedSubheadings = (h.subheadings || []).map((sub, sIdx) => {
      let sanitizedSubTitle = sub.title;
      if (isGenericPlaceholderTitle(sub.title)) {
        sanitizedSubTitle = KEEP_AS_IS.test(sub.title.trim()) ? sub.title : `${h.number || hIdx + 1}.${sIdx + 1} Key points and evidence`;
      }
      return {
        ...sub,
        title: sanitizedSubTitle,
      };
    });

    return {
      ...h,
      title: sanitizedH1Title,
      subheadings: sanitizedSubheadings,
    };
  });
}
