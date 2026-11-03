import { useState } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";
import type { GroundedGap, ScoutPaper } from "../../../domain/journal/blueprintFunnel";
import { findGaps } from "../blueprintApi";

export interface SavedGaps {
  interest: string;
  since: number;
  gaps: GroundedGap[];
  /** Only the papers the kept gaps cite. */
  papers: ScoutPaper[];
  searched: number;
  dropped: number;
}

const TYPE_LABEL: Record<string, string> = {
  empirical: "Empirical",
  theoretical: "Theoretical",
  methodological: "Methodological",
  contextual: "Context or setting",
  population: "Population",
};

/**
 * Step 1 for an explorer: a broad interest in, research gaps out. Each gap
 * shows the recent papers it rests on and the words quoted from them.
 */
export default function GapFinder({
  projectId,
  interest,
  onInterest,
  saved,
  onFound,
  selectedGapId,
  onSelect,
}: {
  projectId: string;
  interest: string;
  onInterest: (v: string) => void;
  saved: SavedGaps | null;
  onFound: (g: SavedGaps) => void;
  selectedGapId: string;
  onSelect: (gap: GroundedGap) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (interest.trim().length < 3 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await findGaps(projectId, interest.trim());
      const cited = new Set(r.gaps.flatMap((g) => g.evidence.map((e) => e.paperKey)));
      onFound({ interest: interest.trim(), since: r.since, gaps: r.gaps, papers: r.papers.filter((p) => cited.has(p.key)), searched: r.papers.length, dropped: r.dropped });
      if (r.gaps.length === 0) setError(`${r.papers.length} recent papers were read, but no gap held up against them. Try different or broader words.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gaps could not be found.");
    } finally {
      setBusy(false);
    }
  };

  const paper = (key: string) => saved?.papers.find((p) => p.key === key);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="bp-interest" className="text-xs font-bold text-[color:var(--text-primary)]">
          Your area of interest
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="bp-interest"
            value={interest}
            onChange={(e) => onInterest(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void run()}
            placeholder="e.g. AI governance in healthcare, Himalayan climate adaptation"
            className="flex-1 bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-xl px-4 py-2 text-xs text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:border-[color:var(--accent)] outline-none"
          />
          <button type="button" onClick={() => void run()} disabled={busy || interest.trim().length < 3} className="studio-btn studio-btn-primary shrink-0">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Search className="w-3.5 h-3.5" aria-hidden="true" />}
            {busy ? "Reading recent papers…" : "Find research gaps"}
          </button>
        </div>
        <p className="text-[11px] text-[color:var(--text-muted)]">
          A few words are enough. Recent papers come from OpenAlex or Crossref; your AI reads them and proposes gaps, each quoting the papers it rests on.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-xs text-[color:var(--state-danger)]">
          {error}
        </p>
      )}

      {saved && saved.gaps.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] text-[color:var(--text-secondary)]" data-testid="gap-basis">
            From {saved.searched} paper{saved.searched === 1 ? "" : "s"} published since {saved.since} on “{saved.interest}”.
            {saved.dropped > 0 ? ` ${saved.dropped} proposed gap${saved.dropped === 1 ? " was" : "s were"} left out because ${saved.dropped === 1 ? "its" : "their"} quotes were not in the papers cited.` : ""}
          </p>
          <ul className="space-y-3" aria-label="Research gaps">
            {saved.gaps.map((gap) => {
              const selected = gap.id === selectedGapId;
              return (
                <li key={gap.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelect(gap)}
                    className={`w-full text-left p-4 rounded-xl border text-xs transition-colors cursor-pointer ${
                      selected
                        ? "border-[color:var(--accent)] ring-1 ring-[color:var(--accent)] bg-[color:var(--surface-raised)]"
                        : "border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] hover:border-[color:var(--border-control)]"
                    }`}
                  >
                    <span className="inline-block mb-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)]">
                      {TYPE_LABEL[gap.type] ?? gap.type}
                    </span>
                    {selected && <span className="ml-2 text-[10px] font-bold text-[color:var(--accent)]">Selected</span>}
                    <span className="block font-semibold text-[color:var(--text-primary)]">{gap.statement}</span>
                    {gap.whyItMatters && <span className="block mt-1 text-[color:var(--text-secondary)]">{gap.whyItMatters}</span>}
                  </button>
                  <ul className="mt-1.5 ml-4 space-y-1" aria-label="Evidence from papers">
                    {gap.evidence.map((e) => {
                      const p = paper(e.paperKey);
                      if (!p) return null;
                      const href = p.doi ? `https://doi.org/${p.doi}` : p.url;
                      return (
                        <li key={e.paperKey} className="text-[11px] text-[color:var(--text-secondary)]">
                          “{e.quote}” —{" "}
                          {href ? (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">
                              {p.title}
                              {p.year ? ` (${p.year})` : ""}
                              <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
                            </a>
                          ) : (
                            `${p.title}${p.year ? ` (${p.year})` : ""}`
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
