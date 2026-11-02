/**
 * A reference as a bibliographic record (close to CSL-JSON), built from what
 * Crossref or DataCite registered for a DOI, or from what the author typed.
 * Nothing is filled in: a field the source does not give stays empty.
 * Pure; no I/O.
 */
import { z } from "zod";

export const refNameSchema = z.object({
  family: z.string(),
  given: z.string().optional(),
});
export type RefName = z.infer<typeof refNameSchema>;

/**
 * clean: registered, no retraction or concern on record.
 * retracted / concern / corrected: a notice is registered against the work.
 * unknown: never checked, or the registry could not be reached.
 */
export const integrityStatusSchema = z.enum(["clean", "retracted", "concern", "corrected", "unknown"]);
export type IntegrityStatus = z.infer<typeof integrityStatusSchema>;

export const referenceRecordSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["article", "book", "chapter", "dataset", "other"]),
  title: z.string(),
  authors: z.array(refNameSchema),
  year: z.number().int().optional(),
  container: z.string().optional(),
  volume: z.string().optional(),
  issue: z.string().optional(),
  pages: z.string().optional(),
  publisher: z.string().optional(),
  doi: z.string().optional(),
  url: z.string().optional(),
  /** Where the record came from: a DOI registry, or the author's own entry. */
  registry: z.enum(["crossref", "datacite", "author"]),
  integrity: z
    .object({
      status: integrityStatusSchema,
      /** DOI or URL of the retraction / concern / correction notice. */
      notice: z.string().optional(),
      checkedAt: z.string(),
    })
    .optional(),
});
export type ReferenceRecord = z.infer<typeof referenceRecordSchema>;

/** The registry part of a DOI, or null when the text is not a DOI. */
export function cleanDoi(raw: string | undefined | null): string | null {
  const s = String(raw ?? "")
    .trim()
    .replace(/^https?:\/\/(?:dx\.|www\.)?doi\.org\//i, "")
    .replace(/^(?:dx\.|www\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .replace(/[.,;]+$/, "")
    .trim();
  return /^10\.\d{4,9}\/\S+$/.test(s) ? s : null;
}

/** A source id for a DOI: stable, and safe inside [CITE:id]. */
export function sourceIdForDoi(doi: string): string {
  return `doi_${doi.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`.slice(0, 80);
}

const str = (v: unknown): string | undefined => {
  if (Array.isArray(v)) return str(v[0]);
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return undefined;
  const t = v.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return t || undefined;
};
const yearOf = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 && n < 3000 ? n : undefined;
};

/** "Smith, Jane", "Jane Smith" or "J. Smith" → family and given names. */
export function parseName(raw: string): RefName | null {
  const s = raw.replace(/\s+/g, " ").trim().replace(/\s+et al\.?$/i, "");
  if (!s) return null;
  if (s.includes(",")) {
    const [family, ...rest] = s.split(",");
    const given = rest.join(",").trim();
    return given ? { family: family.trim(), given } : { family: family.trim() };
  }
  const parts = s.split(" ");
  if (parts.length === 1) return { family: s };
  return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(" ") };
}

type Json = Record<string, unknown>;

const CROSSREF_KIND: Record<string, ReferenceRecord["kind"]> = {
  "journal-article": "article",
  "proceedings-article": "article",
  book: "book",
  monograph: "book",
  "edited-book": "book",
  "reference-book": "book",
  "book-chapter": "chapter",
  "book-section": "chapter",
  "book-part": "chapter",
  dataset: "dataset",
};

function crossrefYear(m: Json): number | undefined {
  for (const k of ["published-print", "published-online", "published", "issued", "created"]) {
    const parts = (m[k] as { "date-parts"?: unknown[][] } | undefined)?.["date-parts"]?.[0];
    const y = yearOf(Array.isArray(parts) ? parts[0] : undefined);
    if (y) return y;
  }
  return undefined;
}

/** A Crossref `message` (from api.crossref.org/works/{doi}) as a record. */
export function recordFromCrossref(m: Json, id: string, doi: string): ReferenceRecord {
  const authors = (Array.isArray(m.author) ? (m.author as Json[]) : [])
    .map((a): RefName | null => {
      const family = str(a.family) ?? str(a.name);
      if (!family) return null;
      const given = str(a.given);
      return given ? { family, given } : { family };
    })
    .filter((a): a is RefName => a !== null);
  const kind = CROSSREF_KIND[String(m.type ?? "")] ?? "other";
  return {
    id,
    kind,
    title: str(m.title) ?? "",
    authors,
    year: crossrefYear(m),
    container: str(m["container-title"]),
    volume: str(m.volume),
    issue: str(m.issue),
    pages: str(m.page),
    publisher: str(m.publisher),
    doi,
    url: `https://doi.org/${doi}`,
    registry: "crossref",
  };
}

/**
 * Whether Crossref has a retraction, expression of concern or correction
 * registered against the work. Since 2023 Crossref carries Retraction Watch
 * data as `updated-by` on the original work; `update-to` is on the notice.
 */
export function integrityFromCrossref(m: Json, checkedAt: string): NonNullable<ReferenceRecord["integrity"]> {
  const type = String(m.type ?? "").toLowerCase();
  const subtype = String(m.subtype ?? "").toLowerCase();
  if (type === "retraction" || subtype === "retraction") {
    return { status: "retracted", notice: str(m.URL), checkedAt };
  }
  const updates = [m["updated-by"], m["update-to"]].flatMap((u) => (Array.isArray(u) ? (u as Json[]) : []));
  const noticeOf = (u: Json) => {
    const d = str(u.DOI) ?? str(u.doi);
    return d ? `https://doi.org/${d}` : undefined;
  };
  const find = (re: RegExp) => updates.find((u) => re.test(String(u.type ?? u["type-label"] ?? u.label ?? "").toLowerCase()));
  const retraction = find(/retract|withdraw|removal/);
  if (retraction) return { status: "retracted", notice: noticeOf(retraction), checkedAt };
  const concern = find(/concern/);
  if (concern) return { status: "concern", notice: noticeOf(concern), checkedAt };
  const correction = find(/correct|erratum|corrigendum/);
  if (correction) return { status: "corrected", notice: noticeOf(correction), checkedAt };
  return { status: "clean", checkedAt };
}

/** A DataCite `data.attributes` object (arXiv, Zenodo, Figshare…) as a record. */
export function recordFromDataCite(a: Json, id: string, doi: string): ReferenceRecord {
  const authors = (Array.isArray(a.creators) ? (a.creators as Json[]) : [])
    .map((c): RefName | null => {
      const family = str(c.familyName);
      const given = str(c.givenName);
      if (family) return given ? { family, given } : { family };
      const name = str(c.name);
      return name ? parseName(name) : null;
    })
    .filter((a): a is RefName => a !== null);
  const titles = Array.isArray(a.titles) ? (a.titles as Json[]) : [];
  const typeGeneral = String((a.types as Json | undefined)?.resourceTypeGeneral ?? "").toLowerCase();
  const container = (a.container as Json | undefined)?.title;
  return {
    id,
    kind: typeGeneral === "dataset" ? "dataset" : typeGeneral === "journalarticle" ? "article" : typeGeneral === "book" ? "book" : "other",
    title: str(titles[0]?.title) ?? "",
    authors,
    year: yearOf(a.publicationYear),
    container: str(container),
    publisher: str(typeof a.publisher === "object" && a.publisher ? (a.publisher as Json).name : a.publisher),
    doi,
    url: `https://doi.org/${doi}`,
    registry: "datacite",
  };
}

/** What the author recorded for a source, as a record (nothing added). */
export function recordFromEntry(e: {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  isUserData?: boolean;
}): ReferenceRecord {
  const doi = cleanDoi(e.doi) ?? undefined;
  return {
    id: e.id,
    kind: e.isUserData ? "dataset" : "other",
    title: e.title,
    authors: e.authors.map(parseName).filter((n): n is RefName => n !== null),
    year: e.year,
    doi,
    url: doi ? `https://doi.org/${doi}` : undefined,
    registry: "author",
  };
}

/** Records saved on the project (answers.reference_records), keyed by source id. */
export function parseReferenceRecords(raw: unknown): Record<string, ReferenceRecord> {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, ReferenceRecord> = {};
  for (const [k, rec] of Object.entries(v as Record<string, unknown>)) {
    const parsed = referenceRecordSchema.safeParse(rec);
    if (parsed.success) out[k] = parsed.data;
  }
  return out;
}
