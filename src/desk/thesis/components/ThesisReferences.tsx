import { useState } from "react";
import { Copy, Loader2, RefreshCw, Trash2 } from "lucide-react";
import AddByDoi from "../../journal/AddByDoi";
import { checkDois } from "../../journal/referenceApi";
import { formatEntry, type StyleKey } from "../../../domain/journal/citationStyles";
import type { ReferenceRecord } from "../../../domain/journal/references";
import type { ThesisChapter } from "../thesisModel";
import { THESIS_STYLES, citeTag, renderThesis, uncitedRecords } from "../thesisReferences";

const STATUS: Record<string, { text: string; tone: string } | undefined> = {
  clean: { text: "No retraction on record", tone: "bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)]" },
  retracted: { text: "Retracted", tone: "bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)]" },
  concern: { text: "Expression of concern", tone: "bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)]" },
  corrected: { text: "Corrected", tone: "bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)]" },
  unknown: { text: "Not checked", tone: "bg-[color:var(--surface-sunken)] text-[color:var(--text-muted)]" },
};

/** A formatted entry with its *italic* parts (journal, volume, book title) in italics. */
const Entry = ({ text }: { text: string }) => (
  <>{text.split(/\*([^*]+)\*/).map((part, i) => (i % 2 === 1 ? <em key={i}>{part}</em> : part))}</>
);

/**
 * The thesis reference list: sources added from their DOIs (the registered
 * record, with any retraction on record), cited in chapter text with a tag,
 * and formatted in the chosen style when exported.
 */
export default function ThesisReferences({
  projectId,
  records,
  style,
  chapters,
  onRecords,
  onStyle,
}: {
  projectId: string;
  records: Record<string, ReferenceRecord>;
  style: StyleKey;
  chapters: ThesisChapter[];
  onRecords: (next: Record<string, ReferenceRecord>) => void;
  onStyle: (next: StyleKey) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const list = Object.values(records).sort((a, b) => formatEntry(a, "apa").localeCompare(formatEntry(b, "apa")));
  const uncited = new Set(uncitedRecords(chapters, records).map((r) => r.id));
  const { missing } = renderThesis(chapters, records, style);
  const withDoi = list.filter((r) => r.doi);

  const recheck = async () => {
    setChecking(true);
    setNote(null);
    try {
      const { results } = await checkDois(projectId, withDoi.map((r) => r.doi!));
      const next = { ...records };
      for (const r of withDoi) if (results[r.doi!]) next[r.id] = { ...r, integrity: results[r.doi!] };
      onRecords(next);
      const flagged = Object.values(results).filter((x) => x.status === "retracted" || x.status === "concern").length;
      setNote(flagged ? `${flagged} source${flagged === 1 ? " has" : "s have"} a retraction or concern on record.` : "No retraction or concern on record at Crossref.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "The DOIs could not be checked.");
    } finally {
      setChecking(false);
    }
  };

  const copy = (id: string) => {
    void navigator.clipboard?.writeText(citeTag(id)).catch(() => undefined);
    setNote(`Copied ${citeTag(id)}. Paste it into a chapter where you cite this source.`);
  };

  return (
    <section aria-label="References" className="apple-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-primary">References</h3>
          <p className="text-xs text-secondary mt-0.5 max-w-prose">
            Add each source from its DOI; the record comes from Crossref or DataCite. Cite it in a chapter with its tag, and the export
            writes the citation and the reference list in your style.
          </p>
        </div>
        <label className="text-[11px] font-semibold text-secondary">
          Citation style
          <select
            value={style}
            onChange={(e) => onStyle(e.target.value as StyleKey)}
            className="ml-2 px-2 py-1 rounded-lg border border-border bg-background text-primary text-xs"
          >
            {THESIS_STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <AddByDoi
        projectId={projectId}
        onAdded={async (record) => {
          const exists = Boolean(records[record.id]);
          onRecords({ ...records, [record.id]: record });
          return exists ? "exists" : "added";
        }}
      />

      {list.length > 0 && (
        <>
          <ul className="space-y-2" aria-label="Reference list">
            {list.map((r) => {
              const status = r.integrity ? STATUS[r.integrity.status] : STATUS.unknown;
              return (
                <li key={r.id} className="p-3 rounded-xl bg-surface-hover text-xs space-y-1.5">
                  <p className="text-primary">
                    <Entry text={formatEntry(r, style)} />
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {status && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${status.tone}`}>{status.text}</span>}
                    {uncited.has(r.id) && <span className="text-[10px] text-[color:var(--text-muted)]">Not cited in any chapter yet</span>}
                    <code className="text-[10px] text-secondary">{citeTag(r.id)}</code>
                    <button type="button" onClick={() => copy(r.id)} aria-label={`Copy citation tag for ${r.title}`} className="p-1 rounded hover:bg-surface cursor-pointer">
                      <Copy className="w-3 h-3" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = { ...records };
                        delete next[r.id];
                        onRecords(next);
                      }}
                      aria-label={`Remove ${r.title}`}
                      className="p-1 rounded hover:bg-surface cursor-pointer ml-auto"
                    >
                      <Trash2 className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {withDoi.length > 0 && (
            <button
              type="button"
              onClick={recheck}
              disabled={checking}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-surface-hover disabled:opacity-50 cursor-pointer"
            >
              {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
              Check retractions again
            </button>
          )}
        </>
      )}

      {missing.length > 0 && (
        <p role="alert" className="text-xs text-[color:var(--state-danger)]">
          Chapters cite tags with no source in this list: {missing.map(citeTag).join(", ")}. Add the source or correct the tag; until then the tag
          is printed as written.
        </p>
      )}
      {note && (
        <p role="status" className="text-xs text-secondary">
          {note}
        </p>
      )}
    </section>
  );
}
