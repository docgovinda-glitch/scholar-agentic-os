import { Plus, Trash2 } from "lucide-react";

/**
 * The student's research questions: add, edit, remove. The viva simulator and
 * chapter drafts are built from these, so an empty list is called out.
 */
export default function ResearchQuestionsEditor({
  questions,
  onChange,
}: {
  questions: string[];
  onChange: (next: string[]) => void;
}) {
  const update = (i: number, value: string) => onChange(questions.map((q, j) => (j === i ? value : q)));
  return (
    <div className="apple-card p-5 space-y-3" data-testid="thesis-research-questions">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-primary">Research questions</h3>
        <button
          type="button"
          onClick={() => onChange([...questions, ""])}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-hover hover:bg-border/40 text-primary transition-colors cursor-pointer"
        >
          <Plus className="w-3 h-3" aria-hidden="true" />
          <span>Add question</span>
        </button>
      </div>
      {questions.length === 0 ? (
        <p className="text-xs text-tertiary">
          No research questions yet. Chapter drafts and the viva examiner are built from them, so add at least one.
        </p>
      ) : (
        <ol className="space-y-2">
          {questions.map((q, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-2 text-[11px] font-bold text-tertiary w-8 shrink-0">RQ{i + 1}</span>
              <textarea
                aria-label={`Research question ${i + 1}`}
                rows={2}
                value={q}
                onChange={(e) => update(i, e.target.value)}
                placeholder="What exactly will this thesis find out?"
                className="flex-1 px-3 py-2 text-xs border border-border rounded-xl bg-background text-primary resize-y"
              />
              <button
                type="button"
                onClick={() => onChange(questions.filter((_, j) => j !== i))}
                aria-label={`Remove research question ${i + 1}`}
                className="mt-1.5 p-1.5 rounded-lg text-tertiary hover:text-primary hover:bg-surface-hover cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
