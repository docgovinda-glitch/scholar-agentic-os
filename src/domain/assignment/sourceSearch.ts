/**
 * Coursework source search, the pure part: turning records from the shared
 * retrieval pipeline into the workspace's sources, with honest verification
 * and relevance. Used by POST /assignment/sources/search. No I/O.
 *
 * - Verification uses the one citation engine (`verifyAndConvertToCSL`):
 *   "verified" = a citable record (title, author, year) with a DOI from a
 *   scholarly index; "unverified" = citable but no DOI; "metadata_incomplete"
 *   = not citable as it stands (shown apart, under "Needs checking").
 *   Nothing missing is filled in.
 * - Relevance is the measured overlap with the brief's subject words and the
 *   search phrases over title, venue and abstract (0-100), never rescaled so
 *   that the best result reads high.
 * - Ids are stable for the same work, so a re-run search matches what is
 *   already listed.
 */
import { verifyAndConvertToCSL } from "../../citation_compliance/cslEngine";
import { formatSourceBibliography } from "../../desk/assignment/services/citationFormatService";
import type { DiscoveredSource, SourceVerificationStatus } from "../../desk/assignment/types";
import { bareDoi, workKeys } from "../../shared/retrieval/identity";
import { scoreSourceRelevance } from "../../utils/briefSourceQueries";
import { extractPrescribedReferences, parsePrescribedBibliography, type BriefQuestionRow } from "../../utils/briefQuestions";
import { explainSourceFit } from "../../utils/sourceFit";

/** A record as the retrieval pipeline returns it (RetrievedSource without its server-only fields). */
export interface FoundRecord {
  title?: string;
  authors?: unknown;
  year?: string | number;
  venue?: string;
  publisher?: string;
  doi?: string;
  url?: string;
  snippet?: string;
  sourceType?: string;
  provider?: string;
  citedByCount?: number;
  openAccessUrl?: string;
  alternateLinks?: string[];
}

export interface SearchContext {
  queries: string[];
  domainTerms: string[];
  questionRows: BriefQuestionRow[];
}

const authorList = (authors: unknown): string[] =>
  (Array.isArray(authors) ? authors : [])
    .map((a) => (typeof a === "string" ? a : a && typeof a === "object" ? String((a as { literal?: string; family?: string; given?: string }).literal ?? [(a as { given?: string }).given, (a as { family?: string }).family].filter(Boolean).join(" ")) : ""))
    .map((a) => a.trim())
    .filter(Boolean);

const yearOf = (year: unknown): string => {
  const m = /\b(1[5-9]\d\d|20\d\d)\b/.exec(String(year ?? ""));
  return m ? m[1] : "";
};

/** What the citation engine makes of the record (see the module comment). */
export function verificationOf(r: FoundRecord): SourceVerificationStatus {
  const check = verifyAndConvertToCSL({ title: r.title, authors: authorList(r.authors), year: yearOf(r.year) || undefined, venue: r.venue, publisher: r.publisher, doi: r.doi, url: r.url, sourceType: r.sourceType });
  if (!check.ok) return "metadata_incomplete";
  return bareDoi(r.doi) ? "verified" : "unverified";
}

/** The same id for the same work, whichever search found it. */
export function stableSourceId(r: FoundRecord): string {
  const key = workKeys({ title: r.title, doi: r.doi, url: r.url, authors: authorList(r.authors), year: r.year })[0] ?? `${r.title ?? ""}|${r.url ?? ""}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return `src-${(h >>> 0).toString(36)}`;
}

function typeOf(sourceType: string | undefined): string {
  if (!sourceType) return "journal";
  if (/book/i.test(sourceType)) return "book";
  if (/conference/i.test(sourceType)) return "conference";
  if (/preprint/i.test(sourceType)) return "preprint";
  if (/report|institution|government|official/i.test(sourceType)) return "report";
  return "journal";
}

/** Relevance of a record to the brief (0-100, measured; 0 = off topic). */
export function relevanceOf(r: FoundRecord, ctx: SearchContext): number {
  return scoreSourceRelevance({ title: r.title ?? "", venue: r.venue, abstract: r.snippet }, ctx.domainTerms, ctx.queries);
}

/** A found record as a workspace source; nothing missing is filled in. */
export function toDiscoveredSource(r: FoundRecord, ctx: SearchContext, citationStyle: string, relevance = relevanceOf(r, ctx)): DiscoveredSource {
  const authors = authorList(r.authors);
  const year = yearOf(r.year);
  const doi = bareDoi(r.doi);
  const why = explainSourceFit({ title: r.title ?? "", venue: r.venue }, ctx.questionRows, ctx.queries[0] ?? "");
  const peer = r.sourceType === "peer-reviewed article" || r.sourceType === "conference paper";
  return {
    id: stableSourceId(r),
    title: r.title ?? "",
    authors,
    year,
    type: typeOf(r.sourceType),
    journal: r.venue || undefined,
    publisher: r.publisher || undefined,
    doi,
    url: r.url || (doi ? `https://doi.org/${doi}` : undefined),
    abstract: r.snippet || undefined,
    relevanceScore: relevance,
    mainFinding: "",
    suggestedUse: "",
    ...(why ? { whyThisSource: why } : {}),
    citation: formatSourceBibliography({ title: r.title ?? "", authors, year: year || "n.d.", journal: r.venue, doi, url: r.url }, citationStyle || "apa7"),
    status: "kept",
    verificationStatus: verificationOf(r),
    isActive: true,
    retrievalSource: r.provider,
    retrievedAt: new Date().toISOString(),
    peerReviewed: peer ? true : null,
    publicationStatus: /preprint/i.test(r.sourceType ?? "") ? "preprint" : "published",
    isVerifiedAcademic: Boolean(doi) || peer,
    isOpenAccess: Boolean(r.openAccessUrl),
    citationCount: typeof r.citedByCount === "number" ? r.citedByCount : undefined,
    ...(r.alternateLinks?.length ? { alternateLinks: r.alternateLinks } : {}),
    sourceOrigin: "system_found",
    originTag: "ai-research",
  };
}

/**
 * The references the brief itself names, listed first with the "Prescribed in
 * Brief" flag. A printed reference list is used exactly as given; a citation
 * named only in the text ("Preskill (2018)") is looked up and kept when an
 * index confirms the author and year, otherwise kept as the brief names it
 * (unverified, never completed with made-up details). `lookup` searches the
 * scholarly indexes (the server passes the shared providers).
 */
export async function prescribedFromBrief(
  briefText: string,
  ctx: SearchContext,
  citationStyle: string,
  lookup: (query: string) => Promise<FoundRecord[]>
): Promise<DiscoveredSource[]> {
  const bibliography = parsePrescribedBibliography(briefText);
  const fromBibliography: DiscoveredSource[] = bibliography.map((b, i) => ({
    id: `prescribed-bib-${i}-${b.year}`,
    title: b.title,
    authors: b.etAl ? [...b.authors, "et al."] : b.authors,
    year: String(b.year),
    type: b.isBook ? "book" : "journal",
    journal: b.isBook ? undefined : b.venue,
    publisher: b.publisher,
    volume: b.volume,
    issue: b.issue,
    pages: b.pages,
    doi: b.doi,
    url: b.doi ? `https://doi.org/${b.doi}` : undefined,
    mainFinding: "",
    suggestedUse: "Named in your assignment brief.",
    whyThisSource: "Named in your assignment brief.",
    citation: b.raw,
    status: "kept" as const,
    verificationStatus: b.doi ? ("verified" as const) : ("unverified" as const),
    isActive: true,
    relevanceScore: 100,
    sourceOrigin: "system_found" as const,
    prescribedInBrief: true,
  }));
  const familyYear = (fam: string, year: number | string) => `${fam.toLowerCase()}|${year}`;
  const covered = new Set(bibliography.map((b) => familyYear((b.authors[0] ?? "").split(",")[0], b.year)));

  const refs = extractPrescribedReferences(briefText).filter((r) => !covered.has(familyYear(r.authors.split(/\s|&|,/)[0], r.year)));
  if (refs.length === 0) return fromBibliography;
  const topic = (ctx.queries[0] || "").split(" ").slice(0, 3).join(" ");
  const looked = await Promise.all(
    refs.map(async (ref, i): Promise<DiscoveredSource> => {
      const surname = ref.authors.split(/\s|&|,/)[0];
      const found = await lookup(`${surname} ${topic}`.trim()).catch(() => [] as FoundRecord[]);
      const hit = found.find((d) => yearOf(d.year) === String(ref.year) && authorList(d.authors).some((a) => a.toLowerCase().includes(surname.toLowerCase())));
      if (hit) {
        return { ...toDiscoveredSource(hit, ctx, citationStyle, 100), id: `prescribed-${i}-${ref.year}`, prescribedInBrief: true, whyThisSource: "Named in your assignment brief." };
      }
      // Unresolved: kept as the brief names it, "et al." as a flag, never as a surname.
      const etAl = /\bet\.?\s*al/i.test(ref.authors);
      const names = ref.authors.replace(/\s*et\.?\s*al\.?/i, "").split(/\s+(?:and|&)\s+/).map((n) => n.trim()).filter(Boolean);
      return {
        id: `prescribed-${i}-${ref.year}`,
        title: `Reference named in your brief: ${ref.label}`,
        authors: etAl ? [...names, "et al."] : names,
        year: String(ref.year),
        type: "journal",
        mainFinding: "",
        suggestedUse: "Named in your assignment brief.",
        whyThisSource: "Named in your assignment brief. Add its full details to cite it.",
        citation: ref.label,
        status: "kept",
        verificationStatus: "unverified",
        isActive: true,
        relevanceScore: 100,
        sourceOrigin: "system_found",
        prescribedInBrief: true,
      };
    })
  );
  return [...fromBibliography, ...looked];
}
