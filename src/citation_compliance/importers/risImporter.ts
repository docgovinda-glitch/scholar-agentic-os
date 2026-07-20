/**
 * RIS Importer
 *
 * Deterministically parses RIS (.ris) source text into CanonicalReference
 * records. No AI/network calls - pure text parsing, consistent with this
 * engine's deterministic-only citation formatting approach.
 */

import type { CanonicalReference, ReferenceAuthor, ReferenceKind } from "../model/reference";

const RIS_TYPE_TO_KIND: Record<string, ReferenceKind> = {
  JOUR: "JournalArticle",
  BOOK: "Book",
  CHAP: "BookChapter",
  CONF: "ConferencePaper",
  THES: "Dissertation",
  RPRT: "TechnicalReport",
  DATA: "Dataset",
  PAT: "Patent",
  UNPB: "Preprint",
  COMP: "Software",
  STAND: "Standard",
  ELEC: "Website",
  GEN: "Website",
};

/** Parse a list of "Last, First" / "First Last" author strings into structured authors. */
function parseAuthorList(raw: string[]): ReferenceAuthor[] {
  return raw
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s, index) => {
      let firstName = "";
      let lastName = "";
      if (s.includes(",")) {
        const [last, first] = s.split(",").map((p) => p.trim());
        lastName = last;
        firstName = first || "";
      } else {
        const parts = s.split(/\s+/);
        lastName = parts.pop() || s;
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

export interface RisImportResult {
  references: CanonicalReference[];
  warnings: string[];
}

/**
 * Parse RIS source text into canonical references.
 * RIS is tag-based: each record starts with "TY  - <type>" and ends with
 * "ER  - ". Lines are "TAG  - value"; repeated AU/A1 tags accumulate authors.
 */
export function importRis(source: string): RisImportResult {
  const warnings: string[] = [];
  const references: CanonicalReference[] = [];
  const lines = source.split(/\r?\n/);

  let current: Record<string, string[]> | null = null;

  const flush = () => {
    if (!current) return;
    try {
      const get = (tag: string) => current![tag]?.[0];
      const kind = RIS_TYPE_TO_KIND[current!.TY?.[0] ?? ""] ?? "JournalArticle";
      const year = normalizeYear(get("PY") ?? get("Y1"));
      const authors = [...(current!.AU ?? []), ...(current!.A1 ?? [])];

      references.push({
        kind,
        title: get("TI") || get("T1") || "Untitled",
        authors: parseAuthorList(authors),
        source: get("JO") || get("JF") || get("T2") || get("PB") || "",
        publisher: get("PB"),
        journal: get("JO") || get("JF"),
        volume: get("VL"),
        issue: get("IS"),
        pages: get("SP") && get("EP") ? `${get("SP")}-${get("EP")}` : get("SP"),
        doi: get("DO"),
        url: get("UR"),
        isbn: get("SN"),
        issn: get("SN"),
        publicationDate: year,
        year,
        keywords: current!.KW,
        _meta: { sourceRecordId: get("ID") },
      });
    } catch (err) {
      warnings.push(`Skipped a RIS record: ${err instanceof Error ? err.message : String(err)}`);
    }
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    const tagMatch = line.match(/^([A-Z][A-Z0-9])\s{0,2}-\s?(.*)$/);
    if (!tagMatch) continue;
    const [, tag, value] = tagMatch;

    if (tag === "TY") {
      flush();
      current = { TY: [value.trim()] };
      continue;
    }
    if (tag === "ER") {
      flush();
      continue;
    }
    if (!current) continue;

    if (!current[tag]) current[tag] = [];
    current[tag].push(value.trim());
  }
  flush(); // handle a record missing a trailing ER tag

  if (references.length === 0 && warnings.length === 0) {
    warnings.push("No RIS records found in source");
  }

  return { references, warnings };
}
