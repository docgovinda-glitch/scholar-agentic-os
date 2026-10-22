import React from "react";
import { Compass, Sparkles, Check, ArrowRight } from "lucide-react";
import type { CourseworkExecutionMode } from "../types/orchestrator";

export interface CourseworkModeToggleProps {
  mode: CourseworkExecutionMode;
  onChange: (mode: CourseworkExecutionMode) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * CourseworkModeToggle:
 * Minimal neutral Tailwind v4 mode selector for Coursework & Essays (OT-01).
 * Features subtle zinc borders, zero pure black, and refined academic typography.
 */
export default function CourseworkModeToggle({
  mode,
  onChange,
  disabled = false,
  className = "",
}: CourseworkModeToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Coursework Orchestration Mode"
      className={`rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/40 p-3 sm:p-4 space-y-3 font-sans transition-colors ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-2.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
              Orchestration Architecture
            </span>
            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-200/70 dark:bg-zinc-800">
              OT-01
            </span>
          </div>
          <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 mt-0.5">
            Choose Execution Mode
          </h3>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Switch between step-by-step phased drafting or fully autonomous deep synthesis.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Minimal Mode (Guided Atomic Lifecycle) */}
        <button
          type="button"
          role="radio"
          aria-checked={mode === "minimal"}
          disabled={disabled}
          onClick={() => onChange("minimal")}
          className={`relative text-left p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 ${
            mode === "minimal"
              ? "border-zinc-900/90 dark:border-zinc-400/80 bg-white dark:bg-zinc-800/90 shadow-xs ring-1 ring-zinc-900/5 dark:ring-zinc-300/10"
              : "border-zinc-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/30 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800/40"
          } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-lg transition-colors ${
                  mode === "minimal"
                    ? "bg-zinc-100 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                    : "bg-zinc-100/70 dark:bg-zinc-800/70 text-zinc-500 dark:text-zinc-400"
                }`}
              >
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Minimal Mode
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                    User-Guided
                  </span>
                </div>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block mt-0.5">
                  Phased Atomic Lifecycle
                </span>
              </div>
            </div>

            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors shrink-0 ${
                mode === "minimal"
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-200 dark:bg-zinc-200 dark:text-zinc-900"
                  : "border-zinc-300 dark:border-zinc-700 bg-transparent"
              }`}
            >
              {mode === "minimal" && <Check className="w-2.5 h-2.5 stroke-[3]" />}
            </div>
          </div>

          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2.5 leading-relaxed">
            Manually advance through four distinct stages: <strong>Understand</strong>, <strong>Sources</strong>, <strong>Drafting</strong>, and <strong>Submission</strong>. The AI strictly acts on the active phase and never drafts ahead.
          </p>

          <div className="mt-3 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1 font-mono text-[10px]">
              <span>4 Gated Stages</span>
              <span>·</span>
              <span>Manual Approvals</span>
            </span>
            <span className="font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
              <span>Step-by-step</span>
              <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </button>

        {/* Detailed Mode (Autonomous Deep Synthesis) */}
        <button
          type="button"
          role="radio"
          aria-checked={mode === "detailed"}
          disabled={disabled}
          onClick={() => onChange("detailed")}
          className={`relative text-left p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 ${
            mode === "detailed"
              ? "border-zinc-900/90 dark:border-zinc-400/80 bg-white dark:bg-zinc-800/90 shadow-xs ring-1 ring-zinc-900/5 dark:ring-zinc-300/10"
              : "border-zinc-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/30 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800/40"
          } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-lg transition-colors ${
                  mode === "detailed"
                    ? "bg-zinc-100 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                    : "bg-zinc-100/70 dark:bg-zinc-800/70 text-zinc-500 dark:text-zinc-400"
                }`}
              >
                <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Detailed Mode
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-300/60 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
                    Autonomous
                  </span>
                </div>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block mt-0.5">
                  Deep End-to-End Synthesis
                </span>
              </div>
            </div>

            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors shrink-0 ${
                mode === "detailed"
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-200 dark:bg-zinc-200 dark:text-zinc-900"
                  : "border-zinc-300 dark:border-zinc-700 bg-transparent"
              }`}
            >
              {mode === "detailed" && <Check className="w-2.5 h-2.5 stroke-[3]" />}
            </div>
          </div>

          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2.5 leading-relaxed">
            Self-executes the complete scholarly pipeline: OpenAlex/Crossref literature discovery, dynamic outline, sequential drafting with deterministic tokens, and uniqueness validation.
          </p>

          <div className="mt-3 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1 font-mono text-[10px]">
              <span>Auto Discovery</span>
              <span>·</span>
              <span>&gt;20% Overlap Guard</span>
            </span>
            <span className="font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
              <span>One-Click Full Paper</span>
              <Sparkles className="w-3 h-3" />
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}
