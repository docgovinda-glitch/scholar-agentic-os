/**
 * Live Web & Scholarly Search Service.
 * Retrieves fresh scholarly papers and real-time web facts matching user queries.
 * Queries open scholarly indices (OpenAlex, Crossref) and web data (Wikipedia, search-proxy).
 * Strictly zero `any` types.
 */

import { getSupabaseRestConfig } from "../supabaseRest.ts";

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
  return words.map((w) => w[1]).join(" ").slice(0, 350);
}

/**
 * Queries OpenAlex public REST API.
 */
export async function searchOpenAlexLive(query: string, limit = 5): Promise<LiveSearchResult[]> {
  const params = new URLSearchParams({
    search: query,
    "per-page": String(limit),
  });
  const mailto = process.env.OPENALEX_MAILTO;
  if (mailto) params.set("mailto", mailto);

  try {
    const res = await fetch(`https://api.openalex.org/works?${params.toString()}`);
    if (!res.ok) return [];
    const data = (await res.json()) as OpenAlexApiResponse;
    const works = data.results ?? [];

    return works.map((w) => {
      const doi = w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//, "") : undefined;
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

      return {
        title: w.title || w.display_name || "Untitled Scholarly Work",
        url,
        snippet,
        publicationDate: w.publication_date || (w.publication_year ? String(w.publication_year) : undefined),
        authors,
        source: "openalex" as const,
      };
    });
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
        ? stripHtml(item.abstract).slice(0, 300)
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
    const res = await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`);
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
        authors: ["Wikipedia Contributors"],
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

  const limit = Math.max(1, Math.min(options.limit ?? 5, 20));
  const mode = options.mode ?? "all";

  const searchTasks: Array<Promise<LiveSearchResult[]>> = [];

  if (mode === "all" || mode === "scholarly") {
    searchTasks.push(searchOpenAlexLive(cleanQuery, Math.max(3, limit)));
    searchTasks.push(searchCrossrefLive(cleanQuery, Math.max(3, limit)));
  }

  if (mode === "all" || mode === "web") {
    searchTasks.push(searchWikipediaLive(cleanQuery, Math.min(3, limit)));
    searchTasks.push(searchProxyWebLive(cleanQuery, Math.min(3, limit)));
  }

  const results = await Promise.allSettled(searchTasks);
  const pool: LiveSearchResult[] = [];

  for (const r of results) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) {
      pool.push(...r.value);
    }
  }

  // Deduplicate by URL or normalized Title
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const deduplicated: LiveSearchResult[] = [];

  for (const item of pool) {
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
