/**
 * Turns a pasted BibTeX or RIS record into Vault fields.
 *
 * Parsing belongs to the shared citation engine (src/citation_compliance's
 * importers: BibTeX directly, RIS for Zotero / Mendeley / EndNote exports).
 * Nothing here re-implements it; this module only adapts `CanonicalReference`
 * into the shapes the Vault UI uses. The Add Source dialog is the caller.
 */

import { APA7Formatter } from "../../citation_compliance/formatters/apa7";
import { importBibTex } from "../../citation_compliance/importers/bibtexImporter";
import { importRis } from "../../citation_compliance/importers/risImporter";
import type { CanonicalReference } from "../../citation_compliance/model/reference";

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

/** The fields the Add Source form fills from one pasted reference. */
export interface PastedReferenceFields {
  format: "bibtex" | "ris";
  title: string;
  /** Full names in reading order ("Yann LeCun"), one per author. */
  authors: string[];
  year: string;
  journal: string;
  publisher: string;
  doi: string;
  url: string;
}

/** The first reference in a pasted BibTeX or RIS record, or null when the text is neither or holds no entry. */
export function parsePastedReference(source: string): PastedReferenceFields | null {
  const format = detectReferenceFormat(source);
  if (format === null) return null;
  // A single-line field flattens a pasted RIS record: put each tag back on its own line.
  const ris = format === "ris" && !/\n/.test(source.trim()) ? source.replace(/\s+(?=[A-Z][A-Z0-9]\s{1,2}-(\s|$))/g, "\n") : source;
  const ref = (format === "bibtex" ? importBibTex(source) : importRis(ris)).references[0];
  if (!ref) return null;
  return {
    format,
    title: ref.title ?? "",
    authors: ref.authors
      .map((a) => [a.firstName, a.middleName, a.lastName].filter(Boolean).join(" ").trim())
      .filter((name) => name.length > 0),
    year: ref.year ?? "",
    journal: ref.journal ?? ref.source ?? "",
    publisher: ref.publisher ?? "",
    doi: ref.doi ?? "",
    url: ref.url ?? "",
  };
}
