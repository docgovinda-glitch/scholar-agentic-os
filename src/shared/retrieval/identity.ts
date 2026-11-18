/**
 * One answer to "are these two records the same work?", used by every list of
 * sources (live search, Coursework sources, exports). Providers describe the
 * same paper differently: one has a DOI and another does not, a subtitle is
 * dropped, an arXiv preprint and its journal version carry different DOIs.
 *
 * A record is described by keys; two records that share any key are the same
 * work:
 *   - `doi:`   the bare, lower-case DOI;
 *   - `arxiv:` the arXiv id (from an arXiv DOI or URL), without version;
 *   - `url:`   the URL without scheme, `www.`, query or trailing slash (web pages);
 *   - `title:` the normalised title, when it is long enough to be specific
 *              (4+ words), else title + year;
 *   - `work:`  the title before its subtitle + first author's surname + year,
 *              so "Deep learning: a review" by LeCun (2015) matches
 *              "Deep learning" by LeCun (2015).
 * Pure; no I/O.
 */
import { normalizeDoi } from "../../citation_compliance/cslEngine";

export interface IdentityRecord {
  title?: string;
  doi?: string;
  url?: string;
  authors?: unknown;
  year?: string | number;
}

/** Lower case, accents and punctuation removed, a leading article dropped. */
export function normalizeWorkTitle(title: string | undefined): string {
  return (title ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/^(?:the|a|an)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function bareDoi(raw: string | undefined): string | undefined {
  return normalizeDoi(raw ?? undefined)?.toLowerCase();
}

/** The arXiv id of a record (new-style ids, version dropped), from its DOI or URL. */
export function arxivId(record: Pick<IdentityRecord, "doi" | "url">): string | undefined {
  const fromDoi = /10\.48550\/arxiv\.(\d{4}\.\d{4,5})/i.exec(record.doi ?? "");
  if (fromDoi) return fromDoi[1];
  const fromUrl = /arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})/i.exec(record.url ?? "");
  return fromUrl ? fromUrl[1] : undefined;
}

function urlKey(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const u = url.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  // A DOI resolver URL is the DOI, not a page.
  if (!u || /^(?:dx\.)?doi\.org\//.test(u)) return undefined;
  return u;
}

/** The first author's surname, lower case ("Smith, J." / "J. Smith" / "Smith J" -> "smith"). */
export function firstAuthorSurname(authors: unknown): string | undefined {
  const first = Array.isArray(authors) ? authors.find((a) => typeof a === "string" && a.trim()) : typeof authors === "string" ? authors : undefined;
  if (typeof first !== "string") return undefined;
  const name = first.trim();
  if (/^et\.?\s*al\.?$/i.test(name)) return undefined;
  const surname = name.includes(",")
    ? name.split(",")[0]
    : // "J. Smith" / "Jane Smith" -> last word; "Smith J" / "Smith JA" -> first word
      /^\S+\s+[A-Z]{1,3}\.?$/.test(name)
      ? name.split(/\s+/)[0]
      : name.split(/\s+/).at(-1) ?? name;
  const s = normalizeWorkTitle(surname).replace(/\s+/g, "");
  return s || undefined;
}

function yearOf(year: string | number | undefined): string | undefined {
  const m = /\b(1[5-9]\d\d|20\d\d)\b/.exec(String(year ?? ""));
  return m ? m[1] : undefined;
}

/** Every key that names this record's work (see the module comment). */
export function workKeys(record: IdentityRecord): string[] {
  const keys: string[] = [];
  const doi = bareDoi(record.doi);
  const arxiv = arxivId(record);
  const url = urlKey(record.url);
  const title = normalizeWorkTitle(record.title);
  const year = yearOf(record.year);
  if (doi) keys.push(`doi:${doi}`);
  if (arxiv) keys.push(`arxiv:${arxiv}`);
  if (url && !doi && !arxiv) keys.push(`url:${url}`);
  if (title) {
    const words = title.split(" ").length;
    if (words >= 4) keys.push(`title:${title}`);
    else if (year) keys.push(`title:${title}|${year}`);
    const core = normalizeWorkTitle((record.title ?? "").split(/[:?!]|\s[-–—]\s/)[0]);
    const surname = firstAuthorSurname(record.authors);
    if (core && core.split(" ").length >= 2 && surname && year) keys.push(`work:${core}|${surname}|${year}`);
  }
  return keys;
}

/** True when the two records describe the same work. */
export function isSameWork(a: IdentityRecord, b: IdentityRecord): boolean {
  const keys = new Set(workKeys(a));
  return workKeys(b).some((k) => keys.has(k));
}

/**
 * Groups records that describe the same work, in first-seen order. Records
 * with no key (no title, DOI or URL) each stay on their own.
 */
export function clusterWorks<T>(items: readonly T[], recordOf: (item: T) => IdentityRecord = (x) => x as unknown as IdentityRecord): T[][] {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<string, number>();
  items.forEach((item, i) => {
    for (const key of workKeys(recordOf(item))) {
      const j = owner.get(key);
      if (j === undefined) owner.set(key, i);
      else {
        const a = find(i);
        const b = find(j);
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      }
    }
  });
  const groups = new Map<number, T[]>();
  items.forEach((item, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), item]);
  });
  return [...groups.values()];
}

/** How complete a record's bibliographic details are (for choosing the record to keep). */
export function completeness(record: IdentityRecord & { venue?: string; journal?: string; snippet?: string; abstract?: string }): number {
  const authors = Array.isArray(record.authors) ? record.authors.filter((a) => typeof a === "string" && a.trim() && !/^et\.?\s*al/i.test(a)) : [];
  return (bareDoi(record.doi) ? 4 : 0) + (authors.length ? 3 : 0) + (yearOf(record.year) ? 2 : 0) + (record.venue || record.journal ? 1 : 0) + ((record.abstract || record.snippet || "").length > 40 ? 1 : 0) + (record.url ? 0.5 : 0);
}

/**
 * One record per work: the most complete record of each group (the first seen
 * on a tie), with the other records' links kept as `alternateLinks`.
 */
export function dedupeWorks<T extends IdentityRecord>(items: readonly T[]): Array<T & { alternateLinks?: string[] }> {
  return clusterWorks(items).map((group) => {
    const best = group.reduce((a, b) => (completeness(b) > completeness(a) ? b : a), group[0]);
    const links = new Set<string>();
    for (const r of group) {
      if (r === best) continue;
      const doi = bareDoi(r.doi);
      if (doi && doi !== bareDoi(best.doi)) links.add(`https://doi.org/${doi}`);
      if (r.url && r.url !== best.url) links.add(r.url);
    }
    return links.size ? { ...best, alternateLinks: [...links] } : best;
  });
}
