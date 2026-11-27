import type { PreviewSource, SourceChoice } from "../../domain/ask/sourceSelection";
import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Compass, Loader2, Pin, Play, Plus, Trash2, X } from "lucide-react";
import {
  classifyResearchPrompt,
  generateQueryVariations,
} from "../../config/askScholarConfig";

export type DeepResearchWorkflowState =
  | "plan_proposed"
  | "plan_approved"
  | "searching"
  | "reading"
  | "synthesizing"
  | "report_ready";

export const DEEP_RESEARCH_STATE_ORDER: DeepResearchWorkflowState[] = [
  "plan_proposed",
  "plan_approved",
  "searching",
  "reading",
  "synthesizing",
  "report_ready",
];

export const DEEP_RESEARCH_STATE_LABELS: Record<DeepResearchWorkflowState, string> = {
  plan_proposed: "Ready to start",
  plan_approved: "Starting",
  searching: "Searching",
  reading: "Reading",
  synthesizing: "Writing",
  report_ready: "Report ready",
};

export interface ProposedDeepResearchPlan {
  question: string;
  disciplineLabel: string;
  subQuestions: string[];
  sourceTypes: string[];
  budgetLabel: string;
}

export function buildProposedDeepResearchPlan(question: string): ProposedDeepResearchPlan {
  const classification = classifyResearchPrompt(question, "deep_research");
  const variations = generateQueryVariations(question, classification);

  const subQuestions = [
    variations[0] || question,
    `${question} — theoretical framework and foundational literature`,
    `${question} — empirical evidence, effect sizes, and comparative studies`,
    `${question} — methodological limitations, conflicting findings, and open gaps`,
  ];

  return {
    question,
    disciplineLabel: classification.disciplineProfile.label,
    subQuestions,
    sourceTypes: classification.disciplineProfile.preferredSourceTypes,
    // What the server actually does (deepResearchEngine: DEEP_REPORT_MAX_SOURCES), not a target it never reaches.
    budgetLabel: "Up to 40 sources go into the report",
  };
}

export function generateInitialDeepResearchPlan(question: string): string[] {
  return buildProposedDeepResearchPlan(question).subQuestions;
}

export interface DeepResearchWorkflowCardProps {
  state?: DeepResearchWorkflowState;
  phase?: DeepResearchWorkflowState;
  plan?: ProposedDeepResearchPlan;
  subQuestions?: string[];
  searchedCount?: number;
  readCount?: number;
  citedCount?: number;
  onUpdateSubQuestions?: (nextQuestions: string[]) => void;
  /** Sources found for this plan; pin keeps one, exclude drops it from the run. */
  previewSources?: PreviewSource[];
  previewStatus?: "loading" | "ready" | "failed";
  onSetSourceChoice?: (index: number, choice: SourceChoice) => void;
  onApprovePlan: (approvedPlanOrQuestions: any) => void;
  onCancel?: () => void;
  /** Who wrote the sub-questions shown: the model, the built-in starter, or the researcher. */
  planSource?: "loading" | "ai" | "starter" | "edited";
}

const PLAN_SOURCE_NOTE: Record<NonNullable<DeepResearchWorkflowCardProps["planSource"]>, string> = {
  loading: "Asking the AI for a research plan…",
  ai: "Drafted by AI from your question. Edit before starting.",
  starter: "Starter plan, not written by AI (no AI could draft one). Edit it to fit your question.",
  edited: "Your edited plan.",
};

/** The four steps a researcher sees: the six workflow states folded into what is happening in plain words. */
const STEPS: Array<{ id: string; label: string; states: DeepResearchWorkflowState[] }> = [
  { id: "plan", label: "Plan", states: ["plan_proposed", "plan_approved"] },
  { id: "search", label: "Search", states: ["searching"] },
  { id: "read", label: "Read", states: ["reading"] },
  { id: "write", label: "Write", states: ["synthesizing"] },
];

/** A textarea that grows with its text, so a long sub-question is read in full on a phone. */
function GrowingTextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} />;
}

export function DeepResearchWorkflowCard({
  state,
  phase,
  plan,
  subQuestions,
  searchedCount,
  readCount,
  citedCount,
  onUpdateSubQuestions,
  previewSources,
  previewStatus,
  onSetSourceChoice,
  onApprovePlan,
  onCancel,
  planSource,
}: DeepResearchWorkflowCardProps) {
  const effectiveState: DeepResearchWorkflowState = state || phase || "plan_proposed";
  const resolvedPlan: ProposedDeepResearchPlan =
    plan ||
    buildProposedDeepResearchPlan(
      subQuestions && subQuestions.length > 0 ? subQuestions[0] : "Deep Research Inquiry"
    );
  const initialQuestions =
    subQuestions && subQuestions.length > 0 ? subQuestions : resolvedPlan.subQuestions;

  const [editableSubQuestions, setEditableSubQuestions] = useState<string[]>(initialQuestions);
  const [newSubQuestion, setNewSubQuestion] = useState("");

  const handleUpdateSubQuestion = (idx: number, val: string) => {
    setEditableSubQuestions((prev) => {
      const next = prev.map((q, i) => (i === idx ? val : q));
      onUpdateSubQuestions?.(next);
      return next;
    });
  };

  const handleRemoveSubQuestion = (idx: number) => {
    if (editableSubQuestions.length <= 1) return;
    setEditableSubQuestions((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      onUpdateSubQuestions?.(next);
      return next;
    });
  };

  const handleAddSubQuestion = () => {
    const clean = newSubQuestion.trim();
    if (!clean) return;
    setEditableSubQuestions((prev) => {
      const next = [...prev, clean];
      onUpdateSubQuestions?.(next);
      return next;
    });
    setNewSubQuestion("");
  };

  // Once the report is written, the plan folds into one line under it: how the question was researched.
  if (effectiveState === "report_ready") {
    const counts = [
      typeof searchedCount === "number" && searchedCount > 0 ? `${searchedCount} sources found` : null,
      typeof citedCount === "number" && citedCount > 0 ? `${citedCount} cited` : null,
    ].filter(Boolean);
    return (
      <details
        data-testid="deep-research-workflow-card"
        data-workflow-state={effectiveState}
        className="group my-3 max-w-[72ch] rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-3 py-2 text-[13px]"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[color:var(--text-secondary)] [&::-webkit-details-marker]:hidden">
          <Compass className="h-4 w-4 shrink-0 text-[color:var(--research)]" aria-hidden="true" />
          <span className="font-medium text-[color:var(--text-primary)]">How this was researched</span>
          <span className="min-w-0 flex-1 truncate">
            {[`${editableSubQuestions.length} questions`, ...counts].join(" · ")}
          </span>
          <span data-testid="deep-research-state-badge" className="sr-only">
            {DEEP_RESEARCH_STATE_LABELS[effectiveState]}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <ol className="mt-2 space-y-1 border-t border-[color:var(--border-subtle)] pt-2 text-[color:var(--text-secondary)]">
          {editableSubQuestions.map((q, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-4 shrink-0 tabular-nums text-[color:var(--research)]">{i + 1}</span>
              <span>{q}</span>
            </li>
          ))}
        </ol>
      </details>
    );
  }

  const stepIndex = STEPS.findIndex((st) => st.states.includes(effectiveState));
  const proposing = effectiveState === "plan_proposed";

  return (
    <div
      data-testid="deep-research-workflow-card"
      data-workflow-state={effectiveState}
      className="my-3 max-w-[72ch] rounded-2xl border border-[color:var(--research-border)] bg-[color:var(--surface-raised)] p-4 sm:p-5"
    >
      {/* Header: what this is, what it covers, and where it stands */}
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--research-subtle)] text-[color:var(--research)]" aria-hidden="true">
          <Compass className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[15px] font-semibold text-[color:var(--text-primary)]">Research plan</h3>
            <span
              data-testid="deep-research-state-badge"
              className="rounded-full bg-[color:var(--research-subtle)] px-2 py-0.5 text-xs font-medium text-[color:var(--research)]"
            >
              {DEEP_RESEARCH_STATE_LABELS[effectiveState]}
            </span>
          </div>
          {/* The budget only: the discipline is a keyword guess, and a wrong one on display costs trust. */}
          <p className="mt-0.5 text-[13px] text-[color:var(--text-secondary)]">{resolvedPlan.budgetLabel}</p>
        </div>
      </div>

      {/* Where the run is: four plain steps */}
      <ol aria-label="Research steps" className="mt-4 grid grid-cols-4 gap-1.5">
        {STEPS.map((st, idx) => {
          const done = idx < stepIndex;
          const current = idx === stepIndex;
          return (
            <li key={st.id} data-testid={`dr-step-${st.id}`} aria-current={current ? "step" : undefined} className="min-w-0">
              <span
                className={`block h-1 rounded-full ${
                  done || current ? "bg-[color:var(--research-solid)]" : "bg-[color:var(--surface-sunken)]"
                } ${current && !proposing ? "animate-pulse" : ""}`}
                aria-hidden="true"
              />
              <span
                className={`mt-1.5 flex items-center gap-1 text-xs ${
                  current ? "font-semibold text-[color:var(--research)]" : done ? "text-[color:var(--text-primary)]" : "text-[color:var(--text-muted)]"
                }`}
              >
                {done && <Check className="h-3 w-3" aria-hidden="true" />}
                {st.label}
              </span>
            </li>
          );
        })}
      </ol>

      {proposing ? (
        <div className="mt-5 space-y-5">
          {/* The questions the run will research, editable */}
          <section aria-labelledby="dr-questions-label">
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
              <h4 id="dr-questions-label" className="text-[13px] font-semibold text-[color:var(--text-primary)]">
                Questions to research
              </h4>
              {planSource && (
                <p data-testid="deep-research-plan-source" role="status" className="text-xs text-[color:var(--text-muted)]">
                  {PLAN_SOURCE_NOTE[planSource]}
                </p>
              )}
            </div>
            <ol className="mt-2 space-y-2">
              {editableSubQuestions.map((sq, idx) => (
                <li key={idx} className="group flex items-start gap-2">
                  <span className="mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--research-subtle)] text-[11px] font-semibold tabular-nums text-[color:var(--research)]" aria-hidden="true">
                    {idx + 1}
                  </span>
                  <GrowingTextArea
                    aria-label={`Sub-question ${idx + 1}`}
                    value={sq}
                    onChange={(e) => handleUpdateSubQuestion(idx, e.target.value)}
                    className="min-h-9 flex-1 resize-none overflow-hidden rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2 text-[14px] leading-snug text-[color:var(--text-primary)] transition-colors hover:border-[color:var(--border-default)] focus:border-[color:var(--research)] focus:outline-none focus:ring-2 focus:ring-[color:var(--research-border)] sm:text-[13px]"
                  />
                  {editableSubQuestions.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove sub-question ${idx + 1}`}
                      onClick={() => handleRemoveSubQuestion(idx)}
                      className="mt-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--state-danger)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ol>
            <div className="mt-2 flex items-center gap-2 pl-7">
              <input
                type="text"
                aria-label="Add a question"
                placeholder="Add a question…"
                value={newSubQuestion}
                onChange={(e) => setNewSubQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddSubQuestion();
                  }
                }}
                className="min-h-9 min-w-0 flex-1 rounded-xl border border-dashed border-[color:var(--border-default)] bg-transparent px-3 py-2 text-[14px] text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--research)] focus:outline-none sm:text-[13px]"
              />
              <button
                type="button"
                onClick={handleAddSubQuestion}
                disabled={!newSubQuestion.trim()}
                className="inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1 rounded-xl px-3 text-[13px] font-medium text-[color:var(--research)] transition-colors hover:bg-[color:var(--research-subtle)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add
              </button>
            </div>
          </section>

          {/* Sources the preview found: keep or drop before the run */}
          {(previewStatus || (previewSources && previewSources.length > 0)) && (
            <section data-testid="plan-source-preview" aria-labelledby="dr-sources-label">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
                <h4 id="dr-sources-label" className="text-[13px] font-semibold text-[color:var(--text-primary)]">
                  Sources found so far
                </h4>
                <p className="text-xs text-[color:var(--text-muted)]">Pin to keep · exclude to drop</p>
              </div>
              {previewStatus === "loading" && (
                <p className="mt-2 flex items-center gap-1.5 text-[13px] text-[color:var(--text-secondary)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Looking for likely sources…
                </p>
              )}
              {previewStatus === "failed" && (
                <p className="mt-2 text-[13px] text-[color:var(--text-secondary)]">No preview this time. The run will still search on its own.</p>
              )}
              <ul className="scholar-scrollbar mt-2 max-h-64 divide-y divide-[color:var(--border-subtle)] overflow-y-auto rounded-xl border border-[color:var(--border-subtle)]">
                {(previewSources || []).map((src, idx) => {
                  const pinned = src.choice === "pinned";
                  const excluded = src.choice === "excluded";
                  return (
                    <li
                      key={`${src.doi || src.url || src.title}-${idx}`}
                      data-choice={src.choice || "none"}
                      className={`flex items-start gap-2 px-3 py-2.5 ${pinned ? "bg-[color:var(--research-subtle)]" : ""} ${excluded ? "opacity-55" : ""}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className={`line-clamp-2 text-[13px] font-medium leading-snug text-[color:var(--text-primary)] ${excluded ? "line-through" : ""}`}>
                          {src.title}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">
                          {[Array.isArray(src.authors) && src.authors[0], src.year, src.venue || src.journal].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          aria-pressed={pinned}
                          aria-label={`Pin ${src.title}`}
                          title={pinned ? "Pinned: kept in the run" : "Pin: keep in the run"}
                          onClick={() => onSetSourceChoice?.(idx, "pinned")}
                          className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-colors ${
                            pinned ? "bg-[color:var(--research-solid)] text-[color:var(--research-on-solid)]" : "text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
                          }`}
                        >
                          <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-pressed={excluded}
                          aria-label={`Exclude ${src.title}`}
                          title={excluded ? "Excluded from the run" : "Exclude from the run"}
                          onClick={() => onSetSourceChoice?.(idx, "excluded")}
                          className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-colors ${
                            excluded ? "bg-[color:var(--text-primary)] text-[color:var(--surface-raised)]" : "text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
                          }`}
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="min-h-10 cursor-pointer rounded-xl px-4 text-[13px] font-medium text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--surface-hover)]"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              data-testid="approve-deep-research-plan-btn"
              onClick={() => {
                const cleaned = editableSubQuestions.filter((s) => s.trim().length > 0);
                if (plan) {
                  onApprovePlan({
                    ...resolvedPlan,
                    subQuestions: cleaned,
                  });
                } else {
                  onApprovePlan(cleaned);
                }
              }}
              className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[color:var(--research-solid)] px-4 text-[14px] font-semibold text-[color:var(--research-on-solid)] shadow-sm transition-[filter,transform] hover:brightness-110 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--research)] sm:w-auto"
            >
              <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              Start research
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-[color:var(--text-secondary)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[color:var(--research)]" aria-hidden="true" />
          {effectiveState === "plan_approved" && "Plan approved. Starting the search…"}
          {effectiveState === "searching" && "Searching scholarly indexes and the web for each question…"}
          {effectiveState === "reading" && "Reading the strongest sources, in full where an open copy exists…"}
          {effectiveState === "synthesizing" && "Writing the report from the sources…"}
        </p>
      )}
    </div>
  );
}
