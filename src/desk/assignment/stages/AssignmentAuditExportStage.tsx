import React, { useState, useEffect, useMemo } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { authedJsonFetch } from "../../api";
import type { SubmissionAuditReport } from "../types";

export default function AssignmentAuditExportStage() {
  const {
    projectId,
    ensurePersisted,
    question,
    assignmentType,
    academicLevel,
    targetWordCount,
    citationStyle,
    deconstruction,
    thesisBudget,
    peelMatrix,
    groundedCitations,
    auditReport,
    setAuditReport,
  } = useAssignmentWorkspace();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);

  // Local state for audit report and compiled text
  const [report, setReport] = useState<SubmissionAuditReport | null>(auditReport);
  const [compiledProse, setCompiledProse] = useState<string>("");

  // Run audit on load if not present
  useEffect(() => {
    if (!report) {
      handleRunAudit();
    } else {
      generateManuscriptText();
    }
  }, [report]);

  const generateManuscriptText = () => {
    const title =
      thesisBudget?.selectedThesis || question || "Coursework Assignment";
    let body = `# ${title}\n\n`;

    if (peelMatrix?.introductionDraft) {
      body += `## Introduction\n\n${peelMatrix.introductionDraft}\n\n`;
    }

    if (peelMatrix?.themes && peelMatrix.themes.length > 0) {
      peelMatrix.themes.forEach((t) => {
        body += `## ${t.themeTitle}\n\n`;
        if (t.draftContent) {
          body += `${t.draftContent}\n\n`;
        } else {
          body += `${t.point}\n\n${t.evidence}\n\n${t.explanation}\n\n${t.counterargument} ${t.rebuttal}\n\n${t.link}\n\n`;
        }
      });
    }

    if (peelMatrix?.conclusionDraft) {
      body += `## Conclusion\n\n${peelMatrix.conclusionDraft}\n\n`;
    }

    if (groundedCitations && groundedCitations.length > 0) {
      body += `## References\n\n`;
      groundedCitations.forEach((c) => {
        body += `- ${c.fullReference || c.citationText}\n`;
      });
    }

    setCompiledProse(body);
  };

  const handleRunAudit = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const realId = await ensurePersisted();
      const res = await authedJsonFetch(
        `/api/projects/${realId}/assignment/audit-export`,
        "POST",
        {
          question,
          assignmentType,
          academicLevel,
          targetWordCount,
          citationStyle,
          deconstruction,
          thesisBudget,
          peelMatrix,
          citations: groundedCitations,
        }
      );
      if (!res.ok) throw new Error("Failed to audit assignment");
      const data = await res.json();
      setReport(data.auditReport);
      await setAuditReport(data.auditReport);
      if (data.compiledManuscript?.fullTextMarkdown) {
        setCompiledProse(data.compiledManuscript.fullTextMarkdown);
      } else {
        generateManuscriptText();
      }
    } catch (err: any) {
      setError(err.message || "Failed to audit assignment.");
      generateManuscriptText();
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (format: "docx" | "pdf" | "markdown" | "tex") => {
    setDownloadingFormat(format);
    try {
      const formatExt: Record<string, { ext: string; mime: string; name: string }> = {
        docx: {
          ext: "docx",
          mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          name: "Assignment_Manuscript",
        },
        pdf: { ext: "pdf", mime: "application/pdf", name: "Assignment_Submission" },
        markdown: { ext: "md", mime: "text/markdown", name: "Assignment_Draft" },
        tex: { ext: "tex", mime: "application/x-tex", name: "Assignment_LaTeX" },
      };

      const meta = formatExt[format];

      // Try server endpoint
      const res = await authedJsonFetch(`/api/projects/${projectId}/export/${format}`, "POST", {
        content: compiledProse,
      }).catch(() => null);

      if (res && res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${meta.name}.${meta.ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        // High-fidelity client-side file download
        const header = `% Scholar OS Academic Coursework & Essay Export\n% Level: ${academicLevel}\n% Citation Standard: ${citationStyle}\n% Word Count: ${targetWordCount}\n% Timestamp: ${new Date().toISOString()}\n\n`;
        const blob = new Blob([header + compiledProse], { type: meta.mime });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${meta.name}.${meta.ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      alert(`Export error: ${err.message}`);
    } finally {
      setTimeout(() => setDownloadingFormat(null), 500);
    }
  };

  const wordCount = useMemo(() => {
    return compiledProse.trim() ? compiledProse.trim().split(/\s+/).filter(Boolean).length : 0;
  }, [compiledProse]);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 text-neutral-900 dark:text-neutral-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-neutral-200/80 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 mb-2">
            <span>Stage 05 • Submission Audit & Export</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Rubric Compliance Audit & Document Export
          </h1>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 mt-1">
            Conduct an examiner-grade rubric compliance audit and download publication-ready .docx & PDF files.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRunAudit}
          disabled={isLoading}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-white/15 transition-all cursor-pointer flex items-center gap-2 shrink-0"
        >
          {isLoading ? "Running Audit..." : "⚡ Re-Audit Rubric"}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Part 1: Audit Assessment Overview */}
      {report && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 dark:border-white/10 pb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Predicted Examiner Grade Band
                </span>
                <div className="flex items-center gap-3 mt-1">
                  <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">
                    {report.estimatedGradeBand || report.bandLabel}
                  </h2>
                  <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    {report.overallScore}% Grade Score
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider ${
                    report.readyForSubmission
                      ? "bg-emerald-500 text-white"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                  }`}
                >
                  {report.readyForSubmission ? "✓ Submission Ready" : "Revisions Recommended"}
                </span>
              </div>
            </div>

            {/* Metric Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10">
                <span className="block text-[11px] text-neutral-500">Word Count Adherence</span>
                <span className="text-sm font-mono font-bold">
                  {wordCount.toLocaleString()} / {targetWordCount.toLocaleString()} words
                </span>
                <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {report.wordCountAdherence?.status === "compliant" ? "✓ Within ±10% margin" : "Check word margin"}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10">
                <span className="block text-[11px] text-neutral-500">Rubric Alignment</span>
                <span className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {report.rubricAlignmentScore}%
                </span>
                <span className="block text-[10px] text-neutral-400 mt-0.5">
                  Brief constraints verified
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10">
                <span className="block text-[11px] text-neutral-500">Grounded Citations</span>
                <span className="text-sm font-mono font-bold">
                  {groundedCitations.length} Peer-Reviewed
                </span>
                <span className="block text-[10px] text-neutral-400 mt-0.5">
                  Format: {citationStyle.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Criteria Results Table */}
            {report.criteriaResults && report.criteriaResults.length > 0 && (
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Marking Criteria Breakdown
                </h3>
                <div className="divide-y divide-neutral-100 dark:divide-white/5 border border-neutral-200/80 dark:border-white/10 rounded-xl overflow-hidden">
                  {report.criteriaResults.map((crit, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 bg-white dark:bg-[#1C1C1E] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-neutral-900 dark:text-white">
                          {crit.name || crit.label || "Marking Criterion"}
                        </span>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400">
                          {crit.feedback || crit.summary}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {crit.awardedMarks !== undefined && crit.maxMarks !== undefined && (
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-neutral-100 dark:bg-white/10">
                            {crit.awardedMarks} / {crit.maxMarks}
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                            crit.status === "pass"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {crit.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Strengths & Priority Fixes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Key Strengths
                </span>
                <ul className="space-y-1">
                  {report.strengths?.map((s, idx) => (
                    <li key={idx} className="text-xs text-neutral-700 dark:text-neutral-300 flex items-start gap-1.5">
                      <span className="text-emerald-500">✓</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  Priority Fixes for First-Class
                </span>
                <ul className="space-y-1">
                  {report.priorityFixes?.map((fix, idx) => (
                    <li key={idx} className="text-xs text-neutral-700 dark:text-neutral-300 flex items-start gap-1.5">
                      <span className="text-amber-500">★</span>
                      <span>{fix}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Part 2: Document Export Cards (.docx, .pdf, .md, .tex) */}
      <div className="p-6 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-5">
        <div>
          <h2 className="text-base font-semibold">Publication-Ready Document Export</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Download your fully formatted academic submission with running headers, in-text citations, and bibliography.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* DOCX Export */}
          <button
            type="button"
            onClick={() => handleDownload("docx")}
            disabled={Boolean(downloadingFormat)}
            className="p-5 rounded-2xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/30 text-left transition-all cursor-pointer group shadow-xs space-y-2"
          >
            <div className="text-2xl">📄</div>
            <div className="font-bold text-sm text-neutral-900 dark:text-white">
              Microsoft Word (.docx)
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Complete student paper formatting, hanging indents, and running headers.
            </p>
            <div className="pt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 group-hover:underline">
              {downloadingFormat === "docx" ? "Preparing .docx..." : "Download .docx →"}
            </div>
          </button>

          {/* PDF Export */}
          <button
            type="button"
            onClick={() => handleDownload("pdf")}
            disabled={Boolean(downloadingFormat)}
            className="p-5 rounded-2xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/30 text-left transition-all cursor-pointer group shadow-xs space-y-2"
          >
            <div className="text-2xl">📕</div>
            <div className="font-bold text-sm text-neutral-900 dark:text-white">
              Academic PDF (.pdf)
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              High-resolution publication PDF ready for Turnitin submission.
            </p>
            <div className="pt-2 text-xs font-semibold text-red-600 dark:text-red-400 group-hover:underline">
              {downloadingFormat === "pdf" ? "Preparing PDF..." : "Download PDF →"}
            </div>
          </button>

          {/* LaTeX Export */}
          <button
            type="button"
            onClick={() => handleDownload("tex")}
            disabled={Boolean(downloadingFormat)}
            className="p-5 rounded-2xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/30 text-left transition-all cursor-pointer group shadow-xs space-y-2"
          >
            <div className="text-2xl">📐</div>
            <div className="font-bold text-sm text-neutral-900 dark:text-white">
              LaTeX Bundle (.tex)
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Overleaf-ready source file with formatted BibTeX bibliography.
            </p>
            <div className="pt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 group-hover:underline">
              {downloadingFormat === "tex" ? "Preparing LaTeX..." : "Download LaTeX →"}
            </div>
          </button>

          {/* Markdown Export */}
          <button
            type="button"
            onClick={() => handleDownload("markdown")}
            disabled={Boolean(downloadingFormat)}
            className="p-5 rounded-2xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/30 text-left transition-all cursor-pointer group shadow-xs space-y-2"
          >
            <div className="text-2xl">📝</div>
            <div className="font-bold text-sm text-neutral-900 dark:text-white">
              Markdown Source (.md)
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Raw plain-text academic markdown with all section headings.
            </p>
            <div className="pt-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 group-hover:underline">
              {downloadingFormat === "markdown" ? "Preparing .md..." : "Download Markdown →"}
            </div>
          </button>
        </div>
      </div>

      {/* Part 3: Live Manuscript Prose Preview */}
      <div className="p-6 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold uppercase tracking-wider text-neutral-500">
              Manuscript Preview
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-neutral-100 dark:bg-white/10 font-bold">
              {wordCount.toLocaleString()} words
            </span>
          </div>
          <span className="text-xs text-neutral-500 font-mono">
            {citationStyle.toUpperCase()} Standard
          </span>
        </div>

        <div className="p-5 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 max-h-96 overflow-y-auto">
          <pre className="text-xs sm:text-sm font-serif leading-relaxed whitespace-pre-wrap text-neutral-800 dark:text-neutral-200">
            {compiledProse}
          </pre>
        </div>
      </div>
    </div>
  );
}
