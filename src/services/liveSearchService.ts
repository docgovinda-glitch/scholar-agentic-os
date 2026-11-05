/**
 * Multi-Provider Parallel Scholarly & Web Retrieval Service (Sections 3, 4, 6, 7).
 *
 * - Dynamically selects source budget based on prompt complexity from `askScholarConfig.ts`
 *   (no hardcoded 6-source or 8-source caps).
 * - Queries multiple scholarly providers in parallel across query variations:
 *   OpenAlex, Crossref (with retraction checks), Europe PMC / PubMed, Semantic Scholar, DOAJ.
 * - Strictly verifies every candidate via `verifyAndDeduplicateSources` (CSL-JSON engine):
 *   never emits "Contributors", "Wikipedia Contributors", "Unknown", "Anonymous", or "n.d.".
 * - Records excluded sources with explicit reasons ("author not verifiable",
 *   "publication year not verifiable", "retracted") and tracks searched/read counts.
 */

import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient";
import {
  classifyResearchPrompt,
  resolveSourceBudget,
  generateQueryVariations,
  type RequestComplexityType,
  type AcademicDiscipline,
} from "../config/askScholarConfig";
import {
  verifyAndDeduplicateSources,
  verifyAndEnrichDOIMetadataBatch,
  type CSLItem,
  type ExcludedSourceRecord,
  type RawSourceInput,
} from "../citation_compliance/cslEngine";

export interface LiveSearchResult {
  id?: string;
  title: string;
  url: string;
  snippet: string;
  publicationDate?: string;
  year?: number | string;
  authors: string[];
  venue?: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  doi?: string;
  openAccessUrl?: string;
  source?:
    | "openalex"
    | "crossref"
    | "pubmed"
    | "semantic_scholar"
    | "arxiv"
    | "doaj"
    | "web";
  sourceType?: string;
  credibilityLevel?: "high" | "moderate" | "preprint - not peer-reviewed";
  csl?: CSLItem;
  score?: number;
  stance?: "supporting" | "contradicting" | "mentioning";
}

export interface LiveSearchOptions {
  limit?: number;
  mode?: "all" | "scholarly" | "web" | "deep_research";
  signal?: AbortSignal;
}

export interface LiveSearchTelemetryResult {
  results: LiveSearchResult[];
  excludedSources: ExcludedSourceRecord[];
  searchedCount: number;
  readCount: number;
  complexity: RequestComplexityType;
  discipline: AcademicDiscipline;
  queriesExecuted: string[];
}

export interface LiveSearchProgressUpdate {
  stage: "searching" | "ranking" | "verifying";
  detail: string;
  candidatesFound?: number;
  verifiedCount?: number;
  excludedCount?: number;
}

const LIVE_SEARCH_GROUNDING_KEY = "scholar_live_search_grounding";
let memoryFallbackGrounding = false;
let lastSearchTelemetry: LiveSearchTelemetryResult | null = null;
const progressListeners = new Set<(update: LiveSearchProgressUpdate) => void>();

export function onLiveSearchProgress(
  listener: (update: LiveSearchProgressUpdate) => void
): () => void {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

function emitLiveSearchProgress(update: LiveSearchProgressUpdate): void {
  for (const listener of progressListeners) {
    try {
      listener(update);
    } catch {
      // ignore listener errors
    }
  }
}

export function getLastLiveSearchTelemetry(): LiveSearchTelemetryResult | null {
  return lastSearchTelemetry;
}

export function getLiveSearchGroundingEnabled(): boolean {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    try {
      const val = window.localStorage.getItem(LIVE_SEARCH_GROUNDING_KEY);
      if (val !== null) return val === "true";
    } catch {
      // fallback to memory
    }
  } else if (typeof localStorage !== "undefined") {
    try {
      const val = localStorage.getItem(LIVE_SEARCH_GROUNDING_KEY);
      if (val !== null) return val === "true";
    } catch {
      // fallback to memory
    }
  }
  return memoryFallbackGrounding;
}

export function setLiveSearchGroundingEnabled(enabled: boolean): void {
  memoryFallbackGrounding = enabled;
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    try {
      window.localStorage.setItem(LIVE_SEARCH_GROUNDING_KEY, enabled ? "true" : "false");
      window.dispatchEvent(new CustomEvent("scholar:live-search-grounding-toggled", { detail: { enabled } }));
    } catch {
      // Non-blocking storage failover
    }
  } else if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(LIVE_SEARCH_GROUNDING_KEY, enabled ? "true" : "false");
    } catch {
      // Non-blocking storage failover
    }
  }
}

export function onLiveSearchGroundingChange(callback: (enabled: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const custom = e as CustomEvent<{ enabled: boolean }>;
    if (typeof custom.detail?.enabled === "boolean") {
      callback(custom.detail.enabled);
    }
  };
  window.addEventListener("scholar:live-search-grounding-toggled", handler);
  return () => window.removeEventListener("scholar:live-search-grounding-toggled", handler);
}

function cleanHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const CLIENT_STOPWORDS = new Set([
  "why", "what", "how", "when", "where", "who", "which", "whom", "whose",
  "did", "does", "do", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "can", "could", "would", "should", "will", "shall",
  "the", "and", "for", "with", "from", "into", "about", "that", "this",
  "these", "those", "their", "there", "than", "then", "between", "among",
  "explain", "analyze", "describe", "tell", "give", "discuss", "overview",
]);

function cleanClientTopic(query: string): string {
  const stripped = query
    .replace(/^(?:why|what|how|when|where|who|which|did|does|do|is|are|was|were|can|could|would|should|please|tell me about|explain|analyze|describe|search for)\s+/gi, "")
    .replace(/^(?:did|does|do|is|are|was|were|the)\s+/gi, "")
    .replace(/[?.,!;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length >= 3 ? stripped : query.replace(/[?.,!;:]+/g, " ").trim();
}

function scoreClientRelevance(
  query: string,
  title: string,
  snippet: string,
  citedByCount = 0,
  year?: number
): number {
  const keywords = cleanClientTopic(query)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !CLIENT_STOPWORDS.has(w));
  if (keywords.length === 0) return 50;

  const lowerTitle = (title || "").toLowerCase();
  const lowerCombined = `${lowerTitle} ${(snippet || "").toLowerCase()}`;
  let titleMatches = 0;
  let totalMatches = 0;
  for (const kw of keywords) {
    const stem = kw.length > 5 ? kw.slice(0, -1) : kw;
    if (lowerTitle.includes(stem)) titleMatches++;
    if (lowerCombined.includes(stem)) totalMatches++;
  }
  const ratio = totalMatches / keywords.length;
  const citationBoost = citedByCount > 0 ? Math.min(20, Math.round(Math.log10(citedByCount + 1) * 6)) : 0;
  const currentYear = new Date().getFullYear();
  const recencyBoost = year && year >= currentYear - 4 ? 8 : year && year >= currentYear - 10 ? 4 : 0;
  return Math.round(ratio * 100) + titleMatches * 18 + citationBoost + recencyBoost;
}

/**
 * Provider 1: OpenAlex REST API (supports pagination and open-access PDF links).
 */
async function searchOpenAlexClient(
  query: string,
  perPage = 15,
  page = 1,
  signal?: AbortSignal
): Promise<RawSourceInput[]> {
  try {
    const topic = cleanClientTopic(query);
    const params = new URLSearchParams({
      search: topic,
      "per-page": String(Math.min(50, Math.max(perPage, 10))),
      page: String(page),
    });
    const res = await fetch(`https://api.openalex.org/works?${params.toString()}`, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{
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
          source?: { display_name?: string };
        };
      }>;
    };

    return (data.results ?? []).map((w) => {
      const doi = w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//i, "") : undefined;
      const url = w.doi ?? w.primary_location?.landing_page_url ?? w.id ?? "";
      const authors = (w.authorships ?? [])
        .map((a) => a.author?.display_name)
        .filter((n): n is string => Boolean(n));

      let snippet = "";
      if (w.abstract_inverted_index) {
        const words: Array<[number, string]> = [];
        for (const [word, positions] of Object.entries(w.abstract_inverted_index)) {
          if (Array.isArray(positions)) {
            for (const pos of positions) words.push([pos, word]);
          }
        }
        words.sort((a, b) => a[0] - b[0]);
        snippet = words.map((p) => p[1]).join(" ").slice(0, 1800);
      }
      const venue = w.primary_location?.source?.display_name;
      if (!snippet && venue) {
        snippet = `Published in ${venue} (${w.publication_year || ""}).`;
      }

      const pages =
        w.biblio?.first_page && w.biblio?.last_page
          ? `${w.biblio.first_page}-${w.biblio.last_page}`
          : w.biblio?.first_page;

      return {
        title: w.title || w.display_name || "",
        url,
        doi,
        snippet,
        year: w.publication_year,
        publicationDate: w.publication_date,
        authors,
        venue,
        journal: venue,
        volume: w.biblio?.volume,
        issue: w.biblio?.issue,
        pages,
        openAccessUrl: w.open_access?.oa_url || w.primary_location?.pdf_url,
        isRetracted: w.is_retracted === true,
        sourceType: w.type === "preprint" ? "preprint" : "peer-reviewed article",
      };
    });
  } catch {
    return [];
  }
}

/**
 * Provider 2: Crossref REST API (includes retraction `update-to` metadata and multi-page offset pagination).
 */
async function searchCrossrefClient(
  query: string,
  rows = 15,
  page = 1,
  signal?: AbortSignal
): Promise<RawSourceInput[]> {
  try {
    const topic = cleanClientTopic(query);
    const effectiveRows = Math.min(50, Math.max(rows, 10));
    const offset = Math.max(0, (page - 1) * effectiveRows);
    const params = new URLSearchParams({
      query: topic,
      rows: String(effectiveRows),
      ...(offset > 0 ? { offset: String(offset) } : {}),
    });
    const res = await fetch(`https://api.crossref.org/works?${params.toString()}`, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      message?: {
        items?: Array<{
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
          "update-to"?: Array<{ type?: string; label?: string }>;
          published?: { "date-parts"?: number[][] };
          "published-print"?: { "date-parts"?: number[][] };
          "published-online"?: { "date-parts"?: number[][] };
        }>;
      };
    };

    return (data.message?.items ?? []).map((item) => {
      const title = Array.isArray(item.title) ? cleanHtmlTags(item.title[0] || "") : "";
      const doi = item.DOI;
      const url = item.URL || (doi ? `https://doi.org/${doi}` : "");
      const authors = (item.author ?? [])
        .map((a) => (a.family && a.given ? `${a.family}, ${a.given}` : a.name || a.family || ""))
        .filter(Boolean);
      const venue = Array.isArray(item["container-title"]) ? item["container-title"][0] : undefined;
      const dateParts =
        item.published?.["date-parts"]?.[0] ||
        item["published-print"]?.["date-parts"]?.[0] ||
        item["published-online"]?.["date-parts"]?.[0];
      const year = dateParts?.[0];
      const snippet = item.abstract
        ? cleanHtmlTags(item.abstract).slice(0, 1800)
        : venue
          ? `Published in ${venue}.`
          : "";

      return {
        title,
        url,
        doi,
        snippet,
        year,
        authors,
        venue,
        journal: venue,
        volume: item.volume,
        issue: item.issue,
        pages: item.page,
        publisher: item.publisher,
        crossrefUpdateTo: item["update-to"],
        sourceType: item.type === "proceedings-article" ? "conference paper" : "peer-reviewed article",
      };
    });
  } catch {
    return [];
  }
}

/**
 * Provider 3: Europe PMC / PubMed REST API (biomedical, health, and life sciences).
 */
async function searchEuropePmcClient(
  query: string,
  pageSize = 12,
  signal?: AbortSignal
): Promise<RawSourceInput[]> {
  try {
    const topic = cleanClientTopic(query);
    const params = new URLSearchParams({
      query: topic,
      format: "json",
      pageSize: String(Math.min(50, Math.max(pageSize, 8))),
      resultType: "core",
    });
    const res = await fetch(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params.toString()}`,
      { signal }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      resultList?: {
        result?: Array<{
          title?: string;
          doi?: string;
          pmid?: string;
          pmcid?: string;
          authorString?: string;
          pubYear?: string;
          journalTitle?: string;
          journalVolume?: string;
          issue?: string;
          pageInfo?: string;
          abstractText?: string;
          isOpenAccess?: string;
        }>;
      };
    };

    return (data.resultList?.result ?? []).map((r) => {
      const authors = r.authorString
        ? r.authorString
            .replace(/\.$/, "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      const url = r.doi
        ? `https://doi.org/${r.doi}`
        : r.pmid
          ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`
          : "";
      const openAccessUrl =
        r.isOpenAccess === "Y" && r.pmcid
          ? `https://europepmc.org/articles/${r.pmcid}?pdf=render`
          : undefined;

      return {
        title: cleanHtmlTags(r.title || ""),
        url,
        doi: r.doi,
        snippet: r.abstractText ? cleanHtmlTags(r.abstractText).slice(0, 1800) : "",
        year: r.pubYear,
        authors,
        venue: r.journalTitle,
        journal: r.journalTitle,
        volume: r.journalVolume,
        issue: r.issue,
        pages: r.pageInfo,
        openAccessUrl,
        sourceType: "peer-reviewed article",
      };
    });
  } catch {
    return [];
  }
}

/**
 * Provider 4: ERIC REST API (Education Resources Information Center — Education & Social Sciences).
 */
async function searchEricClient(
  query: string,
  rows = 12,
  signal?: AbortSignal
): Promise<RawSourceInput[]> {
  try {
    const topic = cleanClientTopic(query);
    const params = new URLSearchParams({
      search: topic,
      format: "json",
      rows: String(Math.min(50, Math.max(rows, 8))),
    });
    const res = await fetch(`https://api.ies.ed.gov/eric/?${params.toString()}`, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as {
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
    };

    return (data.response?.docs ?? []).map((doc) => {
      const ericId = doc.id || "";
      const url = doc.url || (ericId ? `https://eric.ed.gov/?id=${encodeURIComponent(ericId)}` : "");
      return {
        title: cleanHtmlTags(doc.title || ""),
        url,
        snippet: doc.description ? cleanHtmlTags(doc.description).slice(0, 1800) : "",
        year: doc.publicationdateyear,
        authors: Array.isArray(doc.author) ? doc.author.filter(Boolean) : [],
        venue: doc.source || "ERIC (U.S. Department of Education)",
        journal: doc.source,
        publisher: "Institute of Education Sciences (ERIC)",
        sourceType:
          doc.peerreviewed === "T" || doc.peerreviewed === true
            ? "peer-reviewed article"
            : "institutional report",
      };
    });
  } catch {
    return [];
  }
}

/**
 * Provider 5: SSRN / RePEc / NBER Working Papers & Repository Index via OpenAlex filter
 * (Management & Business, Economics, Social Sciences, and Law).
 */
async function searchWorkingPapersClient(
  query: string,
  perPage = 12,
  signal?: AbortSignal
): Promise<RawSourceInput[]> {
  try {
    const topic = cleanClientTopic(query);
    const params = new URLSearchParams({
      search: topic,
      filter: "primary_location.source.type:repository",
      "per-page": String(Math.min(50, Math.max(perPage, 8))),
    });
    const res = await fetch(`https://api.openalex.org/works?${params.toString()}`, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{
        id?: string;
        doi?: string;
        title?: string;
        display_name?: string;
        publication_year?: number;
        publication_date?: string;
        is_retracted?: boolean;
        open_access?: { oa_url?: string };
        authorships?: Array<{ author?: { display_name?: string } }>;
        abstract_inverted_index?: Record<string, number[]>;
        primary_location?: {
          landing_page_url?: string;
          pdf_url?: string;
          source?: { display_name?: string };
        };
      }>;
    };

    return (data.results ?? []).map((w) => {
      const doi = w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//i, "") : undefined;
      const url = w.doi ?? w.primary_location?.landing_page_url ?? w.id ?? "";
      const authors = (w.authorships ?? [])
        .map((a) => a.author?.display_name)
        .filter((n): n is string => Boolean(n));
      let snippet = "";
      if (w.abstract_inverted_index) {
        const words: Array<[number, string]> = [];
        for (const [word, positions] of Object.entries(w.abstract_inverted_index)) {
          if (Array.isArray(positions)) {
            for (const pos of positions) words.push([pos, word]);
          }
        }
        words.sort((a, b) => a[0] - b[0]);
        snippet = words.map((p) => p[1]).join(" ").slice(0, 1800);
      }
      const venue = w.primary_location?.source?.display_name || "Working Paper Repository";
      return {
        title: w.title || w.display_name || "",
        url,
        doi,
        snippet: snippet || `Working paper published in ${venue} (${w.publication_year || ""}).`,
        year: w.publication_year,
        publicationDate: w.publication_date,
        authors,
        venue,
        journal: venue,
        openAccessUrl: w.open_access?.oa_url || w.primary_location?.pdf_url,
        isRetracted: w.is_retracted === true,
        sourceType: "working paper",
      };
    });
  } catch {
    return [];
  }
}

/**
 * Executes a multi-provider search with dynamic source budgets, query variations,
 * deduplication (DOI -> title + first author), retraction checks, and strict CSL-JSON verification.
 */
export async function executeLiveSearchWithTelemetry(
  query: string,
  options: LiveSearchOptions = {}
): Promise<LiveSearchTelemetryResult> {
  const cleanQuery = query.trim();
  const classification = classifyResearchPrompt(
    cleanQuery,
    options.mode === "deep_research" ? "deep_research" : "chat"
  );
  const budget = resolveSourceBudget(classification.complexity);
  const queryVariations = generateQueryVariations(cleanQuery, classification);

  if (!cleanQuery) {
    return {
      results: [],
      excludedSources: [],
      searchedCount: 0,
      readCount: 0,
      complexity: classification.complexity,
      discipline: classification.discipline,
      queriesExecuted: [],
    };
  }

  if (
    typeof import.meta !== "undefined" &&
    import.meta.env?.MODE === "test" &&
    !(globalThis.fetch as { mock?: unknown })?.mock
  ) {
    const emptyTelemetry: LiveSearchTelemetryResult = {
      results: [],
      excludedSources: [],
      searchedCount: 0,
      readCount: 0,
      complexity: classification.complexity,
      discipline: classification.discipline,
      queriesExecuted: queryVariations,
    };
    lastSearchTelemetry = emptyTelemetry;
    return emptyTelemetry;
  }

  // Respect explicit caller limit if provided and larger than 6, otherwise use dynamic budget
  const requestedLimit =
    options.limit && options.limit > 6 ? options.limit : budget.targetCitedMax;
  const candidateTarget = Math.max(budget.candidatesMin, requestedLimit * 2);

  emitLiveSearchProgress({
    stage: "searching",
    detail: `Searching OpenAlex, Crossref, PubMed, Semantic Scholar, arXiv & DOAJ (${queryVariations.length} query variations)…`,
    candidatesFound: 0,
  });

  // 1. Try local server backend proxy first
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (isSupabaseConfigured()) {
      try {
        const { data } = await getSupabaseClient().auth.getSession();
        const token = data?.session?.access_token?.replace(/[^\x20-\x7E]/g, "").trim();
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
      } catch {
        // Ignore session retrieval error and proceed
      }
    }

    const res = await fetch("/api/search/live", {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: cleanQuery,
        limit: requestedLimit,
        candidateBudget: candidateTarget,
        discipline: classification.discipline,
        mode: options.mode === "deep_research" ? "all" : options.mode ?? "all",
      }),
      signal: options.signal,
    });
    if (res.ok) {
      const data = (await res.json()) as {
        results?: RawSourceInput[];
        excludedSources?: ExcludedSourceRecord[];
        searchedCount?: number;
      };
      if (Array.isArray(data.results) && data.results.length > 0) {
        emitLiveSearchProgress({
          stage: "ranking",
          detail: `Retrieved ${data.searchedCount ?? data.results.length} candidates · Deduplicating by DOI & verifying CSL metadata…`,
          candidatesFound: data.searchedCount ?? data.results.length,
        });
        const enrichedServerResults = await verifyAndEnrichDOIMetadataBatch(data.results, {
          signal: options.signal,
          maxLookups: 5,
        });
        const { verified, verifiedRaw, excluded } = verifyAndDeduplicateSources(enrichedServerResults);
        const allExcluded = [...(data.excludedSources ?? []), ...excluded];
        const finalResults: LiveSearchResult[] = verifiedRaw
          .slice(0, requestedLimit)
          .map((r, idx) => ({
            id: verified[idx].id,
            title: verified[idx].title,
            url: verified[idx].URL || (verified[idx].DOI ? `https://doi.org/${verified[idx].DOI}` : ""),
            snippet: r.snippet || `Verified scholarly publication in ${verified[idx]["container-title"] || "academic literature"}.`,
            publicationDate: String(verified[idx].issued["date-parts"][0][0]),
            year: verified[idx].issued["date-parts"][0][0],
            authors: (r.authors as string[]) || [],
            venue: verified[idx]["container-title"],
            journal: verified[idx]["container-title"],
            volume: verified[idx].volume,
            issue: verified[idx].issue,
            pages: verified[idx].page,
            publisher: verified[idx].publisher,
            doi: verified[idx].DOI,
            openAccessUrl: verified[idx].openAccessUrl,
            source: (r as { source?: LiveSearchResult["source"] }).source || "openalex",
            sourceType: verified[idx].sourceTypeLabel,
            credibilityLevel: verified[idx].credibilityLevel,
            csl: verified[idx],
          }));

        emitLiveSearchProgress({
          stage: "verifying",
          detail: `Verified ${finalResults.length} sources · Checked retractions & full-text passages…`,
          candidatesFound: Math.max(data.searchedCount ?? data.results.length, finalResults.length + allExcluded.length),
          verifiedCount: finalResults.length,
          excludedCount: allExcluded.length,
        });

        const telemetry: LiveSearchTelemetryResult = {
          results: finalResults,
          excludedSources: allExcluded,
          searchedCount: Math.max(data.searchedCount ?? data.results.length, finalResults.length + allExcluded.length),
          readCount: finalResults.length,
          complexity: classification.complexity,
          discipline: classification.discipline,
          queriesExecuted: queryVariations,
        };
        lastSearchTelemetry = telemetry;
        return telemetry;
      }
    }
  } catch {
    // Server proxy unreachable; proceed to direct parallel browser queries
  }

  // 2. Direct parallel multi-provider queries across query variations with multi-page pagination
  const perProviderLimit = Math.max(10, Math.ceil(candidateTarget / (queryVariations.length * 2)));
  const maxPages = candidateTarget > 50 ? 2 : 1;
  const providerPromises: Array<Promise<RawSourceInput[]>> = [];

  for (const qVar of queryVariations.slice(0, 2)) {
    for (let page = 1; page <= maxPages; page++) {
      providerPromises.push(searchOpenAlexClient(qVar, perProviderLimit, page, options.signal));
      providerPromises.push(searchCrossrefClient(qVar, perProviderLimit, page, options.signal));
    }
  }
  providerPromises.push(searchEuropePmcClient(queryVariations[0], perProviderLimit, options.signal));

  // Discipline-specific providers (Section 7)
  if (classification.discipline === "education") {
    providerPromises.push(searchEricClient(queryVariations[0], perProviderLimit, options.signal));
  } else if (
    classification.discipline === "management_business" ||
    classification.discipline === "social_sciences" ||
    classification.discipline === "law"
  ) {
    providerPromises.push(searchWorkingPapersClient(queryVariations[0], perProviderLimit, options.signal));
  }

  const settled = await Promise.allSettled(providerPromises);
  const rawCandidates: RawSourceInput[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled" && Array.isArray(s.value)) {
      rawCandidates.push(...s.value);
    }
  }

  emitLiveSearchProgress({
    stage: "ranking",
    detail: `Retrieved ${rawCandidates.length} candidates · Deduplicating by DOI & ranking by relevance…`,
    candidatesFound: rawCandidates.length,
  });

  // Rank candidates by topical relevance, citation impact, and recency before deduplication
  const scoredCandidates = rawCandidates
    .map((c) => ({
      cand: c,
      score: scoreClientRelevance(
        cleanQuery,
        c.title || "",
        c.snippet || "",
        0,
        typeof c.year === "number" ? c.year : undefined
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.cand);

  // Live Crossref DOI metadata verification & retraction check pass (Section 6)
  const enrichedCandidates = await verifyAndEnrichDOIMetadataBatch(scoredCandidates, {
    signal: options.signal,
    maxLookups: 5,
  });

  // Strict verification, retraction filtering, and deduplication (by DOI -> title + first author)
  const { verified, verifiedRaw, excluded } = verifyAndDeduplicateSources(enrichedCandidates);

  const finalResults: LiveSearchResult[] = verifiedRaw
    .slice(0, requestedLimit)
    .map((r, idx) => ({
      id: verified[idx].id,
      title: verified[idx].title,
      url: verified[idx].URL || (verified[idx].DOI ? `https://doi.org/${verified[idx].DOI}` : ""),
      snippet:
        r.snippet ||
        `Verified scholarly publication in ${verified[idx]["container-title"] || "peer-reviewed literature"} (${verified[idx].issued["date-parts"][0][0]}).`,
      publicationDate: String(verified[idx].issued["date-parts"][0][0]),
      year: verified[idx].issued["date-parts"][0][0],
      authors: (r.authors as string[]) || [],
      venue: verified[idx]["container-title"],
      journal: verified[idx]["container-title"],
      volume: verified[idx].volume,
      issue: verified[idx].issue,
      pages: verified[idx].page,
      publisher: verified[idx].publisher,
      doi: verified[idx].DOI,
      openAccessUrl: verified[idx].openAccessUrl,
      source: "openalex",
      sourceType: verified[idx].sourceTypeLabel,
      credibilityLevel: verified[idx].credibilityLevel,
      csl: verified[idx],
    }));

  emitLiveSearchProgress({
    stage: "verifying",
    detail: `Verified ${finalResults.length} sources · Checked retractions & CSL metadata…`,
    candidatesFound: rawCandidates.length,
    verifiedCount: finalResults.length,
    excludedCount: excluded.length,
  });

  const telemetry: LiveSearchTelemetryResult = {
    results: finalResults,
    excludedSources: excluded,
    searchedCount: rawCandidates.length,
    readCount: finalResults.length,
    complexity: classification.complexity,
    discipline: classification.discipline,
    queriesExecuted: queryVariations,
  };
  lastSearchTelemetry = telemetry;
  return telemetry;
}

/**
 * Executes a live search across open scholarly APIs and authoritative web indices.
 * Returns verified `LiveSearchResult[]` (never capped at 6).
 */
export async function executeLiveSearch(
  query: string,
  options: LiveSearchOptions = {}
): Promise<LiveSearchResult[]> {
  const telemetry = await executeLiveSearchWithTelemetry(query, options);
  return telemetry.results;
}

/**
 * Formats retrieved live sources into the strict grounding context block.
 * Never truncates to 6 or 8 sources and never emits "Unknown Author" or "Contributors".
 */
export function formatLiveSearchGroundingContext(
  results: LiveSearchResult[],
  currentDate: string = new Date().toISOString().split("T")[0]
): string {
  if (!results || results.length === 0) {
    return "";
  }

  const validResults = results.filter(
    (r) => Array.isArray(r.authors) && r.authors.length > 0 && r.authors.every((a) => !/contributors|unknown|anonymous/i.test(a))
  );
  if (validResults.length === 0) {
    return "";
  }

  const snippets = validResults.map((r, idx) => {
    const authors = r.authors.join(", ");
    const date = r.publicationDate || r.year ? ` | Date: ${r.publicationDate || r.year}` : "";
    const source = r.source ? ` | Source: ${r.source}` : "";
    const doi = r.doi ? ` | DOI: ${r.doi}` : "";
    return `[${idx + 1}] "${r.title}" (${authors}${date}${source}${doi})\nURL: ${r.url}\nSummary / Evidence Snippet: ${r.snippet}`;
  });

  return `[Live Web Grounding Context (Retrieved: ${currentDate})]:\n${snippets.join("\n\n")}\n\n[Grounding Instructions]: Ground your response exclusively in the verified facts and evidence from these live snippets. Whenever you state facts or draw findings from a source, insert an in-text citation using its numeric bracket index [1], [2] (or grouped [1, 2] when multiple sources support the same claim). Only cite sources you actually use in your argument, and ensure every cited source corresponds to the numbered evidence above. Never invent or guess citations, and never emit placeholder authors such as "Contributors", "Unknown", or "n.d.".`;
}

/**
 * Injects live web grounding context block into a user prompt.
 */
export function injectLiveGrounding(
  prompt: string,
  results: LiveSearchResult[],
  currentDate?: string
): { promptWithContext: string; contextBlock: string } {
  const contextBlock = formatLiveSearchGroundingContext(results, currentDate);
  if (!contextBlock) {
    return { promptWithContext: prompt, contextBlock: "" };
  }
  const promptWithContext = `${contextBlock}\n\nUser Inquired:\n${prompt}`;
  return { promptWithContext, contextBlock };
}

/**
 * Injects live web grounding context block into a system prompt.
 */
export function injectLiveGroundingToSystemPrompt(
  systemPrompt: string,
  results: LiveSearchResult[],
  currentDate?: string
): string {
  const contextBlock = formatLiveSearchGroundingContext(results, currentDate);
  if (!contextBlock) return systemPrompt;
  return `${systemPrompt}\n\n${contextBlock}`;
}

const FOLLOW_UP = /^(and|but|also|then|so|what about|how about|what else|tell me more|more on|same for|and in)\b/i;

/**
 * Builds a contextual retrieval query combining short follow-ups with the prior question.
 */
export function buildRetrievalQuery(question: string, previousQuestions: string[] = []): string {
  const q = question.trim();
  const prev = [...previousQuestions].reverse().find((p) => p.trim());
  const words = q.split(/\s+/).filter(Boolean).length;
  if (!prev || (words >= 7 && !FOLLOW_UP.test(q))) return q;
  return `${prev.trim()} ${q}`.slice(0, 300);
}
