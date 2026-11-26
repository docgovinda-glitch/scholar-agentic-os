import {
ArrowRight,
ArrowLeft,
CheckCircle2,
Sparkles
} from "lucide-react";

export interface SourcesExitGateProps {
  approvedCount: number;
  handleContinue: () => void;
  handleReturn: () => void;
}

export function SourcesExitGate({ approvedCount, handleContinue, handleReturn }: SourcesExitGateProps) {
  return (
    <>
      {/* Phase 03 exit gate */}
      <div className="rounded-2xl p-6 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xs dark:shadow-none flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">
              Evidence Grounding
            </h3>
            {approvedCount > 0 ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 flex items-center gap-1 border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3" />
                <span>{approvedCount} Approved</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] flex items-center gap-1 border border-[color:var(--border-subtle)]">
                <Sparkles className="w-3 h-3 text-[color:var(--text-muted)]" />
                <span>Optional Grounding</span>
              </span>
            )}
          </div>
          <p className="text-xs text-[color:var(--text-muted)]">
            {approvedCount >= 4
              ? `You have approved ${approvedCount} sources. You are fully grounded to proceed to Phase 04 Drafting.`
              : approvedCount > 0
              ? `You have approved ${approvedCount} source${approvedCount === 1 ? "" : "s"} (${approvedCount}/4 recommended). You can continue approving or proceed to drafting anytime.`
              : `Citing sources is recommended (0/4 recommended) but optional. You can attach sources now or proceed directly to drafting.`}
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end flex-wrap">
          <button
            type="button"
            onClick={handleReturn}
            className="px-4 py-2.5 rounded-full text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Understand</span>
          </button>

          <button
            type="button"
            onClick={handleContinue}
            data-testid="proceed-to-drafting-btn"
            className="px-7 py-2.5 rounded-full text-xs font-semibold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer flex items-center gap-2 shadow-xs dark:shadow-none"
          >
            <span>Proceed to Drafting</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
}
