import { memo, type ReactNode } from "react";
import { parseProseBlocks, type ProseBlock } from "../../../shared/proseBlocks";
import { groupUnits, type ManuscriptTexts, type ManuscriptUnit } from "../../../domain/journal/manuscriptModel";

const INLINE = /(\[CITE:[^\]]+\]|\[(?:FIG|TAB):[^\]]+\]|\*\*[^*]+\*\*|\*[^*]+\*|<u>[\s\S]*?<\/u>)/g;

/** Bold, italic, underline, citations (as "Author, Year") and figure references (as "Figure 1"). */
function inline(text: string, cite: (id: string) => string, figure: (token: string) => string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (!part) return null;
    if (part.startsWith("[CITE:")) {
      const id = part.slice(6, -1);
      return (
        <span key={i} className="cite-chip" title={`Citation: ${id}`}>
          {cite(id)}
        </span>
      );
    }
    if (/^\[(FIG|TAB):/.test(part)) return <span key={i}>{figure(part)}</span>;
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("<u>")) return <u key={i}>{part.slice(3, -4)}</u>;
    if (part.startsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

function Block({ b, cite, figure }: { b: ProseBlock; cite: (id: string) => string; figure: (t: string) => string }) {
  const align = "align" in b && b.align ? ({ textAlign: b.align } as const) : undefined;
  switch (b.kind) {
    case "heading":
      return <h4 style={align} className="mt-4 font-semibold text-[color:var(--text-primary)]">{inline(b.text, cite, figure)}</h4>;
    case "quote":
      return <blockquote className="border-l-2 border-[color:var(--border-subtle)] pl-4 italic">{inline(b.text, cite, figure)}</blockquote>;
    case "bullets":
      return <ul className="list-disc pl-6">{b.items.map((t, i) => <li key={i}>{inline(t, cite, figure)}</li>)}</ul>;
    case "numbered":
      return <ol className="list-decimal pl-6">{b.items.map((t, i) => <li key={i}>{inline(t, cite, figure)}</li>)}</ol>;
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse">
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => {
                    const Cell = b.header && i === 0 ? "th" : "td";
                    return <Cell key={j} className="border border-[color:var(--border-subtle)] px-2 py-1 text-left">{inline(c, cite, figure)}</Cell>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return <p style={align}>{inline(b.text, cite, figure)}</p>;
  }
}

/**
 * The whole manuscript as a reader sees it, in article order: section and
 * sub-section headings, formatted text, citations and figure references.
 */
function ManuscriptReader({
  units,
  texts,
  citationLabel,
  figureLabel,
}: {
  units: ManuscriptUnit[];
  texts: ManuscriptTexts;
  citationLabel: (id: string) => string;
  figureLabel: (token: string) => string;
}) {
  const body = (text: string) => parseProseBlocks(text).map((b, i) => <Block key={i} b={b} cite={citationLabel} figure={figureLabel} />);
  const groups = groupUnits(units, "manuscript")
    .map((g) => ({ ...g, units: g.units.filter((u) => (texts.texts[u.id] ?? "").trim()) }))
    .filter((g) => g.units.length > 0);
  const empty = groups.length === 0 && !texts.unsorted.trim() && !texts.backMatter?.trim();

  return (
    <article aria-label="Full manuscript" className="max-w-3xl mx-auto px-4 sm:px-8 py-8 font-serif text-[15px] leading-7 text-[color:var(--text-primary)] space-y-4">
      {empty && <p className="font-sans text-sm text-[color:var(--text-muted)]">Nothing written yet. Sections appear here as you write them.</p>}
      {texts.unsorted.trim() && <section className="space-y-4">{body(texts.unsorted)}</section>}
      {groups.map((g) => (
        <section key={g.sectionId} className="space-y-4">
          <h2 className="font-sans text-lg font-semibold tracking-tight">{g.sectionTitle}</h2>
          {g.units.map((u) => (
            <div key={u.id} className="space-y-4">
              {!u.isWholeSection && <h3 className="font-sans text-base font-semibold">{u.title}</h3>}
              {body(texts.texts[u.id] ?? "")}
            </div>
          ))}
        </section>
      ))}
      {texts.backMatter?.trim() && <section className="space-y-4 border-t border-[color:var(--border-subtle)] pt-4">{body(texts.backMatter)}</section>}
    </article>
  );
}

export default memo(ManuscriptReader);
