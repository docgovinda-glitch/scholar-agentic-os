import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { lookupDoi } from "./referenceApi";
import type { ReferenceRecord } from "../../domain/journal/references";

const NOTICE: Partial<Record<string, string>> = {
  retracted: "Crossref lists a retraction for this paper. It was added so you can decide; cite it only to discuss the retraction.",
  concern: "Crossref lists an expression of concern for this paper.",
  corrected: "Crossref lists a correction for this paper; check the corrected version.",
  unknown: "Retraction status could not be checked for this record.",
};

/**
 * Adds a source from its DOI: the registered record (authors, year, journal,
 * volume, pages) comes from Crossref or DataCite, not from typing.
 */
export default function AddByDoi({
  projectId,
  onAdded,
}: {
  projectId: string;
  onAdded: (record: ReferenceRecord, abstract: string) => Promise<"added" | "exists">;
}) {
  const [doi, setDoi] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);

  const add = async () => {
    if (!doi.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const { record, abstract } = await lookupDoi(projectId, doi);
      const result = await onAdded(record, abstract);
      const who = record.authors[0]?.family ?? "Untitled";
      const name = `${who}${record.authors.length > 1 ? " et al." : ""}, ${record.year ?? "n.d."}`;
      if (result === "exists") {
        setMessage({ tone: "warn", text: `${name} is already in your sources; its record was updated.` });
      } else {
        const notice = record.integrity ? NOTICE[record.integrity.status] : undefined;
        setMessage(notice ? { tone: "warn", text: `Added ${name}. ${notice}` } : { tone: "ok", text: `Added ${name}: “${record.title}”.` });
      }
      setDoi("");
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "The DOI could not be looked up." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          aria-label="DOI"
          value={doi}
          onChange={(e) => setDoi(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="10.1038/s41586-020-2649-2 or https://doi.org/…"
          className="flex-1 bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-xl px-4 py-2 text-xs text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:border-[color:var(--accent)] outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !doi.trim()}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-[color:var(--border-control)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-50 cursor-pointer shrink-0"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Plus className="w-3.5 h-3.5" aria-hidden="true" />}
          {busy ? "Looking up…" : "Add by DOI"}
        </button>
      </div>
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`text-xs ${message.tone === "ok" ? "text-[color:var(--text-secondary)]" : message.tone === "warn" ? "text-[color:var(--state-warning)]" : "text-[color:var(--state-danger)]"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
