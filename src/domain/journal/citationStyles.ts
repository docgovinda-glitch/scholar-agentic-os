/**
 * Journal and Thesis citations: [CITE:id] tokens become in-text citations and
 * a reference list in the six styles journals ask for most. Every entry and
 * citation is rendered by the shared citation_compliance formatters (the one
 * engine); this module only orders, numbers, groups and disambiguates
 * (2021a / 2021b). Only recorded fields are printed. Pure; no I/O.
 */
import type { ReferenceRecord } from "./references";
import { CitationFormatterFactory } from "../../citation_compliance/formattingEngine";
import type { CanonicalReference, ReferenceKind } from "../../citation_compliance/model/reference";

export type StyleKey = "apa" | "harvard" | "chicago" | "mla" | "ieee" | "vancouver";

/** The profile's citation style ("APA 7", "IEEE", …) as a style key; APA when unset. */
export function styleKey(raw: string | undefined): StyleKey {
  const s = (raw ?? "").toLowerCase();
  if (/\bieee\b/.test(s)) return "ieee";
  if (/vancouver|icmje|nlm/.test(s)) return "vancouver";
  if (/harvard/.test(s)) return "harvard";
  if (/chicago/.test(s)) return "chicago";
  if (/\bmla/.test(s)) return "mla";
  return "apa";
}

export const isNumeric = (s: StyleKey) => s === "ieee" || s === "vancouver";

const FORMATTER_ID: Record<StyleKey, string> = { apa: "apa7", harvard: "harvard", chicago: "chicago", mla: "mla9", ieee: "ieee", vancouver: "vancouver" };
const KIND: Record<ReferenceRecord["kind"], ReferenceKind> = { article: "JournalArticle", book: "Book", chapter: "BookChapter", dataset: "Dataset", other: "Website" };

/** A recorded reference as the shared formatters' reference: only recorded fields, nothing filled in. */
export function recordToCanonical(r: ReferenceRecord, suffix = ""): CanonicalReference {
  const isArticle = r.kind === "article" && !!r.container;
  return {
    kind: r.kind === "article" && !r.container ? "Website" : KIND[r.kind],
    title: r.title.trim() || "Untitled",
    authors: r.authors.map((n, order) => ({ firstName: n.given ?? "", lastName: n.family, order })),
    source: r.container ?? (r.kind === "dataset" ? "" : (r.publisher ?? "")),
    ...(isArticle ? { journal: r.container } : {}),
    ...(r.publisher ? { publisher: r.publisher } : {}),
    ...(r.volume ? { volume: r.volume } : {}),
    ...(r.issue ? { issue: r.issue } : {}),
    ...(r.pages ? { pages: r.pages } : {}),
    ...(r.doi ? { doi: r.doi } : {}),
    ...(r.url ? { url: r.url } : {}),
    year: r.year ? String(r.year) : "n.d.",
    ...(r.year ? { publicationDate: String(r.year) } : {}),
    ...(suffix ? { yearSuffix: suffix } : {}),
  };
}

/** One reference-list entry (Markdown: *italic*), from the shared formatters (the one citation engine). */
export function formatEntry(r: ReferenceRecord, style: StyleKey, suffix = ""): string {
  return CitationFormatterFactory.formatBibliography(FORMATTER_ID[style], recordToCanonical(r, suffix));
}

/** The label inside an author-date citation, e.g. "Smith & Lee, 2021" (the shared formatter's citation without its brackets). */
function authorDate(r: ReferenceRecord, style: StyleKey, suffix: string): string {
  return CitationFormatterFactory.formatInText(FORMATTER_ID[style], recordToCanonical(r, suffix)).replace(/^\(|\)$/g, "");
}

export interface RenderedManuscript {
  markdown: string;
  /** Formatted entries, in list order. */
  references: string[];
  /** Cited ids with no record: left in the text as [CITE:id]. */
  missing: string[];
}

const CITE_RUN = /\[CITE:[A-Za-z0-9_.:-]+\](?:[ \t]*[;,]?[ \t]*\[CITE:[A-Za-z0-9_.:-]+\])*/g;
const CITE_ID = /\[CITE:([A-Za-z0-9_.:-]+)\]/g;

/** Cited ids in order of first appearance. */
export function citedIds(markdown: string): string[] {
  const seen: string[] = [];
  for (const m of markdown.matchAll(CITE_ID)) if (!seen.includes(m[1])) seen.push(m[1]);
  return seen;
}

/** Drops a "## References" (or Bibliography / Works Cited) section; the generated one replaces it. */
export function withoutReferenceSection(md: string): string {
  return md.replace(/(^|\n)#{1,3} +(?:References|Bibliography|Works Cited|Reference List)\s*\n[\s\S]*?(?=\n#{1,3} +\S|$)/i, "$1").trimEnd();
}

/**
 * Replaces every [CITE:id] with an in-text citation in the given style and
 * appends a reference list of the cited sources. Adjacent citations become
 * one: "(Smith, 2021; Lee, 2020)" or "[1], [2]". Ids without a record stay
 * as they are and are reported, so nothing is invented for them.
 */
export function renderManuscript(markdown: string, records: Record<string, ReferenceRecord>, style: StyleKey): RenderedManuscript {
  const ids = citedIds(markdown);
  if (ids.length === 0) return { markdown, references: [], missing: [] };
  const missing = ids.filter((id) => !records[id]);
  const cited = ids.filter((id) => records[id]).map((id) => records[id]);

  // List order: first appearance for numeric styles, alphabetical otherwise.
  const sortKey = (r: ReferenceRecord) => `${(r.authors[0]?.family ?? r.title).toLowerCase()} ${r.year ?? 9999} ${r.title.toLowerCase()}`;
  const ordered = isNumeric(style) ? cited : [...cited].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  // 2021a / 2021b when two sources would get the same author-date label.
  const suffix: Record<string, string> = {};
  if (!isNumeric(style)) {
    const groups = new Map<string, ReferenceRecord[]>();
    for (const r of ordered) {
      const k = `${authorDate({ ...r }, style, "")}`;
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    for (const g of groups.values()) if (g.length > 1 && style !== "mla") g.forEach((r, i) => (suffix[r.id] = String.fromCharCode(97 + i)));
  }
  const number: Record<string, number> = {};
  ordered.forEach((r, i) => (number[r.id] = i + 1));

  const body = withoutReferenceSection(markdown).replace(CITE_RUN, (run) => {
    const runIds = [...run.matchAll(CITE_ID)].map((m) => m[1]);
    const known = runIds.filter((id) => records[id]);
    const unknown = runIds.filter((id) => !records[id]).map((id) => `[CITE:${id}]`);
    if (known.length === 0) return unknown.join(" ");
    const cite = isNumeric(style)
      ? known.map((id) => `[${number[id]}]`).join(", ")
      : `(${known.map((id) => authorDate(records[id], style, suffix[id] ?? "")).join("; ")})`;
    return [cite, ...unknown].join(" ");
  });

  const references = ordered.map((r) => formatEntry(r, style, suffix[r.id] ?? ""));
  const heading = style === "mla" ? "Works Cited" : "References";
  const list = isNumeric(style)
    ? references.map((e, i) => (style === "ieee" ? `[${i + 1}] ${e}` : `${i + 1}. ${e}`)).join("\n\n")
    : references.join("\n\n");
  return { markdown: `${body}\n\n## ${heading}\n\n${list}\n`, references, missing };
}
