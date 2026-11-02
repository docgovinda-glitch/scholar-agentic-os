import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { requestAppConfirm } from "../../../components/ui/FeedbackSystem";
import { countWords } from "../proposalModel";

/**
 * One proposal section: the applicant's text with a live word count against
 * its target, and an AI draft that never silently replaces written text.
 */
export default function NarrativeSectionEditor({
  id,
  title,
  hint,
  targetWords,
  value,
  onChange,
  onDraft,
  canDraft,
  draftBlocker,
  rows = 10,
}: {
  id: string;
  title: string;
  hint: string;
  targetWords: number;
  value: string;
  onChange: (next: string) => void;
  onDraft: (guidance: string) => Promise<string>;
  canDraft: boolean;
  draftBlocker?: string;
  rows?: number;
}) {
  const [guidance, setGuidance] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const words = countWords(value);

  async function draft() {
    if (words > 0) {
      const ok = await requestAppConfirm({
        title: `Replace ${title}?`,
        message: "The AI draft will replace the text you have in this section. This can't be undone.",
        confirmLabel: "Replace",
        variant: "danger",
      });
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      onChange(await onDraft(guidance));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The section could not be drafted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="apple-card p-5 space-y-2" aria-labelledby={`${id}-label`}>
      <div className="flex items-baseline justify-between gap-2">
        <label id={`${id}-label`} htmlFor={id} className="text-xs font-bold text-primary">{title}</label>
        <span className={`text-[11px] tabular-nums ${words > targetWords * 1.15 ? "text-[color:var(--state-warning)]" : "text-tertiary"}`}>
          {words.toLocaleString()} / ~{targetWords.toLocaleString()} words
        </span>
      </div>
      <p className="text-[11px] text-secondary">{hint}</p>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-3 text-sm leading-relaxed border border-border rounded-xl bg-background text-primary resize-y apple-prose-measure"
      />
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <input
          aria-label={`Guidance for the ${title} draft`}
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          placeholder="Optional: what the AI draft must cover"
          className="flex-1 px-3 py-2 text-xs border border-border rounded-xl bg-background text-primary"
        />
        <button
          type="button"
          onClick={() => void draft()}
          disabled={!canDraft || busy}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-surface text-xs font-semibold disabled:opacity-50 cursor-pointer shrink-0"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />}
          {busy ? "Drafting…" : words > 0 ? `Redraft ${title} with AI` : `Draft ${title} with AI`}
        </button>
      </div>
      {!canDraft && draftBlocker && <p className="text-[11px] text-tertiary">{draftBlocker}</p>}
      {error && <p role="alert" className="text-xs text-[color:var(--state-danger)]">{error}</p>}
    </section>
  );
}
