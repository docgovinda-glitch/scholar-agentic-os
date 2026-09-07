import React, { useState } from "react";
import { HumanizerAuditReport, CandidateState } from "../../../domain/humanizer/types";

interface AuditSummaryCardProps {
  auditReport?: HumanizerAuditReport;
  candidateState?: CandidateState;
  fallbackUsed?: boolean;
  fallbackReason?: string;
}

export default function AuditSummaryCard({
  auditReport,
  candidateState,
  fallbackUsed,
  fallbackReason,
}: AuditSummaryCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  if (!auditReport && !fallbackUsed) return null;

  const isSafe = auditReport?.finalDecision === "SAFE";
  const isWarning = auditReport?.finalDecision === "WARNING";
  const isRejected = auditReport?.finalDecision === "REJECT" || fallbackUsed;

  return (
    <div
      data-testid="audit-summary-card"
      className={`rounded-xl border p-4 mb-6 transition-all ${
        isRejected
          ? "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
          : isWarning
          ? "bg-amber-500/5 border-amber-500/20 text-slate-800 dark:text-slate-200"
          : "bg-emerald-500/5 border-emerald-500/20 text-slate-800 dark:text-slate-200"
      }`}
    >
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/50 dark:border-slate-800/50">
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full ${
              isRejected ? "bg-amber-500 animate-pulse" : isWarning ? "bg-amber-400" : "bg-emerald-500"
            }`}
          />
          <h4 className="text-sm font-semibold tracking-wide">
            {fallbackUsed
              ? "Safe Rewrite Unavailable — Original Preserved"
              : isWarning
              ? "Safety & Integrity Verified (Review Suggested)"
              : "Safety & Integrity Verified"}
          </h4>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {auditReport?.delta && (
            <span className="text-slate-500 dark:text-slate-400">
              {auditReport.delta.wordCountDelta >= 0 ? `+${auditReport.delta.wordCountDelta}` : auditReport.delta.wordCountDelta} words (
              {auditReport.delta.percentageChanged}% modified)
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium focus:outline-none"
            aria-expanded={showDetails}
          >
            {showDetails ? "Hide Details" : "Review Details"}
          </button>
        </div>
      </div>

      {/* Fail-Safe Explanation Notice */}
      {fallbackUsed && fallbackReason && (
        <div className="mt-3 p-3 bg-amber-500/15 rounded-lg text-xs leading-relaxed text-amber-900 dark:text-amber-200">
          <p className="font-medium mb-1">Fail-Safe Reason:</p>
          <p>{fallbackReason}</p>
        </div>
      )}

      {/* 5 Quality Gates */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3 pt-1">
        {/* 1. Protected Content */}
        <div className="flex flex-col gap-1 p-2 rounded-lg bg-white/50 dark:bg-slate-900/50 border border-slate-200/40 dark:border-slate-800/40">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Protected Content</span>
          <span
            className={`text-xs font-semibold flex items-center gap-1 ${
              auditReport
                ? auditReport.integrity?.passed
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {auditReport ? (auditReport.integrity?.passed ? "✓ Passed (100%)" : "✕ Discrepancy") : "— Not Evaluated"}
          </span>
        </div>

        {/* 2. Propositional Claims */}
        <div className="flex flex-col gap-1 p-2 rounded-lg bg-white/50 dark:bg-slate-900/50 border border-slate-200/40 dark:border-slate-800/40">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Claims & Modality</span>
          <span
            className={`text-xs font-semibold flex items-center gap-1 ${
              auditReport
                ? auditReport.claims?.passed
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {auditReport ? (auditReport.claims?.passed ? "✓ Preserved" : "⚠ Modality Shift") : "— Not Evaluated"}
          </span>
        </div>

        {/* 3. Grammar & Boundaries */}
        <div className="flex flex-col gap-1 p-2 rounded-lg bg-white/50 dark:bg-slate-900/50 border border-slate-200/40 dark:border-slate-800/40">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Grammar & Bounds</span>
          <span
            className={`text-xs font-semibold flex items-center gap-1 ${
              auditReport
                ? auditReport.grammar?.passed
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {auditReport ? (auditReport.grammar?.passed ? "✓ Passed" : "⚠ Grammar Issues") : "— Not Evaluated"}
          </span>
        </div>

        {/* 4. Coherence */}
        <div className="flex flex-col gap-1 p-2 rounded-lg bg-white/50 dark:bg-slate-900/50 border border-slate-200/40 dark:border-slate-800/40">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Paragraph Flow</span>
          <span
            className={`text-xs font-semibold flex items-center gap-1 ${
              auditReport
                ? auditReport.coherence?.passed
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {auditReport ? (auditReport.coherence?.passed ? "✓ Good" : "⚠ Flow Warning") : "— Not Evaluated"}
          </span>
        </div>

        {/* 5. Semantic Fidelity */}
        <div className="flex flex-col gap-1 p-2 rounded-lg bg-white/50 dark:bg-slate-900/50 border border-slate-200/40 dark:border-slate-800/40">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Semantic Fidelity</span>
          <span
            className={`text-xs font-semibold flex items-center gap-1 ${
              auditReport
                ? auditReport.semantic?.passed
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {auditReport ? (auditReport.semantic?.passed ? "✓ Verified" : "⚠ Potential Drift") : "— Not Evaluated"}
          </span>
        </div>
      </div>

      {/* Expandable Details Drawer */}
      {showDetails && auditReport && auditReport.findings && auditReport.findings.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-200/50 dark:border-slate-800/50">
          <h5 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Audit Findings:</h5>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {auditReport.findings.map((f, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 p-2 rounded bg-white/70 dark:bg-slate-900/70 border border-slate-200/50 dark:border-slate-800/50 text-xs"
              >
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    f.severity === "CRITICAL"
                      ? "bg-rose-500/20 text-rose-700 dark:text-rose-300"
                      : f.severity === "ERROR"
                      ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                      : f.severity === "WARNING"
                      ? "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300"
                      : "bg-blue-500/20 text-blue-700 dark:text-blue-300"
                  }`}
                >
                  {f.severity}
                </span>
                <div className="flex-1">
                  <p className="text-slate-700 dark:text-slate-300 font-medium">{f.message}</p>
                  <p className="text-[10px] text-slate-400">
                    Category: {f.category} | Code: {f.code}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
