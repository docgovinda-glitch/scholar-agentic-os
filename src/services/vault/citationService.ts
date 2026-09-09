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

function normalizeReferenceKind(kind?: string): any {
  if (!kind) return "JournalArticle";
  const lower = kind.toLowerCase();
  if (lower === "journal" || lower === "journalarticle" || lower === "article") return "JournalArticle";
  if (lower === "webpage" || lower === "website" || lower === "web") return "Website";
  if (lower === "book") return "Book";
  if (lower === "bookchapter") return "BookChapter";
  if (lower === "thesis" || lower === "phdthesis" || lower === "dissertation") return "Thesis";
  if (lower === "preprint") return "Preprint";
  if (lower === "conferencepaper") return "ConferencePaper";
  return kind;
}

/**
 * Formats a canonical reference or vault item into the requested academic style.
 */
export function formatVaultCitation(
  item: VaultItem | CanonicalReference,
  style: CitationStyleType = "apa7"
): string {
  let ref: CanonicalReference;

  if ("canonicalReference" in item && item.canonicalReference) {
    ref = {
      ...item.canonicalReference,
      kind: normalizeReferenceKind(item.canonicalReference.kind),
    };
  } else if ("kind" in item && "title" in item) {
    ref = {
      ...(item as CanonicalReference),
      kind: normalizeReferenceKind((item as CanonicalReference).kind),
    };
  } else {
    // Construct minimal CanonicalReference from VaultItem fields
    const vaultItem = item as VaultItem;
    ref = {
      kind: normalizeReferenceKind(vaultItem.sourceType),
      title: vaultItem.title || "Untitled Source",
      source: vaultItem.journal || vaultItem.title || "Source Library",
      authors: (vaultItem.authors || []).map((name, idx) => {
        const parts = name.trim().split(" ");
        const lastName = parts.length > 1 ? parts[parts.length - 1] : name;
        const firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
        return {
          firstName,
          lastName,
          order: idx + 1,
        };
      }),
      year: vaultItem.year ? String(vaultItem.year) : undefined,
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
    ref = {
      ...item.canonicalReference,
      kind: normalizeReferenceKind(item.canonicalReference.kind),
    };
  } else if ("kind" in item && "title" in item) {
    ref = {
      ...(item as CanonicalReference),
      kind: normalizeReferenceKind((item as CanonicalReference).kind),
    };
  } else {
    const vaultItem = item as VaultItem;
    ref = {
      kind: normalizeReferenceKind(vaultItem.sourceType),
      title: vaultItem.title || "Untitled",
      source: vaultItem.journal || vaultItem.title || "Source Library",
      authors: (vaultItem.authors || []).map((name, idx) => {
        const parts = name.trim().split(" ");
        const lastName = parts.length > 1 ? parts[parts.length - 1] : name;
        const firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
        return {
          firstName,
          lastName,
          order: idx + 1,
        };
      }),
      year: vaultItem.year ? String(vaultItem.year) : undefined,
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
