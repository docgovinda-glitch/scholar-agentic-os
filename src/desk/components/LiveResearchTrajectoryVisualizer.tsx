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
} from "lucide-react";
import type { ResearchStageTelemetry } from "../api/types";

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

export interface LiveResearchTrajectoryVisualizerProps {
  isLive?: boolean;
  currentStep?: "searching" | "writing" | string;
  foundCount?: number;
  query?: string;
  mode?: string;
  plan?: string[];
  stages?: ResearchStageTelemetry[];
  defaultExpanded?: boolean;
}

export const LiveResearchTrajectoryVisualizer: React.FC<LiveResearchTrajectoryVisualizerProps> = ({
  isLive = false,
  currentStep,
  foundCount = 0,
  query,
  mode = "deep-research",
  plan = [],
  stages = [],
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [secondsElapsed, setSecondsElapsed] = useState<number>(0);

  // Live timer during thinking
  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      setSecondsElapsed((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isLive]);

  // Advance pipeline steps progressively while thinking
  useEffect(() => {
    if (!isLive) return;
    if (currentStep === "searching") {
      setActiveStepIndex(1); // Harvesting
    } else if (currentStep === "writing") {
      setActiveStepIndex(4); // Synthesis
    } else {
      // Progress over time if step not explicitly reported
      const timer = setTimeout(() => {
        setActiveStepIndex((prev) => Math.min(RESEARCH_PIPELINE_STEPS.length - 1, prev + 1));
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [isLive, currentStep, secondsElapsed]);

  const isDeepResearch = mode === "deep-research" || mode === "deep_research";

  return (
    <div
      data-testid="research-trajectory-visualizer"
      className="my-3 rounded-2xl bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-transparent dark:from-indigo-500/10 dark:via-purple-500/10 dark:to-transparent border border-indigo-200/70 dark:border-white/10 overflow-hidden font-sans text-xs shadow-xs"
    >
      {/* Visualizer Top Bar */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between p-3 hover:bg-neutral-100/50 dark:hover:bg-white/5 transition-colors cursor-pointer text-left gap-2"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative flex items-center justify-center shrink-0">
            <div className="w-7 h-7 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
              {isLive ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" /> : <Compass className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
            </div>
            {isLive && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-neutral-900 dark:text-neutral-100 truncate">
                {isDeepResearch
                  ? "Autonomous Deep Research Trajectory"
                  : "Live Multi-Source Literature Retrieval"}
              </span>
              <span className="px-2 py-0.2 rounded-full font-mono text-[10px] font-semibold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-300/40 shrink-0">
                {isLive ? `${secondsElapsed}s · Active` : `${stages.length || 5} Stages Completed`}
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
              {isLive
                ? currentStep === "searching"
                  ? "Querying external academic indices and OpenAlex metadata..."
                  : currentStep === "writing"
                    ? `Found ${foundCount || "verified"} studies · Synthesizing empirical findings...`
                    : "Executing multi-step hypothesis decomposition..."
                : query ? `Inquiry: "${query}"` : "Autonomous literature search and evidence extraction execution trace."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-neutral-400">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded Interactive Pipeline Map */}
      {isExpanded && (
        <div className="px-3.5 pb-3.5 pt-1 border-t border-indigo-100 dark:border-white/5 space-y-3">
          {/* Step Progress Nodes */}
          <div className="space-y-2 pt-1">
            {RESEARCH_PIPELINE_STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isPast = !isLive || idx < activeStepIndex;
              const isCurrent = isLive && idx === activeStepIndex;
              const isUpcoming = isLive && idx > activeStepIndex;

              return (
                <div
                  key={step.id}
                  className={`flex items-start gap-2.5 p-2 rounded-xl transition-all ${
                    isCurrent
                      ? "bg-indigo-500/10 dark:bg-indigo-950/40 border border-indigo-500/30"
                      : isPast
                        ? "bg-white/60 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/5"
                        : "opacity-50 border border-transparent"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {isPast ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <Icon className="w-4 h-4 text-neutral-400" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[11.5px] font-semibold ${
                        isCurrent
                          ? "text-indigo-950 dark:text-indigo-200 font-bold"
                          : isPast
                            ? "text-neutral-800 dark:text-neutral-200"
                            : "text-neutral-400"
                      }`}>
                        Stage {idx + 1}: {step.label}
                      </span>
                      {isCurrent && (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-semibold animate-pulse">
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
              <span className="text-[10.5px] font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                Decomposed Sub-Questions & Search Trajectory:
              </span>
              <ul className="space-y-1 text-neutral-600 dark:text-neutral-400 text-[11px] pl-1">
                {plan.map((step, sIdx) => (
                  <li key={sIdx} className="flex items-start gap-1.5">
                    <span className="text-purple-500 font-bold shrink-0">⚡</span>
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

