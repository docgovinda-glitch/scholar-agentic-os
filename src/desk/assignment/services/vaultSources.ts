/**
 * Knowledge Vault items as Coursework sources (Stage 3, vault channel).
 * Pure mapping: the item's own metadata only; nothing is invented when a
 * field is missing.
 */
import type { VaultItem } from "../../../services/vaultContents";
import type { DiscoveredSource } from "../types";

export function vaultSourceId(item: Pick<VaultItem, "id">): string {
  return `vault-${item.id}`;
}

export function vaultItemToDiscoveredSource(item: VaultItem): DiscoveredSource {
  const ref = item.canonicalReference;
  const authors =
    item.authors && item.authors.length > 0
      ? item.authors
      : ref?.authors?.map((a) => [a.lastName, a.firstName].filter(Boolean).join(", ")).filter(Boolean) ?? [];
  const snippet = (item.content || "").replace(/\s+/g, " ").trim().slice(0, 600);
  return {
    id: vaultSourceId(item),
    title: item.title || ref?.title || item.filename || "Untitled vault item",
    authors,
    year: item.year || ref?.year || "n.d.",
    type: item.sourceType === "web" ? "web" : ref?.kind === "Book" ? "book" : "journal_article",
    journal: item.journal || ref?.journal || ref?.source || "",
    doi: ref?.doi,
    url: ref?.url || item.externalReference,
    citation: item.citation || "",
    abstract: snippet,
    mainFinding: "",
    suggestedUse: "",
    status: "kept",
    vaultItemId: item.id,
    retrievalSource: "vault",
    retrievedAt: new Date().toISOString(),
  };
}
