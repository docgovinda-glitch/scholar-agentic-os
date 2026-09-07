import React, { useState, useRef, useEffect } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import WordCountTracker from "./WordCountTracker";
import type {
  TutorMode,
  SocraticQuestion,
  RubricGradeEstimation,
  CounterArgument,
  GradingBand,
} from "../types";

const MODE_DEFINITIONS: {
  id: TutorMode;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
}[] = [
  {
    id: "socratic",
    label: "Socratic Inquiry",
    shortLabel: "Socratic",
    icon: "🏛️",
    description: "Deep dialectical questioning, challenging assumptions, & probing logical leaps",
  },
  {
    id: "rubric",
    label: "Rubric Estimator",
    shortLabel: "Rubric",
    icon: "📊",
    description: "Marking criteria breakdown, grade band estimation (1st / 2:1 / 2:2), & step-up roadmap",
  },
  {
    id: "counterargument",
    label: "Counter-Arguments",
    shortLabel: "Counter-Args",
    icon: "⚔️",
    description: "Opposing theoretical perspectives, empirical objections, & rebuttal blueprints",
  },
  {
    id: "writing_polish",
    label: "Academic Polish",
    shortLabel: "Polish",
    icon: "✨",
    description: "Scholarly tone refinement, eliminating passive voice, & enhancing lexical precision",
  },
];

const MODE_QUICK_PROMPTS: Record<TutorMode, string[]> = {
  socratic: [
    "Challenge the core assumption of my thesis",
    "What unstated premises am I relying on?",
    "Where is the logical leap in my argument?",
    "How can I deepen this theoretical analysis?",
    "What counter-evidence might undermine this claim?",
  ],
  rubric: [
    "Estimate my draft's grade band & mark",
    "What is preventing this from reaching a 1st Class (70%+)?",
    "Evaluate my critical analysis vs descriptive text",
    "How well does this meet university marking criteria?",
    "Give me actionable steps to jump to the next grade band",
  ],
  counterargument: [
    "What would rival theoretical schools object to?",
    "Surface empirical counter-evidence against my claim",
    "How do I structure a rebuttal for the strongest counter-argument?",
    "Identify edge cases where my thesis breaks down",
  ],
  writing_polish: [
    "Make this paragraph more analytical and concise",
    "Eliminate hedging, informal phrasing, and passive voice",
    "Improve the academic transition into the next point",
    "Strengthen the introductory hook and scholarly authority",
  ],
};

const BAND_COLORS: Record<GradingBand, { badge: string; bg: string; border: string; text: string }> = {
  "1st_class": {
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  "2_1_upper_second": {
    badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
    text: "text-sky-600 dark:text-sky-400",
  },
  "2_2_lower_second": {
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    text: "text-amber-600 dark:text-amber-400",
  },
  "3rd_class": {
    badge: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    text: "text-orange-600 dark:text-orange-400",
  },
  fail: {
    badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
    text: "text-rose-600 dark:text-rose-400",
  },
};

export default function AssignmentAiTutorPanel({ className = "" }: { className?: string }) {
  const {
    tutorMode,
    setTutorMode,
    tutorMessages,
    sendTutorMessage,
    isTutorReplying,
    isEstimatingRubric,
    estimateRubricGrade,
    applyTutorSuggestionToDraft,
    academicLevel,
    currentWordCount,
  } = useAssignmentWorkspace();

  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [tutorMessages, isTutorReplying, isEstimatingRubric]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isTutorReplying || isEstimatingRubric) return;
    sendTutorMessage(inputText, tutorMode);
    setInputText("");
  };

  const handleChipClick = (prompt: string) => {
    if (isTutorReplying || isEstimatingRubric) return;
    sendTutorMessage(prompt, tutorMode);
  };

  const handleRunRubricAudit = () => {
    if (isEstimatingRubric || isTutorReplying) return;
    estimateRubricGrade();
  };

  const activeModeDef = MODE_DEFINITIONS.find((m) => m.id === tutorMode) || MODE_DEFINITIONS[0];

  return (
    <aside
      className={`flex flex-col h-full bg-[color:var(--surface-canvas)] border-l border-[color:var(--border-subtle)] ${className}`}
    >
      {/* Tutor Header */}
      <div className="p-3.5 border-b border-[color:var(--border-subtle)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border border-[color:var(--accent-border)] flex items-center justify-center text-base shadow-xs">
            🎓
          </div>
          <div>
            <h3 className="text-xs font-bold text-[color:var(--text-primary)] flex items-center gap-1.5">
              Academic Thinking & Writing Tutor
            </h3>
            <p className="text-[10px] text-[color:var(--text-muted)]">
              {academicLevel === "postgraduate"
                ? "Postgraduate Synthesis & Dialectical Critique"
                : "Undergraduate Academic Guidance Mode"}
            </p>
          </div>
        </div>
      </div>

      {/* Mode Selector Tabs */}
      <div className="p-2 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]">
        <div className="grid grid-cols-4 gap-1">
          {MODE_DEFINITIONS.map((mode) => {
            const isSelected = tutorMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setTutorMode(mode.id)}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-[var(--radius-md)] text-center transition-all cursor-pointer ${
                  isSelected
                    ? "bg-[color:var(--surface-raised)] border border-[color:var(--accent)] text-[color:var(--accent)] font-bold shadow-xs"
                    : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-raised)] border border-transparent"
                }`}
                title={mode.description}
              >
                <span className="text-xs leading-none mb-0.5">{mode.icon}</span>
                <span className="text-[10px] truncate max-w-full font-semibold">{mode.shortLabel}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-[color:var(--text-muted)] mt-1.5 px-1 truncate">
          <span className="font-semibold text-[color:var(--text-secondary)]">{activeModeDef.label}:</span>{" "}
          {activeModeDef.description}
        </p>
      </div>

      {/* Embedded Live Word Count Meter */}
      <div className="p-3 border-b border-[color:var(--border-subtle)]">
        <WordCountTracker />
      </div>

      {/* Quick Rubric Audit Action Banner in Rubric Mode */}
      {tutorMode === "rubric" && (
        <div className="p-2.5 bg-gradient-to-r from-emerald-500/10 to-sky-500/10 border-b border-[color:var(--border-subtle)] flex items-center justify-between gap-2">
          <div className="text-[11px] text-[color:var(--text-secondary)]">
            <span className="font-bold text-[color:var(--text-primary)] block">Live Marking Audit</span>
            <span>Assess draft against 1st / 2:1 marking criteria</span>
          </div>
          <button
            type="button"
            disabled={isEstimatingRubric || currentWordCount < 50}
            onClick={handleRunRubricAudit}
            className="px-3 py-1.5 rounded-[var(--radius-md)] bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50 shadow-xs flex items-center gap-1.5 shrink-0"
          >
            {isEstimatingRubric ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Auditing…</span>
              </>
            ) : (
              <>
                <span>📊</span>
                <span>Estimate Grade</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {tutorMessages.map((msg) => {
          const isUser = msg.sender === "user";
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[92%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                  isUser
                    ? "bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-br-xs"
                    : "bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] text-[color:var(--text-primary)] rounded-bl-xs shadow-xs"
                }`}
              >
                {/* Text Body */}
                <div className="whitespace-pre-wrap">{msg.text}</div>

                {/* Socratic Questions Cards */}
                {msg.socraticQuestions && msg.socraticQuestions.length > 0 && (
                  <div className="mt-3 space-y-2 pt-2.5 border-t border-[color:var(--border-subtle)]">
                    <span className="text-[10px] uppercase font-bold text-[color:var(--accent)] tracking-wider flex items-center gap-1">
                      <span>🏛️</span> Socratic Probes to Deepen Your Thinking:
                    </span>
                    {msg.socraticQuestions.map((sq: SocraticQuestion) => (
                      <div
                        key={sq.id}
                        className="p-2.5 rounded-[var(--radius-md)] bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-1 flex-wrap">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[color:var(--accent-subtle)] text-[color:var(--accent)]">
                            {sq.challengeType.replace(/_/g, " ").toUpperCase()}
                          </span>
                          <span className="text-[10px] font-medium text-[color:var(--text-muted)]">
                            Concept: {sq.targetConcept}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-[color:var(--text-primary)]">
                          "{sq.question}"
                        </p>
                        <p className="text-[11px] text-[color:var(--text-secondary)] italic">
                          💡 {sq.rationale}
                        </p>
                        <button
                          type="button"
                          onClick={() => sendTutorMessage(`Regarding the Socratic question "${sq.question}": here is my thought...`, "socratic")}
                          className="text-[10px] font-bold text-[color:var(--accent)] hover:underline mt-1 inline-block cursor-pointer"
                        >
                          Explore This Probe →
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Rubric Grade Estimation Card */}
                {msg.rubricEstimation && (
                  <div className="mt-3 space-y-2.5 pt-2.5 border-t border-[color:var(--border-subtle)]">
                    <div className="flex items-center justify-between gap-2 p-2 rounded-[var(--radius-md)] bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)]">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[color:var(--text-muted)] block">
                          Estimated Grade Band
                        </span>
                        <h4 className="text-sm font-extrabold text-[color:var(--text-primary)]">
                          {msg.rubricEstimation.bandLabel}
                        </h4>
                      </div>
                      <div className={`px-2.5 py-1 rounded-full text-xs font-black border ${BAND_COLORS[msg.rubricEstimation.overallBand]?.badge || "bg-neutral-500/10 text-neutral-600 border-neutral-500/20"}`}>
                        {msg.rubricEstimation.overallScore}%
                      </div>
                    </div>

                    {/* Criteria Breakdown */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-[color:var(--text-muted)] block">
                        Marking Dimensions:
                      </span>
                      {msg.rubricEstimation.criteria.map((c) => (
                        <div
                          key={c.id}
                          className="p-2 rounded bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[11px] space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[color:var(--text-primary)]">{c.criterion}</span>
                            <span className="font-semibold text-[color:var(--text-secondary)]">{c.score} / {c.maxScore}</span>
                          </div>
                          <p className="text-[10px] text-[color:var(--text-secondary)]">{c.critique}</p>
                          {c.howToReachNextBand && (
                            <p className="text-[10px] text-[color:var(--accent)] font-medium">
                              🎯 To Step Up: {c.howToReachNextBand}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Roadmap to Higher Band */}
                    {msg.rubricEstimation.targetBandRoadmap && (
                      <div className="p-2.5 rounded-[var(--radius-md)] bg-emerald-500/10 border border-emerald-500/20 text-[11px] space-y-1">
                        <span className="font-bold text-emerald-700 dark:text-emerald-300 block">
                          🚀 Roadmap to {msg.rubricEstimation.targetBandRoadmap.targetBand}:
                        </span>
                        <ul className="list-disc list-inside text-emerald-800 dark:text-emerald-200 text-[10px] space-y-0.5">
                          {msg.rubricEstimation.targetBandRoadmap.actionableSteps.map((step, sIdx) => (
                            <li key={sIdx}>{step}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Counterarguments Card */}
                {msg.counterArguments && msg.counterArguments.length > 0 && (
                  <div className="mt-3 space-y-2 pt-2.5 border-t border-[color:var(--border-subtle)]">
                    <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 tracking-wider flex items-center gap-1">
                      <span>⚔️</span> Theoretical Objections & Counterarguments:
                    </span>
                    {msg.counterArguments.map((ca: CounterArgument) => (
                      <div
                        key={ca.id}
                        className="p-2.5 rounded-[var(--radius-md)] bg-amber-500/5 border border-amber-500/20 space-y-1.5 text-[11px]"
                      >
                        <span className="font-bold text-[color:var(--text-primary)] block">
                          Counterpoint: {ca.opposingViewpoint}
                        </span>
                        <p className="text-[10px] text-[color:var(--text-secondary)]">
                          <span className="font-semibold">Theoretical Grounding:</span> {ca.theoreticalGrounding}
                        </p>
                        {ca.keyScholarsOrSchools && ca.keyScholarsOrSchools.length > 0 && (
                          <p className="text-[10px] text-[color:var(--text-muted)]">
                            <span className="font-semibold">Key Proponents:</span> {ca.keyScholarsOrSchools.join(", ")}
                          </p>
                        )}
                        <div className="pt-1 border-t border-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">
                          <span className="font-bold">🛡️ Rebuttal Blueprint:</span> {ca.suggestedRebuttalStrategy}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actionable Polish Suggestion */}
                {msg.actionableSuggestion && msg.actionableSuggestion.suggestedText && (
                  <div className="mt-2.5 pt-2 border-t border-[color:var(--border-subtle)] text-[11px]">
                    <span className="font-bold text-[color:var(--accent)] block mb-1">
                      💡 Suggested Academic Polish:
                    </span>
                    <p className="italic text-[color:var(--text-secondary)] p-2 rounded bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)]">
                      {msg.actionableSuggestion.suggestedText}
                    </p>
                    <button
                      type="button"
                      onClick={() => applyTutorSuggestionToDraft({
                        suggestedText: msg.actionableSuggestion?.suggestedText || "",
                        targetSectionId: msg.actionableSuggestion?.targetSectionId,
                        type: msg.actionableSuggestion?.type,
                      })}
                      className="mt-1.5 text-[10px] font-bold text-[color:var(--accent)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>📥</span> Apply to Section Draft
                    </button>
                  </div>
                )}
              </div>
              <span className="text-[10px] text-[color:var(--text-muted)] mt-1 px-1">
                {msg.timestamp}
              </span>
            </div>
          );
        })}

        {(isTutorReplying || isEstimatingRubric) && (
          <div className="flex items-center gap-2 text-xs text-[color:var(--text-muted)] p-2">
            <div className="w-2 h-2 rounded-full bg-[color:var(--accent)] animate-bounce" />
            <div className="w-2 h-2 rounded-full bg-[color:var(--accent)] animate-bounce [animation-delay:0.2s]" />
            <div className="w-2 h-2 rounded-full bg-[color:var(--accent)] animate-bounce [animation-delay:0.4s]" />
            <span>
              {isEstimatingRubric
                ? "Senior Examiner auditing draft against rubric criteria…"
                : `Tutor analyzing ${activeModeDef.shortLabel} perspective…`}
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Contextual Prompt Chips */}
      <div className="p-2.5 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] block mb-1.5">
          {activeModeDef.shortLabel} Queries:
        </span>
        <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pr-1">
          {MODE_QUICK_PROMPTS[tutorMode].map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isTutorReplying || isEstimatingRubric}
              onClick={() => handleChipClick(prompt)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] hover:bg-[color:var(--accent-subtle)] transition-colors cursor-pointer text-left truncate max-w-full"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Input Box */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-[color:var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Ask your ${activeModeDef.shortLabel} Tutor...`}
            disabled={isTutorReplying || isEstimatingRubric}
            className="flex-1 bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] px-3 py-2 text-xs text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-hidden focus:border-[color:var(--accent)] transition-colors"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isTutorReplying || isEstimatingRubric}
            className="px-3.5 py-2 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer disabled:opacity-50 shadow-xs"
          >
            Ask
          </button>
        </div>
      </form>
    </aside>
  );
}
