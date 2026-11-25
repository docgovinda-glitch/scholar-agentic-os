/** Scholarly search filters set from the prompt bar. Pure. */

export type YearPreset = "any" | "2020-2026" | "custom";
export type SourceScope = "peer_reviewed" | "full_text_oa" | "vault_only";

export interface ScholarFilters {
  yearPreset: YearPreset;
  /** Used when yearPreset is "custom". */
  yearFrom?: number;
  yearTo?: number;
  scopes: SourceScope[];
}

export const DEFAULT_SCHOLAR_FILTERS: ScholarFilters = { yearPreset: "any", scopes: [] };

export function yearRangeOf(f: ScholarFilters): { from?: number; to?: number } {
  if (f.yearPreset === "2020-2026") return { from: 2020, to: 2026 };
  if (f.yearPreset === "custom") return { from: f.yearFrom, to: f.yearTo };
  return {};
}

export function hasActiveFilters(f: ScholarFilters): boolean {
  return f.yearPreset !== "any" || f.scopes.length > 0;
}

export function describeFilters(f: ScholarFilters): string[] {
  const out: string[] = [];
  const { from, to } = yearRangeOf(f);
  if (from || to) out.push(`${from ?? "…"}–${to ?? "…"}`);
  if (f.scopes.includes("peer_reviewed")) out.push("Peer-reviewed only");
  if (f.scopes.includes("full_text_oa")) out.push("Full-text OA");
  if (f.scopes.includes("vault_only")) out.push("Knowledge Vault only");
  return out;
}

interface Filterable {
  year?: number | string;
  publicationDate?: string;
  credibilityLevel?: string;
  sourceType?: string;
  source?: string;
  openAccessUrl?: string;
}

const yearOf = (r: Filterable): number | undefined => {
  const y = Number(String(r.year ?? r.publicationDate ?? "").slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : undefined;
};

/** Keeps only results that satisfy every active filter. A source with no stated year fails a year filter. */
export function applyScholarFilters<T extends Filterable>(results: T[], f: ScholarFilters): T[] {
  const { from, to } = yearRangeOf(f);
  return results.filter((r) => {
    if (from || to) {
      const y = yearOf(r);
      if (y === undefined || (from && y < from) || (to && y > to)) return false;
    }
    if (f.scopes.includes("peer_reviewed")) {
      if (r.credibilityLevel === "preprint - not peer-reviewed" || r.source === "web" || r.sourceType === "web") return false;
    }
    if (f.scopes.includes("full_text_oa") && !r.openAccessUrl) return false;
    return true;
  });
}
