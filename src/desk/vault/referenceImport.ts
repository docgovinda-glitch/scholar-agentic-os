/**
 * Turns a pasted BibTeX or RIS export into Vault items.
 *
 * VaultSetupScreen's "Import an existing library" option (Zotero, Mendeley,
 * EndNote, BibTeX — docs 25 §6.1) has been sitting there labelled "not
 * available yet" since Vault setup shipped. It still is, as an onboarding
 * path — but the parsing it needs already existed, complete and pure, in
 * src/citation_compliance's importers: BibTeX directly, and RIS covers
 * Zotero/Mendeley/EndNote's own export format. Nothing here re-implements
 * parsing; it only adapts `CanonicalReference` (that engine's model) into
 * the {title, content, citation} shape VaultItem uses.
 */

import { APA7Formatter, importBibTex, importRis, type CanonicalReference } from "../../citation_compliance";

export interface ParsedReferenceItem {
  title: string;
  content: string;
  citation: string;
}

export interface ImportPreview {
  items: ParsedReferenceItem[];
  warnings: string[];
}

const formatter = new APA7Formatter();

function toItem(ref: CanonicalReference): ParsedReferenceItem {
  const authorNames = ref.authors
    .map((a) => [a.firstName, a.lastName].filter(Boolean).join(" "))
    .filter((name) => name.length > 0);
  const authors = authorNames.length > 0 ? authorNames.join(", ") : "Unknown author";
  const source = ref.source ? ` — ${ref.source}` : "";
  const year = ref.year ? `, ${ref.year}` : "";

  return {
    title: ref.title,
    content: `${authors}${source}${year}.`,
    // A full formatted bibliography entry, not just the synopsis above — the
    // point of importing a reference is to have a correct citation for it.
    citation: formatter.formatBibliography(ref),
  };
}

/** Sniffs the format from the text itself, so pasting an export is the whole interaction — no format menu to get right first. */
export function detectReferenceFormat(source: string): "bibtex" | "ris" | null {
  const trimmed = source.trim();
  if (trimmed.startsWith("@")) return "bibtex";
  if (/^TY\s*-/m.test(trimmed)) return "ris";
  return null;
}

export function parseReferences(source: string): ImportPreview {
  const format = detectReferenceFormat(source);
  if (format === null) {
    return {
      items: [],
      warnings: ["Could not recognize this as BibTeX or RIS. Paste the export as-is from your reference manager."],
    };
  }
  const result = format === "bibtex" ? importBibTex(source) : importRis(source);
  return { items: result.references.map(toItem), warnings: result.warnings };
}
