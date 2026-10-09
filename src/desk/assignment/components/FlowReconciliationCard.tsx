import React from "react";
import { type FlowAuditResult } from "../types";
import { 
  GitCommit, 
  CheckCircle2, 
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

export interface FlowReconciliationCardProps {
  audit: FlowAuditResult | null;
  onReRunAudit?: () => void;
  isAuditing?: boolean;
}

export function FlowReconciliationCard({ audit, onReRunAudit, isAuditing }: FlowReconciliationCardProps) {
  if (!audit) return null;

  const hasIssues = audit.issues.length > 0;
  const isOptimal = audit.score >= 90;

  return (
    <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-neutral-200/80 dark:border-white/10 shadow-xs overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 border-b border-neutral-100 dark:border-white/5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${hasIssues ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
            {hasIssues ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-neutral-900 dark:text-white">Flow & Transitions Audit</h3>
            <p className="text-[13px] text-neutral-500 dark:text-neutral-400">
              Analyzes logical jumps between {audit.totalParagraphs} paragraphs.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-0.5">Flow Score</span>
          <span className={`text-xl font-bold ${isOptimal ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
            {audit.score}/100
          </span>
        </div>
      </div>

      <div className="flex-1 p-5 overflow-y-auto bg-neutral-50/50 dark:bg-transparent">
        {hasIssues ? (
          <div className="space-y-4">
            <div className="text-[13px] font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-700/30 rounded-xl p-4">
              Detected {audit.issues.length} potential jump(s) in logic. Consider adding transitional sentences to improve coherence.
            </div>

            <div className="space-y-3">
              {audit.issues.map((issue, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-white dark:bg-white/5 border border-neutral-200/60 dark:border-white/5 text-sm space-y-2">
                  <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-medium">
                    <GitCommit className="w-4 h-4" />
                    <span>Paragraph {issue.paragraphIndex + 1}</span>
                  </div>
                  <p className="text-neutral-600 dark:text-neutral-400 text-[13px] italic border-l-2 border-neutral-200 dark:border-white/10 pl-3">
                    "{issue.textSnippet}"
                  </p>
                  <div className="flex items-start gap-2 pt-2 text-[13px] text-neutral-700 dark:text-neutral-300">
                    <ArrowRight className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                    <span className="font-medium">{issue.suggestedTransition}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center h-full py-8 text-emerald-600 dark:text-emerald-400 space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold">Perfect Coherence</p>
              <p className="text-[13px] opacity-80 max-w-[200px] mt-1">Transitions between paragraphs are logical and seamless.</p>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-neutral-100 dark:border-white/5 bg-white dark:bg-[#1C1C1E]">
        <button
          type="button"
          onClick={onReRunAudit}
          disabled={isAuditing}
          className="w-full py-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 text-xs font-semibold transition-colors disabled:opacity-50"
        >
          {isAuditing ? "Auditing Flow..." : "Re-Run Flow Audit"}
        </button>
      </div>
    </div>
  );
}
