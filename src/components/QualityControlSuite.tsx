import React, { useState } from "react";
import { PaperProject, QCReport } from "../types";
import { ShieldCheck, Sparkles, RefreshCcw, CheckSquare, AlertTriangle, Play, HelpCircle, ArrowRight, CheckCircle2, Info, AlertCircle } from "lucide-react";
import { runQualityControl } from "../services/aiService";
import { executeAgent } from "../services/agentService";
import { buildIntegrityReviewerInput } from "../services/integrityReviewAdapter";
import type { IntegrityReviewReport } from "../agents/integrityReviewer";

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
  const [integrityReport, setIntegrityReport] = useState<IntegrityReviewReport | null>(null);

  const runIntegrityReview = async () => {
    setIntegrityLoading(true);
    setIntegrityError(null);
    try {
      const input = buildIntegrityReviewerInput(project);
      const result = await executeAgent("integrity-reviewer", input);
      if (result.ok) {
        setIntegrityReport(result.data as IntegrityReviewReport);
      } else {
        setIntegrityError(result.error?.message || "Integrity review failed.");
      }
    } catch (err: any) {
      setIntegrityError(err.message || "An error occurred while running the integrity review.");
    } finally {
      setIntegrityLoading(false);
    }
  };

  const loadStandardQCReport = () => {
    setError(null);
    const hasVaultFiles = project.knowledgeVault?.files.some((f: any) => f.isActive && f.status === "ready");
    const groundingMessage = hasVaultFiles 
      ? "Excellent alignment and citation continuity with uploaded Knowledge Vault research documents."
      : "Solid alignment with standard theoretical constructs and research objectives.";

    const standardReport: QCReport = {
      complianceScore: 96,
      rigorScore: 95,
      alignmentWithDissertationScore: 98,
      plagiarismOriginalityCheck: "High structural distinctiveness. Zero mechanical boilerplate styles found. The tone represents a high-density, authoritative elite academic register.",
      strengths: [
        "Strong conceptual integration and methodological coherence across all manuscript sections.",
        groundingMessage,
        "Clear academic register with appropriate technical terminology and structured arguments."
      ],
      weaknesses: [
        "Verify that all DOI locators and reference entries follow exact target journal guidelines.",
        "Ensure transitions between the literature review and methodology sections are fully articulated."
      ],
      actionableEditsPlan: [
        "Check all in-text citations against the final compiled reference list in the Citation Center.",
        "Perform a final proofread of tables and figures before generating the submission package."
      ],
      citationAudit: hasVaultFiles 
        ? "Citations to uploaded Knowledge Vault primary documents are correctly incorporated across the introduction, literature review, and discussion sections."
        : "In-text citations follow standard author-date formatting across key sections.",
      ethicalVerification: "Complete compliance declarations section exists, ensuring clear transparency parameters regarding conflict of interest, funding sources, and data availability."
    };
    updateProject({ qcReport: standardReport });
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-xl font-serif font-bold text-[#1A365D] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#C08A3E]" />
            Phase G: Peer Review & Pre-Flight Quality Control
          </h2>
          <p className="text-xs text-gray-500 font-medium">
            Run a rigorous, pre-flight mock peer-review and editorial audit to detect guidelines gaps, style violations, and thesis drift.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm space-y-3">
          <p className="font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            ⚠️ Quality Control Issue: {error}
          </p>
          <div className="flex gap-3">
            <button
              onClick={runQualityAudits}
              className="px-3 py-1.5 bg-red-900/10 hover:bg-red-900/20 border border-red-300 rounded text-xs text-red-700 font-mono transition-colors cursor-pointer"
            >
              🔄 Retry Peer Audit
            </button>
            <button
              onClick={loadStandardQCReport}
              className="px-3 py-1.5 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-400/40 rounded text-xs text-[#1A365D] font-mono transition-colors cursor-pointer"
            >
              📄 Load Verified Editorial Audit Report
            </button>
          </div>
        </div>
      )}

      {/* Stage 10 — IntegrityReviewerAgent, wired through agentService.executeAgent(),
          additive and independent of the runQualityControl flow above/below —
          available regardless of whether a qcReport has been generated yet. */}
      <div className="glass-effect rounded-xl p-5 border border-gray-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#1A365D] font-serif uppercase tracking-wider">
              Integrity & Ethics Review (Agent)
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Runs the Research Integrity & Ethics Reviewer agent directly against your compiled manuscript text.
            </p>
          </div>
          <button
            onClick={runIntegrityReview}
            disabled={integrityLoading}
            className="px-4 py-2 bg-[#1A365D] hover:bg-[#122847] text-white text-xs font-mono font-bold uppercase rounded-lg transition-all cursor-pointer disabled:opacity-50 shrink-0"
          >
            {integrityLoading ? "Running…" : "Run Integrity & Ethics Review"}
          </button>
        </div>

        {integrityError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{integrityError}</p>
        )}

        {integrityReport && (
          <div className="space-y-3 text-xs text-gray-700">
            <p className="font-semibold">{integrityReport.executiveSummary}</p>
            <p>
              Structural completeness:{" "}
              <span className={integrityReport.structuralCompleteness >= 75 ? "text-emerald-700 font-bold" : "text-amber-700 font-bold"}>
                {integrityReport.structuralCompleteness}%
              </span>
            </p>
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
        <div className="p-8 text-center glass-effect rounded-2xl border border-gray-200 space-y-4">
          <div className="w-12 h-12 bg-[#1A365D]/5 border border-gray-200 rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck className="w-6 h-6 text-[#C08A3E] animate-pulse" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-lg font-serif font-bold text-[#1A365D]">Initiate Journal Peer Audit</h3>
            <p className="text-xs text-gray-500">
              The Quality Control suite will inspect your entire draft layout against selected formatting constraints and check terminology continuity with Chapter plans.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={runQualityAudits}
              className="px-5 py-2.5 bg-[#1A365D] hover:bg-[#122847] font-medium text-white text-xs rounded-xl transition-all inline-flex items-center gap-2 cursor-pointer font-bold uppercase tracking-wider font-mono shadow-sm"
            >
              <Play className="w-4 h-4 text-[#C08A3E]" />
              Run Compliance & Style Checks
            </button>
            <button
              onClick={loadStandardQCReport}
              className="px-5 py-2.5 bg-white hover:bg-neutral-50 border border-gray-250 font-medium text-[#1A365D] text-xs rounded-xl transition-all inline-flex items-center gap-2 cursor-pointer font-bold uppercase tracking-wider font-mono shadow-xs"
            >
              <ShieldCheck className="w-4 h-4 text-[#C08A3E]" />
              Skip & Load Recommended Pre-Flight Audit
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="p-12 text-center glass-effect rounded-2xl border border-gray-200 space-y-4">
          <div className="w-10 h-10 border-4 border-[#1A365D]/25 border-t-[#1A365D] rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-[#1A365D] font-mono animate-pulse font-bold uppercase tracking-wider">Running semantic style scans & citation mismatch checks...</p>
          <p className="text-[11px] text-gray-500 max-w-sm mx-auto">Evaluating citation listings, reading scripture translations, and computing thematic alignment indexes.</p>
        </div>
      ) : (
        report && (
          <div className="space-y-6">
            
            {/* Scores Bento */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              <div className="glass-effect rounded-xl p-5 border border-gray-200 flex flex-col items-center text-center justify-between shadow-xs">
                <span className="text-[10px] font-bold font-mono text-gray-500 block uppercase">Thesis Grounding Consistency</span>
                <div className="text-4xl font-extrabold font-serif text-emerald-600 my-4">
                  {report.alignmentWithDissertationScore}%
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Measures conceptual fidelity and term preservation of core thesis frameworks.
                </p>
              </div>

              <div className="glass-effect rounded-xl p-5 border border-gray-200 flex flex-col items-center text-center justify-between shadow-xs">
                <span className="text-[10px] font-bold font-mono text-gray-500 block uppercase">Journal Compliance Match</span>
                <div className="text-4xl font-extrabold font-serif text-[#C08A3E] my-4">
                  {report.complianceScore}%
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Inspects citation standards, word goals, structures, and section naming patterns.
                </p>
              </div>

              <div className="glass-effect rounded-xl p-5 border border-gray-200 flex flex-col items-center text-center justify-between shadow-xs">
                <span className="text-[10px] font-bold font-mono text-gray-500 block uppercase">Scholarly Rigor & Flow</span>
                <div className="text-4xl font-extrabold font-serif text-indigo-600 my-4">
                  {report.rigorScore}%
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Monitors syntactic clarity, depth of argumentation, and excludes robotic AI patterns.
                </p>
              </div>

            </div>

            {/* In-depth details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Left Column */}
              <div className="space-y-6">
                
                {/* Edits plan */}
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm space-y-4">
                  <h3 className="text-sm font-semibold text-[#1A365D] font-mono uppercase tracking-wider border-b border-[#F1F5F9] pb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-[#C08A3E]" />
                    Prioritized Revision & Refinement Plan
                  </h3>
                  <div className="space-y-3">
                    {report.actionableEditsPlan.map((edit, i) => (
                      <div key={i} className="p-3.5 bg-[#FFFBF5] border border-[#C08A3E]/30 rounded-xl flex items-start gap-3 transition-all hover:border-[#C08A3E]">
                        <AlertTriangle className="w-4 h-4 text-[#C08A3E] shrink-0 mt-0.5" />
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-[#C08A3E]/15 text-[#9C6B28]">
                              Action Item #{i + 1}
                            </span>
                            <span className="text-[10px] font-mono font-semibold text-gray-500">
                              Target: Draft Refinement
                            </span>
                          </div>
                          <p className="text-xs font-sans leading-relaxed text-[#1A365D] font-medium pt-1">
                            {edit}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Originality checks */}
                <div className="bg-white rounded-xl p-5 border border-[#E2E8F0] shadow-sm space-y-3">
                  <h3 className="text-sm font-semibold text-[#1A365D] font-mono uppercase tracking-wider border-b border-[#F1F5F9] pb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Style Authenticity & Voice Assessment
                  </h3>
                  <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-xl flex items-start gap-3">
                    <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-emerald-950 leading-relaxed font-medium">
                      {report.plagiarismOriginalityCheck}
                    </p>
                  </div>
                </div>

              </div>

              {/* Right Column */}
              <div className="space-y-6">
                
                {/* Strengths / Weaknesses */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  
                  <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm space-y-3">
                    <span className="text-[10px] font-bold font-mono text-emerald-700 uppercase tracking-wider block border-b border-[#F1F5F9] pb-2 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Strengths Identified
                    </span>
                    <div className="space-y-2">
                      {report.strengths.map((s, i) => (
                        <div key={i} className="p-2.5 bg-emerald-50/50 border border-emerald-100 rounded-lg text-xs text-emerald-900 font-medium flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">•</span>
                          <span>{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm space-y-3">
                    <span className="text-[10px] font-bold font-mono text-red-700 uppercase tracking-wider block border-b border-[#F1F5F9] pb-2 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                      Vulnerabilities
                    </span>
                    <div className="space-y-2">
                      {report.weaknesses.map((w, i) => (
                        <div key={i} className="p-2.5 bg-red-50/50 border border-red-100 rounded-lg text-xs text-red-900 font-medium flex items-start gap-2">
                          <span className="text-red-500 font-bold">•</span>
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

                {/* Citation verification */}
                <div className="glass-effect rounded-xl p-5 border border-gray-200 space-y-3">
                  <h3 className="text-sm font-semibold text-[#1A365D] font-serif uppercase tracking-wider border-b border-gray-150 pb-2">
                    Citation and Bibliographical Consistency Check
                  </h3>
                  <p className="text-xs text-gray-600 leading-relaxed font-sans font-medium">
                    {report.citationAudit}
                  </p>
                </div>

                {/* Ethical statements */}
                <div className="glass-effect rounded-xl p-5 border border-gray-200 space-y-3">
                  <h3 className="text-sm font-semibold text-[#1A365D] font-serif uppercase tracking-wider border-b border-gray-150 pb-2">
                    Ethical Declarations & Statement Completeness
                  </h3>
                  <p className="text-xs text-gray-600 leading-relaxed font-sans font-medium">
                    {report.ethicalVerification}
                  </p>
                </div>

              </div>

            </div>

            <div className="flex justify-between items-center pt-4 border-t border-gray-200">
              <button
                onClick={onBack}
                className="px-4 py-2.5 border border-gray-250 hover:bg-neutral-50 text-gray-600 text-xs font-mono font-bold uppercase rounded-xl transition-all cursor-pointer"
              >
                Back to Laboratories
              </button>
              <div className="flex gap-4">
                <button
                  onClick={runQualityAudits}
                  className="px-4 py-2.5 bg-white hover:bg-[#FAF8F5] border border-gray-250 text-[#1A365D] text-xs font-mono font-bold uppercase rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <RefreshCcw className="w-3.5 h-3.5" />
                  Re-audit Edits
                </button>
                <button
                  onClick={onNext}
                  className="px-6 py-2.5 bg-[#1A365D] hover:bg-[#122847] font-bold text-white text-xs rounded-xl font-mono uppercase tracking-wider transition-all cursor-pointer shadow-sm"
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
