/**
 * In-text citations and reference-list entries for the six styles journals
 * ask for most, from a ReferenceRecord. Only recorded fields are printed; a
 * missing year prints as "n.d.". Pure; no I/O.
 */
import type { RefName, ReferenceRecord } from "./references";

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

const initials = (given: string | undefined, sep: string, join: string) =>
  (given ?? "")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((g) => `${g.replace(/\./g, "").charAt(0).toUpperCase()}${sep}`)
    .join(join);

const yearText = (r: ReferenceRecord) => (r.year ? String(r.year) : "n.d.");
const end = (s: string) => (/[.?!]$/.test(s) ? s : `${s}.`);
const pagesDash = (p: string | undefined) => p?.replace(/\s*-+\s*/g, "–");
/** *Title*. with the full stop outside the italics (none after ? or !). */
const italicTitle = (t: string) => `*${t.replace(/\.$/, "")}*${/[?!]$/.test(t) ? "" : "."}`;

function listNames(names: string[], and: string, serialComma: boolean): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} ${and} ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}${serialComma ? "," : ""} ${and} ${names[names.length - 1]}`;
}

/** Surname(s) for an author-date citation: one, two, or "et al.". */
function citeAuthors(a: RefName[], and: string, etAlFrom: number): string {
  if (a.length === 0) return "";
  if (a.length >= etAlFrom) return `${a[0].family} et al.`;
  return listNames(a.map((n) => n.family), and, false);
}

/** The author part of a reference-list entry, per style. */
function listAuthors(a: RefName[], style: StyleKey): string {
  if (a.length === 0) return "";
  switch (style) {
    case "apa": {
      const f = (n: RefName) => (n.given ? `${n.family}, ${initials(n.given, ".", " ")}` : n.family);
      if (a.length > 20) return `${a.slice(0, 19).map(f).join(", ")}, . . . ${f(a[a.length - 1])}`;
      return a.length === 1 ? f(a[0]) : `${a.slice(0, -1).map(f).join(", ")}, & ${f(a[a.length - 1])}`;
    }
    case "harvard": {
      const f = (n: RefName) => (n.given ? `${n.family}, ${initials(n.given, ".", "")}` : n.family);
      return listNames(a.map(f), "and", false);
    }
    case "chicago": {
      const first = a[0].given ? `${a[0].family}, ${a[0].given}` : a[0].family;
      const rest = a.slice(1).map((n) => (n.given ? `${n.given} ${n.family}` : n.family));
      if (a.length > 10) return `${[first, ...rest.slice(0, 6)].join(", ")}, et al.`;
      if (a.length === 2) return `${first}, and ${rest[0]}`;
      return listNames([first, ...rest], "and", true);
    }
    case "mla": {
      const first = a[0].given ? `${a[0].family}, ${a[0].given}` : a[0].family;
      if (a.length >= 3) return `${first}, et al.`;
      if (a.length === 2) return `${first}, and ${a[1].given ? `${a[1].given} ${a[1].family}` : a[1].family}`;
      return first;
    }
    case "ieee": {
      const f = (n: RefName) => (n.given ? `${initials(n.given, ".", " ")} ${n.family}` : n.family);
      if (a.length > 6) return `${f(a[0])} et al.`;
      return listNames(a.map(f), "and", a.length > 2);
    }
    case "vancouver": {
      const f = (n: RefName) => (n.given ? `${n.family} ${initials(n.given, "", "")}` : n.family);
      return a.length > 6 ? `${a.slice(0, 6).map(f).join(", ")}, et al` : a.map(f).join(", ");
    }
  }
}

const doiOrUrl = (r: ReferenceRecord, style: StyleKey): string => {
  if (r.doi) {
    if (style === "ieee") return `doi: ${r.doi}.`;
    if (style === "vancouver") return `doi:${r.doi}`;
    return `https://doi.org/${r.doi}`;
  }
  return r.url ?? "";
};

/** One reference-list entry (Markdown: *italic* for titles of containers). */
export function formatEntry(r: ReferenceRecord, style: StyleKey, suffix = ""): string {
  const authors = listAuthors(r.authors, style);
  const title = r.title.trim() || "Untitled";
  const y = yearText(r) + suffix;
  const pages = pagesDash(r.pages);
  const link = doiOrUrl(r, style);
  const dataset = r.kind === "dataset" ? " [Data set]" : "";
  const parts: string[] = [];
  const isArticle = r.kind === "article" && r.container;

  switch (style) {
    case "apa": {
      parts.push(authors ? `${end(authors)} (${y}).` : `${end(title)} (${y}).`);
      if (authors) parts.push(r.kind === "book" ? italicTitle(title) : end(`${title}${dataset}`));
      if (isArticle) {
        let src = `*${r.container}*`;
        if (r.volume) src += `, *${r.volume}*`;
        if (r.issue) src += `(${r.issue})`;
        if (pages) src += `, ${pages}`;
        parts.push(`${src}.`);
      } else if (r.container) parts.push(`${r.container}.`);
      else if (r.publisher && r.kind !== "dataset") parts.push(end(r.publisher));
      if (link) parts.push(link);
      return parts.join(" ");
    }
    case "harvard": {
      parts.push(`${authors || title} (${y})`);
      if (authors) parts[0] += r.kind === "book" ? ` *${title}*.` : ` '${title}'${dataset}${isArticle ? "," : "."}`;
      else parts[0] += ".";
      if (isArticle) {
        let src = `*${r.container}*`;
        if (r.volume) src += `, ${r.volume}`;
        if (r.issue) src += `(${r.issue})`;
        if (pages) src += `, pp. ${pages}`;
        parts.push(`${src}.`);
      } else if (r.publisher) parts.push(end(r.publisher));
      if (r.doi) parts.push(`doi:${r.doi}.`);
      else if (r.url) parts.push(`Available at: ${r.url}.`);
      return parts.join(" ");
    }
    case "chicago": {
      parts.push(authors ? `${end(authors)} ${y}.` : `${y}.`);
      parts.push(r.kind === "book" ? italicTitle(title) : `“${end(title)}”${r.kind === "dataset" ? " Dataset." : ""}`);
      if (isArticle) {
        let src = `*${r.container}*`;
        if (r.volume) src += ` ${r.volume}`;
        if (r.issue) src += ` (${r.issue})`;
        if (pages) src += `: ${pages}`;
        parts.push(`${src}.`);
      } else if (r.publisher) parts.push(end(r.publisher));
      if (link) parts.push(end(link));
      return parts.join(" ");
    }
    case "mla": {
      if (authors) parts.push(end(authors));
      parts.push(r.kind === "book" ? italicTitle(title) : `“${end(title)}”`);
      const src: string[] = [];
      if (r.container) src.push(`*${r.container}*`);
      if (r.volume) src.push(`vol. ${r.volume}`);
      if (r.issue) src.push(`no. ${r.issue}`);
      if (!r.container && r.publisher) src.push(r.publisher);
      if (r.year) src.push(String(r.year));
      if (pages) src.push(`pp. ${pages}`);
      if (link) src.push(link);
      if (src.length) parts.push(`${src.join(", ")}.`);
      return parts.join(" ");
    }
    case "ieee": {
      const head = authors ? `${authors}, ` : "";
      if (r.kind === "book") {
        const pub = [r.publisher, r.year ? String(r.year) : ""].filter(Boolean).join(", ");
        return `${head}*${title}*${pub ? `. ${pub}` : ""}.${link ? ` ${link}` : ""}`;
      }
      const src: string[] = [`${head}“${title.replace(/[.]$/, "")},”`];
      if (r.container) src.push(`*${r.container}*,`);
      const tail = [r.volume ? `vol. ${r.volume}` : "", r.issue ? `no. ${r.issue}` : "", pages ? `pp. ${pages}` : "", r.year ? String(r.year) : ""].filter(Boolean);
      src.push(`${tail.join(", ")}${tail.length ? "," : ""}`);
      const s = src.join(" ").replace(/,$/, ".");
      return `${s.replace(/,”$/, ".”")}${link ? ` ${link}` : ""}`.replace(/\s+/g, " ").trim();
    }
    case "vancouver": {
      if (authors) parts.push(`${authors}.`);
      parts.push(`${title.replace(/[.]$/, "")}${r.kind === "dataset" ? " [dataset]" : ""}.`);
      if (isArticle) {
        let src = `${r.container}. ${r.year ?? ""}`;
        if (r.volume) src += `;${r.volume}`;
        if (r.issue) src += `(${r.issue})`;
        if (r.pages) src += `:${r.pages}`;
        parts.push(`${src.trim()}.`);
      } else {
        const pub = [r.publisher, r.year ? String(r.year) : ""].filter(Boolean).join("; ");
        if (pub) parts.push(`${pub}.`);
      }
      if (link) parts.push(link);
      return parts.join(" ");
    }
  }
}

/** The label inside an author-date citation, e.g. "Smith & Lee, 2021". */
function authorDate(r: ReferenceRecord, style: StyleKey, suffix: string): string {
  const y = yearText(r) + suffix;
  const short = r.title.trim().split(/\s+/).slice(0, 4).join(" ");
  switch (style) {
    case "apa":
      return `${citeAuthors(r.authors, "&", 3) || `“${short}”`}, ${y}`;
    case "harvard":
      return `${citeAuthors(r.authors, "and", 4) || `‘${short}’`}, ${y}`;
    case "chicago":
      return `${citeAuthors(r.authors, "and", 3) || `“${short}”`} ${y}`;
    default:
      // MLA: author only (page numbers are the author's to add).
      return citeAuthors(r.authors, "and", 3) || `“${short}”`;
  }
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
