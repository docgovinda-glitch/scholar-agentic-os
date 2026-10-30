import React, { useState } from "react";
import type { ThesisProjectData } from "../types";

/** One examiner question, as returned by the viva-simulate route for this thesis. */
export interface VivaPracticeQuestion {
  id: string;
  category: string;
  examinerQuestion: string;
  assessmentFocus: string;
  suggestedRebuttalStructure: string[];
}

export interface VivaVoceSimulatorProps {
  thesisData: ThesisProjectData;
  /** Questions generated for this thesis. Empty until the user generates them. */
  questions: VivaPracticeQuestion[];
  className?: string;
}

/**
 * Viva practice room. Uses only the examiner questions generated from the
 * candidate's own thesis. The candidate drafts an answer and checks it against
 * the examiner's suggested structure themselves: nothing here grades the answer,
 * because a score without a real examiner (or a real AI judgement) would be invented.
 */
export default function VivaVoceSimulator({ thesisData, questions, className = "" }: VivaVoceSimulatorProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [ticked, setTicked] = useState<Record<string, boolean[]>>({});

  const active = questions.find((q) => q.id === activeId) ?? questions[0];

  return (
    <div
      className={`p-6 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] flex flex-col gap-6 shadow-xs ${className}`}
      data-testid="viva-voce-simulator"
    >
      <div className="pb-4 border-b border-[color:var(--border-subtle)]">
        <h3 className="text-sm font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
          Viva Practice Room
        </h3>
        <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
          {thesisData.title ? (
            <>
              Thesis: <strong className="text-[color:var(--text-primary)]">{thesisData.title}</strong>
            </>
          ) : (
            "Add your thesis title and research questions to generate examiner questions."
          )}
        </p>
      </div>

      {questions.length === 0 || !active ? (
        <p className="text-xs text-[color:var(--text-secondary)]" data-testid="viva-practice-empty">
          No examiner questions yet. Use <strong>Launch Examiner Simulation</strong> below to generate questions from
          your thesis, then practise your answers here.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 flex flex-col gap-2.5">
            <span className="text-xs font-bold text-[color:var(--text-primary)]">
              Examiner questions ({questions.length})
            </span>
            {questions.map((q) => {
              const isSelected = q.id === active.id;
              return (
                <button
                  type="button"
                  key={q.id}
                  onClick={() => setActiveId(q.id)}
                  aria-pressed={isSelected}
                  className={`text-left p-4 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                    isSelected
                      ? "border-[color:var(--accent)] bg-[color:var(--surface-canvas)] shadow-xs"
                      : "border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-canvas)]"
                  }`}
                >
                  <span className="text-[10px] font-bold text-[color:var(--accent)]">{q.category}</span>
                  <span className="text-xs text-[color:var(--text-secondary)] line-clamp-2 leading-relaxed">
                    {q.examinerQuestion}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="p-5 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-sunken)] flex flex-col gap-2.5">
              <p className="text-sm font-semibold text-[color:var(--text-primary)] leading-relaxed">
                {active.examinerQuestion}
              </p>
              {active.assessmentFocus && (
                <span className="text-[11px] text-[color:var(--text-muted)]">
                  <strong>What the examiner is testing:</strong> {active.assessmentFocus}
                </span>
              )}
            </div>

            <label className="flex flex-col gap-2 text-xs font-bold text-[color:var(--text-primary)]">
              Your answer (stays on this page)
              <textarea
                rows={5}
                value={answers[active.id] ?? ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [active.id]: e.target.value }))}
                placeholder="Acknowledge the premise, point to the evidence in your chapters, and state the limits."
                className="w-full p-3 text-xs font-normal border border-[color:var(--border-control)] rounded-xl bg-[color:var(--surface-input)] text-[color:var(--text-primary)] leading-relaxed resize-none"
              />
            </label>

            {active.suggestedRebuttalStructure.length > 0 && (
              <fieldset className="p-4 rounded-xl border border-[color:var(--border-subtle)] flex flex-col gap-2">
                <legend className="px-1 text-xs font-bold text-[color:var(--text-primary)]">
                  Check your answer covers
                </legend>
                {active.suggestedRebuttalStructure.map((point, idx) => (
                  <label key={idx} className="flex items-start gap-2 text-xs text-[color:var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={ticked[active.id]?.[idx] ?? false}
                      onChange={(e) =>
                        setTicked((prev) => {
                          const next = [...(prev[active.id] ?? [])];
                          next[idx] = e.target.checked;
                          return { ...prev, [active.id]: next };
                        })
                      }
                      className="mt-0.5"
                    />
                    <span>{point}</span>
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
