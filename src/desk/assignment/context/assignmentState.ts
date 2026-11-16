import { selectApprovedSources } from "../../../domain/assignment/approvedSources";
import type { CanonicalDocument } from "../../types";
import type { DiscoveredSource,AssignmentStructure,AssignmentPhaseId,AssignmentAnalysis,RubricScoreReport,SubmissionCheckReport,WritingToneConfig,WritingStyleConfig,UploadedSourceDocument,ThinkingMap,SectionBudgetItem,SectionBreakdown,OutlineSection,FlowAuditResult,EvidenceItem,CitationAuditResult,AssignmentType,AssignmentProjectState,AssignmentDraftingSection,AssignmentBriefRubricCriterion,AcademicLevel } from "../types";


/** A submission phase is complete only when its last check found nothing left to fix. */

export function submissionPasses(report: RubricScoreReport | SubmissionCheckReport | null): boolean {
  if (!report) return false;
  if ("missingRequirements" in report && Array.isArray(report.missingRequirements)) return report.missingRequirements.length === 0;
  return "readyForSubmission" in report ? Boolean(report.readyForSubmission) : false;
}
export function computePhaseStatuses({ question, targetWordCount, citationStyle, structure, analysis, sources, approvedSourceIds, currentWordCount, submissionReport, currentPhase }: {
  question: string;
  targetWordCount: number;
  citationStyle: string;
  structure: AssignmentStructure;
  analysis: AssignmentAnalysis | null;
  sources: DiscoveredSource[];
  approvedSourceIds: string[];
  currentWordCount: number;
  submissionReport: RubricScoreReport | SubmissionCheckReport | null;
  currentPhase: AssignmentPhaseId;
}): Record<AssignmentPhaseId, "active" | "completed" | "upcoming"> {
  const hasExtract = Boolean(question && targetWordCount > 0 && citationStyle);
  const hasUnderstand = Boolean(structure?.isConfirmed || (hasExtract && analysis?.approvedByUser));
  const hasSources = selectApprovedSources(sources, approvedSourceIds).length > 0;
  const hasDrafting = currentWordCount >= Math.min(200, targetWordCount * 0.3);
  const hasSubmission = submissionPasses(submissionReport);

  return {
    extract: currentPhase === "extract" ? "active" : hasExtract ? "completed" : "upcoming",
    understand: currentPhase === "understand" ? "active" : hasUnderstand ? "completed" : "upcoming",
    sources: currentPhase === "sources" ? "active" : hasSources ? "completed" : "upcoming",
    drafting: currentPhase === "drafting" ? "active" : hasDrafting ? "completed" : "upcoming",
    submission: currentPhase === "submission" ? "active" : hasSubmission ? "completed" : "upcoming",
  };
}
export function buildAssignmentProjectState({ activeProjectId, currentPhase, question, targetWordCount, sections, academicLevel, assignmentType, citationStyle, sectionBudgets, writingStyle, writingTone, rubricCriteriaList, analysis, sources, userUploadedSources, approvedSourceIds, evidenceItems, internalSections, outline, activeSectionId, currentWordCount, document, thinkingMap, submissionReport, citationAuditResult, flowAuditResult }: {
  activeProjectId: string;
  currentPhase: AssignmentPhaseId;
  question: string;
  targetWordCount: number;
  sections: SectionBreakdown | undefined;
  academicLevel: AcademicLevel;
  assignmentType: AssignmentType;
  citationStyle: string;
  sectionBudgets: SectionBudgetItem[];
  writingStyle: WritingStyleConfig;
  writingTone: WritingToneConfig;
  rubricCriteriaList: AssignmentBriefRubricCriterion[];
  analysis: AssignmentAnalysis | null;
  sources: DiscoveredSource[];
  userUploadedSources: UploadedSourceDocument[];
  approvedSourceIds: string[];
  evidenceItems: EvidenceItem[];
  internalSections: AssignmentDraftingSection[];
  outline: OutlineSection[];
  activeSectionId: string | null;
  currentWordCount: number;
  document: CanonicalDocument | null;
  thinkingMap: ThinkingMap | null;
  submissionReport: RubricScoreReport | SubmissionCheckReport | null;
  citationAuditResult: CitationAuditResult | null;
  flowAuditResult: FlowAuditResult | null;
}): AssignmentProjectState {
  return {
    projectId: activeProjectId,
    currentPhase,
    brief: {
      rawPrompt: question,
      instructions: question,
      assignmentTopic: question,
      targetWordCount,
      wordBudget: {
        intro: sections?.intro?.targetWords ?? Math.round(targetWordCount * 0.10),
        conclusion: sections?.conclusion?.targetWords ?? Math.round(targetWordCount * 0.15),
        body: sections?.body?.targetWords ?? Math.max(0, targetWordCount - (sections?.intro?.targetWords ?? Math.round(targetWordCount * 0.10)) - (sections?.conclusion?.targetWords ?? Math.round(targetWordCount * 0.15))),
      },
      academicLevel,
      assignmentType,
      citationStyle,
      sections,
      sectionBudgets,
      writingStyle,
      writingTone,
      rubricCriteria: rubricCriteriaList,
      analysis,
      briefLedger: analysis?.briefLedger,
    },
    sources: {
      curated: sources,
      userUploaded: userUploadedSources,
      approvedSourceIds,
      evidenceItems,
    },
    drafting: {
      internalSections: internalSections.length > 0 ? internalSections : outline.map((sec) => ({
        id: sec.id,
        title: sec.title,
        targetWordCount: sec.targetWordCount,
        currentWordCount: sec.currentWordCount,
        guidance: sec.guidance,
        draftContent: sec.draftContent || "",
        status: sec.status,
        keyPoints: sec.keyPoints,
        linkedEvidenceIds: sec.linkedEvidenceIds,
      })),
      activeSectionId: activeSectionId || internalSections[0]?.id || outline[0]?.id || null,
      fullDocumentMarkdown: (internalSections.length > 0 ? internalSections : outline)
        .map((s) => `## ${s.title}\n\n${s.draftContent || ""}`)
        .join("\n\n"),
      overallWordCount: currentWordCount,
      canonicalDocument: document,
      thinkingMap,
    },
    submission: {
      rubricScoreReport: submissionReport,
      citationAudit: citationAuditResult,
      flowAudit: flowAuditResult,
      isReadyForSubmission: Boolean(
        submissionReport &&
        // Ready only when nothing checkable is outstanding (no score threshold).
        Array.isArray((submissionReport as { missingRequirements?: unknown[]; }).missingRequirements) &&
        (submissionReport as { missingRequirements: unknown[]; }).missingRequirements.length === 0 &&
        (!citationAuditResult || citationAuditResult.isReconciled)
      ),
    },
    updatedAt: new Date().toISOString(),
  };
}
