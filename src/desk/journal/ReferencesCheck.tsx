import { Loader2, ShieldCheck } from "lucide-react";
import type { CitationAudit, CitationAuditRow, CitationState } from "../../domain/journal/referenceAudit";

const STATE: Record<CitationState, { label: string; tone: "ok" | "warn" | "bad" | "muted"; text: string }> = {
  verified: { label: "Registered", tone: "ok", text: "Record from the DOI registry; no retraction or concern on record." },
  data: { label: "Your data", tone: "ok", text: "Your own dataset." },
  missing: { label: "No source", tone: "bad", text: "Cited in the text, but no source in Evidence has this id. Remove the citation or add the source." },
  retracted: { label: "Retracted", tone: "bad", text: "A retraction is on record. Remove the citation, or confirm you cite it to discuss the retraction." },
  concern: { label: "Concern", tone: "warn", text: "An expression of concern is on record." },
  corrected: { label: "Corrected", tone: "warn", text: "A correction is on record; make sure you cite the corrected version." },
  unchecked: { label: "Not checked", tone: "warn", text: "Has a DOI that hasn't been checked yet." },
  unregistered: { label: "No DOI", tone: "muted", text: "No DOI, so the reference uses the details as entered in Evidence." },
};

const TONE = {
  ok: "bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)]",
  warn: "bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)]",
  bad: "bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)]",
  muted: "bg-[color:var(--surface-sunken)] text-[color:var(--text-muted)]",
};

function Row({ row, acknowledged, onAcknowledge }: { row: CitationAuditRow; acknowledged: boolean; onAcknowledge: (id: string, on: boolean) => void }) {
  const s = STATE[row.state];
  return (
    <li className="py-2 flex flex-col gap-1 border-b border-[color:var(--border-subtle)] last:border-0">
      <div className="flex items-start gap-2">
        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${TONE[s.tone]}`}>{s.label}</span>
        <span className="text-xs text-[color:var(--text-primary)] min-w-0">
          {row.title || <code className="text-[11px]">[CITE:{row.id}]</code>}
        </span>
      </div>
      <p className="text-[11px] text-[color:var(--text-muted)] pl-1">
        {s.text}
        {row.notice && (
          <>
            {" "}
            <a href={row.notice} target="_blank" rel="noopener noreferrer" className="underline">
              Notice
            </a>
          </>
        )}
      </p>
      {row.state === "retracted" && (
        <label className="flex items-center gap-2 text-[11px] text-[color:var(--text-secondary)] pl-1">
          <input type="checkbox" checked={acknowledged} onChange={(e) => onAcknowledge(row.id, e.target.checked)} />
          I cite this paper to discuss its retraction
        </label>
      )}
    </li>
  );
}

/**
 * Every citation in the manuscript, what it points to, and whether the
 * registry lists a retraction. Export waits until nothing here blocks it.
 */
export default function ReferencesCheck({
  audit,
  references,
  styleLabel,
  numbered,
  hasText,
  canCheck,
  checking,
  checkError,
  lastChecked,
  onCheck,
  acknowledged,
  onAcknowledge,
}: {
  audit: CitationAudit;
  references: string[];
  styleLabel: string;
  /** IEEE / Vancouver number their list; author-date styles don't. */
  numbered: boolean;
  hasText: boolean;
  canCheck: boolean;
  checking: boolean;
  checkError: string | null;
  lastChecked?: string;
  onCheck: () => void;
  acknowledged: string[];
  onAcknowledge: (id: string, on: boolean) => void;
}) {
  const n = audit.rows.length;
  const pill = !hasText
    ? { tone: TONE.muted, text: "Nothing to check yet" }
    : n === 0
    ? { tone: TONE.muted, text: "No citations in the text" }
    : audit.blocking > 0
    ? { tone: TONE.bad, text: `${audit.blocking} to fix before export` }
    : audit.warnings > 0
    ? { tone: TONE.warn, text: `${n} cited · ${audit.warnings} to review` }
    : { tone: TONE.ok, text: `${n} cited · all resolved` };

  return (
    <section aria-label="References" className="p-4 rounded-xl border border-[color:var(--border-control)] bg-[color:var(--surface-raised)] flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-bold text-sm text-[color:var(--text-primary)]">2. References</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${pill.tone}`}>{pill.text}</span>
      </div>

      {n > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={onCheck}
            disabled={!canCheck || checking}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[color:var(--border-control)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-50 cursor-pointer"
          >
            {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />}
            {checking ? "Checking…" : "Check DOIs and retractions"}
          </button>
          <span className="text-[11px] text-[color:var(--text-muted)]">
            {canCheck
              ? `Looks up each DOI at Crossref.${lastChecked ? ` Last checked ${new Date(lastChecked).toLocaleString()}.` : ""}`
              : "None of the cited sources has a DOI to check."}
          </span>
        </div>
      )}
      {checkError && (
        <p role="alert" className="text-xs text-[color:var(--state-danger)]">
          {checkError}
        </p>
      )}

      {n > 0 && (
        <ul aria-label="Citations" className="max-h-72 overflow-y-auto pr-1">
          {audit.rows.map((r) => (
            <Row key={r.id} row={r} acknowledged={acknowledged.includes(r.id)} onAcknowledge={onAcknowledge} />
          ))}
        </ul>
      )}

      {audit.uncited.length > 0 && (
        <p className="text-[11px] text-[color:var(--text-muted)]">
          {audit.uncited.length} {audit.uncited.length === 1 ? "source is" : "sources are"} in Evidence but not cited; {audit.uncited.length === 1 ? "it stays" : "they stay"} out of the reference list.
        </p>
      )}

      {references.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-[color:var(--text-secondary)]">
            Reference list ({styleLabel}, {references.length} {references.length === 1 ? "entry" : "entries"})
          </summary>
          <ol className={`mt-2 space-y-1.5 text-[color:var(--text-primary)] font-serif ${numbered ? "list-decimal pl-5" : "list-none pl-0"}`}>
            {references.map((r, i) => (
              <li key={i}>{r.replace(/\*([^*]+)\*/g, "$1")}</li>
            ))}
          </ol>
          <p className="mt-2 text-[11px] text-[color:var(--text-muted)]">
            Exports use this list and turn each citation into its in-text form. A References section already in the text is replaced by it.
          </p>
        </details>
      )}
    </section>
  );
}
