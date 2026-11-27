import { classifyResearchPrompt } from "../../config/askScholarConfig";
import { frameworkForDiscipline } from "../../domain/ask/evidenceFramework";
import React, { useEffect, useState } from "react";
import { BookOpen, Check, ChevronDown, Compass, Loader2, PenLine, Scale, Search, Square } from "lucide-react";
import type { ResearchStageTelemetry } from "../api/types";

export interface ResearchStageStep {
  id: string;
  /** One word for the step row ("Search"). */
  short: string;
  label: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** The research a person sees, in five plain steps (the server's seven stages fold into them). */
export const RESEARCH_PIPELINE_STEPS: ResearchStageStep[] = [
  { id: "scoping", short: "Plan", label: "Plan the questions", detail: "Breaking the question into sub-questions to search", icon: Compass },
  { id: "harvesting", short: "Search", label: "Search the literature", detail: "Scholarly indexes (OpenAlex, Crossref, Europe PMC and others) and the web", icon: Search },
  { id: "screening", short: "Read", label: "Read the sources", detail: "The strongest sources first, in full where an open copy exists", icon: BookOpen },
  { id: "extraction", short: "Check", label: "Check the evidence", detail: "Comparing what the sources found and looking for gaps", icon: Scale },
  { id: "synthesis", short: "Write", label: "Write the report", detail: "A cited report from the sources, each claim traced to them", icon: PenLine },
];

/** The steps with the checking step named for the question's discipline (PICO only for clinical work). */
export function pipelineStepsFor(query?: string): ResearchStageStep[] {
  if (!query?.trim()) return RESEARCH_PIPELINE_STEPS;
  const framework = frameworkForDiscipline(classifyResearchPrompt(query).discipline);
  return RESEARCH_PIPELINE_STEPS.map((step) =>
    step.id === "extraction" ? { ...step, label: framework.stageLabel, detail: framework.stageDetail } : step
  );
}

/** Server stage 1-7 → the step shown: plan, search, read, check (cross-check and the follow-up search), write. */
const STAGE_TO_STEP = [0, 0, 1, 2, 3, 3, 4, 4];

/** "Stage 2/7: Discovering sources…" → "Discovering sources…": the step row already says where the run is. */
const plainDetail = (text?: string) => (text || "").replace(/^Stage\s*\d+\s*\/\s*\d+\s*:\s*/i, "").trim();

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export interface LiveResearchTrajectoryVisualizerProps {
  isLive?: boolean;
  currentStep?: "searching" | "writing" | string;
  foundCount?: number;
  liveDetail?: string;
  query?: string;
  mode?: string;
  plan?: string[];
  stages?: ResearchStageTelemetry[];
  activeStage?: ResearchStageTelemetry | null;
  onStop?: () => void;
  defaultExpanded?: boolean;
  /** Shown inside the live card under the steps (Deep Research's activity feed). */
  children?: React.ReactNode;
}

export const LiveResearchTrajectoryVisualizer: React.FC<LiveResearchTrajectoryVisualizerProps> = ({
  isLive = false,
  currentStep,
  foundCount = 0,
  liveDetail,
  query,
  mode = "deep-research",
  plan = [],
  stages = [],
  activeStage,
  onStop,
  defaultExpanded = false,
  children,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [secondsElapsed, setSecondsElapsed] = useState<number>(0);
  const deep = mode === "deep-research" || mode === "deep_research";
  const steps = pipelineStepsFor(query);

  // Elapsed time only: it is shown as a clock and never moves the steps (those follow the server's stages).
  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => setSecondsElapsed((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [isLive]);

  const stepIndex =
    activeStage?.stageNumber && activeStage.stageNumber > 0
      ? STAGE_TO_STEP[Math.min(STAGE_TO_STEP.length - 1, activeStage.stageNumber)]
      : currentStep === "writing"
        ? 4
        : currentStep === "searching"
          ? 1
          : 0;

  // Deep Research wears its indigo; a quick answer's search stays neutral.
  const accentText = deep ? "text-[color:var(--research)]" : "text-[color:var(--text-primary)]";
  const accentFill = deep ? "bg-[color:var(--research-solid)]" : "bg-[color:var(--text-primary)]";
  const accentTint = deep ? "bg-[color:var(--research-subtle)]" : "bg-[color:var(--surface-inset)]";

  if (isLive) {
    const detail =
      plainDetail(liveDetail || activeStage?.detail) ||
      (currentStep === "writing" && foundCount > 0 ? `Writing from ${foundCount} sources` : steps[stepIndex].detail);
    return (
      <div
        data-testid="research-trajectory-visualizer"
        className={`my-2.5 max-w-[72ch] rounded-2xl border bg-[color:var(--surface-raised)] p-4 ${deep ? "border-[color:var(--research-border)]" : "border-[color:var(--border-subtle)]"}`}
      >
        <div className="flex items-center gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${accentTint} ${accentText}`} aria-hidden="true">
            <Loader2 className="h-4 w-4 animate-spin" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-semibold text-[color:var(--text-primary)]">
                {deep ? "Researching your question" : "Searching sources"}
              </span>
              <span className="text-xs tabular-nums text-[color:var(--text-muted)]" aria-label={`${secondsElapsed} seconds`}>
                {clock(secondsElapsed)}
              </span>
            </div>
            <p role="status" aria-live="polite" className="mt-0.5 truncate text-[13px] text-[color:var(--text-secondary)]">
              {detail}
            </p>
          </div>
          {onStop && (
            <button
              type="button"
              onClick={onStop}
              title="Stop the research"
              className="inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[color:var(--border-default)] px-3 text-[13px] font-medium text-[color:var(--text-primary)] transition-colors hover:bg-[color:var(--surface-hover)]"
            >
              <Square className="h-3 w-3 fill-current" aria-hidden="true" />
              Stop
            </button>
          )}
        </div>

        <ol aria-label="Research steps" className="mt-4 grid grid-cols-5 gap-1.5">
          {steps.map((step, idx) => {
            const done = idx < stepIndex;
            const current = idx === stepIndex;
            return (
              <li key={step.id} aria-current={current ? "step" : undefined} title={step.label} className="min-w-0">
                <span
                  className={`block h-1 rounded-full ${done || current ? accentFill : "bg-[color:var(--surface-sunken)]"} ${current ? "animate-pulse" : ""}`}
                  aria-hidden="true"
                />
                <span
                  className={`mt-1.5 flex items-center gap-1 truncate text-xs ${
                    current ? `font-semibold ${accentText}` : done ? "text-[color:var(--text-primary)]" : "text-[color:var(--text-muted)]"
                  }`}
                >
                  {done && <Check className="h-3 w-3 shrink-0" aria-hidden="true" />}
                  {step.short}
                </span>
              </li>
            );
          })}
        </ol>

        {children && <div className="mt-4 border-t border-[color:var(--border-subtle)] pt-3">{children}</div>}
      </div>
    );
  }

  // Afterwards: how the answer was researched, folded away until asked for.
  const recorded = stages.filter((s) => s.detail);
  return (
    <div
      data-testid="research-trajectory-visualizer"
      className="my-2.5 max-w-[72ch] rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] text-[13px]"
    >
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        aria-expanded={isExpanded}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[color:var(--text-secondary)]"
      >
        <Compass className={`h-4 w-4 shrink-0 ${deep ? "text-[color:var(--research)]" : ""}`} aria-hidden="true" />
        <span className="font-medium text-[color:var(--text-primary)]">How this was researched</span>
        <span className="min-w-0 flex-1 truncate">
          {query ? `“${query}”` : `${recorded.length || steps.length} steps`}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {isExpanded && (
        <div className="space-y-3 border-t border-[color:var(--border-subtle)] px-3 py-3">
          <ol className="space-y-2">
            {(recorded.length > 0
              ? recorded.map((s) => ({ key: `${s.id}-${s.stageNumber}`, label: s.label, detail: plainDetail(s.detail), skipped: s.status === "skipped" }))
              : steps.map((s) => ({ key: s.id, label: s.label, detail: s.detail, skipped: false }))
            ).map((row) => (
              <li key={row.key} className="flex items-start gap-2">
                <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${row.skipped ? "text-[color:var(--text-muted)]" : "text-[color:var(--state-success)]"}`} aria-hidden="true" />
                <div className="min-w-0">
                  <div className="font-medium text-[color:var(--text-primary)]">
                    {row.label}
                    {row.skipped && <span className="ml-1.5 text-xs font-normal text-[color:var(--text-muted)]">(not run)</span>}
                  </div>
                  <p className="text-xs leading-snug text-[color:var(--text-secondary)]">{row.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          {plan && plan.length > 0 && recorded.length === 0 && (
            <div className="border-t border-[color:var(--border-subtle)] pt-3">
              <div className="mb-1.5 text-xs font-semibold text-[color:var(--text-primary)]">Research trail</div>
              <ol className="space-y-1 text-xs text-[color:var(--text-secondary)]">
                {plan.map((step, i) => (
                  <li key={i} className="flex gap-2">
                    <span className={`w-4 shrink-0 tabular-nums ${deep ? "text-[color:var(--research)]" : ""}`}>{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LiveResearchTrajectoryVisualizer;
