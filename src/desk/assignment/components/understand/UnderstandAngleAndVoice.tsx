import type { ThesisStance } from "../../../../domain/assignment/briefThesis";
import React from "react";
import { type WritingStyleConfig } from "../../types";

export interface UnderstandAngleAndVoiceProps {
  activeThesis: string;
  coreTopic: string;
  dispatchToneAssistantSuggestions: () => void;
  handleToneChange: (newTone: string) => void;
  localStyle: WritingStyleConfig;
  localTone: string;
  saveAnswers: (updates: Record<string, unknown>) => Promise<void>;
  setActiveThesis: (value: React.SetStateAction<string>) => void;
  setLocalStyle: (value: React.SetStateAction<WritingStyleConfig>) => void;
  setWritingStyle: (style: WritingStyleConfig) => Promise<void>;
  thesisStances: ThesisStance[];
  toneSectionRef: React.RefObject<HTMLDivElement | null>;
}

export function UnderstandAngleAndVoice({ activeThesis, coreTopic, dispatchToneAssistantSuggestions, handleToneChange, localStyle, localTone, saveAnswers, setActiveThesis, setLocalStyle, setWritingStyle, thesisStances, toneSectionRef }: UnderstandAngleAndVoiceProps) {
  return (
    <>
          {/* Core topic, working angle and writing voice */}
          <section className="bg-white dark:bg-ink-750 rounded-2xl border border-neutral-200/80 dark:border-white/10 p-4 sm:p-5 shadow-xs space-y-3" aria-label="Core topic and working angle">
            <h3 className="text-xs font-semibold text-neutral-900 dark:text-white uppercase tracking-wider">
              Topic &amp; Core Angle
            </h3>
            <p className="text-sm text-neutral-800 dark:text-neutral-200" data-testid="core-topic">
              {coreTopic}
            </p>

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pick an angle">
              {thesisStances.map((st) => {
                const isSelected = activeThesis === st.statement;
                return (
                  <button
                    key={st.id}
                    type="button"
                    aria-pressed={isSelected}
                    title={st.statement}
                    onClick={() => {
                      setActiveThesis(st.statement);
                      saveAnswers({ assignment_thesis: st.statement, thesis_statement: st.statement });
                    }}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                        : "border-neutral-200 dark:border-white/15 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5"
                    }`}
                  >
                    {st.title}
                  </button>
                );
              })}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="assignment_thesis_input" className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Working thesis
              </label>
              <textarea
                id="assignment_thesis_input"
                value={activeThesis}
                onChange={(e) => {
                  setActiveThesis(e.target.value);
                  saveAnswers({ assignment_thesis: e.target.value, thesis_statement: e.target.value });
                }}
                rows={2}
                placeholder="Pick an angle above or write your own working thesis…"
                className="w-full bg-transparent border border-neutral-200/80 dark:border-white/10 rounded-xl p-3 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 resize-y"
              />
            </div>

            <div
              ref={toneSectionRef}
              data-testid="tone-section-wrapper"
              onFocusCapture={dispatchToneAssistantSuggestions}
              onClickCapture={dispatchToneAssistantSuggestions}
              className="space-y-1.5"
            >
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Writing style</span>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Writing style">
                {WRITING_VOICE_OPTIONS.map((opt) => {
                  const active = localTone === opt.value || (opt.value === "natural" && !WRITING_VOICE_OPTIONS.some((o) => o.value === localTone));
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => handleToneChange(opt.value)}
                      className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
                        active
                          ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                          : "border-neutral-200 dark:border-white/15 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {localTone === "custom" && (
                <textarea
                  aria-label="Paste a sample of your own writing"
                  value={localStyle.customSampleText ?? ""}
                  onChange={(e) => {
                    const updated: WritingStyleConfig = { ...localStyle, preset: "custom", customSampleText: e.target.value };
                    setLocalStyle(updated);
                    setWritingStyle?.(updated);
                    saveAnswers({ writingStyle: updated, writing_style: updated }).catch(console.warn);
                  }}
                  rows={2}
                  placeholder="Paste a paragraph or two of your own writing; Scholar will mirror its voice when drafting."
                  className="w-full bg-transparent border border-neutral-200/80 dark:border-white/10 rounded-xl p-3 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 resize-y"
                />
              )}
            </div>
          </section>
    </>
  );
}
const WRITING_VOICE_OPTIONS: Array<{ value: string; label: string; }> = [
  { value: "natural", label: "Clear & Natural Academic (Default)" },
  { value: "expository", label: "Simple & Direct" },
  { value: "analytical", label: "Analytical" },
  { value: "custom", label: "My Own Writing Style" },
];
