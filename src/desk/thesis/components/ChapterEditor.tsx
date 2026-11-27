import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Loader2, Sparkles, Square, Trash2 } from "lucide-react";
import { requestAppConfirm } from "../../../components/ui/FeedbackSystem";
import SectionTextEditor from "../../editor/SectionTextEditor";
import { countWords, type ThesisChapter } from "../thesisModel";

export interface ChapterDraftResult {
  content: string;
  bibliography: string;
}

export interface ChapterDraftLive {
  onToken?: (text: string) => void;
  onReset?: () => void;
  signal?: AbortSignal;
}

/** Thesis text keeps its own headings (#, ##, ###); citations are already formatted text. */
const plainCitationLabel = (id: string) => id;

/**
 * Where the thesis is written: every chapter's title, word target, status and
 * text, with an AI draft per chapter. An AI draft never silently replaces the
 * student's text: replacing written text asks first. While the AI drafts, its
 * words appear as they are written (read-only); Stop leaves the chapter as it was.
 */
export default function ChapterEditor({
  chapters,
  onUpdate,
  onMove,
  onRemove,
  onDraft,
  canDraft,
  draftBlocker,
}: {
  chapters: ThesisChapter[];
  onUpdate: (index: number, patch: Partial<ThesisChapter>) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onRemove: (index: number) => void;
  onDraft: (index: number, guidance: string, live: ChapterDraftLive) => Promise<ChapterDraftResult>;
  canDraft: boolean;
  draftBlocker?: string;
}) {
  const [open, setOpen] = useState<number | null>(chapters.length ? 0 : null);
  const [guidance, setGuidance] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});
  /** The words the AI has written so far, for the chapter being drafted. */
  const [liveText, setLiveText] = useState("");
  const stopRef = useRef<AbortController | null>(null);

  async function draft(i: number) {
    const ch = chapters[i];
    if (countWords(ch.content) > 0) {
      const ok = await requestAppConfirm({
        title: `Replace Chapter ${ch.chapterNumber}?`,
        message: "The AI draft will replace the text you have in this chapter. This can't be undone.",
        confirmLabel: "Replace",
        variant: "danger",
      });
      if (!ok) return;
    }
    const stop = new AbortController();
    stopRef.current = stop;
    setBusy(i);
    setLiveText("");
    setErrors((e) => ({ ...e, [i]: "" }));
    try {
      const result = await onDraft(i, guidance[i] ?? "", {
        onToken: (text) => setLiveText((t) => t + text),
        onReset: () => setLiveText(""),
        signal: stop.signal,
      });
      onUpdate(i, { content: result.content, bibliography: result.bibliography, status: ch.status === "not_started" ? "drafting" : ch.status });
    } catch (err) {
      const message = stop.signal.aborted
        ? "Stopped. The chapter was left as it was."
        : err instanceof Error
          ? err.message
          : "The chapter could not be drafted.";
      setErrors((e) => ({ ...e, [i]: message }));
    } finally {
      stopRef.current = null;
      setBusy(null);
      setLiveText("");
    }
  }

  if (chapters.length === 0) {
    return <p className="text-xs text-tertiary">No chapters yet. Set up the structure in Proposal &amp; Framing, or add a chapter there.</p>;
  }

  return (
    <div className="space-y-3" data-testid="thesis-chapter-editor">
      {chapters.map((ch, i) => {
        const words = countWords(ch.content);
        const pct = ch.targetWordCount > 0 ? Math.min(100, Math.round((words / ch.targetWordCount) * 100)) : 0;
        const isOpen = open === i;
        return (
          <section key={ch.chapterNumber} className="apple-card overflow-hidden" aria-labelledby={`chapter-${i}-heading`}>
            <div className="flex items-center gap-2 p-3">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                aria-controls={`chapter-${i}-body`}
                className="p-1 rounded-lg hover:bg-surface-hover cursor-pointer"
                aria-label={isOpen ? `Collapse chapter ${ch.chapterNumber}` : `Expand chapter ${ch.chapterNumber}`}
              >
                {isOpen ? <ChevronDown className="w-4 h-4" aria-hidden="true" /> : <ChevronRight className="w-4 h-4" aria-hidden="true" />}
              </button>
              <span className="w-6 h-6 rounded-full bg-primary text-surface font-bold text-xs flex items-center justify-center shrink-0">{ch.chapterNumber}</span>
              <h3 id={`chapter-${i}-heading`} className="flex-1 min-w-0 text-sm font-bold text-primary truncate">{ch.title || `Chapter ${ch.chapterNumber}`}</h3>
              <span className="text-xs tabular-nums text-tertiary shrink-0">
                {words.toLocaleString()} / {ch.targetWordCount.toLocaleString()} words
              </span>
            </div>
            <div className="h-1 bg-surface-hover" aria-hidden="true">
              <div className="h-1 bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>

            {isOpen && (
              <div id={`chapter-${i}-body`} className="p-4 space-y-3 border-t border-border/60">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem_9rem] gap-2">
                  <label className="text-xs font-semibold text-secondary">
                    Title
                    <input
                      value={ch.title}
                      onChange={(e) => onUpdate(i, { title: e.target.value })}
                      className="mt-1 w-full px-3 py-2 text-xs border border-border rounded-xl bg-background text-primary"
                    />
                  </label>
                  <label className="text-xs font-semibold text-secondary">
                    Target words
                    <input
                      type="number"
                      min={0}
                      value={ch.targetWordCount}
                      onChange={(e) => onUpdate(i, { targetWordCount: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      className="mt-1 w-full px-3 py-2 text-xs border border-border rounded-xl bg-background text-primary"
                    />
                  </label>
                  <label className="text-xs font-semibold text-secondary">
                    Status
                    <select
                      value={ch.status}
                      onChange={(e) => onUpdate(i, { status: e.target.value as ThesisChapter["status"] })}
                      className="mt-1 w-full px-3 py-2 text-xs border border-border rounded-xl bg-background text-primary"
                    >
                      <option value="not_started">Not started</option>
                      <option value="drafting">Drafting</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="completed">Completed</option>
                    </select>
                  </label>
                </div>

                <div className="text-xs font-semibold text-secondary">
                  <p id={`chapter-${i}-text-label`} className="mb-1">Chapter text</p>
                  {busy === i ? (
                    <div
                      aria-busy="true"
                      aria-labelledby={`chapter-${i}-text-label`}
                      data-testid="thesis-chapter-live"
                      className="min-h-[14rem] max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-background p-3 text-sm font-normal leading-relaxed text-primary apple-prose-measure"
                    >
                      {liveText || <span className="text-tertiary">Finding sources and starting the draft…</span>}
                    </div>
                  ) : (
                    <SectionTextEditor
                      value={ch.content ?? ""}
                      onChange={(next) => onUpdate(i, { content: next })}
                      ariaLabel={`Chapter ${ch.chapterNumber} text`}
                      placeholder="Write this chapter here, or draft it with your AI below and edit the result."
                      citationLabel={plainCitationLabel}
                      keepHeadingLevels
                      richBlocks
                    />
                  )}
                </div>

                {ch.bibliography?.trim() && (
                  <details className="text-xs">
                    <summary className="cursor-pointer font-semibold text-secondary">References cited in this chapter</summary>
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-secondary">{ch.bibliography}</pre>
                  </details>
                )}

                <div className="rounded-xl bg-surface-hover/60 p-3 space-y-2">
                  <label className="block text-xs font-semibold text-secondary">
                    What this chapter must cover (optional, sent with the AI draft)
                    <input
                      value={guidance[i] ?? ""}
                      onChange={(e) => setGuidance((g) => ({ ...g, [i]: e.target.value }))}
                      placeholder="e.g. compare the two survey waves; keep the ethics section short"
                      className="mt-1 w-full px-3 py-2 text-xs border border-border rounded-xl bg-background text-primary"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void draft(i)}
                      disabled={!canDraft || busy !== null}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-surface text-xs font-semibold disabled:opacity-50 cursor-pointer"
                    >
                      {busy === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />}
                      {busy === i ? "Drafting…" : words > 0 ? "Redraft with AI" : "Draft with AI"}
                    </button>
                    {busy === i && (
                      <button
                        type="button"
                        onClick={() => stopRef.current?.abort()}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs font-semibold text-primary hover:bg-surface cursor-pointer"
                      >
                        <Square className="w-3 h-3" aria-hidden="true" />
                        Stop
                      </button>
                    )}
                    {busy === i && liveText && (
                      <span className="text-xs tabular-nums text-tertiary">{countWords(liveText).toLocaleString()} words so far</span>
                    )}
                    {!canDraft && draftBlocker && <span className="text-xs text-tertiary">{draftBlocker}</span>}
                    <span className="flex-1" />
                    <button type="button" onClick={() => onMove(i, -1)} disabled={i === 0} aria-label={`Move chapter ${ch.chapterNumber} up`} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30 cursor-pointer">
                      <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => onMove(i, 1)} disabled={i === chapters.length - 1} aria-label={`Move chapter ${ch.chapterNumber} down`} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30 cursor-pointer">
                      <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = words === 0 || (await requestAppConfirm({ title: `Remove Chapter ${ch.chapterNumber}?`, message: "Its text will be deleted. This can't be undone.", confirmLabel: "Remove", variant: "danger" }));
                        if (ok) onRemove(i);
                      }}
                      aria-label={`Remove chapter ${ch.chapterNumber}`}
                      className="p-1.5 rounded-lg text-tertiary hover:text-[color:var(--state-danger)] hover:bg-surface cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  {errors[i] && <p role="alert" className="text-xs text-[color:var(--state-danger)]">{errors[i]}</p>}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
