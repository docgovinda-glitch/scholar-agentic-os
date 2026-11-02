import { useState } from "react";
import type { StudioEvidence } from "../studioEvidence";
import { citedReferences } from "../studioEvidence";

/**
 * Sources for the section being written (or all of them), each insertable as a
 * citation, and the reference list for what the manuscript cites so far.
 */
export default function StudioEvidencePanel({
  forUnit,
  all,
  manuscript,
  onInsert,
  onGoToEvidence,
}: {
  forUnit: StudioEvidence[];
  all: StudioEvidence[];
  manuscript: string;
  onInsert: (token: string) => void;
  onGoToEvidence: () => void;
}) {
  const [tab, setTab] = useState<"unit" | "all">(forUnit.length > 0 ? "unit" : "all");
  const list = tab === "unit" ? forUnit : all;
  const { entries, unknownTokens } = citedReferences(manuscript, all);

  return (
    <div className="flex flex-col h-full min-h-0" aria-label="Sources">
      <div className="flex border-b border-[color:var(--border-subtle)] text-xs font-semibold">
        {([["unit", `This section (${forUnit.length})`], ["all", `All sources (${all.length})`]] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={tab === k}
            onClick={() => setTab(k)}
            className={`flex-1 px-3 py-2.5 cursor-pointer border-b-2 ${tab === k ? "border-[color:var(--text-primary)] text-[color:var(--text-primary)]" : "border-transparent text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {list.length === 0 ? (
          <div className="text-xs text-[color:var(--text-muted)] text-center py-6 space-y-2">
            <p>{tab === "unit" ? "No sources are assigned to this section yet." : "No sources or data in this project yet."}</p>
            <button type="button" onClick={onGoToEvidence} className="font-semibold text-[color:var(--text-primary)] underline cursor-pointer">
              Add them in Evidence
            </button>
          </div>
        ) : (
          list.map((e) => (
            <article key={e.id} className="p-3 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)]">
                  {e.isUserData ? "Your data" : "Literature"}
                </span>
                <button
                  type="button"
                  onClick={() => onInsert(e.citationToken)}
                  aria-label={`Cite ${e.title}`}
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-md border border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] cursor-pointer"
                >
                  Cite
                </button>
              </div>
              <h4 className="text-xs font-semibold text-[color:var(--text-primary)] leading-snug">{e.title}</h4>
              <p className="text-[11px] text-[color:var(--text-muted)]">{e.author} · {e.year ?? "n.d."}</p>
              <p className="text-[11px] leading-relaxed text-[color:var(--text-secondary)] line-clamp-4">
                {e.findings || <span className="italic text-[color:var(--text-muted)]">No findings recorded for this source yet.</span>}
              </p>
            </article>
          ))
        )}
      </div>

      <section className="border-t border-[color:var(--border-subtle)] p-3 max-h-[40%] overflow-y-auto" aria-labelledby="studio-references-heading">
        <h3 id="studio-references-heading" className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] mb-2">
          References cited ({entries.length})
        </h3>
        {entries.length === 0 && unknownTokens.length === 0 ? (
          <p className="text-[11px] text-[color:var(--text-muted)]">Citations you insert appear here.</p>
        ) : (
          <ol className="space-y-1.5 text-[11px] leading-snug text-[color:var(--text-secondary)]">
            {entries.map(({ evidence, reference }) => <li key={evidence.id}>{reference}</li>)}
          </ol>
        )}
        {unknownTokens.length > 0 && (
          <p role="status" className="mt-2 text-[11px] text-[color:var(--state-warning)]">
            {unknownTokens.length === 1 ? "1 citation matches" : `${unknownTokens.length} citations match`} no source in this project: {unknownTokens.join(", ")}
          </p>
        )}
      </section>
    </div>
  );
}
