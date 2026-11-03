import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { authedJsonFetch } from "../api";
import { textFingerprint, type SupportResult, type SupportVerdict } from "../../domain/journal/citationSupport";

export interface SavedSupport {
  fingerprint: string;
  checkedAt: string;
  truncated: number;
  results: SupportResult[];
}

const VERDICT: Record<SupportVerdict, { label: string; tone: string }> = {
  does_not_support: { label: "Doesn't support", tone: "bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)]" },
  partly: { label: "Partly", tone: "bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)]" },
  cannot_tell: { label: "Can't tell", tone: "bg-[color:var(--surface-sunken)] text-[color:var(--text-muted)]" },
  supports: { label: "Supports", tone: "bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)]" },
};
const ORDER: SupportVerdict[] = ["does_not_support", "partly", "cannot_tell", "supports"];

export function parseSavedSupport(raw: unknown): SavedSupport | null {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return v && typeof v === "object" && Array.isArray((v as SavedSupport).results) ? (v as SavedSupport) : null;
  } catch {
    return null;
  }
}

/**
 * Asks the author's AI whether each cited source supports the sentence that
 * cites it, judged only from what Evidence records about the source. Advice,
 * not a gate: it never blocks export.
 */
export default function CitationSupportPanel({
  projectId,
  manuscript,
  saved,
  titleOf,
  onSave,
}: {
  projectId: string;
  manuscript: string;
  saved: SavedSupport | null;
  titleOf: (id: string) => string;
  onSave: (s: SavedSupport) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSupported, setShowSupported] = useState(false);
  const stale = saved ? saved.fingerprint !== textFingerprint(manuscript) : false;

  const counts = useMemo(() => {
    const c: Record<SupportVerdict, number> = { supports: 0, partly: 0, does_not_support: 0, cannot_tell: 0 };
    for (const r of saved?.results ?? []) c[r.verdict]++;
    return c;
  }, [saved]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/agentic/citations/support`, "POST", {});
      const body = (await res.json().catch(() => ({}))) as { error?: string; results?: SupportResult[]; truncated?: number; fingerprint?: string };
      if (!res.ok || !body.results) throw new Error(body.error || "The citations could not be checked.");
      await onSave({ fingerprint: body.fingerprint ?? textFingerprint(manuscript), checkedAt: new Date().toISOString(), truncated: body.truncated ?? 0, results: body.results });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The citations could not be checked.");
    } finally {
      setBusy(false);
    }
  };

  const shown = (saved?.results ?? []).filter((r) => showSupported || r.verdict !== "supports").sort((a, b) => ORDER.indexOf(a.verdict) - ORDER.indexOf(b.verdict));

  return (
    <section aria-label="Do sources support their sentences" className="p-4 rounded-xl border border-[color:var(--border-control)] bg-[color:var(--surface-raised)] flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-bold text-sm text-[color:var(--text-primary)]">Do sources support their sentences?</span>
        {saved && (
          <span className="text-[11px] text-[color:var(--text-muted)]">
            {counts.does_not_support} don't · {counts.partly} partly · {counts.cannot_tell} can't tell · {counts.supports} support
          </span>
        )}
      </div>
      <p className="text-[11px] text-[color:var(--text-secondary)]">
        Your AI reads each sentence that cites a source next to what Evidence records about that source (its findings or abstract), and must quote that record for its verdict. A verdict whose quote isn't in the record is discarded. This is advice for you to check; it doesn't block export.
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={run}
          disabled={busy || !manuscript.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[color:var(--border-control)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-50 cursor-pointer"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />}
          {busy ? "Checking…" : saved ? "Check again" : "Check with my AI"}
        </button>
        {saved && (
          <span className={`text-[11px] ${stale ? "text-[color:var(--state-warning)]" : "text-[color:var(--text-muted)]"}`}>
            {stale ? "The text has changed since this check; run it again." : `Checked ${new Date(saved.checkedAt).toLocaleString()}.`}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-[color:var(--state-danger)]">
          {error}
        </p>
      )}
      {saved && saved.truncated > 0 && <p className="text-[11px] text-[color:var(--text-muted)]">The first 40 citations were checked; {saved.truncated} more were not.</p>}
      {saved && (
        <ul aria-label="Citation checks" className="max-h-80 overflow-y-auto space-y-2">
          {shown.map((r) => (
            <li key={r.key} className="p-2 rounded-lg border border-[color:var(--border-subtle)] space-y-1">
              <div className="flex items-start gap-2">
                <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${VERDICT[r.verdict].tone}`}>{VERDICT[r.verdict].label}</span>
                <span className="text-xs text-[color:var(--text-primary)]">{r.sentence}</span>
              </div>
              <p className="text-[11px] text-[color:var(--text-muted)]">
                Source: {titleOf(r.citeId)}. {r.reason}
              </p>
              {r.quote && <blockquote className="text-[11px] text-[color:var(--text-secondary)] border-l-2 border-[color:var(--border-strong)] pl-2">“{r.quote}”</blockquote>}
            </li>
          ))}
        </ul>
      )}
      {saved && counts.supports > 0 && (
        <button type="button" onClick={() => setShowSupported((v) => !v)} className="self-start text-[11px] underline text-[color:var(--text-secondary)] cursor-pointer">
          {showSupported ? "Hide" : "Show"} the {counts.supports} that support their sentence
        </button>
      )}
    </section>
  );
}
