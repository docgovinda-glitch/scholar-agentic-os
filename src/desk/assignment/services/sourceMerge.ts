/**
 * Merging new search results into a project's source list (Stage 3).
 *
 * A new search never discards what the student chose or added: approved,
 * bookmarked, prescribed, Vault and hand-entered sources stay, and so do the
 * ones they removed (so a search cannot bring them back). Only unreviewed
 * search results are replaced. New results are never approved here; the
 * student decides.
 */
import type { DiscoveredSource } from "../types";

/** True when the student acted on the source or it came from them or the brief. */
export function isStudentOwnedSource(source: DiscoveredSource, approvedIds: ReadonlySet<string>): boolean {
  return (
    approvedIds.has(source.id) ||
    Boolean(source.prescribedInBrief) ||
    Boolean(source.isBookmarked) ||
    Boolean(source.isExcluded) ||
    source.status === "removed" ||
    Boolean(source.vaultItemId) ||
    source.sourceOrigin === "user_added" ||
    source.sourceOrigin === "user_uploaded" ||
    source.originTag === "user" ||
    source.id.startsWith("src-custom-") ||
    source.id.startsWith("vault-")
  );
}

/** One key per work: the DOI when there is one, else the normalised title. */
export function sourceIdentity(source: Pick<DiscoveredSource, "doi" | "title">): string {
  const doi = (source.doi || "").trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
  if (doi) return `doi:${doi}`;
  // Preserve hyphens in compound terms (COVID-19, Machine-Learning, etc.)
  return `title:${(source.title || "").toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim()}`;
}

/**
 * The list after a search. "replace" swaps the unreviewed results for the new
 * ones (a re-run search); "add" keeps everything and appends. Results already
 * in the list (same id, DOI or title) are skipped either way.
 */
export function mergeSearchResults(
  existing: readonly DiscoveredSource[],
  found: readonly DiscoveredSource[],
  approvedIds: Iterable<string>,
  mode: "replace" | "add"
): { sources: DiscoveredSource[]; added: DiscoveredSource[] } {
  const approved = new Set(approvedIds);
  const kept = mode === "replace" ? existing.filter((s) => isStudentOwnedSource(s, approved)) : [...existing];
  const ids = new Set(kept.map((s) => s.id));
  const keys = new Set(kept.map(sourceIdentity));
  const added: DiscoveredSource[] = [];
  for (const s of found) {
    const key = sourceIdentity(s);
    if (ids.has(s.id) || keys.has(key)) continue;
    ids.add(s.id);
    keys.add(key);
    added.push(s);
  }
  return { sources: [...kept, ...added], added };
}
