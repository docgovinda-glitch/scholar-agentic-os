import { useState } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { findJournals, type JournalMatch } from "../blueprintApi";

export interface SavedJournals {
  query: string;
  since: number;
  journals: JournalMatch[];
}

/**
 * Step 2 for an author without a journal: journals that published the most
 * relevant recent articles on the topic, from the public index. What the
 * index does not record (word limit, citation style, review model) is not
 * shown here; it comes from the chosen journal's guidelines.
 */
export default function JournalMatcher({
  projectId,
  query,
  saved,
  onFound,
  selectedName,
  onSelect,
}: {
  projectId: string;
  /** The gap, title and questions, as search words. */
  query: string;
  saved: SavedJournals | null;
  onFound: (r: SavedJournals) => void;
  selectedName: string;
  onSelect: (j: JournalMatch) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (query.trim().length < 3 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await findJournals(projectId, query.trim());
      onFound({ query: query.trim(), since: r.since, journals: r.journals });
      if (r.journals.length === 0) setError("No journals were found for these words. Try the broader interest instead.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Journals could not be found.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={() => void run()} disabled={busy || query.trim().length < 3} className="studio-btn">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Search className="w-3.5 h-3.5" aria-hidden="true" />}
          {busy ? "Searching journals…" : "Find best-fit journals"}
        </button>
        <span className="text-[11px] text-[color:var(--text-muted)]">Ranked by how many recent articles on your topic each journal published (OpenAlex or Crossref). No AI.</span>
      </div>
      {error && (
        <p role="alert" className="text-xs text-[color:var(--state-danger)]">
          {error}
        </p>
      )}
      {saved && saved.journals.length > 0 && (
        <ul className="grid sm:grid-cols-2 gap-3" aria-label="Matching journals">
          {saved.journals.map((j) => {
            const selected = j.name === selectedName;
            return (
              <li
                key={j.id}
                className={`p-4 rounded-xl border text-xs space-y-1.5 ${
                  selected ? "border-[color:var(--accent)] ring-1 ring-[color:var(--accent)]" : "border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)]"
                }`}
              >
                <p className="font-bold text-[color:var(--text-primary)]">{j.name}</p>
                <p className="text-[color:var(--text-secondary)]">
                  {[j.publisher, j.issn ? `ISSN ${j.issn}` : "", j.isOpenAccess === true ? "Open access" : j.isOpenAccess === false ? "Subscription or hybrid" : ""]
                    .filter(Boolean)
                    .join(" · ") || "Publisher not recorded in the index"}
                </p>
                <p className="text-[color:var(--text-secondary)]">{j.rationale}</p>
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <button type="button" onClick={() => onSelect(j)} className={`studio-btn ${selected ? "" : "studio-btn-primary"}`} aria-label={`Select ${j.name}`}>
                    {selected ? "Selected" : "Select journal"}
                  </button>
                  {j.homepage && (
                    <a href={j.homepage} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline text-[color:var(--text-secondary)]">
                      Journal site <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
