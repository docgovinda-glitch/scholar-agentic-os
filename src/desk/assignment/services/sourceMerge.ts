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
import { workKeys } from "../../../shared/retrieval/identity";

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

/** The keys that name a source's work (shared identity rules: DOI, arXiv id, title, short title + first author + year). */
export function sourceIdentityKeys(source: Pick<DiscoveredSource, "doi" | "title" | "url" | "authors" | "year">): string[] {
  const keys = workKeys(source);
  return keys.length ? keys : [`title:${(source.title || "").toLowerCase().trim()}`];
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
  const keys = new Set(kept.flatMap(sourceIdentityKeys));
  const added: DiscoveredSource[] = [];
  for (const s of found) {
    const sKeys = sourceIdentityKeys(s);
    const duplicate = ids.has(s.id) || sKeys.some((k) => keys.has(k));
    // A skipped duplicate's keys (its DOI, say) still name the listed work.
    sKeys.forEach((k) => keys.add(k));
    if (duplicate) continue;
    ids.add(s.id);
    added.push(s);
  }
  return { sources: [...kept, ...added], added };
}
