import React from "react";
import { Compass, Sparkles } from "lucide-react";
import type { CourseworkExecutionMode } from "../types/orchestrator";

export interface CourseworkModeToggleProps {
  mode: CourseworkExecutionMode;
  onChange: (mode: CourseworkExecutionMode) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * CourseworkModeToggle:
 * Apple-grade minimalist segmented control for Coursework & Essays (OT-01).
 * Features subtle zinc borders, whisper-quiet typography, and distraction-free ergonomics.
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
      className={`inline-flex items-center p-0.5 rounded-xl bg-zinc-100/90 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 text-xs font-medium select-none ${className}`}
    >
      {/* Minimal Mode (Guided Atomic Lifecycle) */}
      <button
        type="button"
        role="radio"
        aria-checked={mode === "minimal"}
        disabled={disabled}
        onClick={() => onChange("minimal")}
        title="Minimal Mode: Streamlined, distraction-free view focused on core drafting and final output"
        className={`py-1.5 px-3 rounded-lg transition-all text-center cursor-pointer flex items-center gap-1.5 border border-transparent ${
          mode === "minimal"
            ? "border-zinc-200/80 dark:border-zinc-700/60 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold shadow-2xs"
            : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <Compass className={`w-3.5 h-3.5 ${mode === "minimal" ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400"}`} />
        <span>Minimal Mode</span>
      </button>

      {/* Detailed Mode (Autonomous Deep Synthesis) */}
      <button
        type="button"
        role="radio"
        aria-checked={mode === "detailed"}
        disabled={disabled}
        onClick={() => onChange("detailed")}
        title="Detailed Mode: Full atomic lifecycle granularity, live evidence telemetry, citation tokens & section uniqueness validation"
        className={`py-1.5 px-3 rounded-lg transition-all text-center cursor-pointer flex items-center gap-1.5 border border-transparent ${
          mode === "detailed"
            ? "border-zinc-200/80 dark:border-zinc-700/60 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold shadow-2xs"
            : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <Sparkles className={`w-3.5 h-3.5 ${mode === "detailed" ? "text-amber-500" : "text-zinc-400"}`} />
        <span>Detailed Mode</span>
      </button>
    </div>
  );
}
