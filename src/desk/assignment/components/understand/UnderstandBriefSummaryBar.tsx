import type { AssignmentPhaseId } from "../../types";
import React from "react";
import { Edit2 } from "lucide-react";
import { safeFormatLabel } from "../../../../utils/briefExtractor";

export interface UnderstandBriefSummaryBarProps {
  briefSummary: string;
  localCitation: string;
  localLevel: "high_school" | "undergraduate" | "postgraduate" | "doctoral";
  localTone: string;
  localType: "essay" | "coursework" | "analytical_essay" | "critical_essay" | "argumentative_essay" | "research_paper" | "report" | "case_study" | "literature_review" | "annotated_bibliography" | "reflection" | "article_critique" | "book_review" | "policy_analysis" | "business_assignment" | "lab_report" | "short_answer" | "other";
  localWordCount: number;
  onBack: (() => void) | undefined;
  setPhase: (phase: AssignmentPhaseId, options?: { replace?: boolean; }) => void;
  setUnderstandStep: (value: React.SetStateAction<"brief_input" | "outline_review">) => void;
  userOverrideStepRef: React.RefObject<boolean>;
}

export function UnderstandBriefSummaryBar({ briefSummary, localCitation, localLevel, localTone, localType, localWordCount, onBack, setPhase, setUnderstandStep, userOverrideStepRef }: UnderstandBriefSummaryBarProps) {
  return (
    <>
          {/* Top Locked Brief Summary Bar */}
          <div className="bg-white dark:bg-ink-750 rounded-2xl border border-neutral-200/80 dark:border-white/10 p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-neutral-100 dark:border-white/5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-xs font-semibold text-neutral-900 dark:text-white uppercase tracking-wider">
                  Assignment Brief Summary
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Locked &amp; Calibrated
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  userOverrideStepRef.current = true;
                  setUnderstandStep("brief_input");
                  if (onBack) onBack();
                  else if (setPhase) setPhase("extract");
                }}
                aria-label="Edit Brief"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer w-fit border border-neutral-200/60 dark:border-white/10"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>← Edit Brief in Phase 1</span>
              </button>
            </div>

            {/* Executive summary (never the pasted brief) */}
            <p className="text-sm text-neutral-800 dark:text-neutral-200 leading-relaxed" data-testid="brief-summary-text">
              {briefSummary}
            </p>

            {/* Parameter Badges */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-300">
                Level: <strong className="font-semibold capitalize text-neutral-900 dark:text-white">{safeFormatLabel(localLevel)}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-300">
                Type: <strong className="font-semibold capitalize text-neutral-900 dark:text-white">{safeFormatLabel(localType)}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-300">
                Citation: <strong className="font-semibold uppercase text-neutral-900 dark:text-white">{localCitation}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                Tone: <strong className="font-semibold capitalize">{safeFormatLabel(localTone)}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-300">
                Target: <strong className="font-semibold text-neutral-900 dark:text-white">{localWordCount.toLocaleString()} words</strong>
              </span>
            </div>
          </div>
    </>
  );
}
