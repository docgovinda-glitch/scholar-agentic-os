/**
 * Live Web & Scholarly Search Service.
 * Retrieves fresh scholarly papers and real-time web facts matching user queries.
 * Queries open scholarly indices (OpenAlex, Crossref) and web data (Wikipedia, search-proxy).
 * Strictly zero `any` types.
 */

import { getSupabaseRestConfig } from "../supabaseRest.ts";
import { searchConfiguredWebApi, searchDuckDuckGo, searchGoogleNewsRss } from "../research/webSearchEngine.ts";

const STOPWORDS = new Set([
  "why", "what", "how", "when", "where", "who", "which", "whom", "whose",
  "did", "does", "do", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "can", "could", "would", "should", "will", "shall",
  "the", "and", "for", "with", "from", "into", "about", "that", "this",
  "these", "those", "their", "there", "than", "then", "between", "among",
  "explain", "analyze", "describe", "tell", "give", "discuss", "overview",
]);

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

export function computeLiveSearchRelevance(
  query: string,
  title: string,
  snippet: string
): { titleMatches: number; totalMatches: number; keywordCount: number; ratio: number } {
  const keywords = extractQueryKeywords(query);
  if (keywords.length === 0) {
    return { titleMatches: 1, totalMatches: 1, keywordCount: 1, ratio: 1 };
  }
  const lowerTitle = (title || "").toLowerCase();
  const lowerCombined = `${lowerTitle} ${(snippet || "").toLowerCase()}`;
  let titleMatches = 0;
  let totalMatches = 0;
  for (const kw of keywords) {
    const stem = kw.length > 5 ? kw.slice(0, -1) : kw;
    if (lowerTitle.includes(stem)) titleMatches++;
    if (lowerCombined.includes(stem)) totalMatches++;
  }
  return {
    titleMatches,
    totalMatches,
    keywordCount: keywords.length,
    ratio: totalMatches / keywords.length,
  };
}

export interface LiveSearchResult {
  title: string;
  url: string;
  snippet: string;
  publicationDate?: string;
  authors: string[];
  source: "openalex" | "crossref" | "web" | "wikipedia" | "arxiv";
  score?: number;
}

interface OpenAlexAuthorship {
  author?: { display_name?: string };
}

interface OpenAlexWorkItem {
  id: string;
  doi?: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  publication_date?: string;
  type?: string;
  authorships?: OpenAlexAuthorship[];
  abstract_inverted_index?: Record<string, number[]>;
  primary_location?: {
    landing_page_url?: string;
    source?: { display_name?: string; type?: string };
  };
}

interface OpenAlexApiResponse {
  results?: OpenAlexWorkItem[];
}

interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
}

interface CrossrefWorkItem {
  DOI?: string;
  URL?: string;
  title?: string | string[];
  abstract?: string;
  author?: CrossrefAuthor[];
  "container-title"?: string | string[];
  published?: { "date-parts"?: number[][] };
  "published-print"?: { "date-parts"?: number[][] };
  created?: { "date-parts"?: number[][] };
}

interface CrossrefApiResponse {
  message?: {
    items?: CrossrefWorkItem[];
  };
}

interface WikipediaSearchItem {
  title: string;
  pageid: number;
  snippet: string;
  timestamp: string;
}

interface WikipediaSearchResponse {
  query?: {
    search?: WikipediaSearchItem[];
  };
}

interface WebProxyResult {
  title?: string;
  url: string;
  content?: string;
  score?: number;
}

export function stripHtml(html: string): string {
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

export function reconstructOpenAlexAbstract(invertedIndex?: Record<string, number[]>): string {
  if (!invertedIndex || typeof invertedIndex !== "object") return "";
  const words: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    if (Array.isArray(positions)) {
      for (const pos of positions) {
        words.push([pos, word]);
      }
    }
  }
  words.sort((a, b) => a[0] - b[0]);
  return words.map((w) => w[1]).join(" ").slice(0, 1800);
}

/**
 * Queries OpenAlex public REST API.
 */
export async function searchOpenAlexLive(query: string, limit = 5): Promise<LiveSearchResult[]> {
  const topic = cleanSearchTopic(query);
  const params = new URLSearchParams({
    search: topic,
    "per-page": String(Math.max(limit, 8)),
  });
  const mailto = process.env.OPENALEX_MAILTO;
  if (mailto) params.set("mailto", mailto);

  try {
    const res = await fetch(`https://api.openalex.org/works?${params.toString()}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as OpenAlexApiResponse;
    const works = data.results ?? [];

    const mapped = works.map((w) => {
      const url = w.doi ?? w.primary_location?.landing_page_url ?? w.id;
      const authors = (w.authorships ?? [])
        .map((a) => a.author?.display_name)
        .filter((n): n is string => Boolean(n));
      const abstractText = reconstructOpenAlexAbstract(w.abstract_inverted_index);
      const venue = w.primary_location?.source?.display_name;
      const snippet = abstractText
        ? abstractText
        : venue
        ? `Published in ${venue} (${w.publication_year || "Recent"}). Scholarly research work.`
        : `Scholarly work indexed by OpenAlex (${w.publication_year || "Recent"}).`;

      const title = w.title || w.display_name || "Untitled Scholarly Work";
      const rel = computeLiveSearchRelevance(query, title, snippet);
      return {
        title,
        url,
        snippet,
        publicationDate: w.publication_date || (w.publication_year ? String(w.publication_year) : undefined),
        authors,
        source: "openalex" as const,
        score: Math.round(rel.ratio * 100) + rel.titleMatches * 15,
        _rel: rel,
      };
    });

    if (mapped.length <= 1) {
      return mapped.map(({ _rel, ...rest }) => rest);
    }

    const filtered = mapped
      .filter((item) => {
        if (item._rel.keywordCount <= 1) return item._rel.totalMatches >= 1;
        if (item._rel.keywordCount === 2) return item._rel.titleMatches >= 1 && item._rel.totalMatches >= 2;
        return item._rel.titleMatches >= 2 && item._rel.ratio >= 0.5;
      })
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    return filtered.slice(0, limit).map(({ _rel, ...rest }) => rest);
  } catch {
    return [];
  }
}

/**
 * Queries Crossref public API.
 */
export async function searchCrossrefLive(query: string, limit = 5): Promise<LiveSearchResult[]> {
  const params = new URLSearchParams({
    query,
    rows: String(limit),
    sort: "relevance",
  });

  try {
    const res = await fetch(`https://api.crossref.org/works?${params.toString()}`, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        "User-Agent": "ScholarCore/2.0 (mailto:scholar-core@users.noreply.github.com)",
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as CrossrefApiResponse;
    const items = data.message?.items ?? [];

    return items.map((item) => {
      const rawTitle = Array.isArray(item.title) ? item.title[0] : item.title || "Untitled Paper";
      const title = stripHtml(rawTitle);
      const doi = item.DOI ? item.DOI.replace(/^https?:\/\/doi\.org\//, "") : undefined;
      const url = item.URL || (doi ? `https://doi.org/${doi}` : "");
      const authors = Array.isArray(item.author)
        ? item.author
            .map((a) => (a.given && a.family ? `${a.family}, ${a.given}` : a.name || a.family || ""))
            .filter((n): n is string => Boolean(n))
        : [];
      const venue = Array.isArray(item["container-title"])
        ? item["container-title"][0]
        : item["container-title"];
      const rawSnippet = item.abstract
        ? stripHtml(item.abstract).slice(0, 1800)
        : venue
        ? `Peer-reviewed paper published in ${venue}.`
        : "Scholarly record registered with Crossref.";
      const dateParts =
        item.published?.["date-parts"]?.[0] ||
        item["published-print"]?.["date-parts"]?.[0] ||
        item.created?.["date-parts"]?.[0];
      const publicationDate = Array.isArray(dateParts) && dateParts.length > 0 ? dateParts.join("-") : undefined;

      return {
        title,
        url,
        snippet: rawSnippet,
        publicationDate,
        authors,
        source: "crossref" as const,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Queries Wikipedia API for real-time encyclopedia facts and overview summaries.
 */
export async function searchWikipediaLive(query: string, limit = 3): Promise<LiveSearchResult[]> {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    utf8: "",
    format: "json",
    origin: "*",
    srlimit: String(limit),
  });

  try {
    const res = await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as WikipediaSearchResponse;
    const items = data.query?.search ?? [];

    return items.map((item) => {
      const pageTitle = item.title;
      const slug = encodeURIComponent(pageTitle.replace(/\s+/g, "_"));
      const url = `https://en.wikipedia.org/wiki/${slug}`;
      const snippet = stripHtml(item.snippet);
      const publicationDate = item.timestamp ? item.timestamp.split("T")[0] : undefined;

      return {
        title: pageTitle,
        url,
        snippet,
        publicationDate,
        authors: [],
        source: "wikipedia" as const,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Queries Supabase Edge Function `search-proxy` if configured.
 */
export async function searchProxyWebLive(query: string, limit = 5): Promise<LiveSearchResult[]> {
  const config = getSupabaseRestConfig();
  if (!config) return [];

  try {
    const res = await fetch(`${config.supabaseUrl.replace(/\/+$/, "")}/functions/v1/search-proxy`, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok) return [];
    const parsed = (await res.json()) as { results?: WebProxyResult[] };
    const items = parsed.results ?? [];

    return items.map((item) => ({
      title: item.title || item.url,
      url: item.url,
      snippet: item.content ? stripHtml(item.content).slice(0, 300) : "Web result",
      publicationDate: undefined,
      authors: [],
      source: "web" as const,
      score: item.score,
    }));
  } catch {
    return [];
  }
}

/**
 * Orchestrates multi-source live web & scholarly search.
 * Merges and deduplicates records across OpenAlex, Crossref, and Web.
 */
export async function executeLiveSearch(
  query: string,
  options: {
    limit?: number;
    mode?: "all" | "scholarly" | "web";
  } = {}
): Promise<LiveSearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const limit = Math.max(1, Math.min(options.limit ?? 20, 120));
  const mode = options.mode ?? "all";
  const topicQuery = cleanSearchTopic(cleanQuery);

  const webTasks: Array<Promise<LiveSearchResult[]>> = [];
  const scholarlyTasks: Array<Promise<LiveSearchResult[]>> = [];

  if (mode === "all" || mode === "web") {
    webTasks.push(
      searchConfiguredWebApi(cleanQuery, Math.min(15, limit)).then((items) =>
        items.map((item) => ({
          title: item.title,
          url: item.url,
          snippet: item.snippet,
          publicationDate: item.publishedDate || (item.year ? String(item.year) : undefined),
          authors: item.authors && item.authors.length > 0 ? item.authors : item.publisher ? [item.publisher] : item.venue ? [item.venue] : [],
          source: "web" as const,
          score: (item.score ?? 80) + 15,
        }))
      )
    );
    webTasks.push(
      searchGoogleNewsRss(topicQuery, Math.min(10, limit)).then((items) =>
        items.map((item) => ({
          title: item.title,
          url: item.url,
          snippet: item.snippet,
          publicationDate: item.publishedDate || (item.year ? String(item.year) : undefined),
          authors: item.authors && item.authors.length > 0 ? item.authors : item.publisher ? [item.publisher] : item.venue ? [item.venue] : [],
          source: "web" as const,
          score: (item.score ?? 78) + 12,
        }))
      )
    );
    webTasks.push(
      searchDuckDuckGo(topicQuery, Math.min(10, limit)).then((items) =>
        items.map((item) => ({
          title: item.title,
          url: item.url,
          snippet: item.snippet,
          publicationDate: item.publishedDate || (item.year ? String(item.year) : undefined),
          authors: item.authors && item.authors.length > 0 ? item.authors : item.publisher ? [item.publisher] : [],
          source: "web" as const,
          score: (item.score ?? 70) + 10,
        }))
      )
    );
    webTasks.push(searchProxyWebLive(topicQuery, Math.min(10, limit)));
  }

  if (mode === "all" || mode === "scholarly") {
    const scholarlyCap = Math.max(15, limit);
    scholarlyTasks.push(searchOpenAlexLive(topicQuery, scholarlyCap));
    scholarlyTasks.push(
      searchCrossrefLive(topicQuery, scholarlyCap).then((items) =>
        items.filter((item) => {
          const rel = computeLiveSearchRelevance(cleanQuery, item.title, item.snippet);
          return rel.keywordCount <= 1 ? rel.totalMatches >= 1 : rel.titleMatches >= 1 && rel.ratio >= 0.4;
        })
      )
    );
  }

  const [webSettled, scholarlySettled] = await Promise.all([
    Promise.allSettled(webTasks),
    Promise.allSettled(scholarlyTasks),
  ]);

  const webPool: LiveSearchResult[] = [];
  for (const r of webSettled) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) {
      webPool.push(...r.value);
    }
  }

  const scholarlyPool: LiveSearchResult[] = [];
  for (const r of scholarlySettled) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) {
      scholarlyPool.push(...r.value);
    }
  }

  // Combine scholarly and web sources without capping scholarly sources to 2
  const combinedPool = [...scholarlyPool, ...webPool];

  // Deduplicate by URL or normalized Title
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const deduplicated: LiveSearchResult[] = [];

  for (const item of combinedPool) {
    const cleanUrl = item.url.toLowerCase().trim();
    const normTitle = item.title.toLowerCase().replace(/[\W_]+/g, " ").trim();

    if (cleanUrl && seenUrls.has(cleanUrl)) continue;
    if (normTitle && seenTitles.has(normTitle)) continue;

    if (cleanUrl) seenUrls.add(cleanUrl);
    if (normTitle) seenTitles.add(normTitle);

    deduplicated.push(item);
  }

  return deduplicated.slice(0, limit);
}
