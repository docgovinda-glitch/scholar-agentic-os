/**
 * The state of every citation in a manuscript: does it point to a source, is
 * that source registered, and has it been retracted. Pure; no I/O.
 */
import { citedIds } from "./citationStyles";
import { recordFromEntry, type ReferenceRecord } from "./references";

export interface AuditSource {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  isUserData: boolean;
}

export type CitationState =
  | "verified" // record from Crossref/DataCite, no notice against it
  | "data" // the author's own dataset
  | "missing" // cited id matches no source
  | "retracted"
  | "concern"
  | "corrected"
  | "unchecked" // has a DOI, not looked up yet
  | "unregistered"; // no DOI: details are as the author typed them

export interface CitationAuditRow {
  id: string;
  title: string;
  state: CitationState;
  /** Stops export until fixed (or, for a retraction, acknowledged). */
  blocking: boolean;
  notice?: string;
}

export interface CitationAudit {
  rows: CitationAuditRow[];
  blocking: number;
  warnings: number;
  /** Sources in the project that the text never cites. */
  uncited: AuditSource[];
}

/** Saved records first; a source without one gets a record from what was typed. */
export function recordsForSources(sources: AuditSource[], saved: Record<string, ReferenceRecord>): Record<string, ReferenceRecord> {
  const out: Record<string, ReferenceRecord> = {};
  for (const s of sources) out[s.id] = saved[s.id] ?? recordFromEntry(s);
  return out;
}

export function auditCitations(
  markdown: string,
  sources: AuditSource[],
  saved: Record<string, ReferenceRecord>,
  acknowledgedRetractions: string[] = []
): CitationAudit {
  const ids = citedIds(markdown);
  const byId = new Map(sources.map((s) => [s.id, s]));
  const rows: CitationAuditRow[] = ids.map((id) => {
    const src = byId.get(id);
    if (!src) return { id, title: "", state: "missing", blocking: true };
    const rec = saved[id];
    const base = { id, title: rec?.title || src.title };
    if (src.isUserData) return { ...base, state: "data", blocking: false };
    const status = rec?.integrity?.status;
    if (status === "retracted") return { ...base, state: "retracted", blocking: !acknowledgedRetractions.includes(id), notice: rec?.integrity?.notice };
    if (status === "concern") return { ...base, state: "concern", blocking: false, notice: rec?.integrity?.notice };
    if (status === "corrected") return { ...base, state: "corrected", blocking: false, notice: rec?.integrity?.notice };
    if (rec && rec.registry !== "author" && status === "clean") return { ...base, state: "verified", blocking: false };
    if (rec?.doi || src.doi) return { ...base, state: "unchecked", blocking: false };
    return { ...base, state: "unregistered", blocking: false };
  });
  const cited = new Set(ids);
  return {
    rows,
    blocking: rows.filter((r) => r.blocking).length,
    warnings: rows.filter((r) => !r.blocking && !["verified", "data"].includes(r.state)).length,
    uncited: sources.filter((s) => !s.isUserData && !cited.has(s.id)),
  };
}
