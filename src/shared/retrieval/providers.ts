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
import { stripTags } from "../markupText";

export interface ProviderOptions {
  signal?: AbortSignal;
  /** Polite-pool contact for OpenAlex (OPENALEX_MAILTO), optional. */
  mailto?: string;
  /** OpenAlex API key (OPENALEX_API_KEY), optional. */
  openAlexApiKey?: string;
  timeoutMs?: number;
  /** Extra query parameters for search calls (provider filters such as a publication-year floor). */
  extraParams?: Record<string, string>;
  /** Injected fetch (tests, or a caller with its own transport). Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
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
  | "doaj"
  | "datacite"
  | "arxiv"
  | "repository";

export const CROSSREF_USER_AGENT = "ScholarCore/2.0 (https://scholar.gkshah.com.np; mailto:support@scholar-core.org)";

/** Plain text of an abstract or title: tags removed (inline ones without a gap, see stripTags), entities decoded. */
export function stripMarkup(html: string): string {
  return stripTags(html)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Plain text of a title, without a field label some records carry inside the title
 * itself ("Title: Spaced-Repetition Learning…" from a preprint server).
 */
export function titleText(raw: string): string {
  return stripMarkup(raw).replace(/^(?:article\s+)?title\s*[:：]\s*/i, "");
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

export function reconstructOpenAlexAbstract(index?: Record<string, number[]> | null): string {
  if (!index || typeof index !== "object") return "";
  const words: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(index)) {
    if (Array.isArray(positions)) for (const pos of positions) words.push([pos, word]);
  }
  words.sort((a, b) => a[0] - b[0]);
  return words.map((w) => w[1]).join(" ");
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
  const res = await (options.fetchImpl ?? fetch)(url, { signal: withTimeout(options), headers: { Accept: "application/json", ...headers } });
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
  open_access?: { oa_url?: string; is_oa?: boolean };
  authorships?: Array<{ author?: { display_name?: string } }>;
  abstract_inverted_index?: Record<string, number[]>;
  concepts?: Array<{ display_name?: string }>;
  primary_location?: {
    landing_page_url?: string;
    pdf_url?: string;
    is_oa?: boolean;
    source?: { id?: string; display_name?: string; type?: string; issn_l?: string; host_organization_name?: string };
  };
}

function openAlexParams(options: ProviderOptions, base: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams(base);
  if (options.mailto) params.set("mailto", options.mailto);
  if (options.openAlexApiKey) params.set("api_key", options.openAlexApiKey);
  for (const [k, v] of Object.entries(options.extraParams ?? {})) params.set(k, v);
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
      id: w.id ? w.id.split("/").pop() : undefined,
      title: titleText(w.title || w.display_name || ""),
      url: w.doi ?? w.primary_location?.landing_page_url ?? w.id ?? "",
      doi,
      snippet: reconstructOpenAlexAbstract(w.abstract_inverted_index).slice(0, 1800),
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
      issn: w.primary_location?.source?.issn_l,
      venueId: w.primary_location?.source?.id?.replace("https://openalex.org/", ""),
      publisher: w.primary_location?.source?.host_organization_name,
      themes: (w.concepts ?? []).slice(0, 4).map((c) => (c.display_name ?? "").toLowerCase().replace(/\s+/g, "-")).filter(Boolean),
      isOpenAccess: Boolean(w.open_access?.is_oa || w.primary_location?.is_oa),
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
      "per-page": String(Math.min(200, Math.max(perPage, 5))),
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
  subject?: string[];
  license?: unknown[];
  ISSN?: string[];
  "update-to"?: Array<{ type?: string; label?: string }>;
  published?: { "date-parts"?: number[][] };
  "published-print"?: { "date-parts"?: number[][] };
  "published-online"?: { "date-parts"?: number[][] };
  created?: { "date-parts"?: number[][] };
}

/** Crossref record types that are not standalone citable works. */
export const NOT_A_CITABLE_WORK = new Set([
  "component",
  "peer-review",
  "journal",
  "journal-issue",
  "journal-volume",
  "proceedings",
  "proceedings-series",
  "book-series",
  "book-set",
  "report-component",
  "report-series",
  "grant",
  "database",
]);

function mapCrossrefItem(item: CrossrefItem): RawSourceInput {
  const doi = bareDoi(item.DOI);
  const venue = Array.isArray(item["container-title"]) ? item["container-title"][0] : undefined;
  const dateParts =
    item.published?.["date-parts"]?.[0] ||
    item["published-print"]?.["date-parts"]?.[0] ||
    item["published-online"]?.["date-parts"]?.[0] ||
    item.created?.["date-parts"]?.[0];
  return {
    title: Array.isArray(item.title) ? titleText(item.title[0] || "") : "",
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
    themes: (item.subject ?? []).slice(0, 3).map((x) => x.toLowerCase().replace(/\s+/g, "-")),
    isOpenAccess: Array.isArray(item.license) && item.license.length > 0,
  } as RawSourceInput;
}

export async function searchCrossref(
  query: string,
  rows = 15,
  page = 1,
  options: ProviderOptions = {}
): Promise<ProviderResult> {
  try {
    const effectiveRows = Math.min(100, Math.max(rows, 5));
    const offset = Math.max(0, (page - 1) * effectiveRows);
    const params = new URLSearchParams({
      query: cleanSearchTopic(query),
      rows: String(effectiveRows),
      sort: "relevance",
      ...(offset > 0 ? { offset: String(offset) } : {}),
      ...(options.extraParams ?? {}),
    });
    const data = await getJson<{ message?: { items?: CrossrefItem[] } }>(
      `https://api.crossref.org/works?${params.toString()}`,
      options,
      "CrossRef",
      { "User-Agent": CROSSREF_USER_AGENT }
    );
    // Parts of works (a figure or table of a report), peer-review reports, whole
    // journals/issues and grants are not citable works: never offer them as sources.
    const items = (data.message?.items ?? []).filter((it) => !NOT_A_CITABLE_WORK.has(String(it.type ?? ""))).map(mapCrossrefItem);
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
          title: titleText(String(p.title)),
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
        title: titleText(r.title || ""),
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
        themes: ["europe-pmc"],
        isOpenAccess: r.isOpenAccess === "Y",
      } as RawSourceInput;
    });
    return { provider: "europe_pmc", items };
  } catch (err) {
    return failure("europe_pmc", err);
  }
}

/**
 * The PubMed Central ids of the open-access articles among these DOIs, in one Europe PMC search (its API can take
 * many seconds a call, so one batched lookup beats one call per paper). Keys are lower-cased bare DOIs; a DOI with
 * no open-access PMC copy is absent. An empty map when the call fails.
 */
export async function lookupEuropePmcOpenAccessIds(dois: string[], options: ProviderOptions = {}): Promise<Map<string, string>> {
  const wanted = [...new Set(dois.map((d) => bareDoi(d)?.toLowerCase()).filter((d): d is string => Boolean(d)))].slice(0, 25);
  const out = new Map<string, string>();
  if (wanted.length === 0) return out;
  try {
    const params = new URLSearchParams({
      query: wanted.map((d) => `DOI:"${d}"`).join(" OR "),
      format: "json",
      pageSize: String(wanted.length * 2),
      resultType: "lite",
    });
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params.toString()}`;
    type Lite = { resultList?: { result?: Array<{ pmcid?: string; isOpenAccess?: string; doi?: string }> } };
    // Europe PMC's gateway sometimes answers 503 for a moment: one retry after a short pause.
    const data = await getJson<Lite>(url, options, "Europe PMC").catch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      return getJson<Lite>(url, options, "Europe PMC");
    });
    for (const hit of data.resultList?.result ?? []) {
      const doi = bareDoi(hit.doi)?.toLowerCase();
      if (doi && hit.pmcid && hit.isOpenAccess === "Y" && wanted.includes(doi)) out.set(doi, hit.pmcid);
    }
  } catch {
    // No lookup: the papers are read from their other open copies, or not at all.
  }
  return out;
}

/** The body of a JATS article (PubMed Central's XML) as plain text: paragraphs and section titles, no figures or tables. */
export function jatsBodyText(xml: string): string | undefined {
  const body = xml.match(/<body[\s\S]*<\/body>/i)?.[0];
  if (!body) return undefined;
  const text = body
    .replace(/<(table-wrap|fig|disp-formula|xref)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|title|sec|list-item)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x?[0-9a-f]+;/gi, " ")
    .replace(/&amp;/g, "&")
    // Brackets left empty where citation numbers were removed ("[ ]", "[, ]", "( )").
    .replace(/\[\s*(?:[,;–-]\s*)*\]/g, "")
    .replace(/\(\s*(?:[,;–-]\s*)*\)/g, "")
    .replace(/[ \t]+([.,;:])/g, "$1")
    .replace(/(?<!\.)\.\.(?!\.)/g, ".")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*\n\s*/g, "\n\n")
    .trim();
  return text || undefined;
}

/** NCBI's tool name on its E-utilities and ID converter calls (no email: no personal data leaves the server). */
const NCBI_TOOL = "scholar-core";

/**
 * The PubMed Central ids of these DOIs, in one call to NCBI's ID converter (fast); Europe PMC's search is the
 * fallback. Keys are lower-cased bare DOIs; a DOI that PMC does not hold is absent. Being in PMC does not mean
 * the full text may be downloaded: the caller checks that the text it gets is a whole article.
 */
export async function lookupPmcIdsByDoi(dois: string[], options: ProviderOptions = {}): Promise<Map<string, string>> {
  const wanted = [...new Set(dois.map((d) => bareDoi(d)?.toLowerCase()).filter((d): d is string => Boolean(d)))].slice(0, 100);
  const out = new Map<string, string>();
  if (wanted.length === 0) return out;
  try {
    const params = new URLSearchParams({ ids: wanted.join(","), format: "json", tool: NCBI_TOOL });
    const data = await getJson<{ records?: Array<{ doi?: string; pmcid?: string; "requested-id"?: string }> }>(
      `https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/?${params.toString()}`,
      options,
      "NCBI ID converter"
    );
    for (const r of data.records ?? []) {
      const doi = bareDoi(r["requested-id"] || r.doi)?.toLowerCase();
      if (doi && r.pmcid && wanted.includes(doi)) out.set(doi, r.pmcid);
    }
    return out;
  } catch {
    return lookupEuropePmcOpenAccessIds(wanted, options);
  }
}

/**
 * The full text of a PubMed Central article as plain text with blank lines between paragraphs and section titles
 * (the article body only: no front matter or reference list). NCBI first (fast), Europe PMC as the fallback.
 * Undefined when neither has a downloadable full text.
 */
export async function fetchPmcFullText(pmcid: string, options: ProviderOptions = {}): Promise<string | undefined> {
  const id = pmcid.trim().toUpperCase();
  if (!/^PMC\d+$/.test(id)) return undefined;
  try {
    const params = new URLSearchParams({ db: "pmc", id: id.slice(3), rettype: "xml", tool: NCBI_TOOL });
    const res = await (options.fetchImpl ?? fetch)(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?${params.toString()}`, {
      signal: withTimeout(options),
      headers: { Accept: "application/xml" },
    });
    if (res.ok) {
      const text = jatsBodyText(await res.text());
      if (text) return text;
    }
  } catch {
    // fall through to Europe PMC
  }
  return fetchEuropePmcFullText(id, options);
}

/** The full text of an open-access article from Europe PMC (the fallback of `fetchPmcFullText`). */
export async function fetchEuropePmcFullText(pmcid: string, options: ProviderOptions = {}): Promise<string | undefined> {
  const id = pmcid.trim().toUpperCase();
  if (!/^PMC\d+$/.test(id)) return undefined;
  try {
    const res = await (options.fetchImpl ?? fetch)(`https://www.ebi.ac.uk/europepmc/webservices/rest/${id}/fullTextXML`, {
      signal: withTimeout(options),
      headers: { Accept: "application/xml" },
    });
    if (!res.ok) return undefined;
    return jatsBodyText(await res.text());
  } catch {
    return undefined;
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
        title: titleText(doc.title || ""),
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

interface PaperRef {
  doi?: string;
  title: string;
}

/** Resolves one OpenAlex work from a DOI (exact) or, failing that, its title (best match). */
async function resolveOpenAlexWork(paper: PaperRef, options: ProviderOptions): Promise<OpenAlexWork & { referenced_works?: string[] } | undefined> {
  if (paper.doi) {
    const doi = bareDoi(paper.doi);
    const params = openAlexParams(options, {});
    return getJson(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi ?? "")}?${params.toString()}`, options, "OpenAlex");
  }
  const params = openAlexParams(options, { search: paper.title, "per-page": "1" });
  const data = await getJson<{ results?: Array<OpenAlexWork & { referenced_works?: string[] }> }>(
    `https://api.openalex.org/works?${params.toString()}`,
    options,
    "OpenAlex"
  );
  return data.results?.[0];
}

/** Works the given paper cites (its reference list), from OpenAlex. */
export async function fetchOpenAlexReferences(paper: PaperRef, limit = 8, options: ProviderOptions = {}): Promise<ProviderResult> {
  try {
    const work = await resolveOpenAlexWork(paper, options);
    const refs = (work?.referenced_works ?? []).slice(0, limit).map((r) => r.split("/").pop()).filter(Boolean);
    if (refs.length === 0) return { provider: "openalex", items: [] };
    const params = openAlexParams(options, { filter: `openalex_id:${refs.join("|")}`, "per-page": String(limit) });
    const data = await getJson<{ results?: OpenAlexWork[] }>(`https://api.openalex.org/works?${params.toString()}`, options, "OpenAlex");
    return { provider: "openalex", items: mapOpenAlex(data.results ?? []) };
  } catch (err) {
    return failure("openalex", err);
  }
}

/** Works that cite the given paper, most cited first, from OpenAlex. */
export async function fetchOpenAlexCitedBy(paper: PaperRef, limit = 8, options: ProviderOptions = {}): Promise<ProviderResult> {
  try {
    const work = await resolveOpenAlexWork(paper, options);
    const id = work?.id?.split("/").pop();
    if (!id) return { provider: "openalex", items: [] };
    const params = openAlexParams(options, { filter: `cites:${id}`, "per-page": String(limit), sort: "cited_by_count:desc" });
    const data = await getJson<{ results?: OpenAlexWork[] }>(`https://api.openalex.org/works?${params.toString()}`, options, "OpenAlex");
    return { provider: "openalex", items: mapOpenAlex(data.results ?? []) };
  } catch (err) {
    return failure("openalex", err);
  }
}

/** One work by DOI from OpenAlex. `undefined` when OpenAlex has no record; throws on a transport failure. */
export async function lookupOpenAlexByDoi(doi: string, options: ProviderOptions = {}): Promise<RawSourceInput | undefined> {
  const clean = bareDoi(doi);
  if (!clean) return undefined;
  const params = openAlexParams(options, {});
  try {
    const work = await getJson<OpenAlexWork>(`https://api.openalex.org/works/https://doi.org/${clean}?${params.toString()}`, options, "OpenAlex");
    return mapOpenAlex([work])[0];
  } catch (err) {
    if (err instanceof Error && /\b404\b/.test(err.message)) return undefined;
    throw err;
  }
}

/** The raw Crossref record for a DOI (for callers that need Crossmark relations). `undefined` on 404. */
export async function fetchCrossrefMessage(doi: string, options: ProviderOptions = {}): Promise<(CrossrefItem & Record<string, unknown>) | undefined> {
  const clean = bareDoi(doi);
  if (!clean) return undefined;
  try {
    const data = await getJson<{ message?: CrossrefItem & Record<string, unknown> }>(
      `https://api.crossref.org/works/${encodeURIComponent(clean)}`,
      options,
      "CrossRef",
      { "User-Agent": CROSSREF_USER_AGENT }
    );
    return data.message;
  } catch (err) {
    if (err instanceof Error && /\b404\b/.test(err.message)) return undefined;
    throw err;
  }
}

/** One work by DOI from Crossref, including retraction notices (`crossrefUpdateTo`). */
export async function lookupCrossrefByDoi(doi: string, options: ProviderOptions = {}): Promise<RawSourceInput | undefined> {
  const message = await fetchCrossrefMessage(doi, options);
  return message ? mapCrossrefItem(message) : undefined;
}

interface DataCiteAttributes {
  doi?: string;
  titles?: Array<{ title?: string }>;
  creators?: Array<{ name?: string; givenName?: string; familyName?: string }>;
  publisher?: string;
  publicationYear?: number | string;
  container?: { title?: string };
  descriptions?: Array<{ description?: string }>;
  dates?: Array<{ dateType?: string; date?: string }>;
}

/**
 * Open repositories (Zenodo via DataCite) also hold keyword-stuffed uploads:
 * a "title" of several hundred characters, or "authors" that are only numbers.
 * Such records match any search, so they are not offered as sources.
 */
export function isPlausibleRecord(item: Pick<RawSourceInput, "title" | "authors">): boolean {
  const title = (item.title ?? "").trim();
  if (!title || title.length > 300) return false;
  const authors = (item.authors ?? []) as unknown[];
  const name = (a: unknown) => (typeof a === "string" ? a : a && typeof a === "object" ? Object.values(a as Record<string, unknown>).join(" ") : "");
  if (authors.length > 0 && !authors.some((a) => /\p{L}{2,}/u.test(name(a)))) return false;
  return true;
}

function mapDataCite(attrs: DataCiteAttributes, id?: string): RawSourceInput {
  const doi = bareDoi(attrs.doi);
  const year =
    attrs.publicationYear ||
    attrs.dates?.find((d) => d.dateType === "Issued" || d.dateType === "Created" || d.dateType === "Submitted")?.date?.slice(0, 4);
  const venue = attrs.container?.title || attrs.publisher;
  return {
    id,
    title: titleText(attrs.titles?.[0]?.title || ""),
    url: doi ? `https://doi.org/${doi}` : "",
    doi,
    snippet: attrs.descriptions?.[0]?.description ? stripMarkup(attrs.descriptions[0].description).slice(0, 1800) : "",
    year,
    authors: (attrs.creators ?? [])
      .map((c) => c.name || [c.givenName, c.familyName].filter(Boolean).join(" "))
      .filter(Boolean),
    venue,
    journal: venue,
    publisher: attrs.publisher,
    isOpenAccess: true,
    themes: ["datacite"],
    sourceType: "scholarly work",
  } as RawSourceInput;
}

/** The raw DataCite attributes for a DOI (arXiv, Zenodo, Figshare, repositories). `undefined` on 404. */
export async function fetchDataCiteAttributes(doi: string, options: ProviderOptions = {}): Promise<(DataCiteAttributes & Record<string, unknown>) | undefined> {
  const clean = bareDoi(doi);
  if (!clean) return undefined;
  try {
    const data = await getJson<{ data?: { attributes?: DataCiteAttributes & Record<string, unknown> } }>(
      `https://api.datacite.org/dois/${encodeURIComponent(clean)}`,
      options,
      "DataCite"
    );
    return data.data?.attributes;
  } catch (err) {
    if (err instanceof Error && /\b404\b/.test(err.message)) return undefined;
    throw err;
  }
}

export async function lookupDataCiteByDoi(doi: string, options: ProviderOptions = {}): Promise<RawSourceInput | undefined> {
  const attrs = await fetchDataCiteAttributes(doi, options);
  return attrs ? mapDataCite(attrs) : undefined;
}

export interface OpenAlexSourceDetail {
  id: string;
  homepage?: string;
  isOpenAccess?: boolean;
  publisher?: string;
}

/** Homepage and open-access status of journals (OpenAlex "sources") by id. */
export async function fetchOpenAlexSourceDetails(ids: string[], options: ProviderOptions = {}): Promise<OpenAlexSourceDetail[]> {
  if (ids.length === 0) return [];
  const params = openAlexParams(options, { filter: `openalex_id:${ids.join("|")}`, select: "id,homepage_url,is_oa,host_organization_name" });
  const data = await getJson<{ results?: Array<{ id?: string; homepage_url?: string; is_oa?: boolean; host_organization_name?: string }> }>(
    `https://api.openalex.org/sources?${params.toString()}`,
    options,
    "OpenAlex"
  );
  return (data.results ?? []).map((s) => ({
    id: String(s.id).replace("https://openalex.org/", ""),
    homepage: typeof s.homepage_url === "string" ? s.homepage_url : undefined,
    isOpenAccess: typeof s.is_oa === "boolean" ? s.is_oa : undefined,
    publisher: typeof s.host_organization_name === "string" ? s.host_organization_name : undefined,
  }));
}
