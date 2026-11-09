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
  /** Called with the final word target per row (the student's own override wins). */
  onWordsChange?: (targets: Array<{ label: string; words: number }>, hasOverrides: boolean) => void;
}

/** One scannable line per question: label, summary, marks and word target. */
export function SubQuestionsCard({ briefText, fallbackQuestions = [], totalWords, onRowsChange, onWordsChange }: SubQuestionsCardProps) {
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
    setOverrides({});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signature captures parsed
  }, [signature]);

  // Words the student typed in stay as typed; the rest of the budget is shared by marks.
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [editingWordsId, setEditingWordsId] = useState<string | null>(null);
  const targets = useMemo(() => {
    const fixed = rows.filter((r) => overrides[r.id] !== undefined);
    const free = rows.filter((r) => overrides[r.id] === undefined);
    const remaining = Math.max(0, totalWords - fixed.reduce((n, r) => n + overrides[r.id], 0));
    const alloc = free.length
      ? allocateWordsByMarks(free.map((r) => ({ id: r.id, title: r.text, marks: r.marks })), Math.max(100, remaining))
      : null;
    const out: Record<string, { words: number; pct: number }> = {};
    for (const r of rows) {
      if (overrides[r.id] !== undefined) out[r.id] = { words: overrides[r.id], pct: Math.round((overrides[r.id] / Math.max(1, totalWords)) * 100) };
    }
    free.forEach((r, i) => {
      const q = alloc?.questions[i];
      const words = free.length && remaining < 100 ? 0 : q?.targetWords ?? 0;
      out[r.id] = { words, pct: q?.weightPercentage ?? 0 };
    });
    return out;
  }, [rows, overrides, totalWords]);

  useEffect(() => {
    onWordsChange?.(rows.map((r) => ({ label: r.label, words: targets[r.id]?.words ?? 0 })), Object.keys(overrides).length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report only when the numbers change
  }, [JSON.stringify(rows.map((r) => [r.id, targets[r.id]?.words]))]);

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
          const budget = targets[row.id];
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
                {typeof row.marks === "number" && row.marks > 0 ? `${row.marks} Marks (${budget?.pct ?? 0}%)` : `${budget?.pct ?? 0}%`}
              </span>
              {editingWordsId === row.id ? (
                <input
                  autoFocus
                  type="number"
                  min={0}
                  aria-label={`Words for ${row.label}`}
                  defaultValue={budget?.words ?? 0}
                  onBlur={(e) => {
                    const n = Math.round(Number(e.target.value));
                    if (Number.isFinite(n) && n >= 0) setOverrides((o) => ({ ...o, [row.id]: n }));
                    setEditingWordsId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditingWordsId(null);
                  }}
                  className="w-20 shrink-0 rounded-lg border border-neutral-300 dark:border-white/15 bg-transparent px-2 py-1 font-mono text-[11px]"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingWordsId(row.id)}
                  title="Click to set your own word count"
                  aria-label={`Edit words for ${row.label}`}
                  className="shrink-0 font-mono text-[11px] text-emerald-700 dark:text-emerald-300 whitespace-nowrap hover:underline cursor-pointer"
                >
                  ~{(budget?.words ?? 0).toLocaleString()} words
                </button>
              )}
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
                      onClick={() => {
                        setOverrides((o) => {
                          const { [row.id]: _drop, ...rest } = o;
                          return rest;
                        });
                        update(rows.filter((r) => r.id !== row.id));
                      }}
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

/** The marking criteria as a three-column table in plain English. */
export function GradingCriteriaCard({ briefText, rubricText }: { briefText: string; rubricText?: string }) {
  const rows = useMemo(() => parseMarkingCriteria([briefText, rubricText].filter(Boolean).join("\n")), [briefText, rubricText]);
  if (rows.length === 0) return null;
  return (
    <section className={card} aria-label="Grading criteria" data-testid="grading-criteria-card">
      <h3 className={heading}>Grading criteria</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              <th scope="col" className="py-1.5 pr-3 font-semibold">Criterion / Section</th>
              <th scope="col" className="py-1.5 pr-3 font-semibold whitespace-nowrap">Marks &amp; Weight</th>
              <th scope="col" className="py-1.5 font-semibold">What you need to show</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-white/5 text-neutral-800 dark:text-neutral-200">
            {rows.map((r, i) => (
              <tr key={i} className="align-top">
                <td className="py-2 pr-3 font-medium">{r.criterion}</td>
                <td className="py-2 pr-3 whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                  {r.marks ? `${r.marks} marks` : ""}{r.marks && r.weightPercent ? " · " : ""}{r.weightPercent ? `${r.weightPercent}%` : ""}
                </td>
                <td className="py-2 text-neutral-600 dark:text-neutral-400">{r.expectation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
