/**
 * Real client-side citation-metadata lookup against Crossref and OpenAlex — replaces
 * the prior hardcoded-stub behavior in aiService.ts's enrichCitationMetadata, which
 * returned identical fabricated content (fake abstract, fake "named entities" like
 * "Stanford University"/"Crossref API") regardless of the actual paper. Same defect
 * pattern already fixed for discoverDataSources/discoverJournals, and the same
 * conventions are reused here: per-source try/catch tolerance, AbortSignal.timeout,
 * honest gaps instead of fabrication.
 *
 * Unlike literatureRetrievalService/journalRetrievalService (which search for a LIST
 * of candidates), this is a single-record lookup — enriching one already-identified
 * citation, not discovering new ones. When looking up by DOI, both sources' results
 * describe the same work and can be safely merged (gap-filling). When falling back to
 * a title search (no DOI available), Crossref's and OpenAlex's top hits may describe
 * DIFFERENT papers — merging fields across two different by-title matches would
 * silently Frankenstein two records together, so in that case only one source's
 * result is used (Crossref preferred, OpenAlex as fallback), never both.
 */

const REQUEST_TIMEOUT_MS = 10000;

export interface CitationLookupResult {
  title: string;
  abstract: string;
  authors: { firstName: string; lastName: string }[];
  journalName: string;
  publisher: string;
  volume: string;
  issue: string;
  issn: string;
  eissn: string;
  year: string;
  doi: string;
  openAlexId: string;
  isOpenAccess: boolean | null;
  source: "Crossref" | "OpenAlex" | "PubMed" | "Open Library";
}

export interface CitationEnrichmentResult {
  /** One result per source that found a match. Same work if looked up by DOI. */
  matches: CitationLookupResult[];
  sourceErrors: string[];
}

function splitAuthorName(given: string | undefined, family: string | undefined): { firstName: string; lastName: string } {
  return { firstName: given || "", lastName: family || "" };
}

function crossrefItemToResult(item: any): CitationLookupResult {
  return {
    title: Array.isArray(item.title) ? item.title[0] || "" : item.title || "",
    abstract: typeof item.abstract === "string" ? item.abstract.replace(/<[^>]+>/g, "").trim() : "",
    authors: Array.isArray(item.author) ? item.author.map((a: any) => splitAuthorName(a.given, a.family)) : [],
    journalName: Array.isArray(item["container-title"]) ? item["container-title"][0] || "" : "",
    publisher: item.publisher || "",
    volume: item.volume || "",
    issue: item.issue || "",
    issn: Array.isArray(item.ISSN) ? item.ISSN[0] || "" : "",
    eissn: Array.isArray(item.ISSN) && item.ISSN[1] ? item.ISSN[1] : "",
    year: String(
      item.published?.["date-parts"]?.[0]?.[0]
        ?? item["published-print"]?.["date-parts"]?.[0]?.[0]
        ?? item.issued?.["date-parts"]?.[0]?.[0]
        ?? ""
    ),
    doi: item.DOI || "",
    openAlexId: "",
    isOpenAccess: null,
    source: "Crossref",
  };
}

function reconstructOpenAlexAbstract(invertedIndex: Record<string, number[]> | undefined): string {
  if (!invertedIndex) return "";
  const positions: string[] = [];
  for (const [word, indices] of Object.entries(invertedIndex)) {
    for (const idx of indices) positions[idx] = word;
  }
  return positions.filter(Boolean).join(" ");
}

function openAlexItemToResult(item: any): CitationLookupResult {
  return {
    title: item.title || item.display_name || "",
    abstract: reconstructOpenAlexAbstract(item.abstract_inverted_index),
    authors: Array.isArray(item.authorships)
      ? item.authorships.map((a: any) => {
          const name: string = a.author?.display_name || "";
          const parts = name.split(" ");
          return { firstName: parts.slice(0, -1).join(" "), lastName: parts.slice(-1).join(" ") };
        })
      : [],
    journalName: item.primary_location?.source?.display_name || item.host_venue?.display_name || "",
    publisher: item.primary_location?.source?.host_organization_name || "",
    volume: item.biblio?.volume || "",
    issue: item.biblio?.issue || "",
    issn: Array.isArray(item.primary_location?.source?.issn) ? item.primary_location.source.issn[0] || "" : "",
    eissn: "",
    year: item.publication_year ? String(item.publication_year) : "",
    doi: item.doi ? item.doi.replace(/^https?:\/\/doi\.org\//, "") : "",
    openAlexId: item.id || "",
    isOpenAccess: typeof item.open_access?.is_oa === "boolean" ? item.open_access.is_oa : null,
    source: "OpenAlex",
  };
}

function pubmedItemToResult(item: any): CitationLookupResult {
  return {
    title: item.title || "",
    abstract: "", // not exposed by esummary; would need a separate efetch call
    authors: Array.isArray(item.authors)
      ? item.authors.map((a: any) => {
          const name: string = a.name || "";
          const parts = name.split(" ");
          return { firstName: parts.slice(0, -1).join(" "), lastName: parts.slice(-1).join(" ") };
        })
      : [],
    journalName: item.fulljournalname || item.source || "",
    publisher: "",
    volume: item.volume || "",
    issue: item.issue || "",
    issn: item.issn || "",
    eissn: item.essn || "",
    year: (item.pubdate || "").match(/\d{4}/)?.[0] || "",
    doi: (item.articleids || []).find((id: any) => id.idtype === "doi")?.value || "",
    openAlexId: "",
    isOpenAccess: null,
    source: "PubMed",
  };
}

function openLibraryItemToResult(item: any): CitationLookupResult {
  return {
    title: item.title || "",
    abstract: "", // Open Library's book API doesn't expose an abstract/description here
    authors: Array.isArray(item.authors)
      ? item.authors.map((a: any) => {
          const name: string = a.name || "";
          const parts = name.split(" ");
          return { firstName: parts.slice(0, -1).join(" "), lastName: parts.slice(-1).join(" ") };
        })
      : [],
    journalName: "", // not applicable to a book
    publisher: Array.isArray(item.publishers) ? item.publishers[0]?.name || "" : "",
    volume: "",
    issue: "",
    issn: "",
    eissn: "",
    year: (item.publish_date || "").match(/\d{4}/)?.[0] || "",
    doi: "",
    openAlexId: "",
    isOpenAccess: null,
    source: "Open Library",
  };
}

async function lookupCrossrefByDoi(doi: string): Promise<CitationLookupResult | null> {
  const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Crossref returned HTTP ${res.status}`);
  const data = await res.json();
  return data?.message ? crossrefItemToResult(data.message) : null;
}

async function lookupOpenAlexByDoi(doi: string): Promise<CitationLookupResult | null> {
  const res = await fetch(`https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OpenAlex returned HTTP ${res.status}`);
  const data = await res.json();
  return data && !data.error ? openAlexItemToResult(data) : null;
}

async function lookupPubmedById(pmid: string): Promise<CitationLookupResult | null> {
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`PubMed returned HTTP ${res.status}`);
  const data = await res.json();
  const item = data?.result?.[pmid];
  // A PMID unknown to PubMed doesn't 404 — esummary echoes it back under `uids` with
  // no matching key, so absence of the keyed record is the actual "not found" signal.
  return item ? pubmedItemToResult(item) : null;
}

function normalizeOpenAlexId(id: string): string {
  return id.trim().replace(/^https?:\/\/(api\.)?openalex\.org\//, "");
}

async function lookupOpenAlexById(id: string): Promise<CitationLookupResult | null> {
  const res = await fetch(`https://api.openalex.org/works/${encodeURIComponent(normalizeOpenAlexId(id))}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OpenAlex returned HTTP ${res.status}`);
  const data = await res.json();
  return data && !data.error ? openAlexItemToResult(data) : null;
}

function normalizeIsbn(isbn: string): string {
  return isbn.trim().replace(/[^0-9Xx]/g, "");
}

async function lookupOpenLibraryByIsbn(isbn: string): Promise<CitationLookupResult | null> {
  const cleaned = normalizeIsbn(isbn);
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(cleaned)}&format=json&jscmd=data`;
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Open Library returned HTTP ${res.status}`);
  const data = await res.json();
  const item = data?.[`ISBN:${cleaned}`];
  return item ? openLibraryItemToResult(item) : null;
}

const TITLE_MATCH_THRESHOLD = 0.5;

function normalizeTitleWords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Word-overlap similarity check, required before trusting ANY title-search result as
 * "the same paper" — empirically necessary (2026-07-22), not defensive paranoia:
 * Crossref's /works?query.title= endpoint never returns zero results for `rows>=1`,
 * even for a deliberately nonsensical query — it returned one of Crossref's own
 * internal deleted-DOI test/tombstone records (10.50505/nturpintest-blabla-2,
 * "Totally different Title") as its "best available" match. Without this guard,
 * that record's real bibliographic data would have been merged into an unrelated
 * citation and presented as verified — arguably worse than the fabrication this
 * whole fix removes, since it attaches genuinely real facts to the wrong paper.
 * OpenAlex's /works?search= was observed to correctly return zero results for the
 * same nonsense query, but the check is applied to both sources for consistency.
 */
function isPlausibleTitleMatch(queryTitle: string, candidateTitle: string): boolean {
  const queryWords = normalizeTitleWords(queryTitle);
  if (queryWords.length === 0) return false;
  const candidateWords = new Set(normalizeTitleWords(candidateTitle));
  const sharedCount = queryWords.filter((w) => candidateWords.has(w)).length;
  return sharedCount / queryWords.length >= TITLE_MATCH_THRESHOLD;
}

async function lookupCrossrefByTitle(title: string): Promise<CitationLookupResult | null> {
  const url = `https://api.crossref.org/works?query.title=${encodeURIComponent(title)}&rows=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Crossref returned HTTP ${res.status}`);
  const data = await res.json();
  const item = data?.message?.items?.[0];
  if (!item) return null;
  const result = crossrefItemToResult(item);
  return isPlausibleTitleMatch(title, result.title) ? result : null;
}

async function lookupOpenAlexByTitle(title: string): Promise<CitationLookupResult | null> {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(title)}&per-page=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`OpenAlex returned HTTP ${res.status}`);
  const data = await res.json();
  const item = data?.results?.[0];
  if (!item) return null;
  const result = openAlexItemToResult(item);
  return isPlausibleTitleMatch(title, result.title) ? result : null;
}

/**
 * Looks up a citation by DOI (preferred — both sources describe the same work, so
 * results from both are returned and safe to merge) or by title (fallback — only the
 * first successful source's result is returned, since two by-title top hits can be
 * different papers).
 */
export async function lookupCitation(params: { doi?: string; title?: string }): Promise<CitationEnrichmentResult> {
  const doi = params.doi?.trim();
  const title = params.title?.trim();

  if (!doi && !title) {
    throw new Error("Cannot enrich a citation without a DOI or a title to look up.");
  }

  const sourceErrors: string[] = [];

  if (doi) {
    const settled = await Promise.allSettled([lookupCrossrefByDoi(doi), lookupOpenAlexByDoi(doi)]);
    const matches: CitationLookupResult[] = [];
    settled.forEach((outcome, i) => {
      const source = i === 0 ? "Crossref" : "OpenAlex";
      if (outcome.status === "fulfilled") {
        if (outcome.value) matches.push(outcome.value);
      } else {
        const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        sourceErrors.push(`${source}: ${reason}`);
      }
    });
    return { matches, sourceErrors };
  }

  // Title-only fallback: try Crossref first, then OpenAlex — never both, to avoid
  // silently combining fields from two potentially different papers.
  try {
    const crossrefMatch = await lookupCrossrefByTitle(title!);
    if (crossrefMatch) return { matches: [crossrefMatch], sourceErrors };
  } catch (e) {
    sourceErrors.push(`Crossref: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const openAlexMatch = await lookupOpenAlexByTitle(title!);
    if (openAlexMatch) return { matches: [openAlexMatch], sourceErrors };
  } catch (e) {
    sourceErrors.push(`OpenAlex: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { matches: [], sourceErrors };
}

/** Identifier types this file can actually look up against a real, CORS-clean source. */
const SUPPORTED_IDENTIFIER_TYPES = ["DOI", "PMID", "OPENALEX", "ISBN"] as const;

export interface IdentifierLookupResult {
  /** One entry per source that found a match — DOI lookups may return two (see lookupCitation's doc comment for why title lookups never do). */
  matches: CitationLookupResult[];
  sourceErrors: string[];
  /** False when `type` has no real lookup implemented yet (see the doc comment below) — distinct from "looked it up and found nothing." */
  supported: boolean;
}

/**
 * Looks up a citation by a specific identifier type and value — DOI, PMID, an
 * OpenAlex work ID, or an ISBN. Each of these maps onto exactly one real, CORS-clean,
 * already-verified source (Crossref+OpenAlex for DOI, PubMed's esummary for PMID,
 * OpenAlex directly for its own IDs, Open Library for ISBN).
 *
 * Every other identifier type this app's UI offers (URL Import, SSRN, Zenodo,
 * ResearchGate, Google Books, YouTube, Podcast) has no equivalent free, structured,
 * CORS-clean API — they're arbitrary-web-page or media-transcript problems, not
 * bibliographic-metadata lookups, and (like arXiv, explicitly out of scope here)
 * would need the accepted fetch/search proxy or an entirely different feature, not a
 * client-side fix. Rather than fabricate anything for those, `supported: false` is
 * returned so the caller can be honest about it not being available yet.
 */
export async function lookupByIdentifier(identifier: string, type: string): Promise<IdentifierLookupResult> {
  const value = identifier.trim();
  const normalizedType = type.trim().toUpperCase();

  if (!value || !SUPPORTED_IDENTIFIER_TYPES.includes(normalizedType as (typeof SUPPORTED_IDENTIFIER_TYPES)[number])) {
    return { matches: [], sourceErrors: [], supported: false };
  }

  if (normalizedType === "DOI") {
    const { matches, sourceErrors } = await lookupCitation({ doi: value });
    return { matches, sourceErrors, supported: true };
  }

  const sourceErrors: string[] = [];
  try {
    let match: CitationLookupResult | null = null;
    if (normalizedType === "PMID") match = await lookupPubmedById(value);
    else if (normalizedType === "OPENALEX") match = await lookupOpenAlexById(value);
    else if (normalizedType === "ISBN") match = await lookupOpenLibraryByIsbn(value);
    return { matches: match ? [match] : [], sourceErrors, supported: true };
  } catch (e) {
    sourceErrors.push(e instanceof Error ? e.message : String(e));
    return { matches: [], sourceErrors, supported: true };
  }
}
