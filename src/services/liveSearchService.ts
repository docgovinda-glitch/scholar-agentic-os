/**
 * Client-Side & Proxied Live Web & Scholarly Search Service.
 * Retrieves fresh web data and academic papers matching user queries.
 * Injects structured live grounding context blocks into client-owned AI prompts.
 * Strictly zero `any` types.
 */

import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient";

export interface LiveSearchResult {
  title: string;
  url: string;
  snippet: string;
  publicationDate?: string;
  authors: string[];
  source?: "openalex" | "crossref" | "web" | "wikipedia" | "arxiv";
  score?: number;
}

export interface LiveSearchOptions {
  limit?: number;
  mode?: "all" | "scholarly" | "web";
  signal?: AbortSignal;
}

const LIVE_SEARCH_GROUNDING_KEY = "scholar_live_search_grounding";
let memoryFallbackGrounding = false;

/**
 * Checks whether the user has enabled Live Web Search Grounding.
 */
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

/**
 * Updates the user's Live Web Search Grounding preference.
 */
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

/**
 * Subscribes to changes in Live Web Search Grounding toggle.
 */
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

/**
 * Direct client-side CORS query for OpenAlex (works in browser without backend proxy).
 */
async function searchOpenAlexClient(query: string, limit = 4, signal?: AbortSignal): Promise<LiveSearchResult[]> {
  try {
    const params = new URLSearchParams({ search: query, "per-page": String(limit) });
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
        authorships?: Array<{ author?: { display_name?: string } }>;
        abstract_inverted_index?: Record<string, number[]>;
        primary_location?: { landing_page_url?: string; source?: { display_name?: string } };
      }>;
    };

    return (data.results ?? []).map((w) => {
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
        snippet = words.map((p) => p[1]).join(" ").slice(0, 320);
      }
      if (!snippet && w.primary_location?.source?.display_name) {
        snippet = `Published in ${w.primary_location.source.display_name} (${w.publication_year || "Recent"}).`;
      }
      if (!snippet) {
        snippet = `Scholarly work indexed by OpenAlex (${w.publication_year || "Recent"}).`;
      }

      return {
        title: w.title || w.display_name || "Scholarly Publication",
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
 * Direct client-side CORS query for Wikipedia search API (works in browser without backend proxy).
 */
async function searchWikipediaClient(query: string, limit = 3, signal?: AbortSignal): Promise<LiveSearchResult[]> {
  try {
    const params = new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: query,
      utf8: "",
      format: "json",
      origin: "*",
      srlimit: String(limit),
    });
    const res = await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      query?: {
        search?: Array<{
          title: string;
          snippet: string;
          timestamp?: string;
        }>;
      };
    };

    return (data.query?.search ?? []).map((item) => ({
      title: item.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, "_"))}`,
      snippet: cleanHtmlTags(item.snippet),
      publicationDate: item.timestamp ? item.timestamp.split("T")[0] : undefined,
      authors: ["Wikipedia Contributors"],
      source: "wikipedia" as const,
    }));
  } catch {
    return [];
  }
}

/**
 * Executes a live search across open scholarly APIs and fresh web indices.
 * Tries the backend proxy first (`/api/search/live`), falling back to direct CORS browser fetch.
 */
export async function executeLiveSearch(
  query: string,
  options: LiveSearchOptions = {}
): Promise<LiveSearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const limit = Math.max(1, Math.min(options.limit ?? 5, 15));
  const mode = options.mode ?? "all";

  // 1. Try local server backend proxy
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (isSupabaseConfigured()) {
      try {
        const { data } = await getSupabaseClient().auth.getSession();
        if (data?.session?.access_token) {
          headers["Authorization"] = `Bearer ${data.session.access_token}`;
        }
      } catch {
        // Ignore session retrieval error and proceed
      }
    }

    const res = await fetch("/api/search/live", {
      method: "POST",
      headers,
      body: JSON.stringify({ query: cleanQuery, limit, mode }),
      signal: options.signal,
    });
    if (res.ok) {
      const data = (await res.json()) as { results?: LiveSearchResult[] };
      if (Array.isArray(data.results) && data.results.length > 0) {
        return data.results.slice(0, limit);
      }
    }
  } catch {
    // Server proxy unreachable; proceed to direct browser queries
  }

  // 2. Direct browser CORS fallback
  const promises: Array<Promise<LiveSearchResult[]>> = [];
  if (mode === "all" || mode === "scholarly") {
    promises.push(searchOpenAlexClient(cleanQuery, limit, options.signal));
  }
  if (mode === "all" || mode === "web") {
    promises.push(searchWikipediaClient(cleanQuery, Math.min(3, limit), options.signal));
  }

  const settled = await Promise.allSettled(promises);
  const candidates: LiveSearchResult[] = [];

  for (const s of settled) {
    if (s.status === "fulfilled" && Array.isArray(s.value)) {
      candidates.push(...s.value);
    }
  }

  // Deduplicate
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const deduped: LiveSearchResult[] = [];

  for (const item of candidates) {
    const normUrl = item.url.toLowerCase().trim();
    const normTitle = item.title.toLowerCase().replace(/[\W_]+/g, " ").trim();
    if (normUrl && seenUrls.has(normUrl)) continue;
    if (normTitle && seenTitles.has(normTitle)) continue;

    if (normUrl) seenUrls.add(normUrl);
    if (normTitle) seenTitles.add(normTitle);
    deduped.push(item);
  }

  return deduped.slice(0, limit);
}

/**
 * Formats retrieved live snippets into the strict grounding context block.
 */
export function formatLiveSearchGroundingContext(
  results: LiveSearchResult[],
  currentDate: string = new Date().toISOString().split("T")[0]
): string {
  if (!results || results.length === 0) {
    return "";
  }

  const snippets = results.slice(0, 5).map((r, idx) => {
    const authors = r.authors && r.authors.length > 0 ? r.authors.join(", ") : "Unknown Author";
    const date = r.publicationDate ? ` | Date: ${r.publicationDate}` : "";
    const source = r.source ? ` | Source: ${r.source}` : "";
    return `[${idx + 1}] "${r.title}" (${authors}${date}${source})\nURL: ${r.url}\nSummary / Evidence Snippet: ${r.snippet}`;
  });

  return `[Live Web Grounding Context (Retrieved: ${currentDate})]:\n${snippets.join("\n\n")}\n\n[Grounding Instructions]: Ground your response exclusively in the verified facts and evidence from these live snippets. Whenever you state facts or draw findings from a source, provide inline citation links using markdown format (e.g. [[1]](URL) or [Author, Year](URL)). If the retrieved sources do not contain sufficient evidence to answer, state this explicitly rather than fabricating details.`;
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
