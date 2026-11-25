import { errorText } from "../../../shared/errorText";
import { ReviewAgentPanel } from "../components/AgentPanels";
import { selectApprovedSources } from "../../../domain/assignment/approvedSources";
import { useState,useEffect,useMemo } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { RubricComplianceCard } from "../components/RubricComplianceCard";
import { CitationReconciliationCard } from "../components/CitationReconciliationCard";
import { FlowReconciliationCard } from "../components/FlowReconciliationCard";
import { FullDraftReview } from "../components/FullDraftReview";
import {
exportAssignmentToDocx,
downloadAssignmentPdf,
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
ArrowLeft,AlertTriangle,LinkIcon,
ChevronDown,
Edit2
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
    question,
    submissionReport,
    runSubmissionAudit,
    isAuditingSubmission,
    citationAuditResult,
    flowAuditResult,
    setPhase,
    saveAnswers,
    projectId,
    updateSectionContent,
  } = useAssignmentWorkspace();

  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Customizable Cover Sheet Metadata
  const [studentName, setStudentName] = useState(
    project?.answers?.["student_name"] || ""
  );
  const [studentId, setStudentId] = useState(
    project?.answers?.["student_id"] || ""
  );
  const [courseName, setCourseName] = useState(
    project?.answers?.["course_name"] || projectState.brief.courseDetails?.courseName || ""
  );
  const [institutionName, setInstitutionName] = useState(
    project?.answers?.["institution"] || ""
  );
  const [showMetadataForm, setShowMetadataForm] = useState(false);
  // The per-check telemetry is kept, but out of the way until it is asked for.
  const [showDetailedChecks, setShowDetailedChecks] = useState(false);

  // There is nothing to grade until something is drafted: no audit, no
  // grade band and no readiness score for an empty paper.
  const hasDraft = currentWordCount > 0;

  // Auto-run the submission audit on mount once there is a draft to audit
  useEffect(() => {
    if (hasDraft && !submissionReport && !isAuditingSubmission && typeof runSubmissionAudit === "function") {
      runSubmissionAudit();
    }
  }, [hasDraft, submissionReport, isAuditingSubmission, runSubmissionAudit]);

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
        studentName: studentName || undefined,
        studentId: studentId || undefined,
        courseName: courseName || projectState.brief.courseDetails?.courseName || undefined,
        institution: institutionName || undefined,
        brief: projectState.brief,
        sections: activeSections,
        sources: approvedSources,
        actualWordCount: currentWordCount,
      });
    } catch (err: unknown) {
      setExportError(errorText(err) || "Failed to generate Word document (.docx).");
    } finally {
      setIsExportingDocx(false);
    }
  };

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    setExportError(null);
    if (saveAnswers) {
      saveAnswers({
        student_name: studentName,
        student_id: studentId,
        course_name: courseName,
        institution: institutionName,
      });
    }
    const params = {
      title: assignmentTitle,
      studentName: studentName || undefined,
      studentId: studentId || undefined,
      courseName: courseName || projectState.brief.courseDetails?.courseName || undefined,
      institution: institutionName || undefined,
      brief: projectState.brief,
      sections: activeSections,
      sources: approvedSources,
      actualWordCount: currentWordCount,
    };
    try {
      await downloadAssignmentPdf(projectId, params);
    } catch (err: unknown) {
      // The PDF service is unreachable: fall back to the printable view.
      try {
        exportAssignmentToPdf(params);
        setExportError(`${errorText(err) || "PDF export failed."} Opened the printable view instead (use Save as PDF).`);
      } catch {
        setExportError(errorText(err) || "Failed to export PDF.");
      }
    } finally {
      setIsExportingPdf(false);
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
    () => selectApprovedSources(sources, approvedSourceIds),
    [sources, approvedSourceIds]
  );
  const citationCoverage = useMemo(
    () => getCitationCoverage(activeSections, approvedSources),
    [activeSections, approvedSources]
  );

  // Word Budget Deviation
  const wordDiff = currentWordCount - targetWordCount;
  const wordDiffPercentage = targetWordCount > 0 ? ((wordDiff / targetWordCount) * 100).toFixed(1) : "0";
  const isWordCountCompliant = Math.abs(Number(wordDiffPercentage)) <= 10;

  // Facts only: no predicted grade or readiness score.
  const sectionsWritten = activeSections.filter((sec: { draftContent?: string }) => (sec.draftContent ?? "").trim().length > 0).length;
  const toDoCount = ((submissionReport as { missingRequirements?: string[] } | null)?.missingRequirements ?? []).length;
  // Render helpers for detailed telemetry vs streamlined packaging
  const renderAuditLayout = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
      {/* Left Column: Rubric Compliance Card */}
      <div className="lg:col-span-1 min-h-[400px]">
        <RubricComplianceCard
          report={submissionReport && "missingRequirements" in submissionReport ? submissionReport : null}
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
      <div className="rounded-2xl p-6 sm:p-7 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-teal-500" />
            <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">
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
          <div className="p-3 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)]">
            <div className="text-lg font-bold text-[color:var(--text-primary)] tabular-nums">{citationCoverage.totalAnchors}</div>
            <div className="text-xs text-[color:var(--text-muted)] uppercase tracking-wider">Total Anchors</div>
          </div>
          <div className="p-3 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)]">
            <div className="text-lg font-bold text-[color:var(--text-primary)] tabular-nums">{citationCoverage.sourcesWithCitations}</div>
            <div className="text-xs text-[color:var(--text-muted)] uppercase tracking-wider">Sources Cited</div>
          </div>
          <div className="p-3 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)]">
            <div className={`text-lg font-bold tabular-nums ${citationCoverage.orphanedSources > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {citationCoverage.orphanedSources}
            </div>
            <div className="text-xs text-[color:var(--text-muted)] uppercase tracking-wider">Orphaned</div>
          </div>
          <div className="p-3 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)]">
            <div className="text-lg font-bold text-[color:var(--text-primary)] tabular-nums">
              {citationCoverage.sectionCoverage.filter((s) => s.anchorCount > 0).length}/{citationCoverage.sectionCoverage.length}
            </div>
            <div className="text-xs text-[color:var(--text-muted)] uppercase tracking-wider">Sections w/ Cites</div>
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
    <div className="rounded-2xl p-6 sm:p-7 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[color:var(--border-subtle)] pb-4">
        <div className="space-y-1">
          <h3 className="text-sm sm:text-base font-semibold text-[color:var(--text-primary)]">
            Download
          </h3>
          <p className="text-xs text-[color:var(--text-muted)]">
            Formatted with standard 1-inch margins, title sheet, running headers, and formatted bibliography according to {citationStyle.toUpperCase()}.
          </p>
        </div>
      </div>

      {/* Customizable Title Sheet Details */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setShowMetadataForm(!showMetadataForm)}
          className="text-xs font-medium text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] inline-flex items-center gap-1.5 transition-colors cursor-pointer py-1"
        >
          <Edit2 className="w-3.5 h-3.5" />
          <span>{showMetadataForm ? "Hide Cover Sheet Metadata" : "Customize Cover Page Metadata (Student Name, ID, Course, University)"}</span>
        </button>

        {showMetadataForm && (
          <div className="mt-3 p-4 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/50 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 animate-in fade-in duration-150">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[color:var(--text-secondary)]">Student Name</label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Candidate Name"
                className="w-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-lg px-2.5 py-1 text-xs text-[color:var(--text-primary)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[color:var(--text-secondary)]">Candidate / Student ID</label>
              <input
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="e.g. SCH-2026-X01"
                className="w-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-lg px-2.5 py-1 text-xs text-[color:var(--text-primary)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[color:var(--text-secondary)]">Course / Module</label>
              <input
                type="text"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="e.g. POLI3002 International Security"
                className="w-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-lg px-2.5 py-1 text-xs text-[color:var(--text-primary)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[color:var(--text-secondary)]">University / Institution</label>
              <input
                type="text"
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
                placeholder="e.g. University Faculty"
                className="w-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-lg px-2.5 py-1 text-xs text-[color:var(--text-primary)]"
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
            disabled={isExportingDocx || sectionsWritten === 0}
            title={sectionsWritten === 0 ? "Write at least one section first" : undefined}
            data-testid="export-docx-button"
            className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 transition-opacity cursor-pointer inline-flex items-center gap-2 shadow-xs disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            <span>{isExportingDocx ? "Compiling Word Doc..." : "Download Formatted Word Document (.docx)"}</span>
          </button>

          {/* Secondary Action: Download PDF */}
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExportingPdf || sectionsWritten === 0}
            title={sectionsWritten === 0 ? "Write at least one section first" : undefined}
            data-testid="export-pdf-button"
            className="disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 rounded-xl text-xs font-semibold bg-[color:var(--surface-inset)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer inline-flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            <span>{isExportingPdf ? "Rendering PDF..." : "Download PDF Document"}</span>
          </button>

          {/* Copy Full Markdown */}
          <button
            type="button"
            onClick={handleCopyMarkdown}
            disabled={sectionsWritten === 0}
            className="disabled:opacity-50 disabled:cursor-not-allowed px-3.5 py-2.5 rounded-xl text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer inline-flex items-center gap-1.5"
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
            className="px-4 py-2 rounded-xl text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Drafting</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 text-[color:var(--text-primary)]">
      {/* Phase 4 Header / Overview Bar */}
      <div className="rounded-2xl p-6 sm:p-7 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[color:var(--border-subtle)] pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                Phase 05 · Submission & Review
              </span>
              <span className="text-xs text-[color:var(--text-muted)] font-mono">
                Before you submit
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[color:var(--text-primary)]">
              Check and download
            </h1>
            <p className="text-xs sm:text-sm text-[color:var(--text-muted)] max-w-2xl">
              Check length, structure and what the question asks for, match each citation to a source, then download Word, PDF or plain text.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => runSubmissionAudit?.()}
              disabled={isAuditingSubmission || !hasDraft}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer inline-flex items-center gap-2 disabled:opacity-50"
              title="Re-run Rubric & Citation Audit"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isAuditingSubmission ? "animate-spin" : ""}`} />
              <span>{isAuditingSubmission ? "Checking…" : "Check again"}</span>
            </button>
          </div>
        </div>

        {!hasDraft ? (
          <div data-testid="submission-nothing-drafted" className="p-4 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-[color:var(--text-secondary)]">
              Nothing to check yet. Write at least one section and the checks against your brief and the citation check appear here.
            </p>
            <button
              type="button"
              onClick={() => (setPhase ? setPhase("drafting") : onBack?.())}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 cursor-pointer shrink-0"
            >
              Go to Drafting
            </button>
          </div>
        ) : (
        /* The facts, on one line: what is written, what is left to do, how long it is. */
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)]">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-[color:var(--text-muted)]">Sections written</span>
            <span className="text-sm font-semibold text-[color:var(--text-primary)] tabular-nums" data-testid="sections-written">
              {sectionsWritten} / {activeSections.length}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-xs text-[color:var(--text-muted)]">To do before submitting</span>
            <span className="text-sm font-semibold text-[color:var(--text-primary)] tabular-nums" data-testid="todo-count">
              {submissionReport ? (toDoCount === 0 ? "Nothing found" : toDoCount) : "Not checked"}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-xs text-[color:var(--text-muted)]">Length</span>
            <span className="text-sm font-semibold text-[color:var(--text-primary)] tabular-nums">
              {currentWordCount.toLocaleString()} / {targetWordCount.toLocaleString()}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isWordCountCompliant ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
              {Number(wordDiffPercentage) > 0 ? `+${wordDiffPercentage}%` : `${wordDiffPercentage}%`}
            </span>
            <span className="text-xs text-[color:var(--text-muted)]">against the brief; check your module's rules</span>
          </div>
        </div>
        )}
      </div>

      {/* The agent: review of the draft against the brief */}
      <ReviewAgentPanel />

      {/* Export Error Alert if any */}
      {exportError && (
        <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 dark:bg-rose-500/10 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{exportError}</span>
        </div>
      )}

      {hasDraft && (
        <>
          {/* What the student actually came here to see: the whole paper. */}
          <FullDraftReview
            title={assignmentTitle}
            sections={activeSections}
            approvedSources={approvedSources}
            citationStyle={citationStyle}
            wordCount={currentWordCount}
            targetWordCount={targetWordCount}
            onUpdateSection={updateSectionContent}
          />

          {/* Every per-check number stays available, but folded away: the three
              audit cards repeat between them what the ribbon already says. */}
          <div className="rounded-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDetailedChecks((v) => !v)}
              aria-expanded={showDetailedChecks}
              data-testid="toggle-detailed-checks"
              className="w-full flex items-center justify-between gap-3 px-5 sm:px-6 py-3.5 text-left cursor-pointer hover:bg-[color:var(--surface-hover)] transition-colors"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[color:var(--text-primary)]">Checks in detail</span>
                <span className="block text-xs text-[color:var(--text-muted)]">
                  Against your brief, citation by citation, and the links between paragraphs.
                </span>
              </span>
              <ChevronDown className={`w-4 h-4 shrink-0 text-[color:var(--text-muted)] transition-transform ${showDetailedChecks ? "rotate-180" : ""}`} />
            </button>

            {showDetailedChecks && (
              <div className="px-5 sm:px-6 pb-6 pt-1 space-y-6 border-t border-[color:var(--border-subtle)]">
                {renderAuditLayout()}
                {renderCitationCoverage()}
              </div>
            )}
          </div>

        </>
      )}

      {/* One instance only: rendering it in both branches of `hasDraft` would
          remount the download buttons the moment a draft appears. */}
      {renderPackagingControls()}
    </div>
  );
}

export default AssignmentSubmissionStage;
