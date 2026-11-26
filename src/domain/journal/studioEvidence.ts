/**
 * The evidence the Writing Studio can cite: the author's own data and the
 * literature they approved, read from the project answers, plus the reference
 * list built from the [CITE:id] tokens in the text. Pure; no React, no I/O.
 */
import { safeParseAnswerField } from "../../shared/projectStateSchema";
import { citedIds, formatEntry, isNumeric, styleKey } from "./citationStyles";
import type { ReferenceRecord } from "./references";
import { recordsForSources } from "./referenceAudit";

export interface StudioEvidence {
  id: string;
  citationToken: string;
  title: string;
  /** Short form for display: "Smith", "Smith & Lee", "Smith et al.". */
  author: string;
  /** Every author as recorded. */
  authors: string[];
  year?: number;
  doi?: string;
  isUserData: boolean;
  /** What the source found, as recorded; empty when nothing was recorded. */
  findings: string;
  assignedSectionId: string;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const yearOf = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export function studioEvidence(answers: Record<string, unknown>): StudioEvidence[] {
  const out: StudioEvidence[] = [];
  const datasets = safeParseAnswerField<Array<Record<string, unknown>>>(answers["user_datasets"] ?? answers["user_data_entries"], []);
  if (Array.isArray(datasets)) {
    datasets.forEach((d, i) => {
      const id = str(d.id) || `data_${i + 1}`;
      out.push({
        id,
        citationToken: str(d.citationToken) || `[CITE:${id}]`,
        title: str(d.title) || str(d.name) || `Dataset ${i + 1}`,
        author: str(d.author) || "Your data",
        authors: [str(d.author)].filter(Boolean),
        year: yearOf(d.year),
        isUserData: true,
        findings: str(d.extractedFindings) || str(d.summary),
        assignedSectionId: str(d.assignedSectionId),
      });
    });
  }
  const vault = safeParseAnswerField<Array<Record<string, unknown>>>(answers["approved_vault_sources"] ?? answers["vault_sources"], []);
  if (Array.isArray(vault)) {
    vault.forEach((v, i) => {
      const id = str(v.id) || `src_${i + 1}`;
      const authors = Array.isArray(v.authors) ? (v.authors as unknown[]).map(str).filter(Boolean) : [str(v.author) || str(v.authors)].filter(Boolean);
      out.push({
        id,
        citationToken: `[CITE:${id}]`,
        title: str(v.title) || "Untitled source",
        author: authors.length > 2 ? `${authors[0]} et al.` : authors.join(" & ") || "Unknown author",
        authors,
        year: yearOf(v.year),
        doi: str(v.doi) || undefined,
        isUserData: false,
        findings: str(v.keyFindings) || str(v.abstract) || str(v.summary),
        assignedSectionId: str(v.assignedSectionId),
      });
    });
  }
  return out;
}

/** Evidence for one writing unit: assigned to it, to its section, or listed on its budget. */
export function evidenceFor(all: StudioEvidence[], unitId: string, sectionId: string, assignedIds: string[]): StudioEvidence[] {
  return all.filter((e) => e.assignedSectionId === unitId || e.assignedSectionId === sectionId || assignedIds.includes(e.id));
}

/**
 * References for every [CITE:id] token in the text, in the project's citation
 * style (the same formatter Delivery and export use), plus the ids that match
 * no source. Alphabetical, except in numbered styles (IEEE, Vancouver), where
 * the list follows first citation so its numbers match the in-text ones. A saved registry record wins over what was typed.
 */
export function citedReferences(
  text: string,
  all: StudioEvidence[],
  options: { records?: Record<string, ReferenceRecord>; citationStyle?: string } = {}
): { entries: Array<{ evidence: StudioEvidence; reference: string }>; unknownTokens: string[] } {
  const style = styleKey(options.citationStyle);
  const byId = new Map(all.map((e) => [e.id, e]));
  const records = recordsForSources(all, options.records ?? {});
  const entries: Array<{ evidence: StudioEvidence; reference: string }> = [];
  const unknownTokens: string[] = [];
  for (const id of citedIds(text)) {
    const e = byId.get(id) ?? all.find((x) => x.citationToken === `[CITE:${id}]`);
    if (e) entries.push({ evidence: e, reference: formatEntry(records[e.id], style) });
    else unknownTokens.push(`[CITE:${id}]`);
  }
  if (!isNumeric(style)) entries.sort((a, b) => a.reference.localeCompare(b.reference));
  return { entries, unknownTokens };
}

/**
 * The sources the AI may cite when drafting a section: the ones the author
 * assigned to it (or to its section). Nothing else is added.
 */
export function draftingSources(evidence: StudioEvidence[]) {
  return evidence.map((e) => ({
    id: e.id,
    authors: e.authors.length > 0 ? e.authors : e.author,
    year: e.year ?? "n.d.",
    title: e.title,
    doi: e.doi,
    keyFindings: e.findings || undefined,
  }));
}
