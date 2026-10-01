import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { RubricComplianceCard } from "../components/RubricComplianceCard";
import { CitationReconciliationCard } from "../components/CitationReconciliationCard";
import {
  exportAssignmentToDocx,
  exportAssignmentToPdf,
  copyAssignmentMarkdown,
} from "../services/assignmentExportService";
import { getCitationCoverage } from "../services/citationAnchoringService";
import {
  FileText,
  Printer,
  Copy,
  Check,
  RotateCw,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  BookOpen,
  LinkIcon,
} from "lucide-react";

export interface AssignmentSubmissionStageProps {
  onBack?: () => void;
}

export function AssignmentSubmissionStage({
  onBack,
}: AssignmentSubmissionStageProps) {
  const {
    project,
    projectState,
    targetWordCount,
    currentWordCount,
    internalSections,
    outline,
    sources,
    approvedSourceIds,
    citationStyle,
    academicLevel,
    question,
    submissionReport,
    runSubmissionAudit,
    isAuditingSubmission,
    citationAuditResult,
    setPhase,
  } = useAssignmentWorkspace();

  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Auto-run submission audit on mount if report is not yet generated
  useEffect(() => {
    if (!submissionReport && !isAuditingSubmission && typeof runSubmissionAudit === "function") {
      runSubmissionAudit();
    }
  }, [submissionReport, isAuditingSubmission, runSubmissionAudit]);

  // Determine active sections list (internalSections or outline fallback)
  const activeSections = internalSections.length > 0 ? internalSections : outline.map((sec) => ({
    id: sec.id,
    title: sec.title,
    targetWordCount: sec.targetWordCount,
    currentWordCount: sec.currentWordCount,
    guidance: sec.guidance,
    draftContent: sec.draftContent || "",
    status: sec.status,
    keyPoints: sec.keyPoints,
    linkedEvidenceIds: sec.linkedEvidenceIds,
  }));

  const assignmentTitle =
    project?.answers?.["assignment_title"] ||
    project?.answers?.["title"] ||
    question ||
    "Academic Assignment";

  const handleExportDocx = async () => {
    setIsExportingDocx(true);
    setExportError(null);
    try {
      await exportAssignmentToDocx({
        title: assignmentTitle,
        studentName: project?.answers?.["student_name"] || "Academic Candidate",
        studentId: project?.answers?.["student_id"] || "SCH-2026-X01",
        courseName: project?.answers?.["course_name"] || projectState.brief.courseDetails?.courseName || "Academic Course",
        institution: project?.answers?.["institution"] || "University Faculty of Arts & Sciences",
        brief: projectState.brief,
        sections: activeSections,
        sources: projectState.sources.curated,
        actualWordCount: currentWordCount,
      });
    } catch (err: any) {
      setExportError(err?.message || "Failed to generate Word document (.docx).");
    } finally {
      setIsExportingDocx(false);
    }
  };

  const handleExportPdf = () => {
    try {
      exportAssignmentToPdf({
        title: assignmentTitle,
        studentName: project?.answers?.["student_name"] || "Academic Candidate",
        studentId: project?.answers?.["student_id"] || "SCH-2026-X01",
        courseName: project?.answers?.["course_name"] || projectState.brief.courseDetails?.courseName || "Academic Course",
        institution: project?.answers?.["institution"] || "University Faculty of Arts & Sciences",
        brief: projectState.brief,
        sections: activeSections,
        sources: projectState.sources.curated,
        actualWordCount: currentWordCount,
      });
    } catch (err: any) {
      setExportError(err?.message || "Failed to open printable academic PDF view.");
    }
  };

  const handleCopyMarkdown = async () => {
    const success = await copyAssignmentMarkdown(
      activeSections,
      projectState.sources.curated,
      projectState.brief,
      assignmentTitle
    );
    if (success) {
      setCopiedMarkdown(true);
      setTimeout(() => setCopiedMarkdown(false), 2200);
    }
  };

  // Citation Coverage Statistics (Production Spec §5)
  const approvedSources = useMemo(
    () => sources.filter((s) => s.status === "kept" || (approvedSourceIds && approvedSourceIds.includes(s.id))),
    [sources, approvedSourceIds]
  );
  const citationCoverage = useMemo(
    () => getCitationCoverage(activeSections as any, approvedSources),
    [activeSections, approvedSources]
  );

  // Word Budget Deviation
  const wordDiff = currentWordCount - targetWordCount;
  const wordDiffPercentage = targetWordCount > 0 ? ((wordDiff / targetWordCount) * 100).toFixed(1) : "0";
  const isWordCountCompliant = Math.abs(Number(wordDiffPercentage)) <= 10;

  // Grade & Readiness values from submissionReport
  const predictedGrade = (submissionReport as any)?.predictedGrade ||
    ((submissionReport as any)?.overallScore ? `Score: ${(submissionReport as any).overallScore}%` : "Pending Evaluation");
  const readinessPercentage = (submissionReport as any)?.readinessPercentage ?? (submissionReport?.overallScore ?? 75);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 text-neutral-900 dark:text-neutral-100">
      {/* Phase 4 Header / Overview Bar */}
      <div className="rounded-2xl p-6 sm:p-7 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-100 dark:border-white/5 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                Phase 04 · Submission & Review
              </span>
              <span className="text-xs text-neutral-400 dark:text-neutral-500 font-mono">
                Camera-Ready Checkpoint
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Submission Quality Audit & Camera-Ready Export
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 max-w-2xl">
              Conduct automated 10-point rubric evaluation, reconcile in-text citations against verified bibliography entries, and download camera-ready academic manuscripts.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => runSubmissionAudit?.()}
              disabled={isAuditingSubmission}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-neutral-100 dark:bg-white/5 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer inline-flex items-center gap-2 disabled:opacity-50"
              title="Re-run Rubric & Citation Audit"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isAuditingSubmission ? "animate-spin" : ""}`} />
              <span>{isAuditingSubmission ? "Auditing..." : "Re-run Audit"}</span>
            </button>
          </div>
        </div>

        {/* Status Metrics Ribbon */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/5 space-y-1">
            <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
              Predicted Grade Band
            </span>
            <div className="text-lg sm:text-xl font-bold text-neutral-900 dark:text-white truncate">
              {predictedGrade}
            </div>
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500 block">
              Phase 1 rubric criteria alignment
            </span>
          </div>

          <div className="p-4 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/5 space-y-1">
            <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
              Submission Readiness Index
            </span>
            <div className="text-lg sm:text-xl font-bold text-neutral-900 dark:text-white tabular-nums flex items-center gap-2">
              <span>{readinessPercentage}%</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${readinessPercentage >= 75 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                {readinessPercentage >= 75 ? "Ready" : "Action Needed"}
              </span>
            </div>
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500 block">
              Audit pass index & integrity checks
            </span>
          </div>

          <div className="p-4 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/5 space-y-1">
            <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
              Word Count Budget Margin
            </span>
            <div className="text-lg sm:text-xl font-bold text-neutral-900 dark:text-white tabular-nums flex items-center gap-2">
              <span>{currentWordCount.toLocaleString()} / {targetWordCount.toLocaleString()}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isWordCountCompliant ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                {Number(wordDiffPercentage) > 0 ? `+${wordDiffPercentage}%` : `${wordDiffPercentage}%`}
              </span>
            </div>
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500 block">
              ±10% institutional threshold
            </span>
          </div>
        </div>
      </div>

      {/* Export Error Alert if any */}
      {exportError && (
        <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 dark:bg-rose-500/10 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{exportError}</span>
        </div>
      )}

      {/* Two-Column Audit Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column: Rubric Compliance Card */}
        <RubricComplianceCard
          report={submissionReport as any}
          isLoading={isAuditingSubmission}
          onReRunAudit={runSubmissionAudit}
        />

        {/* Right Column: Citation Reconciliation Card */}
        <CitationReconciliationCard
          audit={citationAuditResult}
          isLoading={isAuditingSubmission}
          onReRunAudit={runSubmissionAudit}
        />
      </div>

      {/* Citation Coverage Statistics Card (Production Spec §5) */}
      {approvedSources.length > 0 && (
        <div className="rounded-2xl p-6 sm:p-7 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-teal-500" />
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                Citation Anchor Coverage
              </h3>
            </div>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
              citationCoverage.orphanedSources === 0
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            }`}>
              {citationCoverage.sourcesWithCitations}/{approvedSources.length} sources cited
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/5">
              <div className="text-lg font-bold text-neutral-900 dark:text-white tabular-nums">{citationCoverage.totalAnchors}</div>
              <div className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Total Anchors</div>
            </div>
            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/5">
              <div className="text-lg font-bold text-neutral-900 dark:text-white tabular-nums">{citationCoverage.sourcesWithCitations}</div>
              <div className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Sources Cited</div>
            </div>
            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/5">
              <div className={`text-lg font-bold tabular-nums ${citationCoverage.orphanedSources > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {citationCoverage.orphanedSources}
              </div>
              <div className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Orphaned</div>
            </div>
            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/5">
              <div className="text-lg font-bold text-neutral-900 dark:text-white tabular-nums">
                {citationCoverage.sectionCoverage.filter((s) => s.anchorCount > 0).length}/{citationCoverage.sectionCoverage.length}
              </div>
              <div className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Sections w/ Cites</div>
            </div>
          </div>

          {citationCoverage.orphanedSources > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-500/10">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                <span className="font-semibold">{citationCoverage.orphanedSources} approved source{citationCoverage.orphanedSources > 1 ? "s are" : " is"} not cited</span> in any section. Consider integrating them or removing them from approved sources.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Export Bar & Final Action Controls */}
      <div className="rounded-2xl p-6 sm:p-7 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 dark:border-white/5 pb-4">
          <div className="space-y-1">
            <h3 className="text-sm sm:text-base font-semibold text-neutral-900 dark:text-white">
              Camera-Ready Document Packaging
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Formatted with standard 1-inch margins, title sheet, running headers, and formatted bibliography according to {citationStyle.toUpperCase()}.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-3">
            {/* Primary Action: Download .docx */}
            <button
              type="button"
              onClick={handleExportDocx}
              disabled={isExportingDocx}
              data-testid="export-docx-button"
              className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer inline-flex items-center gap-2 shadow-xs disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              <span>{isExportingDocx ? "Compiling Word Doc..." : "Download Formatted Word Document (.docx)"}</span>
            </button>

            {/* Secondary Action: Download PDF */}
            <button
              type="button"
              onClick={handleExportPdf}
              data-testid="export-pdf-button"
              className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-neutral-100 dark:bg-white/5 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-white/10 transition-colors cursor-pointer inline-flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span>Download PDF Document</span>
            </button>

            {/* Copy Full Markdown */}
            <button
              type="button"
              onClick={handleCopyMarkdown}
              className="px-3.5 py-2.5 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer inline-flex items-center gap-1.5"
              title="Copy clean markdown text to clipboard"
            >
              {copiedMarkdown ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedMarkdown ? "Copied!" : "Copy Full Markdown"}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Back to Drafting Button */}
            <button
              type="button"
              onClick={() => {
                if (onBack) onBack();
                else setPhase("drafting");
              }}
              className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Drafting</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AssignmentSubmissionStage;
