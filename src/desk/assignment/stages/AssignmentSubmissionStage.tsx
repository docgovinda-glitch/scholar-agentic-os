import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { RubricComplianceCard } from "../components/RubricComplianceCard";
import { CitationReconciliationCard } from "../components/CitationReconciliationCard";
import { FlowReconciliationCard } from "../components/FlowReconciliationCard";
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
  Edit2,
  ChevronDown,
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
    flowAuditResult,
    setPhase,
    saveAnswers,
    executionMode,
  } = useAssignmentWorkspace();

  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showDetailedAudit, setShowDetailedAudit] = useState(false);

  // Customizable Cover Sheet Metadata
  const [studentName, setStudentName] = useState(
    project?.answers?.["student_name"] || "Academic Candidate"
  );
  const [studentId, setStudentId] = useState(
    project?.answers?.["student_id"] || "SCH-2026-X01"
  );
  const [courseName, setCourseName] = useState(
    project?.answers?.["course_name"] || projectState.brief.courseDetails?.courseName || "Academic Course"
  );
  const [institutionName, setInstitutionName] = useState(
    project?.answers?.["institution"] || "University Faculty of Arts & Sciences"
  );
  const [showMetadataForm, setShowMetadataForm] = useState(false);

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
      if (saveAnswers) {
        saveAnswers({
          student_name: studentName,
          student_id: studentId,
          course_name: courseName,
          institution: institutionName,
        });
      }
      await exportAssignmentToDocx({
        title: assignmentTitle,
        studentName: studentName || "Academic Candidate",
        studentId: studentId || "SCH-2026-X01",
        courseName: courseName || projectState.brief.courseDetails?.courseName || "Academic Course",
        institution: institutionName || "University Faculty of Arts & Sciences",
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
      if (saveAnswers) {
        saveAnswers({
          student_name: studentName,
          student_id: studentId,
          course_name: courseName,
          institution: institutionName,
        });
      }
      exportAssignmentToPdf({
        title: assignmentTitle,
        studentName: studentName || "Academic Candidate",
        studentId: studentId || "SCH-2026-X01",
        courseName: courseName || projectState.brief.courseDetails?.courseName || "Academic Course",
        institution: institutionName || "University Faculty of Arts & Sciences",
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
  // Render helpers for detailed telemetry vs streamlined packaging
  const renderAuditLayout = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
      {/* Left Column: Rubric Compliance Card */}
      <div className="lg:col-span-1 min-h-[400px]">
        <RubricComplianceCard
          report={submissionReport as any}
          isLoading={isAuditingSubmission}
          onReRunAudit={runSubmissionAudit}
        />
      </div>

      {/* Center Column: Citation Reconciliation Card */}
      <div className="lg:col-span-1 min-h-[400px]">
        <CitationReconciliationCard
          audit={citationAuditResult}
          isLoading={isAuditingSubmission}
          onReRunAudit={runSubmissionAudit}
        />
      </div>

      {/* Right Column: Flow Reconciliation Card */}
      <div className="lg:col-span-1 min-h-[400px]">
        <FlowReconciliationCard
          audit={flowAuditResult || null}
          isAuditing={isAuditingSubmission}
          onReRunAudit={runSubmissionAudit}
        />
      </div>
    </div>
  );

  const renderCitationCoverage = () => (
    approvedSources.length > 0 ? (
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
    ) : null
  );

  const renderPackagingControls = () => (
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

      {/* Customizable Title Sheet Details */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setShowMetadataForm(!showMetadataForm)}
          className="text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 inline-flex items-center gap-1.5 transition-colors cursor-pointer py-1"
        >
          <Edit2 className="w-3.5 h-3.5" />
          <span>{showMetadataForm ? "Hide Cover Sheet Metadata" : "Customize Cover Page Metadata (Student Name, ID, Course, University)"}</span>
        </button>

        {showMetadataForm && (
          <div className="mt-3 p-4 rounded-xl border border-neutral-200/60 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 animate-in fade-in duration-150">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Student Name</label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Candidate Name"
                className="w-full bg-white dark:bg-[#252528] border border-neutral-200/80 dark:border-white/10 rounded-lg px-2.5 py-1 text-xs text-neutral-900 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Candidate / Student ID</label>
              <input
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="e.g. SCH-2026-X01"
                className="w-full bg-white dark:bg-[#252528] border border-neutral-200/80 dark:border-white/10 rounded-lg px-2.5 py-1 text-xs text-neutral-900 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Course / Module</label>
              <input
                type="text"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="e.g. POLI3002 International Security"
                className="w-full bg-white dark:bg-[#252528] border border-neutral-200/80 dark:border-white/10 rounded-lg px-2.5 py-1 text-xs text-neutral-900 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">University / Institution</label>
              <input
                type="text"
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
                placeholder="e.g. University Faculty"
                className="w-full bg-white dark:bg-[#252528] border border-neutral-200/80 dark:border-white/10 rounded-lg px-2.5 py-1 text-xs text-neutral-900 dark:text-white"
              />
            </div>
          </div>
        )}
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
  );

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 text-neutral-900 dark:text-neutral-100">
      {/* Minimal Step Guidance Banner */}
      <div className="p-3.5 sm:p-4 rounded-xl bg-neutral-100/60 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-mono font-bold text-[10px] shrink-0">
            4
          </div>
          <p className="text-neutral-600 dark:text-neutral-400 text-xs leading-relaxed">
            Verify academic rubric compliance, reconcile citations against verified references, and export camera-ready submissions with university title pages and bibliographies.
          </p>
        </div>
        <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 shrink-0 self-start sm:self-auto">
          Audit &amp; Export Checkpoint
        </span>
      </div>

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
              Word Budget Margin
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

      {/* Dynamic Layout Based on Minimal vs Detailed Mode */}
      {executionMode === "detailed" ? (
        <>
          {/* Detailed Mode: Full Two-Column Audit Granularity First */}
          {renderAuditLayout()}
          {renderCitationCoverage()}
          {renderPackagingControls()}
        </>
      ) : (
        <>
          {/* Minimal Mode: Streamlined Camera-Ready Packaging Front & Center */}
          {renderPackagingControls()}

          {/* Collapsible Secondary Telemetry */}
          <div className="rounded-xl border border-neutral-200/70 dark:border-white/10 p-4 bg-neutral-50/60 dark:bg-white/[0.02] transition-colors">
            <button
              type="button"
              onClick={() => setShowDetailedAudit((prev) => !prev)}
              className="w-full flex items-center justify-between text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  Detailed 10-Point Rubric & Citation Token Telemetry
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-neutral-200/70 dark:bg-white/10 text-neutral-600 dark:text-neutral-400">
                  Optional Inspector
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                <span>{showDetailedAudit ? "Hide Telemetry" : "Inspect Rubric & Citation Details"}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDetailedAudit ? "rotate-180" : ""}`} />
              </div>
            </button>

            {showDetailedAudit && (
              <div className="mt-5 space-y-6 pt-5 border-t border-neutral-200/70 dark:border-white/5">
                {renderAuditLayout()}
                {renderCitationCoverage()}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default AssignmentSubmissionStage;
