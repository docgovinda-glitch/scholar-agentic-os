import { countProseWords } from "../../../shared/proseBlocks";
import { clipHeadingWords } from "../../../utils/briefQuestions";
import type {
AcademicLevel,
AssignmentType,DiscoveredSource,UploadedSourceDocument,
AssignmentBriefRubricCriterion,SectionBudgetItem,WritingStyleConfig,AssignmentStructure
} from "../types";
import { cleanAnswerString,AssignmentDraftingSection,structureToSectionBudgets } from "../types";
import { generateDynamicAssignmentStructure } from "../services/dynamicStructure";
import { safeParseAnswerField } from "../../../shared/projectStateSchema";

export function readInternalSections({ answers, briefText, question }: {
  answers: Record<string, string>;
  briefText: string;
  question: string;
}): AssignmentDraftingSection[] {
  const isNonML = !/\b(machine learning|deep learning|neural network|transformer|foundation model)\b/i.test(`${question} ${briefText}`);
  const isCorrupted = (list: Array<{ title?: string }>) =>
    list.some((sec) =>
      (isNonML && /Mathematical Formulations|Loss Optimization Landscapes|Algorithmic Architectures/i.test(sec.title || "")) ||
      /Divide Yourself in Teams|teams of 2|in classroom discussion/i.test(sec.title || "")
    );

  const rawInternal = answers["assignment_internal_sections"];
  if (rawInternal) {
    const parsed = safeParseAnswerField<AssignmentDraftingSection[]>(rawInternal, []);
    // Word counts always come from the text: a stored count can be stale after
    // a write that did not refresh it (server-side revisions, older saves).
    if (Array.isArray(parsed) && parsed.length > 0 && !isCorrupted(parsed)) {
      return parsed.map((sec) => ({
        ...sec,
        // Older saves clipped titles with a trailing "…"; show them cut at a clean word.
        ...(typeof sec?.title === "string" && /…\s*$/.test(sec.title) ? { title: clipHeadingWords(sec.title) } : {}),
        currentWordCount: countProseWords(sec?.draftContent || ""),
      }));
    }
  }
  return [];
}

export function readRubricCriteria({ answers }: {
  answers: Record<string, string>;
}): AssignmentBriefRubricCriterion[] {
  const raw = answers["rubricCriteria"] || answers["rubric_criteria"];
  if (raw) {
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // fallback
    }
  }
  // "provisional" is the intake placeholder, not a rubric.
  const rubricText = cleanAnswerString(answers["marking_rubric"]) || cleanAnswerString(answers["rubric"]);
  if (rubricText && rubricText.trim()) {
    const lines = rubricText.split("\n").map((l: string) => l.trim()).filter(Boolean);
    return lines.slice(0, 8).map((line: string, idx: number) => {
      const match = line.match(/(.*?)(?:[:\-–—]\s*(\d+)%?|(?:\((\d+)%\)))/);
      return {
        id: `rc-${idx + 1}`,
        title: match ? match[1].replace(/^[0-9]+[.)\s]*/, "").trim() : line.slice(0, 50),
        criterion: match ? match[1].replace(/^[0-9]+[.)\s]*/, "").trim() : line.slice(0, 50),
        description: line,
        weightPercentage: match ? parseInt(match[2] || match[3] || "0", 10) || undefined : undefined,
        weightPercent: match ? parseInt(match[2] || match[3] || "0", 10) || undefined : undefined,
      };
    });
  }
  return [];
}

export function readStructure({ academicLevel, answers, assignmentType, briefText, question, targetWordCount }: {
  academicLevel: AcademicLevel;
  answers: Record<string, string>;
  assignmentType: AssignmentType;
  briefText: string;
  question: string;
  targetWordCount: number;
}): AssignmentStructure {
  const raw = answers["assignment_structure"];
  if (raw) {
    const parsed = safeParseAnswerField<AssignmentStructure | undefined>(raw, undefined);
    if (parsed?.headings && Array.isArray(parsed.headings) && parsed.headings.length > 0) {
      const isNonMLTopic = !/\b(machine learning|deep learning|neural network|transformer|foundation model)\b/i.test(`${question} ${briefText}`);
      const hasLeakedML = parsed.headings.some((h) =>
        /Mathematical Formulations|Loss Optimization Landscapes|Algorithmic Architectures/i.test(h.title || "") ||
        (h.subheadings || []).some((sub) => /Mathematical Formulations|Loss Optimization Landscapes|empirical risk minimization/i.test(sub.title || sub.guidance || ""))
      );
      const hasClassroomLogistics = parsed.headings.some((h) =>
        /Divide Yourself in Teams|teams of 2|in classroom discussion/i.test(h.title || "")
      );

      if (!((isNonMLTopic && hasLeakedML) || hasClassroomLogistics)) {
        return parsed;
      }
    }
  }
  return generateDynamicAssignmentStructure({
    question: cleanAnswerString(question),
    assignmentType,
    academicLevel,
    targetWordCount: targetWordCount > 0 ? targetWordCount : 2000,
    briefText: cleanAnswerString(briefText),
  });
}

export function readSectionBudgets({ rawBudgets, structure, targetWordCount }: {
  rawBudgets: string;
  structure: AssignmentStructure;
  targetWordCount: number;
}): SectionBudgetItem[] {
  if (structure?.headings && structure.headings.length > 0) {
    const converted = structureToSectionBudgets(structure);
    if (converted.length > 0) return converted;
  }
  if (rawBudgets) {
    const parsed = safeParseAnswerField<SectionBudgetItem[]>(rawBudgets, []);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  }
  // Baseline allocation
  const total = targetWordCount > 0 ? targetWordCount : 2000;
  const intro = Math.round(total * 0.10);
  const conclusion = Math.round(total * 0.10);
  const body = Math.max(0, total - intro - conclusion);
  return [
    { id: "intro", title: "Introduction", targetWordCount: intro, isCustom: false },
    { id: "body", title: "Body Paragraphs", targetWordCount: body, isCustom: false },
    { id: "conclusion", title: "Conclusion", targetWordCount: conclusion, isCustom: false },
  ];
}

export function readApprovedSourceIds({ answers, sources, userUploadedSources }: {
  answers: Record<string, string>;
  sources: DiscoveredSource[];
  userUploadedSources: UploadedSourceDocument[];
}): string[] {
  const raw = answers["approved_source_ids"];
  if (raw !== undefined && raw !== null) {
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fallback
    }
  }
  // Until the student approves sources, only the brief's own prescribed
  // references count as approved; discovered papers wait for a decision.
  const fromSources = (sources ?? [])
    .filter((s) => s.status !== "removed" && !s.isExcluded && s.prescribedInBrief)
    .map((s) => s.id);
  const fromUploaded = userUploadedSources.map((u) => u.id);
  return Array.from(new Set([...fromSources, ...fromUploaded]));
}

export function readWritingStyle({ rawStyle }: {
  rawStyle: string;
}): WritingStyleConfig {
  if (rawStyle) {
    const parsed = safeParseAnswerField<WritingStyleConfig | undefined>(rawStyle, undefined);
    if (parsed && parsed.preset) return parsed;
  }
  return {
    preset: "analytical",
    description: "Breaks down causes, patterns, and connections between concepts.",
  };
}
