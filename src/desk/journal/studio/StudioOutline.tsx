import { countWords, groupUnits, writingRank, type ManuscriptTexts, type ManuscriptUnit } from "../manuscriptModel";

export const UNSORTED_ID = "__unsorted__";

const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th"];

/**
 * The manuscript's sections and sub-sections with words written against each
 * target. Shown in manuscript order, or in the order authors usually write.
 */
export default function StudioOutline({
  units,
  texts,
  activeId,
  order,
  onOrderChange,
  onSelect,
}: {
  units: ManuscriptUnit[];
  texts: ManuscriptTexts;
  activeId: string;
  order: "manuscript" | "writing";
  onOrderChange: (o: "manuscript" | "writing") => void;
  onSelect: (id: string) => void;
}) {
  const ranks = Array.from(new Set(units.map((u) => writingRank(u.kind)).filter((r) => r < 7))).sort((a, b) => a - b);
  const groups = groupUnits(units, order);

  return (
    <nav aria-label="Manuscript outline" className="flex flex-col h-full min-h-0 w-full min-w-0">
      <div className="px-3 pt-3 pb-2 border-b border-[color:var(--border-subtle)] space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">Outline</div>
        <div role="radiogroup" aria-label="Outline order" className="flex p-0.5 rounded-lg bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[11px] font-semibold">
          {(["manuscript", "writing"] as const).map((o) => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={order === o}
              onClick={() => onOrderChange(o)}
              className={`flex-1 px-2 py-1 rounded-md cursor-pointer ${order === o ? "bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] shadow-2xs" : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"}`}
            >
              {o === "manuscript" ? "Article order" : "Writing order"}
            </button>
          ))}
        </div>
        {order === "writing" && (
          <p className="text-[11px] leading-snug text-[color:var(--text-muted)]">
            Methods and results first, while the work is fresh; the introduction once you know what you found; the abstract last.
          </p>
        )}
      </div>

      <ol className="flex-1 overflow-y-auto p-2 space-y-3">
        {texts.unsorted.trim() && (
          <li>
            <button
              type="button"
              onClick={() => onSelect(UNSORTED_ID)}
              aria-current={activeId === UNSORTED_ID ? "true" : undefined}
              className={`w-full text-left px-2.5 py-2 rounded-lg text-xs cursor-pointer border ${activeId === UNSORTED_ID ? "border-[color:var(--accent-border)] bg-[color:var(--surface-sunken)]" : "border-transparent hover:bg-[color:var(--surface-hover)]"}`}
            >
              <span className="font-semibold text-[color:var(--text-primary)]">Text from your earlier draft</span>
              <span className="block text-[10px] text-[color:var(--text-muted)]">{countWords(texts.unsorted)} words not under a section yet</span>
            </button>
          </li>
        )}
        {groups.map((g) => {
          const rank = writingRank(g.kind);
          const ordinal = rank < 7 ? ORDINAL[ranks.indexOf(rank)] : null;
          const written = g.units.reduce((n, u) => n + countWords(texts.texts[u.id]), 0);
          const target = g.units.reduce((n, u) => n + u.targetWords, 0);
          return (
            <li key={g.sectionId}>
              <div className="flex items-baseline justify-between gap-2 px-2 pb-1">
                <span className="text-[11px] font-bold text-[color:var(--text-primary)] truncate min-w-0">{g.sectionTitle}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {order === "writing" && ordinal && (
                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)]">Write {ordinal}</span>
                  )}
                  <span className="text-[10px] tabular-nums text-[color:var(--text-muted)]">{written}/{target}</span>
                </span>
              </div>
              <ul className="space-y-0.5">
                {g.units.map((u) => {
                  const words = countWords(texts.texts[u.id]);
                  const pct = u.targetWords > 0 ? Math.min(100, Math.round((words / u.targetWords) * 100)) : 0;
                  const active = u.id === activeId;
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(u.id)}
                        aria-current={active ? "true" : undefined}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg cursor-pointer border ${active ? "border-[color:var(--accent-border)] bg-[color:var(--surface-sunken)]" : "border-transparent hover:bg-[color:var(--surface-hover)]"}`}
                      >
                        <span className="flex items-baseline justify-between gap-2 text-xs min-w-0">
                          <span className={`truncate min-w-0 ${active ? "font-semibold text-[color:var(--text-primary)]" : "text-[color:var(--text-secondary)]"}`}>
                            {u.isWholeSection ? "Whole section" : u.title}
                          </span>
                          <span className="text-[10px] tabular-nums text-[color:var(--text-muted)] shrink-0">{words}/{u.targetWords}</span>
                        </span>
                        <span className="mt-1 block h-1 rounded-full bg-[color:var(--surface-sunken)] overflow-hidden" aria-hidden="true">
                          <span className="block h-full rounded-full bg-[color:var(--accent)]" style={{ width: `${pct}%` }} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
