import React, { useState } from "react";
import {
  Compass,
  CheckCircle2,
  Play,
  Plus,
  Trash2,
  Loader2,
  BookOpen,
  Search,
  Sparkles,
} from "lucide-react";
import {
  classifyResearchPrompt,
  resolveSourceBudget,
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
  plan_proposed: "Plan Proposed",
  plan_approved: "Plan Approved",
  searching: "Searching Providers",
  reading: "Reading Full Texts",
  synthesizing: "Synthesizing Report",
  report_ready: "Report Ready",
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
  const budget = resolveSourceBudget("deep_research");
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
    budgetLabel: `${budget.minCandidates}–${budget.maxCandidates} candidates retrieved · ${budget.minCited}–${budget.maxCited}+ read & cited`,
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
  onApprovePlan: (approvedPlanOrQuestions: any) => void;
  onCancel?: () => void;
}

export function DeepResearchWorkflowCard({
  state,
  phase,
  plan,
  subQuestions,
  onUpdateSubQuestions,
  onApprovePlan,
  onCancel,
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

  const currentIdx = DEEP_RESEARCH_STATE_ORDER.indexOf(effectiveState);

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

  return (
    <div
      data-testid="deep-research-workflow-card"
      data-workflow-state={effectiveState}
      className="my-3 p-4 rounded-2xl bg-white dark:bg-ink-800 border border-purple-200/80 dark:border-purple-800/40 shadow-md space-y-3 max-w-[75ch]"
    >
      {/* Header & State Machine Stepper */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-neutral-200/70 dark:border-white/10">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300">
            Deep Research Plan & Workflow
          </span>
        </div>
        <span
          data-testid="deep-research-state-badge"
          className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-200 border border-purple-200 dark:border-purple-800/50"
        >
          {DEEP_RESEARCH_STATE_LABELS[effectiveState]}
        </span>
      </div>

      {/* Explicit State Progress Pills */}
      <div className="flex items-center flex-nowrap overflow-x-auto whitespace-nowrap gap-1.5 py-1 text-[10.5px]">
        {DEEP_RESEARCH_STATE_ORDER.map((st, idx) => {
          const isDone = idx < currentIdx || effectiveState === "report_ready";
          const isCurrent = idx === currentIdx && effectiveState !== "report_ready";
          return (
            <span
              key={st}
              data-testid={`dr-step-${st}`}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium border shrink-0 ${
                isCurrent
                  ? "bg-purple-600 text-white border-purple-600"
                  : isDone
                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50"
                    : "bg-neutral-100 dark:bg-white/5 text-neutral-500 dark:text-neutral-400 border-neutral-200/60 dark:border-white/10"
              }`}
            >
              {isCurrent && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
              {isDone && <CheckCircle2 className="w-2.5 h-2.5" />}
              <span>{DEEP_RESEARCH_STATE_LABELS[st]}</span>
            </span>
          );
        })}
      </div>

      {/* Discipline & Source Budget Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-neutral-50 dark:bg-white/[0.03] p-2.5 rounded-xl border border-neutral-200/60 dark:border-white/10">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
            Discipline & Source Types
          </span>
          <span className="font-semibold text-neutral-800 dark:text-neutral-200">
            {resolvedPlan.disciplineLabel}
          </span>
          <span className="block text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
            {resolvedPlan.sourceTypes.slice(0, 4).join(", ")}
          </span>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
            Source Budget
          </span>
          <span className="font-semibold text-neutral-800 dark:text-neutral-200">
            {resolvedPlan.budgetLabel}
          </span>
          <span className="block text-[11px] text-neutral-500 dark:text-neutral-400">
            Runs in background · Notifies when ready
          </span>
        </div>
      </div>

      {/* Editable Sub-Questions when in plan_proposed state */}
      {effectiveState === "plan_proposed" ? (
        <div className="space-y-2">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
            Research Sub-Questions (Edit or add before starting)
          </label>
          <div className="space-y-1.5">
            {editableSubQuestions.map((sq, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-neutral-400 w-5">{idx + 1}.</span>
                <input
                  type="text"
                  aria-label={`Sub-question ${idx + 1}`}
                  value={sq}
                  onChange={(e) => handleUpdateSubQuestion(idx, e.target.value)}
                  className="flex-1 px-2.5 py-1.5 rounded-lg text-xs bg-white dark:bg-ink-900 border border-neutral-200 dark:border-white/15 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                {editableSubQuestions.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove sub-question ${idx + 1}`}
                    onClick={() => handleRemoveSubQuestion(idx)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5 pt-1">
            <input
              type="text"
              placeholder="Add another research sub-question…"
              value={newSubQuestion}
              onChange={(e) => setNewSubQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddSubQuestion();
                }
              }}
              className="flex-1 px-2.5 py-1.5 rounded-lg text-xs bg-neutral-50 dark:bg-ink-900 border border-neutral-200 dark:border-white/15 text-neutral-900 dark:text-neutral-100"
            />
            <button
              type="button"
              onClick={handleAddSubQuestion}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-white/15 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer"
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
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-sm cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Approve Plan & Start Deep Research</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 text-xs text-neutral-600 dark:text-neutral-300">
          {effectiveState === "searching" && (
            <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-medium">
              <Search className="w-3.5 h-3.5 animate-pulse" />
              <span>Querying OpenAlex, Crossref, PubMed, Semantic Scholar, and authoritative web in parallel…</span>
            </div>
          )}
          {effectiveState === "reading" && (
            <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-medium">
              <BookOpen className="w-3.5 h-3.5 animate-pulse" />
              <span>Reading top-ranked full texts, verifying DOIs & retraction status, and checking coverage gaps…</span>
            </div>
          )}
          {effectiveState === "synthesizing" && (
            <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-medium">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              <span>Synthesizing long-form academic report with 1-to-1 verified citations…</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
