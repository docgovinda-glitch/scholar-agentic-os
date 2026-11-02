/**
 * The evidence the Writing Studio can cite: the author's own data and the
 * literature they approved, read from the project answers, plus the reference
 * list built from the [CITE:id] tokens in the text. Pure; no React, no I/O.
 */
import { safeParseAnswerField } from "../../shared/projectStateSchema";

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

/** A plain reference entry from what is recorded; nothing is added. */
export function formatReference(e: StudioEvidence): string {
  const head = `${e.author} (${e.year ?? "n.d."}). ${e.title.replace(/\.$/, "")}.`;
  if (e.isUserData) return `${head} [Dataset].`;
  return e.doi ? `${head} https://doi.org/${e.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "")}` : head;
}

/** References for every [CITE:id] token in the text, alphabetical, plus tokens that match no source. */
export function citedReferences(text: string, all: StudioEvidence[]): { entries: Array<{ evidence: StudioEvidence; reference: string }>; unknownTokens: string[] } {
  const tokens = Array.from(new Set(text.match(/\[CITE:[a-zA-Z0-9_.:-]+\]/g) || []));
  const entries: Array<{ evidence: StudioEvidence; reference: string }> = [];
  const unknownTokens: string[] = [];
  for (const tok of tokens) {
    const id = tok.slice(6, -1);
    const e = all.find((x) => x.id === id || x.citationToken === tok);
    if (e) entries.push({ evidence: e, reference: formatReference(e) });
    else unknownTokens.push(tok);
  }
  entries.sort((a, b) => a.evidence.author.localeCompare(b.evidence.author));
  return { entries, unknownTokens };
}
