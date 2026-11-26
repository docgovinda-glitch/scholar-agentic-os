import type { ThesisStance } from "../../../../domain/assignment/briefThesis";
import React, { useState } from "react";
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
  /** Where the stances come from: the AI's proposals, or the brief's own wording (no AI). */
  thesisSource?: "ai" | "brief";
  /** While the build plans the thesis: what it is doing. */
  thesisPending?: string | null;
  /** Ask the AI to sharpen the thesis; nothing is saved until the student accepts. */
  onRefineThesis?: (thesis: string) => Promise<{ ok: true; thesis: string; note: string } | { ok: false; error: string }>;
  toneSectionRef: React.RefObject<HTMLDivElement | null>;
}

export function UnderstandAngleAndVoice({ activeThesis, coreTopic, dispatchToneAssistantSuggestions, handleToneChange, localStyle, localTone, saveAnswers, setActiveThesis, setLocalStyle, setWritingStyle, thesisStances, thesisSource = "brief", thesisPending = null, onRefineThesis, toneSectionRef }: UnderstandAngleAndVoiceProps) {
  const [refining, setRefining] = useState(false);
  const [suggestion, setSuggestion] = useState<{ thesis: string; note: string } | null>(null);
  const [refineError, setRefineError] = useState<string | null>(null);
  const chooseThesis = (statement: string) => {
    setActiveThesis(statement);
    saveAnswers({ assignment_thesis: statement });
  };
  const refine = async () => {
    if (!onRefineThesis || refining || activeThesis.trim().length < 5) return;
    setRefining(true);
    setRefineError(null);
    setSuggestion(null);
    const out = await onRefineThesis(activeThesis.trim());
    setRefining(false);
    if (out.ok) setSuggestion({ thesis: out.thesis, note: out.note });
    else setRefineError(out.error);
  };
  return (
    <>
          {/* Core topic, working angle and writing voice */}
          <section className="bg-[color:var(--surface-raised)] rounded-2xl border border-[color:var(--border-subtle)] p-4 sm:p-5 shadow-xs space-y-3" aria-label="Core topic and working angle">
            <h3 className="text-xs font-semibold text-[color:var(--text-primary)] uppercase tracking-wider">
              Topic &amp; Core Angle
            </h3>
            <p className="text-sm text-[color:var(--text-primary)]" data-testid="core-topic">
              {coreTopic}
            </p>

            {thesisPending && (
              <p role="status" className="text-xs text-[color:var(--text-muted)]" data-testid="thesis-pending">
                {thesisPending}
              </p>
            )}

            {thesisSource === "ai" && thesisStances.length > 0 && (
              <div className="space-y-1.5" role="group" aria-label="Working theses your AI proposed">
                <p className="text-xs font-medium text-[color:var(--text-secondary)]">Suggested by your AI. Pick one, or write your own below.</p>
                {thesisStances.map((st) => {
                  const isSelected = activeThesis === st.statement;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => chooseThesis(st.statement)}
                      className={`w-full text-left px-3 py-2 rounded-xl border text-xs transition-colors cursor-pointer ${
                        isSelected
                          ? "border-[color:var(--accent-solid)] bg-[color:var(--accent-subtle)] text-[color:var(--text-primary)]"
                          : "border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)]"
                      }`}
                    >
                      <span className="block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">AI suggestion{st.title ? ` · ${st.title}` : ""}</span>
                      <span className="block mt-0.5 text-[color:var(--text-primary)]">{st.statement}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {thesisSource !== "ai" && thesisStances.length > 0 && (
            <p className="text-xs text-[color:var(--text-muted)]">Starting points taken from the brief's own wording (not written by AI):</p>
            )}
            {thesisSource !== "ai" && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pick an angle">
              {thesisStances.map((st) => {
                const isSelected = activeThesis === st.statement;
                return (
                  <button
                    key={st.id}
                    type="button"
                    aria-pressed={isSelected}
                    title={st.statement}
                    onClick={() => chooseThesis(st.statement)}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? "border-neutral-900 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] dark:border-white"
                        : "border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)]"
                    }`}
                  >
                    {st.title}
                  </button>
                );
              })}
            </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="assignment_thesis_input" className="text-xs font-medium text-[color:var(--text-secondary)]">
                Working thesis
              </label>
              <textarea
                id="assignment_thesis_input"
                value={activeThesis}
                onChange={(e) => {
                  setActiveThesis(e.target.value);
                  saveAnswers({ assignment_thesis: e.target.value });
                }}
                rows={2}
                placeholder="Pick a suggestion above or write your own working thesis…"
                className="w-full bg-transparent border border-[color:var(--border-subtle)] rounded-xl p-3 text-sm text-[color:var(--text-primary)] placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 resize-y"
              />
              {onRefineThesis && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={refine}
                    disabled={refining || activeThesis.trim().length < 5}
                    className="px-3 py-1 rounded-full border border-[color:var(--border-default)] text-xs font-medium text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {refining ? "Refining…" : "Refine with AI"}
                  </button>
                  {refineError && <span role="alert" className="text-xs text-[color:var(--state-danger)]">{refineError}</span>}
                </div>
              )}
              {suggestion && (
                <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/70 p-3 space-y-2" data-testid="thesis-suggestion">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">AI suggestion</p>
                  <p className="text-sm text-[color:var(--text-primary)]">{suggestion.thesis}</p>
                  {suggestion.note && <p className="text-xs text-[color:var(--text-muted)]">{suggestion.note}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        chooseThesis(suggestion.thesis);
                        setSuggestion(null);
                      }}
                      className="px-3 py-1 rounded-full bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] text-xs font-medium cursor-pointer"
                    >
                      Use this
                    </button>
                    <button
                      type="button"
                      onClick={() => setSuggestion(null)}
                      className="px-3 py-1 rounded-full text-xs font-medium text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] cursor-pointer"
                    >
                      Keep mine
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div
              ref={toneSectionRef}
              data-testid="tone-section-wrapper"
              onFocusCapture={dispatchToneAssistantSuggestions}
              onClickCapture={dispatchToneAssistantSuggestions}
              className="space-y-1.5"
            >
              <span className="text-xs font-medium text-[color:var(--text-secondary)]">Writing style</span>
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
                          ? "border-neutral-900 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] dark:border-white"
                          : "border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)]"
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
                  className="w-full bg-transparent border border-[color:var(--border-subtle)] rounded-xl p-3 text-sm text-[color:var(--text-primary)] placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 resize-y"
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
