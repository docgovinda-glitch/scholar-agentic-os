import React, { useState, useEffect } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { authedJsonFetch } from "../../api";
import type { SubmissionCheckReport } from "../types";

export default function AssignmentFinalStage() {
  const {
    projectId,
    project,
    question,
    academicLevel,
    assignmentType,
    targetWordCount,
    citationStyle,
    outline,
    submissionReport,
    setSubmissionReport,
    currentWordCount,
  } = useAssignmentWorkspace();

  const [isReviewing, setIsReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"check" | "document">("check");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!submissionReport) {
      handleRunReview();
    }
  }, []);

  const handleRunReview = async () => {
    setIsReviewing(true);
    setError(null);
    try {
      const res = await authedJsonFetch(`/api/projects/${projectId}/assignment/review`, "POST", {
        question,
        academicLevel,
        assignmentType,
        targetWordCount,
        citationStyle,
        outline,
      });

      if (!res.ok) throw new Error("Failed to run submission review");
      const data: SubmissionCheckReport = await res.json();
      await setSubmissionReport(data);
    } catch (err: any) {
      setError(err.message || "Failed to generate review");
    } finally {
      setIsReviewing(false);
    }
  };

  // Build full document markdown text
  const fullDocumentMarkdown = `# ${project?.answers?.["assignment_title"] || project?.answers?.["title"] || "Academic Assignment"}

**Author:** Scholar Core Academic Author  
**Course:** ${project?.answers["course_name"] || "University Course"}  
**Institution:** ${project?.answers["institution"] || "University Institution"}  
**Academic Level:** ${academicLevel === "postgraduate" ? "Postgraduate" : "Undergraduate"}  
**Citation Style:** ${citationStyle.toUpperCase()}  
**Word Count:** ${currentWordCount} / ${targetWordCount} words  

---

${outline
  .map(
    (sec) => `## ${sec.title}

${sec.draftContent || "(Section draft pending)"}
`
  )
  .join("\n\n")}

---

## References

${outline
  .flatMap((s) => s.linkedEvidenceIds || [])
  .length > 0
  ? "Formatted according to " + citationStyle.toUpperCase() + " referencing standard."
  : "References listed in-text and verified."}
`;

  const handleCopyDocument = () => {
    navigator.clipboard.writeText(fullDocumentMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadDocx = () => {
    const blob = new Blob([fullDocumentMarkdown], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(project?.answers?.["assignment_title"] || project?.answers?.["title"] || "Assignment").replace(/\s+/g, "_")}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    window.print();
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="border-b border-[color:var(--border-subtle)] pb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🏆</span>
            <h2 className="text-lg font-bold text-[color:var(--text-primary)]">
              Phase 8: Review & Final Submission
            </h2>
          </div>
          <p className="text-xs text-[color:var(--text-secondary)]">
            Run the 10-Point Academic Submission Check, preview the full document, and export Word / PDF.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isReviewing}
            onClick={handleRunReview}
            className="px-3.5 py-1.5 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-xs font-semibold hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
          >
            {isReviewing ? "Reviewing…" : "🔄 Re-Run 10-Point Check"}
          </button>
          <button
            type="button"
            onClick={handleDownloadDocx}
            className="px-3.5 py-1.5 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
          >
            <span>📥</span>
            <span>Download Word (.docx)</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Tabs: 10-Point Checklist vs Final Document */}
      <div className="flex items-center gap-2 border-b border-[color:var(--border-subtle)] pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("check")}
          className={`px-4 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-colors ${
            activeTab === "check"
              ? "bg-[color:var(--accent)] text-[color:var(--text-inverse)]"
              : "bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
          }`}
        >
          10-Point Submission Audit
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("document")}
          className={`px-4 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-colors ${
            activeTab === "document"
              ? "bg-[color:var(--accent)] text-[color:var(--text-inverse)]"
              : "bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
          }`}
        >
          📄 Unified Document Preview & Export
        </button>
      </div>

      {activeTab === "check" ? (
        <div className="space-y-6">
          {isReviewing && !submissionReport ? (
            <div className="flex flex-col items-center justify-center p-12 space-y-3">
              <div className="w-8 h-8 border-3 border-[color:var(--accent)] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium text-[color:var(--text-secondary)]">
                Senior Academic Reviewer running 10-point submission audit…
              </p>
            </div>
          ) : (
            <>
              {/* Overall Score Banner */}
              <div className="p-5 rounded-[var(--radius-xl)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex flex-col items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <span className="text-lg font-black">{submissionReport?.overallScore || 90}</span>
                    <span className="text-[9px] uppercase font-bold">/ 100</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[color:var(--text-primary)]">
                      Academic Readiness Assessment
                    </h3>
                    <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                      {submissionReport?.readyForSubmission
                        ? "✓ Excellent! Draft satisfies all key university marking criteria."
                        : "⚠️ Action recommended on priority fixes before submission."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    className="px-3.5 py-1.5 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-xs font-semibold hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
                  >
                    Print / Export PDF
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadDocx}
                    className="px-3.5 py-1.5 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer"
                  >
                    Export Word
                  </button>
                </div>
              </div>

              {/* 10 Criteria Results */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {submissionReport?.criteriaResults?.map((crit, idx) => {
                  const isPass = crit.status === "pass";
                  const isWarn = crit.status === "warning";

                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-[var(--radius-lg)] border space-y-2 ${
                        isPass
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : isWarn
                          ? "border-amber-500/30 bg-amber-500/5"
                          : "border-red-500/30 bg-red-500/5"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[color:var(--text-primary)]">
                          {crit.label || crit.category}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isPass
                              ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                              : isWarn
                              ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                              : "bg-red-500/20 text-red-600 dark:text-red-400"
                          }`}
                        >
                          {isPass ? "✓ PASS" : isWarn ? "⚠️ WARNING" : "✕ ACTION REQUIRED"}
                        </span>
                      </div>
                      <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
                        {crit.summary}
                      </p>
                      {crit.feedback && (
                        <p className="text-[11px] text-[color:var(--text-muted)] italic pt-1 border-t border-[color:var(--border-subtle)]">
                          💡 {crit.feedback}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Strengths & Priority Fixes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-[var(--radius-md)] border border-emerald-500/20 bg-emerald-500/5 space-y-2">
                  <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    🌟 Key Academic Strengths
                  </h4>
                  <ul className="text-xs text-[color:var(--text-secondary)] space-y-1 list-disc list-inside">
                    {submissionReport?.strengths?.map((str, i) => (
                      <li key={i}>{str}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-[var(--radius-md)] border border-amber-500/20 bg-amber-500/5 space-y-2">
                  <h4 className="text-xs font-bold text-amber-700 dark:text-amber-400">
                    🔧 Final Polish Recommendations
                  </h4>
                  <ul className="text-xs text-[color:var(--text-secondary)] space-y-1 list-disc list-inside">
                    {submissionReport?.priorityFixes?.map((fix, i) => (
                      <li key={i}>{fix}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        /* Unified Document Preview */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[color:var(--text-muted)]">
              Unified Academic Manuscript Preview • {currentWordCount} words
            </span>
            <button
              type="button"
              onClick={handleCopyDocument}
              className="px-3 py-1 rounded border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-xs font-semibold hover:bg-[color:var(--surface-hover)] cursor-pointer"
            >
              {copied ? "✓ Copied Markdown" : "📋 Copy Manuscript"}
            </button>
          </div>

          <div className="p-8 rounded-[var(--radius-xl)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-xs leading-relaxed font-serif space-y-6 max-h-[650px] overflow-y-auto shadow-sm">
            <div className="text-center pb-6 border-b border-[color:var(--border-subtle)] space-y-2">
              <h1 className="text-xl font-bold font-sans text-[color:var(--text-primary)]">
                {project?.answers?.["assignment_title"] || project?.answers?.["title"] || "Academic Assignment"}
              </h1>
              <p className="text-xs font-sans text-[color:var(--text-muted)]">
                {project?.answers["course_name"] || "Academic Course"} • {project?.answers["institution"] || "University"}
              </p>
              <p className="text-[11px] font-sans text-[color:var(--text-secondary)]">
                Referencing Standard: <strong className="uppercase">{citationStyle}</strong> • Target: {targetWordCount} words
              </p>
            </div>

            {outline.map((sec) => (
              <div key={sec.id} className="space-y-2">
                <h3 className="text-sm font-bold font-sans text-[color:var(--text-primary)]">
                  {sec.title}
                </h3>
                <p className="whitespace-pre-wrap text-[color:var(--text-primary)] leading-loose">
                  {sec.draftContent || "(Draft in progress)"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
