/**
 * BibTeX Importer
 *
 * Deterministically parses BibTeX (.bib) source text into CanonicalReference
 * records. No AI/network calls - pure text parsing, consistent with this
 * engine's deterministic-only citation formatting approach.
 */

import type { CanonicalReference, ReferenceAuthor, ReferenceKind } from "../model/reference";

const ENTRY_TYPE_TO_KIND: Record<string, ReferenceKind> = {
  article: "JournalArticle",
  book: "Book",
  inbook: "BookChapter",
  incollection: "BookChapter",
  inproceedings: "ConferencePaper",
  conference: "ConferencePaper",
  phdthesis: "Dissertation",
  mastersthesis: "Thesis",
  techreport: "TechnicalReport",
  misc: "Website",
  online: "Website",
  dataset: "Dataset",
  patent: "Patent",
  unpublished: "Preprint",
  software: "Software",
  standard: "Standard",
};

interface RawBibEntry {
  type: string;
  citeKey: string;
  fields: Record<string, string>;
}

/** Find the index of the closing brace matching the opening brace at `openIndex`. */
function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Parse `field = {value}` / `field = "value"` / `field = 123` pairs from a BibTeX entry body. */
function parseFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const fieldRegex = /([A-Za-z][\w-]*)\s*=\s*/g;
  let match: RegExpExecArray | null;

  while ((match = fieldRegex.exec(body)) !== null) {
    const name = match[1].toLowerCase();
    const valueStart = fieldRegex.lastIndex;
    let value: string;
    let nextIndex: number;

    if (body[valueStart] === "{") {
      const closeIndex = findMatchingBrace(body, valueStart);
      if (closeIndex === -1) break;
      value = body.slice(valueStart + 1, closeIndex);
      nextIndex = closeIndex + 1;
    } else if (body[valueStart] === '"') {
      const closeIndex = body.indexOf('"', valueStart + 1);
      if (closeIndex === -1) break;
      value = body.slice(valueStart + 1, closeIndex);
      nextIndex = closeIndex + 1;
    } else {
      const commaIndex = body.indexOf(",", valueStart);
      const end = commaIndex === -1 ? body.length : commaIndex;
      value = body.slice(valueStart, end).trim();
      nextIndex = end;
    }

    fields[name] = value.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
    fieldRegex.lastIndex = nextIndex;
  }

  return fields;
}

/** Parse an "and"-joined BibTeX author field into structured authors ("Last, First" or "First Last" per segment). */
function parseAuthors(field: string | undefined): ReferenceAuthor[] {
  if (!field) return [];

  return field
    .split(/\s+and\s+/i)
    .map((raw) => raw.trim())
    .filter((raw) => raw.length > 0)
    .map((raw, index) => {
      let firstName = "";
      let lastName = "";

      if (raw.includes(",")) {
        const [last, first] = raw.split(",").map((s) => s.trim());
        lastName = last;
        firstName = first || "";
      } else {
        const parts = raw.split(/\s+/);
        lastName = parts.pop() || raw;
        firstName = parts.join(" ");
      }

      return { firstName, lastName, order: index };
    });
}

function normalizeYear(year: string | undefined): string | undefined {
  if (!year) return undefined;
  const match = year.match(/\d{4}/);
  return match ? match[0] : undefined;
}

function toCanonicalReference(entry: RawBibEntry): CanonicalReference {
  const f = entry.fields;
  const kind = ENTRY_TYPE_TO_KIND[entry.type] ?? "JournalArticle";
  const year = normalizeYear(f.year);

  return {
    kind,
    title: f.title || "Untitled",
    authors: parseAuthors(f.author ?? f.editor),
    source: f.journal || f.booktitle || f.publisher || f.school || "",
    publisher: f.publisher,
    journal: f.journal,
    volume: f.volume,
    issue: f.number,
    pages: f.pages,
    doi: f.doi,
    url: f.url,
    isbn: f.isbn,
    issn: f.issn,
    publicationDate: year,
    year,
    keywords: f.keywords ? f.keywords.split(/[,;]\s*/).filter(Boolean) : undefined,
    details: {
      chapterTitle: f.chapter,
      conferenceName: f.booktitle,
      edition: f.edition,
      series: f.series,
    },
    _meta: { sourceRecordId: entry.citeKey },
  };
}

export interface BibTexImportResult {
  references: CanonicalReference[];
  warnings: string[];
}

/**
 * Parse BibTeX source text into canonical references.
 * Malformed individual entries are skipped (with a warning) rather than
 * failing the entire import, so one bad entry doesn't block the rest of
 * a large bibliography.
 */
export function importBibTex(source: string): BibTexImportResult {
  const warnings: string[] = [];
  const references: CanonicalReference[] = [];
  const entryStart = /@(\w+)\s*\{\s*([^,]*),/g;
  let match: RegExpExecArray | null;

  while ((match = entryStart.exec(source)) !== null) {
    const type = match[1].toLowerCase();
    if (type === "comment" || type === "string" || type === "preamble") continue;

    const citeKey = match[2].trim();
    const braceOpen = source.indexOf("{", match.index);
    const bodyEnd = findMatchingBrace(source, braceOpen);
    if (bodyEnd === -1) {
      warnings.push(`Skipped entry "${citeKey}": unterminated braces`);
      continue;
    }

    const body = source.slice(entryStart.lastIndex, bodyEnd);
    entryStart.lastIndex = bodyEnd + 1;

    try {
      const entry: RawBibEntry = { type, citeKey, fields: parseFields(body) };
      references.push(toCanonicalReference(entry));
    } catch (err) {
      warnings.push(`Skipped entry "${citeKey}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (references.length === 0 && warnings.length === 0) {
    warnings.push("No BibTeX entries found in source");
  }

  return { references, warnings };
}
