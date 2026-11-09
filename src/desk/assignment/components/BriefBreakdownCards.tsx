import React, { useEffect, useMemo, useState } from "react";
import { Check, Edit2, Trash2, X } from "lucide-react";
import { allocateWordsByMarks } from "../../../utils/briefExtractor";
import {
  parseBriefQuestions,
  parseMarkingCriteria,
  type BriefQuestionRow,
} from "../../../utils/briefQuestions";

const card = "bg-white dark:bg-ink-750 rounded-2xl border border-neutral-200/80 dark:border-white/10 p-4 sm:p-5 shadow-xs space-y-3";
const heading = "text-xs font-semibold text-neutral-900 dark:text-white uppercase tracking-wider";

export interface SubQuestionsCardProps {
  briefText: string;
  /** Used only when the brief has no parseable numbered questions. */
  fallbackQuestions?: string[];
  totalWords: number;
  onRowsChange?: (rows: BriefQuestionRow[]) => void;
}

/** One scannable line per question: label, summary, marks and word target. */
export function SubQuestionsCard({ briefText, fallbackQuestions = [], totalWords, onRowsChange }: SubQuestionsCardProps) {
  const parsed = useMemo(() => {
    const rows = parseBriefQuestions(briefText);
    if (rows.length > 0) return rows;
    return fallbackQuestions.map<BriefQuestionRow>((text, i) => ({ id: `q${i + 1}`, label: `Q${i + 1}`, text }));
  }, [briefText, fallbackQuestions]);

  const [rows, setRows] = useState<BriefQuestionRow[]>(parsed);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // Re-read the brief when it changes; the student's edits apply to the current brief only.
  const signature = parsed.map((r) => `${r.id}:${r.text}:${r.marks ?? ""}`).join("|");
  useEffect(() => {
    setRows(parsed);
    setEditingId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signature captures parsed
  }, [signature]);

  const allocation = useMemo(
    () => allocateWordsByMarks(rows.map((r) => ({ id: r.id, title: r.text, marks: r.marks })), totalWords),
    [rows, totalWords]
  );

  const update = (next: BriefQuestionRow[]) => {
    setRows(next);
    onRowsChange?.(next);
  };

  if (rows.length === 0) return null;

  return (
    <section className={card} aria-label="Key sub-questions" data-testid="sub-questions-card">
      <h3 className={heading}>Key sub-questions your essay must answer</h3>
      <ul className="divide-y divide-neutral-100 dark:divide-white/5">
        {rows.map((row, i) => {
          const budget = allocation.questions[i];
          const editing = editingId === row.id;
          return (
            <li key={row.id} className="flex items-center gap-2.5 py-2 text-xs text-neutral-800 dark:text-neutral-200" data-testid="sub-question-row">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-neutral-200/70 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 shrink-0">
                {row.label}
              </span>
              {editing ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && draft.trim()) {
                      update(rows.map((r) => (r.id === row.id ? { ...r, text: draft.trim() } : r)));
                      setEditingId(null);
                    }
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  aria-label={`Edit ${row.label}`}
                  className="min-w-0 flex-1 rounded-lg border border-neutral-300 dark:border-white/15 bg-transparent px-2 py-1"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate font-medium" title={row.text}>{row.text}</span>
              )}
              <span className="shrink-0 text-[11px] text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                {typeof row.marks === "number" && row.marks > 0 ? `${row.marks} Marks (${budget?.weightPercentage ?? 0}%)` : `${budget?.weightPercentage ?? 0}%`}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                ~{(budget?.targetWords ?? 0).toLocaleString()} words
              </span>
              <span className="shrink-0 flex items-center gap-0.5">
                {editing ? (
                  <>
                    <button
                      type="button"
                      aria-label={`Save ${row.label}`}
                      disabled={!draft.trim()}
                      onClick={() => {
                        update(rows.map((r) => (r.id === row.id ? { ...r, text: draft.trim() } : r)));
                        setEditingId(null);
                      }}
                      className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" aria-label="Cancel edit" onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-label={`Edit ${row.label}`}
                      onClick={() => {
                        setDraft(row.text);
                        setEditingId(row.id);
                      }}
                      className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${row.label}`}
                      onClick={() => update(rows.filter((r) => r.id !== row.id))}
                      className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The marking criteria stated by the brief, one line each. */
export function GradingCriteriaCard({ briefText, rubricText }: { briefText: string; rubricText?: string }) {
  const rows = useMemo(() => parseMarkingCriteria([briefText, rubricText].filter(Boolean).join("\n")), [briefText, rubricText]);
  if (rows.length === 0) return null;
  return (
    <section className={card} aria-label="Grading criteria" data-testid="grading-criteria-card">
      <h3 className={heading}>Grading criteria</h3>
      <ul className="divide-y divide-neutral-100 dark:divide-white/5">
        {rows.map((r, i) => (
          <li key={i} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 py-2 text-xs text-neutral-800 dark:text-neutral-200">
            <span className="font-medium sm:w-2/5">{r.criterion}</span>
            <span className="shrink-0 text-[11px] text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
              {r.marks ? `${r.marks} marks` : ""}{r.marks && r.weightPercent ? " · " : ""}{r.weightPercent ? `${r.weightPercent}%` : ""}
            </span>
            {r.expectation && <span className="text-neutral-600 dark:text-neutral-400 min-w-0">{r.expectation}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
