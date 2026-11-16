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

  return (
    <div className="bg-[color:var(--surface-raised)] rounded-2xl border border-[color:var(--border-subtle)] shadow-xs overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 border-b border-[color:var(--border-subtle)] flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${hasIssues ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
            {hasIssues ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-[color:var(--text-primary)]">Links between paragraphs</h3>
            <p className="text-[13px] text-[color:var(--text-muted)]">
              Paragraphs with no linking word and no key term shared with the one before, across {audit.totalParagraphs} paragraphs.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs font-semibold text-[color:var(--text-muted)] mb-0.5 whitespace-nowrap">To look at</span>
          <span className={`text-xl font-bold tabular-nums ${hasIssues ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`} data-testid="flow-issue-count">
            {audit.issues.length}
          </span>
        </div>
      </div>

      <div className="flex-1 p-5 overflow-y-auto bg-[color:var(--surface-inset)]/50 dark:bg-transparent">
        {hasIssues ? (
          <div className="space-y-4">
            <div className="text-[13px] font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-700/30 rounded-xl p-4">
              {audit.issues.length} paragraph{audit.issues.length === 1 ? "" : "s"} may not connect to the one before. Read each and, if the step is not clear, open it with a sentence that links back.
            </div>

            <div className="space-y-3">
              {audit.issues.map((issue, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-sm space-y-2">
                  <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-medium">
                    <GitCommit className="w-4 h-4" />
                    <span>Paragraph {issue.paragraphIndex + 1}</span>
                  </div>
                  <p className="text-[color:var(--text-secondary)] text-[13px] italic border-l-2 border-[color:var(--border-subtle)] pl-3">
                    "{issue.textSnippet}"
                  </p>
                  <div className="flex items-start gap-2 pt-2 text-[13px] text-[color:var(--text-secondary)]">
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
              <p className="text-sm font-semibold">Nothing flagged</p>
              <p className="text-[13px] opacity-80 max-w-[220px] mt-1">Every paragraph shares a linking word or key term with the one before. This is a simple check, not a judgement of your argument.</p>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]">
        <button
          type="button"
          onClick={onReRunAudit}
          disabled={isAuditing}
          className="w-full py-2.5 rounded-xl bg-[color:var(--surface-inset)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] text-xs font-semibold transition-colors disabled:opacity-50"
        >
          {isAuditing ? "Auditing Flow..." : "Re-Run Flow Audit"}
        </button>
      </div>
    </div>
  );
}
