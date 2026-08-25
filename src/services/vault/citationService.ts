/**
 * Citation Service for Universal Knowledge Vault
 * Wraps the citation compliance formatters to generate bibliography & in-text citations.
 */

import type { CanonicalReference } from "../../citation_compliance/model/reference";
import { APA7Formatter } from "../../citation_compliance/formatters/apa7";
import { IEEEFormatter } from "../../citation_compliance/formatters/ieee";
import { MLA9Formatter } from "../../citation_compliance/formatters/mla9";
import { ChicagoFormatter } from "../../citation_compliance/formatters/chicago";
import { HarvardFormatter } from "../../citation_compliance/formatters/harvard";
import { VancouverFormatter } from "../../citation_compliance/formatters/vancouver";
import type { VaultItem } from "../vaultContents";

export type CitationStyleType = "apa7" | "ieee" | "mla9" | "chicago" | "harvard" | "vancouver";

const formatters = {
  apa7: new APA7Formatter(),
  ieee: new IEEEFormatter(),
  mla9: new MLA9Formatter(),
  chicago: new ChicagoFormatter(),
  harvard: new HarvardFormatter(),
  vancouver: new VancouverFormatter(),
};

/**
 * Formats a canonical reference or vault item into the requested academic style.
 */
export function formatVaultCitation(
  item: VaultItem | CanonicalReference,
  style: CitationStyleType = "apa7"
): string {
  let ref: CanonicalReference;

  if ("canonicalReference" in item && item.canonicalReference) {
    ref = item.canonicalReference;
  } else if ("kind" in item && "title" in item) {
    ref = item as CanonicalReference;
  } else {
    // Construct minimal CanonicalReference from VaultItem fields
    const vaultItem = item as VaultItem;
    ref = {
      id: vaultItem.id || crypto.randomUUID(),
      kind: "journal",
      title: vaultItem.title || "Untitled Source",
      authors: (vaultItem.authors || []).map((name) => {
        const parts = name.trim().split(" ");
        return {
          lastName: parts[parts.length - 1] || name,
          initials: parts[0]?.[0] || "",
        };
      }),
      year: vaultItem.year ? parseInt(vaultItem.year, 10) : undefined,
      journal: vaultItem.journal,
      url: vaultItem.externalReference,
    };
  }

  const formatter = formatters[style] || formatters.apa7;
  try {
    return formatter.formatBibliography(ref);
  } catch {
    // Fallback simple citation if formatting fails
    const authors = ref.authors.map((a) => a.lastName).join(", ") || "Unknown Author";
    const year = ref.year ? ` (${ref.year})` : "";
    return `${authors}${year}. ${ref.title}.`;
  }
}

/**
 * Formats in-text citation (e.g. "(Smith & Doe, 2024)" or "[1]").
 */
export function formatVaultInText(
  item: VaultItem | CanonicalReference,
  style: CitationStyleType = "apa7",
  position: number = 1
): string {
  let ref: CanonicalReference;
  if ("canonicalReference" in item && item.canonicalReference) {
    ref = item.canonicalReference;
  } else if ("kind" in item && "title" in item) {
    ref = item as CanonicalReference;
  } else {
    const vaultItem = item as VaultItem;
    ref = {
      id: vaultItem.id || crypto.randomUUID(),
      kind: "journal",
      title: vaultItem.title || "Untitled",
      authors: (vaultItem.authors || []).map((name) => ({
        lastName: name.trim().split(" ").pop() || name,
      })),
      year: vaultItem.year ? parseInt(vaultItem.year, 10) : undefined,
    };
  }

  const formatter = formatters[style] || formatters.apa7;
  try {
    return formatter.formatInText(ref, { position });
  } catch {
    const firstAuthor = ref.authors[0]?.lastName || "Author";
    return `(${firstAuthor}, ${ref.year || "n.d."})`;
  }
}

/**
 * Converts a vault item into BibTeX text format.
 */
export function toBibTeX(item: VaultItem): string {
  const citeKey = (item.authors?.[0]?.toLowerCase().replace(/\s+/g, "") || "source") + (item.year || "2025");
  const authorStr = (item.authors || []).join(" and ") || "Author, Unknown";
  
  return `@article{${citeKey},
  title = {${item.title}},
  author = {${authorStr}},
  year = {${item.year || "2025"}},
  journal = {${item.journal || "Working Paper"}}${item.externalReference ? `,\n  url = {${item.externalReference}}` : ""}
}`;
}
