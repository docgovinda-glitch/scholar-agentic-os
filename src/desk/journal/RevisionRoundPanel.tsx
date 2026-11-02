import { useMemo, useState } from "react";
import { Copy, Download, FileInput, Trash2 } from "lucide-react";
import {
  changedSections,
  parseRevisionRound,
  responseLetter,
  revisionProgress,
  sectionsOf,
  splitReviews,
  type RevisionComment,
  type RevisionRound,
} from "../../domain/journal/revision";

const STATUS: Array<{ value: RevisionComment["status"]; label: string }> = [
  { value: "open", label: "Open" },
  { value: "revised", label: "Revised in the manuscript" },
  { value: "answered", label: "Answered, no change needed" },
  { value: "declined", label: "Not changed (reason given)" },
];

const box = "w-full text-xs p-2 rounded-lg border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--border-strong)]";

/**
 * The journal's real reviews: paste the decision letter, answer each comment,
 * tie it to the sections you changed, and download the response letter.
 */
export default function RevisionRoundPanel({
  stored,
  manuscript,
  title,
  journal,
  onSave,
}: {
  stored: unknown;
  manuscript: string;
  title: string;
  journal?: string;
  onSave: (round: RevisionRound | null) => Promise<void>;
}) {
  const saved = useMemo(() => parseRevisionRound(stored), [stored]);
  const [round, setRound] = useState<RevisionRound | null>(saved);
  const [pasted, setPasted] = useState("");
  const [importing, setImporting] = useState(!saved);
  const [status, setStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const preview = useMemo(() => (pasted.trim() ? splitReviews(pasted) : []), [pasted]);
  const sections = useMemo(() => Object.keys(sectionsOf(manuscript)), [manuscript]);
  const changes = useMemo(() => (round ? changedSections(round.baseline, manuscript) : []), [round, manuscript]);
  const changedTitles = new Set(changes.map((c) => c.title));
  const progress = round ? revisionProgress(round.comments) : null;
  const letter = round ? responseLetter(round, { title, journal }) : "";

  const persist = async (next: RevisionRound | null) => {
    setRound(next);
    try {
      await onSave(next);
      setStatus("Saved.");
    } catch {
      setStatus("Could not save. Your changes are still on screen; try again.");
    }
  };

  const start = () => {
    const comments = preview.map((c, i) => ({ id: `rc-${Date.now().toString(36)}-${i}`, ...c, response: "", status: "open" as const, sections: [] }));
    void persist({ round: (round?.round ?? 0) + 1, importedAt: new Date().toISOString(), baseline: sectionsOf(manuscript), comments });
    setImporting(false);
    setPasted("");
  };

  const patch = (id: string, p: Partial<RevisionComment>) => {
    if (!round) return;
    setRound({ ...round, comments: round.comments.map((c) => (c.id === id ? { ...c, ...p } : c)) });
    setStatus(null);
  };
  const save = () => round && void persist(round);

  const download = () => {
    const url = URL.createObjectURL(new Blob([letter], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Response_to_reviewers_round_${round?.round ?? 1}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-label="Reviews from the journal" className="bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] rounded-2xl p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--border-subtle)] pb-4">
        <div>
          <h2 className="text-sm font-bold text-[color:var(--text-primary)]">Reviews from the journal{round ? ` · revision ${round.round}` : ""}</h2>
          <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
            Paste the reviewers' comments from the decision letter. Answer each one, note where the manuscript changed, and download the point-by-point response.
          </p>
        </div>
        {round && progress && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${progress.open.length ? "bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)]" : "bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)]"}`}>
            {progress.done} of {progress.total} answered
          </span>
        )}
      </div>

      {importing ? (
        <div className="space-y-2">
          <label htmlFor="decision-letter" className="block text-xs font-semibold text-[color:var(--text-primary)]">
            Reviewers' comments
          </label>
          <textarea
            id="decision-letter"
            rows={8}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={"Reviewer 1\n1. …\n2. …\n\nReviewer 2\n- …"}
            className={box}
          />
          <p className="text-[11px] text-[color:var(--text-muted)]">
            {pasted.trim()
              ? preview.length
                ? `${preview.length} comment${preview.length === 1 ? "" : "s"} from ${new Set(preview.map((p) => p.reviewer)).size} reviewer${new Set(preview.map((p) => p.reviewer)).size === 1 ? "" : "s"}. Check them below before starting.`
                : 'No reviewer headings found. Start each reviewer with a line like "Reviewer 1" or "Referee #2".'
              : "Lines like \"Reviewer 1\", \"Referee #2\" or \"Editor\" start a reviewer; numbered or bulleted points become separate comments. Text before the first reviewer is ignored."}
          </p>
          {preview.length > 0 && (
            <ol className="max-h-56 overflow-y-auto text-[11px] text-[color:var(--text-secondary)] space-y-1 border border-[color:var(--border-subtle)] rounded-lg p-2">
              {preview.map((p, i) => (
                <li key={i}>
                  <strong>{p.reviewer}, comment {p.number}:</strong> {p.text}
                </li>
              ))}
            </ol>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={start} disabled={preview.length === 0} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[color:var(--text-primary)] text-[color:var(--surface-canvas)] disabled:opacity-50 cursor-pointer">
              <FileInput className="w-3.5 h-3.5" aria-hidden="true" />
              {round ? `Start revision ${round.round + 1}` : "Start the revision"}
            </button>
            {round && (
              <button type="button" onClick={() => setImporting(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[color:var(--border-control)] cursor-pointer">
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : round ? (
        <div className="space-y-4">
          {changes.length > 0 && (
            <p className="text-[11px] text-[color:var(--text-secondary)]">
              Changed since the reviews arrived: {changes.map((c) => `${c.title} (${c.kind === "changed" ? `${c.wordsBefore}→${c.wordsAfter} words` : c.kind})`).join(", ")}.
            </p>
          )}
          {Array.from(new Set(round.comments.map((c) => c.reviewer))).map((reviewer) => (
            <div key={reviewer} className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)]">{reviewer}</h3>
              {round.comments
                .filter((c) => c.reviewer === reviewer)
                .map((c) => (
                  <article key={c.id} aria-label={`${reviewer}, comment ${c.number}`} className="p-3 rounded-xl border border-[color:var(--border-subtle)] space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <blockquote className="text-xs text-[color:var(--text-primary)] border-l-2 border-[color:var(--border-strong)] pl-2">
                        <span className="font-semibold">Comment {c.number}.</span> {c.text}
                      </blockquote>
                      <button type="button" aria-label={`Remove ${reviewer} comment ${c.number}`} onClick={() => void persist({ ...round, comments: round.comments.filter((x) => x.id !== c.id) })} className="p-1 rounded text-[color:var(--text-muted)] hover:text-[color:var(--state-danger)] cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                    <textarea
                      aria-label={`Response to ${reviewer} comment ${c.number}`}
                      rows={3}
                      value={c.response}
                      onChange={(e) => patch(c.id, { response: e.target.value })}
                      onBlur={save}
                      placeholder="Your reply to this comment"
                      className={box}
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-[11px] text-[color:var(--text-secondary)] flex items-center gap-1.5">
                        Status
                        <select
                          aria-label={`Status of ${reviewer} comment ${c.number}`}
                          value={c.status}
                          onChange={(e) => {
                            const next = { ...round, comments: round.comments.map((x) => (x.id === c.id ? { ...x, status: e.target.value as RevisionComment["status"] } : x)) };
                            void persist(next);
                          }}
                          className="text-[11px] p-1 rounded border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)]"
                        >
                          {STATUS.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {sections.length > 0 && (
                        <fieldset className="flex flex-wrap items-center gap-1.5">
                          <legend className="sr-only">Sections changed for {reviewer} comment {c.number}</legend>
                          <span className="text-[11px] text-[color:var(--text-secondary)]">Changed in:</span>
                          {sections.map((t) => {
                            const on = c.sections.includes(t);
                            return (
                              <button
                                key={t}
                                type="button"
                                aria-pressed={on}
                                onClick={() => {
                                  const next = { ...round, comments: round.comments.map((x) => (x.id === c.id ? { ...x, sections: on ? x.sections.filter((s) => s !== t) : [...x.sections, t] } : x)) };
                                  void persist(next);
                                }}
                                title={changedTitles.has(t) ? "Changed since the reviews arrived" : "Not changed since the reviews arrived"}
                                className={`px-2 py-0.5 rounded-full text-[10px] border cursor-pointer ${on ? "bg-[color:var(--accent-subtle)] border-[color:var(--accent)] text-[color:var(--accent)]" : "border-[color:var(--border-subtle)] text-[color:var(--text-muted)]"}`}
                              >
                                {t}
                                {changedTitles.has(t) ? " •" : ""}
                              </button>
                            );
                          })}
                        </fieldset>
                      )}
                    </div>
                  </article>
                ))}
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--border-subtle)] pt-3">
            <button type="button" onClick={download} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[color:var(--border-control)] cursor-pointer">
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Response letter (.md)
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(letter);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[color:var(--border-control)] cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
              {copied ? "Copied" : "Copy letter"}
            </button>
            <button type="button" onClick={() => setImporting(true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[color:var(--border-control)] cursor-pointer">
              New round of reviews
            </button>
            {progress && progress.open.length > 0 && (
              <span className="text-[11px] text-[color:var(--state-warning)]">
                {progress.open.length} comment{progress.open.length === 1 ? "" : "s"} still need{progress.open.length === 1 ? "s" : ""} a reply; the letter marks {progress.open.length === 1 ? "it" : "them"} "Not yet written".
              </span>
            )}
            {status && <span role="status" className="text-[11px] text-[color:var(--text-muted)]">{status}</span>}
          </div>
        </div>
      ) : null}
    </section>
  );
}
