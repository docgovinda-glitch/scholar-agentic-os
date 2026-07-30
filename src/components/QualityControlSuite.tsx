import React, { useState } from "react";
import { PaperProject } from "../types";
import { ShieldCheck, Sparkles, RefreshCcw, CheckSquare, AlertTriangle, Play, HelpCircle, ArrowRight, CheckCircle2, Info, AlertCircle } from "lucide-react";
import { runQualityControl } from "../services/aiService";
import { executeAgent } from "../services/agentService";
import { buildIntegrityReviewerInput } from "../services/integrityReviewAdapter";
import type { IntegrityReviewReport } from "../agents/integrityReviewer";
import { runResearchPipeline, type PipelineStageError } from "../agents/pipeline";

interface QualityControlSuiteProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function QualityControlSuite({
  project,
  updateProject,
  onNext,
  onBack,
}: QualityControlSuiteProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stage 10 (target-workflow.md) — IntegrityReviewerAgent, wired through
  // agentService.executeAgent(), additive to the existing runQualityControl
  // flow above (not replacing it — the two produce differently-shaped
  // reports and this project's rule is never to remove working
  // functionality without being asked).
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [integrityError, setIntegrityError] = useState<string | null>(null);
  const [integrityReport, setIntegrityReport] = useState<IntegrityReviewReport | null>(project.integrityReviewReport ?? null);

  const runIntegrityReview = async () => {
    setIntegrityLoading(true);
    setIntegrityError(null);
    try {
      const input = buildIntegrityReviewerInput(project);
      const result = await executeAgent("integrity-reviewer", input);
      if (result.ok) {
        const report = result.data as IntegrityReviewReport;
        setIntegrityReport(report);
        // Real gap found and fixed (2026-07-30, approval-visibility
        // follow-up): this used to be local component state only, lost the
        // moment the user left this tab — invisible everywhere else,
        // including at manuscript approval. Persisted so
        // ManuscriptEditorWorkspace.tsx can surface it too.
        updateProject({ integrityReviewReport: report });
      } else {
        setIntegrityError(result.error?.message || "Integrity review failed.");
      }
    } catch (err: any) {
      setIntegrityError(err.message || "An error occurred while running the integrity review.");
    } finally {
      setIntegrityLoading(false);
    }
  };

  // Agent-UI adapter Step 2c (docs/planning/agent-ui-adapter-scoping.md) — additive
  // to runIntegrityReview above, not a replacement. That call only ever populates
  // IntegrityReviewerInput.manuscriptText (integrityReviewAdapter.ts deliberately
  // leaves researchPlan/literatureReview/knowledgeGapReport/researchQuestionReport/
  // methodologyReport/statisticalAnalysisReport undefined, since PaperProject alone
  // has no honest source for them). runResearchPipeline (src/agents/pipeline.ts,
  // built this session) actually runs the upstream agents for real, so this button
  // feeds the SAME integrity reviewer a real upstream chain instead of leaving
  // those fields blank — still never fabricated, just genuinely populated now that
  // there's a real pipeline to populate them from.
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [pipelineStageErrors, setPipelineStageErrors] = useState<PipelineStageError[]>([]);

  const runFullPipelineReview = async () => {
    setPipelineLoading(true);
    setPipelineError(null);
    setPipelineStageErrors([]);
    try {
      const result = await runResearchPipeline(project);
      setPipelineStageErrors(result.errors);
      if (result.integrityReviewReport) {
        setIntegrityReport(result.integrityReviewReport);
        updateProject({ integrityReviewReport: result.integrityReviewReport });
      } else {
        setPipelineError("The pipeline ran, but the terminal integrity-review stage did not complete — see stage errors below.");
      }
    } catch (err: any) {
      setPipelineError(err.message || "An error occurred while running the full research pipeline.");
    } finally {
      setPipelineLoading(false);
    }
  };

  // Compile entire manuscript text for audit
  const compileManuscriptText = () => {
    let fullText = "";
    Object.entries(project.sections).forEach(([sec, text]) => {
      if (text.trim()) {
        fullText += `=== SECTION: ${sec} ===\n${text}\n\n`;
      }
    });
    return fullText;
  };

  const runQualityAudits = async () => {
    const draftText = compileManuscriptText();
    if (!draftText.trim()) {
      setError("Your manuscript draft is currently empty. Please write or draft some sections in Phase F before auditing.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const report = await runQualityControl({
        projectState: project,
        currentDraft: draftText,
      });
      updateProject({ qcReport: report });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while compiling compliance audits. Check your API settings.");
    } finally {
      setLoading(false);
    }
  };

  const report = project.qcReport;

  return (
    <div id="quality-control" className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[color:var(--color-navy-4)] pb-4">
        <div>
          <h2 className="text-xl font-bold text-[#E2E8F0] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[color:var(--color-luminous-blue)]" />
            Phase G: Peer Review & Pre-Flight Quality Control
          </h2>
          <p className="text-xs text-[#94A3B8] font-medium">
            Run a rigorous, pre-flight mock peer-review and editorial audit to detect guidelines gaps, style violations, and thesis drift.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm space-y-3">
          <p className="font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            ⚠️ Quality Control Issue: {error}
          </p>
          <div className="flex gap-3">
            <button
              onClick={runQualityAudits}
              className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded text-xs text-red-400 font-mono transition-colors cursor-pointer"
            >
              🔄 Retry Peer Audit
            </button>
          </div>
        </div>
      )}

      {/* Stage 10 — IntegrityReviewerAgent, wired through agentService.executeAgent(),
          additive and independent of the runQualityControl flow above/below —
          available regardless of whether a qcReport has been generated yet. */}
      <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#E2E8F0] uppercase tracking-wider">
              Integrity & Ethics Review (Agent)
            </h3>
            <p className="text-xs text-[#94A3B8] mt-1">
              Runs the Research Integrity & Ethics Reviewer agent directly against your compiled manuscript text.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <button
              onClick={runIntegrityReview}
              disabled={integrityLoading || pipelineLoading}
              className="px-4 py-2 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white text-xs font-mono font-bold uppercase rounded-lg transition-all cursor-pointer disabled:opacity-50"
            >
              {integrityLoading ? "Running…" : "Run Integrity & Ethics Review"}
            </button>
            <button
              onClick={runFullPipelineReview}
              disabled={integrityLoading || pipelineLoading}
              title="Runs the full research agent chain (literature review, research questions, methodology, statistics) for real upstream context, then the integrity review"
              className="px-4 py-2 bg-[color:var(--color-navy-1)] hover:bg-[color:var(--color-navy-3)] border border-[color:var(--color-luminous-blue)]/40 text-[color:var(--color-luminous-blue)] text-xs font-mono font-bold uppercase rounded-lg transition-all cursor-pointer disabled:opacity-50"
            >
              {pipelineLoading ? "Running Full Pipeline…" : "Run Full Pipeline (Deep Review)"}
            </button>
          </div>
        </div>

        {integrityError && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">{integrityError}</p>
        )}

        {pipelineError && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">{pipelineError}</p>
        )}

        {pipelineStageErrors.length > 0 && (
          <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-1">
            <p className="font-semibold">Some pipeline stages did not complete (the rest still ran):</p>
            <ul className="list-disc list-inside">
              {pipelineStageErrors.map((e, i) => (
                <li key={i}>{e.agentId}: {e.message}</li>
              ))}
            </ul>
          </div>
        )}

        {integrityReport && (
          <div className="space-y-3 text-xs text-[#94A3B8]">
            <p className="font-semibold">{integrityReport.executiveSummary}</p>
            <p>
              Structural completeness:{" "}
              <span className={integrityReport.structuralCompleteness >= 75 ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                {integrityReport.structuralCompleteness}%
              </span>
            </p>

            {/* Semantic peer review (docs/planning/semantic-peer-review-scoping.md,
                2026-07-24) — a separate, literature-grounded comparison layer,
                deliberately kept legible as distinct from the structural scan
                above (never a rigor/publishability verdict). */}
            {integrityReport.comparableSourceAnalysis && (
              <div className="p-3 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-lg space-y-2">
                <p className="font-semibold text-[#E2E8F0]">Comparable Literature (real, retrieved sources)</p>
                {integrityReport.comparableSourceAnalysis.note ? (
                  <p className="text-[#94A3B8] italic">{integrityReport.comparableSourceAnalysis.note}</p>
                ) : (
                  <ul className="space-y-2">
                    {integrityReport.comparableSourceAnalysis.findings.map((f, i) => (
                      <li key={i} className="border-l-2 border-[color:var(--color-luminous-blue)]/40 pl-2">
                        <span>{f.finding}</span>{" "}
                        <a href={f.citedPaper.url} target="_blank" rel="noreferrer" className="text-[#E2E8F0] underline">
                          [{f.citedPaper.title}]
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {integrityReport.comparableSourceAnalysis.retrievedPapers.length > 0 && (
                  <p className="text-[10px] text-[#94A3B8]">
                    {integrityReport.comparableSourceAnalysis.retrievedPapers.length} real paper(s) retrieved for comparison — not a plagiarism, rigor, or publishability check.
                  </p>
                )}
              </div>
            )}

            {integrityReport.recommendations.length > 0 && (
              <ul className="list-disc list-inside space-y-1">
                {integrityReport.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {!report && !loading ? (
        <div className="p-8 text-center bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl space-y-4">
          <div className="w-12 h-12 bg-[color:var(--color-luminous-blue)]/10 border border-[color:var(--color-navy-4)] rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck className="w-6 h-6 text-[color:var(--color-luminous-blue)] animate-pulse" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-lg font-bold text-[#E2E8F0]">Initiate Journal Peer Audit</h3>
            <p className="text-xs text-[#94A3B8]">
              The Quality Control suite will inspect your entire draft layout against selected formatting constraints and check terminology continuity with Chapter plans.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={runQualityAudits}
              className="px-5 py-2.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] font-medium text-white text-xs rounded-xl transition-all inline-flex items-center gap-2 cursor-pointer font-bold uppercase tracking-wider font-mono shadow-sm"
            >
              <Play className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
              Run Compliance & Style Checks
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="p-12 text-center bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl space-y-4">
          <div className="w-10 h-10 border-4 border-[color:var(--color-luminous-blue)]/25 border-t-[color:var(--color-luminous-blue)] rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-[#E2E8F0] font-mono animate-pulse font-bold uppercase tracking-wider">Running semantic style scans & citation mismatch checks...</p>
          <p className="text-[11px] text-[#94A3B8] max-w-sm mx-auto">Evaluating citation listings, reading scripture translations, and computing thematic alignment indexes.</p>
        </div>
      ) : (
        report && (
          <div className="space-y-6">
            
            {/* Scores Bento */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 flex flex-col items-center text-center justify-between shadow-xs">
                <span className="text-[10px] font-bold font-mono text-[#94A3B8] block uppercase">Thesis Grounding Consistency</span>
                <div className="text-4xl font-extrabold text-emerald-600 my-4">
                  {report.alignmentWithDissertationScore}%
                </div>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  Measures conceptual fidelity and term preservation of core thesis frameworks.
                </p>
              </div>

              <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 flex flex-col items-center text-center justify-between shadow-xs">
                <span className="text-[10px] font-bold font-mono text-[#94A3B8] block uppercase">Journal Compliance Match</span>
                <div className="text-4xl font-extrabold text-[color:var(--color-luminous-blue)] my-4">
                  {report.complianceScore}%
                </div>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  Inspects citation standards, word goals, structures, and section naming patterns.
                </p>
              </div>

              <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 flex flex-col items-center text-center justify-between shadow-xs">
                <span className="text-[10px] font-bold font-mono text-[#94A3B8] block uppercase">Scholarly Rigor & Flow</span>
                <div className="text-4xl font-extrabold text-indigo-600 my-4">
                  {report.rigorScore}%
                </div>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  Monitors syntactic clarity, depth of argumentation, and excludes robotic AI patterns.
                </p>
              </div>

            </div>

            {/* In-depth details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Left Column */}
              <div className="space-y-6">
                
                {/* Edits plan */}
                <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 shadow-sm space-y-4">
                  <h3 className="text-sm font-semibold text-[#E2E8F0] font-mono uppercase tracking-wider border-b border-[color:var(--color-navy-1)] pb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
                    Prioritized Revision & Refinement Plan
                  </h3>
                  <div className="space-y-3">
                    {report.actionableEditsPlan.map((edit, i) => (
                      <div key={i} className="p-3.5 bg-[color:var(--color-navy-1)] border border-[color:var(--color-luminous-blue)]/30 rounded-xl flex items-start gap-3 transition-all hover:border-[color:var(--color-luminous-blue)]">
                        <AlertTriangle className="w-4 h-4 text-[color:var(--color-luminous-blue)] shrink-0 mt-0.5" />
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-[color:var(--color-luminous-blue)]/15 text-[color:var(--color-luminous-blue)]">
                              Action Item #{i + 1}
                            </span>
                            <span className="text-[10px] font-mono font-semibold text-[#94A3B8]">
                              Target: Draft Refinement
                            </span>
                          </div>
                          <p className="text-xs font-sans leading-relaxed text-[#E2E8F0] font-medium pt-1">
                            {edit}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Originality checks */}
                <div className="bg-[color:var(--color-navy-2)] rounded-xl p-5 border border-[color:var(--color-navy-4)] shadow-sm space-y-3">
                  <h3 className="text-sm font-semibold text-[#E2E8F0] font-mono uppercase tracking-wider border-b border-[color:var(--color-navy-1)] pb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Style Authenticity & Voice Assessment
                  </h3>
                  <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-3">
                    <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-emerald-300 leading-relaxed font-medium">
                      {report.plagiarismOriginalityCheck}
                    </p>
                  </div>
                </div>

              </div>

              {/* Right Column */}
              <div className="space-y-6">
                
                {/* Strengths / Weaknesses */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  
                  <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 shadow-sm space-y-3">
                    <span className="text-[10px] font-bold font-mono text-emerald-400 uppercase tracking-wider block border-b border-[color:var(--color-navy-1)] pb-2 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Strengths Identified
                    </span>
                    <div className="space-y-2">
                      {report.strengths.map((s, i) => (
                        <div key={i} className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 font-medium flex items-start gap-2">
                          <span className="text-emerald-400 font-bold">•</span>
                          <span>{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 shadow-sm space-y-3">
                    <span className="text-[10px] font-bold font-mono text-red-400 uppercase tracking-wider block border-b border-[color:var(--color-navy-1)] pb-2 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                      Vulnerabilities
                    </span>
                    <div className="space-y-2">
                      {report.weaknesses.map((w, i) => (
                        <div key={i} className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300 font-medium flex items-start gap-2">
                          <span className="text-red-400 font-bold">•</span>
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

                {/* Citation verification */}
                <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-[#E2E8F0] uppercase tracking-wider border-b border-[color:var(--color-navy-4)] pb-2">
                    Citation and Bibliographical Consistency Check
                  </h3>
                  <p className="text-xs text-[#94A3B8] leading-relaxed font-sans font-medium">
                    {report.citationAudit}
                  </p>
                </div>

                {/* Ethical statements */}
                <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-[#E2E8F0] uppercase tracking-wider border-b border-[color:var(--color-navy-4)] pb-2">
                    Ethical Declarations & Statement Completeness
                  </h3>
                  <p className="text-xs text-[#94A3B8] leading-relaxed font-sans font-medium">
                    {report.ethicalVerification}
                  </p>
                </div>

              </div>

            </div>

            <div className="flex justify-between items-center pt-4 border-t border-[color:var(--color-navy-4)]">
              <button
                onClick={onBack}
                className="px-4 py-2.5 border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)] text-[#94A3B8] text-xs font-mono font-bold uppercase rounded-xl transition-all cursor-pointer"
              >
                Back to Laboratories
              </button>
              <div className="flex gap-4">
                <button
                  onClick={runQualityAudits}
                  className="px-4 py-2.5 bg-[color:var(--color-navy-1)] hover:bg-[color:var(--color-navy-3)] border border-[color:var(--color-navy-4)] text-[#E2E8F0] text-xs font-mono font-bold uppercase rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <RefreshCcw className="w-3.5 h-3.5" />
                  Re-audit Edits
                </button>
                <button
                  onClick={onNext}
                  className="px-6 py-2.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] font-bold text-white text-xs rounded-xl font-mono uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                >
                  Proceed to QC Redrafting
                </button>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
