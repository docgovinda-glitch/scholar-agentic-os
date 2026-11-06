import React, { useState, useEffect } from "react";
import {
  Compass,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  BarChart3,
  ShieldCheck,
  FileText,
  Square,
  Sparkles,
} from "lucide-react";
import type { ResearchStageTelemetry } from "../api/types";
import ScholarCoreLogo from "../../components/ScholarCoreLogo";

export interface ResearchStageStep {
  id: string;
  label: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const RESEARCH_PIPELINE_STEPS: ResearchStageStep[] = [
  {
    id: "scoping",
    label: "Query Decomposition & Scoping",
    detail: "Formulating sub-hypotheses and identifying theoretical variables",
    icon: Compass,
  },
  {
    id: "harvesting",
    label: "Multi-Portal Literature Retrieval",
    detail: "Harvesting OpenAlex, Crossref, Europe PMC and scholarly repositories",
    icon: Search,
  },
  {
    id: "screening",
    label: "Quality & Methodological Screening",
    detail: "Filtering preprints, assessing sample sizes, and screening peer-reviewed venues",
    icon: Filter,
  },
  {
    id: "extraction",
    label: "Empirical Evidence & PICO Extraction",
    detail: "Parsing effect sizes (SMD, OR, RR), sample sizes (N), and confidence intervals",
    icon: BarChart3,
  },
  {
    id: "synthesis",
    label: "Epistemic Triangulation & Synthesis",
    detail: "Resolving contradictory evidence and generating strict inline citation trace",
    icon: ShieldCheck,
  },
];

export const DEEP_RESEARCH_STEPS = RESEARCH_PIPELINE_STEPS;
export const STANDARD_RESEARCH_STEPS = RESEARCH_PIPELINE_STEPS.slice(0, 4);

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
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [secondsElapsed, setSecondsElapsed] = useState<number>(0);

  const isDeepResearch = mode === "deep-research" || mode === "deep_research";
  const pipelineSteps = RESEARCH_PIPELINE_STEPS;
  const totalSteps = pipelineSteps.length;

  // Live timer during thinking
  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      setSecondsElapsed((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isLive]);

  // Synchronize stage based on activeStage, currentStep, and progressive timers
  useEffect(() => {
    if (!isLive) return;

    if (activeStage?.stageNumber && activeStage.stageNumber > 0) {
      const idx = Math.min(totalSteps - 1, activeStage.stageNumber - 1);
      setActiveStepIndex(idx);
      return;
    }

    if (currentStep === "writing") {
      setActiveStepIndex(totalSteps - 1);
      return;
    }

    if (currentStep === "searching") {
      if (activeStepIndex === 0) {
        setActiveStepIndex(1);
      }
    }
  }, [isLive, activeStage, currentStep, totalSteps, activeStepIndex]);

  // Progressive simulated timer to step forward smoothly when server is processing
  useEffect(() => {
    if (!isLive || activeStage?.stageNumber) return;

    const stepInterval = isDeepResearch ? 3500 : 2500;
    const maxProgressionIndex = currentStep === "writing" ? totalSteps - 1 : totalSteps - 2;

    const timer = setTimeout(() => {
      setActiveStepIndex((prev) => (prev < maxProgressionIndex ? prev + 1 : prev));
    }, stepInterval);

    return () => clearTimeout(timer);
  }, [isLive, activeStepIndex, currentStep, isDeepResearch, totalSteps, activeStage?.stageNumber]);

  const currentStepData = pipelineSteps[activeStepIndex] || pipelineSteps[0];
  const progressPercent = Math.min(100, Math.round(((activeStepIndex + 1) / totalSteps) * 100));

  return (
    <div
      data-testid="research-trajectory-visualizer"
      className="my-2.5 rounded-2xl bg-neutral-50/90 dark:bg-white/[0.03] border border-neutral-200/80 dark:border-white/10 shadow-xs overflow-hidden font-sans text-xs transition-all duration-200"
    >
      {/* Top Header Row: Unified branding, timer, status, and expand toggle */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between p-3 hover:bg-neutral-100/50 dark:hover:bg-white/5 transition-colors cursor-pointer text-left gap-2 border-b border-neutral-200/60 dark:border-white/5"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative flex items-center justify-center shrink-0">
            <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 flex items-center justify-center">
              {isLive ? (
                <ScholarCoreLogo size="sm" withText={false} className="scale-75 animate-spin" />
              ) : (
                <Compass className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              )}
            </div>
            {isLive && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-sky-500 animate-ping" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-neutral-900 dark:text-neutral-100 text-[12px] truncate">
                {isDeepResearch
                  ? "Autonomous Deep Research Trajectory"
                  : "Live Multi-Source Literature Retrieval"}
              </span>
              <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-mono font-medium bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 shrink-0">
                {isLive ? `${secondsElapsed}s · Active` : `${stages.length || totalSteps} Stages Completed`}
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
              {isLive
                ? currentStep === "searching"
                  ? "Querying external academic indices and OpenAlex metadata..."
                  : currentStep === "writing"
                  ? `Found ${foundCount || "verified"} studies · Synthesizing empirical findings...`
                  : "Executing multi-step hypothesis decomposition..."
                : query
                ? `Inquiry: "${query}"`
                : "Autonomous literature search and evidence extraction execution trace."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isLive && onStop && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onStop();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onStop();
                }
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer shadow-2xs"
              title="Stop research generation"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
              <span>Stop</span>
            </span>
          )}

          <div className="text-neutral-400">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </button>

      {/* Progress Track (shown during live execution) */}
      {isLive && (
        <div className="w-full h-1 bg-neutral-200/50 dark:bg-white/5 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-600 transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* During live background processing: Single active step appears. When step finishes, next appears! */}
      {isLive && (
        <div className="p-3 sm:p-3.5">
          <div
            key={`active-step-${activeStepIndex}`}
            className="p-3 rounded-xl bg-white dark:bg-ink-800/80 border border-sky-500/20 dark:border-sky-500/30 shadow-2xs animate-in fade-in slide-in-from-bottom-1 duration-200"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-5 h-5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                  {activeStepIndex + 1}
                </span>
                <span className="text-[12.5px] font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                  Stage {activeStepIndex + 1}: {currentStepData.label}
                </span>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/40 font-medium shrink-0 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                <span>Running</span>
              </span>
            </div>

            <p className="text-[11.5px] text-neutral-600 dark:text-neutral-400 leading-relaxed">
              {liveDetail || activeStage?.detail || currentStepData.detail}
            </p>

            {foundCount > 0 && (
              <div className="mt-2 pt-2 border-t border-neutral-100 dark:border-white/5 flex items-center gap-1.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>
                  Found {foundCount} verified scholarly candidate{foundCount === 1 ? "" : "s"}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expanded Interactive Pipeline Map (when user expands or completed) */}
      {isExpanded && (!isLive || isExpanded) && (
        <div className="px-3.5 pb-3.5 pt-1 border-t border-neutral-100 dark:border-white/5 space-y-3">
          {/* Step Progress Nodes */}
          <div className="space-y-1.5 pt-1">
            {pipelineSteps.map((step, idx) => {
              const StepIcon = step.icon;
              const isPast = !isLive || idx < activeStepIndex;
              const isCurrent = isLive && idx === activeStepIndex;

              return (
                <div
                  key={step.id}
                  className={`flex items-start gap-2.5 p-2 rounded-xl transition-all ${
                    isCurrent
                      ? "bg-sky-500/10 border border-sky-500/30"
                      : isPast
                      ? "bg-white/60 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/5"
                      : "opacity-50 border border-transparent"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {isPast ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 animate-spin text-sky-600 dark:text-sky-400" />
                    ) : (
                      <StepIcon className="w-4 h-4 text-neutral-400" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[11.5px] font-semibold ${
                          isCurrent
                            ? "text-sky-950 dark:text-sky-200 font-bold"
                            : isPast
                            ? "text-neutral-800 dark:text-neutral-200"
                            : "text-neutral-400"
                        }`}
                      >
                        Stage {idx + 1}: {step.label}
                      </span>
                      {isCurrent && (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-sky-500/20 text-sky-700 dark:text-sky-300 font-semibold animate-pulse">
                          Running
                        </span>
                      )}
                      {isPast && (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                          Complete
                        </span>
                      )}
                    </div>
                    <p className="text-[10.5px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-snug">
                      {step.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sub-Questions & Search Plan (if available) */}
          {plan && plan.length > 0 && (
            <div className="pt-2 border-t border-neutral-100 dark:border-white/5 space-y-1.5">
              <span className="text-[10.5px] font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider block">
                Decomposed Sub-Questions & Search Trajectory:
              </span>
              <ul className="space-y-1 text-neutral-600 dark:text-neutral-400 text-[11px] pl-1">
                {plan.map((step, sIdx) => (
                  <li key={sIdx} className="flex items-start gap-1.5">
                    <span className="text-sky-500 font-bold shrink-0">⚡</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LiveResearchTrajectoryVisualizer;
