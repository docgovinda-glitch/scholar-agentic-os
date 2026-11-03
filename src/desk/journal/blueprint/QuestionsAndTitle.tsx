import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";

const field =
  "w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-xl px-3 py-2 text-xs text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:border-[color:var(--accent)] outline-none";

/**
 * The study's research questions and working title, always editable. AI
 * suggestions (when a gap is chosen) are offered beside them, never imposed.
 */
export default function QuestionsAndTitle({
  questions,
  onQuestions,
  title,
  onTitle,
  titleOptions,
  suggest,
  suggesting,
  suggestError,
}: {
  questions: string[];
  onQuestions: (next: string[]) => void;
  title: string;
  onTitle: (v: string) => void;
  titleOptions: string[];
  /** Absent when there is no gap to suggest from. */
  suggest?: () => void;
  suggesting: boolean;
  suggestError: string | null;
}) {
  const list = questions.length ? questions : [""];
  const setAt = (i: number, v: string) => onQuestions(list.map((q, j) => (j === i ? v : q)));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-bold text-[color:var(--text-primary)]">Research questions</span>
          {suggest && (
            <button type="button" onClick={suggest} disabled={suggesting} className="studio-btn">
              {suggesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />}
              {suggesting ? "Suggesting…" : "Suggest questions and titles for this gap"}
            </button>
          )}
        </div>
        {suggestError && (
          <p role="alert" className="text-xs text-[color:var(--state-danger)]">
            {suggestError}
          </p>
        )}
        <ol className="space-y-2">
          {list.map((q, i) => (
            <li key={i} className="flex gap-2 items-start">
              <span className="text-[11px] font-mono text-[color:var(--text-muted)] pt-2 w-8 shrink-0">RQ{i + 1}</span>
              <textarea aria-label={`Research question ${i + 1}`} rows={2} value={q} onChange={(e) => setAt(i, e.target.value)} placeholder="What do you want to find out?" className={`${field} resize-y`} />
              {list.length > 1 && (
                <button type="button" aria-label={`Remove research question ${i + 1}`} onClick={() => onQuestions(list.filter((_, j) => j !== i))} className="p-2 rounded-lg hover:bg-[color:var(--surface-hover)] cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ol>
        {list.length < 5 && (
          <button type="button" onClick={() => onQuestions([...list, ""])} className="studio-btn">
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Add question
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="bp-title" className="text-xs font-bold text-[color:var(--text-primary)]">
          Working article title
        </label>
        <input id="bp-title" value={title} onChange={(e) => onTitle(e.target.value)} placeholder="A specific, searchable title" className={`${field} font-semibold`} />
        {titleOptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Title suggestions">
            {titleOptions.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onTitle(t)}
                aria-pressed={t === title}
                className="px-2.5 py-1 rounded-lg text-[11px] text-left border border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] cursor-pointer"
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
