/**
 * Scholarly provider adapters: the ONE place that talks to OpenAlex, Crossref,
 * Semantic Scholar, Europe PMC, ERIC and repository working papers.
 *
 * Isomorphic (plain `fetch`, no browser or Node-only APIs) so the server's
 * RetrievalService and discovery.ts both call the same code. Every adapter
 * returns only what the provider actually sent: when a provider has no
 * abstract, `snippet` is empty, never a sentence written by us.
 */

import type { RawSourceInput } from "../../citation_compliance/cslEngine";

export interface ProviderOptions {
  signal?: AbortSignal;
  /** Polite-pool contact for OpenAlex (OPENALEX_MAILTO), optional. */
  mailto?: string;
  /** OpenAlex API key (OPENALEX_API_KEY), optional. */
  openAlexApiKey?: string;
  timeoutMs?: number;
}

/** Provider outcome. `error` is set when the provider failed, so callers can tell "no hits" from "down". */
export interface ProviderResult {
  provider: ProviderId;
  items: RawSourceInput[];
  error?: string;
}

export type ProviderId =
  | "openalex"
  | "crossref"
  | "semantic_scholar"
  | "europe_pmc"
  | "eric"
  | "repository";

export const CROSSREF_USER_AGENT = "ScholarCore/2.0 (https://scholar.gkshah.com.np; mailto:support@scholar-core.org)";

export function stripMarkup(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "why", "what", "how", "when", "where", "who", "which", "whom", "whose",
  "did", "does", "do", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "can", "could", "would", "should", "will", "shall",
  "the", "and", "for", "with", "from", "into", "about", "that", "this",
  "these", "those", "their", "there", "than", "then", "between", "among",
  "explain", "analyze", "describe", "tell", "give", "discuss", "overview",
]);

/** Strips question scaffolding ("what is…", "explain…") so providers search the topic itself. */
export function cleanSearchTopic(query: string): string {
  const stripped = query
    .replace(/^(?:why|what|how|when|where|who|which|did|does|do|is|are|was|were|can|could|would|should|please|tell me about|explain|analyze|describe|search for)\s+/gi, "")
    .replace(/^(?:did|does|do|is|are|was|were|the)\s+/gi, "")
    .replace(/[?.,!;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length >= 3 ? stripped : query.replace(/[?.,!;:]+/g, " ").trim();
}

export function extractQueryKeywords(query: string): string[] {
  return cleanSearchTopic(query)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/** Topical relevance 0..n: keyword coverage plus title hits, citation impact and recency. */
export function scoreRelevance(
  query: string,
  title: string,
  snippet: string,
  options: { citedByCount?: number; year?: number } = {}
): { score: number; titleMatches: number; ratio: number; keywordCount: number } {
  const keywords = extractQueryKeywords(query);
  if (keywords.length === 0) return { score: 50, titleMatches: 0, ratio: 1, keywordCount: 0 };
  const lowerTitle = (title || "").toLowerCase();
  const lowerAll = `${lowerTitle} ${(snippet || "").toLowerCase()}`;
  let titleMatches = 0;
  let totalMatches = 0;
  for (const kw of keywords) {
    const stem = kw.length > 5 ? kw.slice(0, -1) : kw;
    if (lowerTitle.includes(stem)) titleMatches++;
    if (lowerAll.includes(stem)) totalMatches++;
  }
  const ratio = totalMatches / keywords.length;
  const cited = options.citedByCount ?? 0;
  const citationBoost = cited > 0 ? Math.min(20, Math.round(Math.log10(cited + 1) * 6)) : 0;
  const nowYear = new Date().getFullYear();
  const y = options.year;
  const recencyBoost = y && y >= nowYear - 4 ? 8 : y && y >= nowYear - 10 ? 4 : 0;
  return {
    score: Math.round(ratio * 100) + titleMatches * 18 + citationBoost + recencyBoost,
    titleMatches,
    ratio,
    keywordCount: keywords.length,
  };
}

function reconstructAbstract(index?: Record<string, number[]>): string {
  if (!index || typeof index !== "object") return "";
  const words: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(index)) {
    if (Array.isArray(positions)) for (const pos of positions) words.push([pos, word]);
  }
  words.sort((a, b) => a[0] - b[0]);
  return words.map((w) => w[1]).join(" ").slice(0, 1800);
}

function bareDoi(doi?: string | null): string | undefined {
  if (!doi) return undefined;
  const clean = doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim();
  return clean || undefined;
}

function withTimeout(options: ProviderOptions): AbortSignal | undefined {
  const timeout = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(options.timeoutMs ?? 15_000) : undefined;
  if (options.signal && timeout && "any" in AbortSignal) {
    return (AbortSignal as unknown as { any(signals: AbortSignal[]): AbortSignal }).any([options.signal, timeout]);
  }
  return options.signal ?? timeout;
}

async function getJson<T>(url: string, options: ProviderOptions, label: string, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, { signal: withTimeout(options), headers: { Accept: "application/json", ...headers } });
  if (!res.ok) throw new Error(`${label} ${res.status}`);
  return (await res.json()) as T;
}

function failure(provider: ProviderId, err: unknown): ProviderResult {
  return { provider, items: [], error: err instanceof Error ? err.message : String(err) };
}

interface OpenAlexWork {
  title?: string;
  display_name?: string;
  doi?: string;
  id?: string;
  publication_year?: number;
  publication_date?: string;
  cited_by_count?: number;
  is_retracted?: boolean;
  type?: string;
  biblio?: { volume?: string; issue?: string; first_page?: string; last_page?: string };
  open_access?: { oa_url?: string };
  authorships?: Array<{ author?: { display_name?: string } }>;
  abstract_inverted_index?: Record<string, number[]>;
  primary_location?: {
    landing_page_url?: string;
    pdf_url?: string;
    source?: { display_name?: string; type?: string };
  };
}

function openAlexParams(options: ProviderOptions, base: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams(base);
  if (options.mailto) params.set("mailto", options.mailto);
  if (options.openAlexApiKey) params.set("api_key", options.openAlexApiKey);
  return params;
}

function mapOpenAlex(works: OpenAlexWork[], sourceType?: string): RawSourceInput[] {
  return works.map((w) => {
    const doi = bareDoi(w.doi);
    const venue = w.primary_location?.source?.display_name;
    const pages =
      w.biblio?.first_page && w.biblio?.last_page
        ? `${w.biblio.first_page}-${w.biblio.last_page}`
        : w.biblio?.first_page;
    const journalArticle = w.type === "article" && w.primary_location?.source?.type === "journal";
    return {
      title: w.title || w.display_name || "",
      url: w.doi ?? w.primary_location?.landing_page_url ?? w.id ?? "",
      doi,
      snippet: reconstructAbstract(w.abstract_inverted_index),
      year: w.publication_year,
      publicationDate: w.publication_date,
      authors: (w.authorships ?? []).map((a) => a.author?.display_name).filter((n): n is string => Boolean(n)),
      venue,
      journal: venue,
      volume: w.biblio?.volume,
      issue: w.biblio?.issue,
      pages,
      openAccessUrl: w.open_access?.oa_url || w.primary_location?.pdf_url,
      isRetracted: w.is_retracted === true,
      sourceType: sourceType ?? (w.type === "preprint" ? "preprint" : journalArticle ? "peer-reviewed article" : "scholarly work"),
      citedByCount: w.cited_by_count ?? 0,
    } as RawSourceInput;
  });
}

export async function searchOpenAlex(
  query: string,
  perPage = 15,
  page = 1,
  options: ProviderOptions = {}
): Promise<ProviderResult> {
  try {
    const params = openAlexParams(options, {
      search: cleanSearchTopic(query),
      "per-page": String(Math.min(50, Math.max(perPage, 5))),
      page: String(Math.max(1, page)),
    });
    const data = await getJson<{ results?: OpenAlexWork[] }>(`https://api.openalex.org/works?${params.toString()}`, options, "OpenAlex");
    return { provider: "openalex", items: mapOpenAlex(data.results ?? []) };
  } catch (err) {
    return failure("openalex", err);
  }
}

/** SSRN / RePEc / NBER and other repositories, via OpenAlex's repository filter. */
export async function searchWorkingPapers(query: string, perPage = 12, options: ProviderOptions = {}): Promise<ProviderResult> {
  try {
    const params = openAlexParams(options, {
      search: cleanSearchTopic(query),
      filter: "primary_location.source.type:repository",
      "per-page": String(Math.min(50, Math.max(perPage, 5))),
    });
    const data = await getJson<{ results?: OpenAlexWork[] }>(`https://api.openalex.org/works?${params.toString()}`, options, "OpenAlex");
    return { provider: "repository", items: mapOpenAlex(data.results ?? [], "working paper") };
  } catch (err) {
    return failure("repository", err);
  }
}

interface CrossrefItem {
  DOI?: string;
  URL?: string;
  title?: string[];
  abstract?: string;
  author?: Array<{ given?: string; family?: string; name?: string }>;
  "container-title"?: string[];
  volume?: string;
  issue?: string;
  page?: string;
  publisher?: string;
  type?: string;
  "is-referenced-by-count"?: number;
  "update-to"?: Array<{ type?: string; label?: string }>;
  published?: { "date-parts"?: number[][] };
  "published-print"?: { "date-parts"?: number[][] };
  "published-online"?: { "date-parts"?: number[][] };
  created?: { "date-parts"?: number[][] };
}

export async function searchCrossref(
  query: string,
  rows = 15,
  page = 1,
  options: ProviderOptions = {}
): Promise<ProviderResult> {
  try {
    const effectiveRows = Math.min(50, Math.max(rows, 5));
    const offset = Math.max(0, (page - 1) * effectiveRows);
    const params = new URLSearchParams({
      query: cleanSearchTopic(query),
      rows: String(effectiveRows),
      sort: "relevance",
      ...(offset > 0 ? { offset: String(offset) } : {}),
    });
    const data = await getJson<{ message?: { items?: CrossrefItem[] } }>(
      `https://api.crossref.org/works?${params.toString()}`,
      options,
      "CrossRef",
      { "User-Agent": CROSSREF_USER_AGENT }
    );
    const items = (data.message?.items ?? []).map((item): RawSourceInput => {
      const doi = bareDoi(item.DOI);
      const venue = Array.isArray(item["container-title"]) ? item["container-title"][0] : undefined;
      const dateParts =
        item.published?.["date-parts"]?.[0] ||
        item["published-print"]?.["date-parts"]?.[0] ||
        item["published-online"]?.["date-parts"]?.[0] ||
        item.created?.["date-parts"]?.[0];
      return {
        title: Array.isArray(item.title) ? stripMarkup(item.title[0] || "") : "",
        url: item.URL || (doi ? `https://doi.org/${doi}` : ""),
        doi,
        snippet: item.abstract ? stripMarkup(item.abstract).slice(0, 1800) : "",
        year: dateParts?.[0],
        publicationDate: Array.isArray(dateParts) && dateParts.length > 0 ? dateParts.join("-") : undefined,
        authors: (item.author ?? [])
          .map((a) => (a.family && a.given ? `${a.family}, ${a.given}` : a.name || a.family || ""))
          .filter(Boolean),
        venue,
        journal: venue,
        volume: item.volume,
        issue: item.issue,
        pages: item.page,
        publisher: item.publisher,
        crossrefUpdateTo: item["update-to"],
        sourceType: item.type === "proceedings-article" ? "conference paper" : item.type === "journal-article" ? "peer-reviewed article" : "scholarly work",
        citedByCount: item["is-referenced-by-count"] ?? 0,
      } as RawSourceInput;
    });
    return { provider: "crossref", items };
  } catch (err) {
    return failure("crossref", err);
  }
}

export async function searchSemanticScholar(query: string, limit = 15, options: ProviderOptions = {}): Promise<ProviderResult> {
  try {
    const params = new URLSearchParams({
      query: cleanSearchTopic(query),
      limit: String(Math.min(50, Math.max(limit, 5))),
      fields: "title,authors,year,venue,externalIds,url,abstract,citationCount,openAccessPdf,publicationDate,publicationTypes",
    });
    const data = await getJson<{
      data?: Array<{
        title?: string;
        authors?: Array<{ name?: string }>;
        year?: number;
        venue?: string;
        externalIds?: { DOI?: string };
        url?: string;
        abstract?: string;
        citationCount?: number;
        publicationDate?: string;
        openAccessPdf?: { url?: string };
        publicationTypes?: string[];
      }>;
    }>(`https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`, options, "Semantic Scholar");
    const items = (data.data ?? [])
      .filter((p) => p?.title)
      .map((p): RawSourceInput => {
        const doi = bareDoi(p.externalIds?.DOI);
        const types = p.publicationTypes ?? [];
        return {
          title: String(p.title),
          url: p.url || (doi ? `https://doi.org/${doi}` : ""),
          doi,
          snippet: p.abstract ? p.abstract.slice(0, 1800) : "",
          year: p.year,
          publicationDate: p.publicationDate,
          authors: (p.authors ?? []).map((a) => a.name).filter((n): n is string => Boolean(n)),
          venue: p.venue || undefined,
          journal: p.venue || undefined,
          openAccessUrl: p.openAccessPdf?.url,
          sourceType: types.includes("Conference") ? "conference paper" : types.includes("JournalArticle") ? "peer-reviewed article" : "scholarly work",
          citedByCount: p.citationCount ?? 0,
        } as RawSourceInput;
      });
    return { provider: "semantic_scholar", items };
  } catch (err) {
    return failure("semantic_scholar", err);
  }
}

export async function searchEuropePmc(query: string, pageSize = 12, options: ProviderOptions = {}): Promise<ProviderResult> {
  try {
    const params = new URLSearchParams({
      query: cleanSearchTopic(query),
      format: "json",
      pageSize: String(Math.min(50, Math.max(pageSize, 5))),
      resultType: "core",
    });
    const data = await getJson<{
      resultList?: {
        result?: Array<{
          title?: string;
          doi?: string;
          pmid?: string;
          pmcid?: string;
          authorString?: string;
          pubYear?: string;
          firstPublicationDate?: string;
          journalTitle?: string;
          journalVolume?: string;
          issue?: string;
          pageInfo?: string;
          abstractText?: string;
          isOpenAccess?: string;
          citedByCount?: number;
        }>;
      };
    }>(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params.toString()}`, options, "Europe PMC");
    const items = (data.resultList?.result ?? []).map((r): RawSourceInput => {
      const doi = bareDoi(r.doi);
      return {
        title: stripMarkup(r.title || ""),
        url: doi ? `https://doi.org/${doi}` : r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/` : "",
        doi,
        snippet: r.abstractText ? stripMarkup(r.abstractText).slice(0, 1800) : "",
        year: r.pubYear,
        publicationDate: r.firstPublicationDate,
        authors: r.authorString
          ? r.authorString.replace(/\.$/, "").split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        venue: r.journalTitle,
        journal: r.journalTitle,
        volume: r.journalVolume,
        issue: r.issue,
        pages: r.pageInfo,
        openAccessUrl: r.isOpenAccess === "Y" && r.pmcid ? `https://europepmc.org/articles/${r.pmcid}?pdf=render` : undefined,
        sourceType: "peer-reviewed article",
        citedByCount: r.citedByCount ?? 0,
      } as RawSourceInput;
    });
    return { provider: "europe_pmc", items };
  } catch (err) {
    return failure("europe_pmc", err);
  }
}

export async function searchEric(query: string, rows = 12, options: ProviderOptions = {}): Promise<ProviderResult> {
  try {
    const params = new URLSearchParams({
      search: cleanSearchTopic(query),
      format: "json",
      rows: String(Math.min(50, Math.max(rows, 5))),
    });
    const data = await getJson<{
      response?: {
        docs?: Array<{
          id?: string;
          title?: string;
          author?: string[];
          publicationdateyear?: number | string;
          description?: string;
          source?: string;
          url?: string;
          peerreviewed?: string | boolean;
        }>;
      };
    }>(`https://api.ies.ed.gov/eric/?${params.toString()}`, options, "ERIC");
    const items = (data.response?.docs ?? [])
      .map((doc): RawSourceInput => ({
        title: stripMarkup(doc.title || ""),
        url: doc.url || (doc.id ? `https://eric.ed.gov/?id=${encodeURIComponent(doc.id)}` : ""),
        snippet: doc.description ? stripMarkup(doc.description).slice(0, 1800) : "",
        year: doc.publicationdateyear,
        authors: Array.isArray(doc.author) ? doc.author.filter(Boolean) : [],
        venue: doc.source || undefined,
        journal: doc.source || undefined,
        publisher: "Institute of Education Sciences (ERIC)",
        sourceType: doc.peerreviewed === "T" || doc.peerreviewed === true ? "peer-reviewed article" : "institutional report",
      }))
      .filter((d) => d.title && d.url);
    return { provider: "eric", items };
  } catch (err) {
    return failure("eric", err);
  }
}
