/**
 * Web Search Engine for Scholar Core AI
 *
 * Provides real-time web search, source retrieval, and content extraction:
 * 1. Multi-source search: DuckDuckGo HTML / public search APIs + OpenAlex scholarly search.
 * 2. SSRF-guarded webpage content retrieval using safeFetchHtml.
 * 3. Text cleaning, snippet extraction, and citation metadata formatting.
 */

import { safeFetchHtml } from "../../utils/ssrfGuard.ts";
import { discoverOpenAlexSources, discoverCrossrefSources } from "../discovery/discovery.ts";

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  sourceType: "web" | "scholarly" | "official";
  publishedDate?: string;
  author?: string;
}

export interface WebSearchResponse {
  query: string;
  results: SearchResultItem[];
  retrievedAt: string;
}

/**
 * Clean HTML into plain text suitable for LLM context ingestion.
 */
export function cleanHtmlToText(html: string, maxLength = 8000): string {
  if (!html) return "";

  // 1. Remove script, style, nav, footer, header, svg, noscript tags and contents
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ");

  // 2. Replace paragraph, heading, break tags with newlines
  text = text
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  // 3. Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–");

  // 4. Normalize multiple whitespaces and excessive newlines
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();

  return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
}

/**
 * Search DuckDuckGo HTML endpoint without JavaScript requirement.
 */
export async function searchDuckDuckGo(query: string, maxResults = 6): Promise<SearchResultItem[]> {
  try {
    const encoded = encodeURIComponent(query);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `q=${encoded}`,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    const items: SearchResultItem[] = [];

    // Parse DuckDuckGo result links: class="result__a" or result-link
    // DuckDuckGo redirects through //duckduckgo.com/l/?uddg=...
    const resultBlocks = html.split(/class="result\s+results_links/gi).slice(1);

    for (const block of resultBlocks) {
      if (items.length >= maxResults) break;

      // Extract URL
      const linkMatch = block.match(/href="([^"]+)"[^>]*class="result__a"/i) || block.match(/class="result__url"[^>]*href="([^"]+)"/i);
      if (!linkMatch) continue;

      let rawUrl = linkMatch[1];
      if (rawUrl.includes("uddg=")) {
        const uddgParam = rawUrl.split("uddg=")[1]?.split("&")[0];
        if (uddgParam) {
          rawUrl = decodeURIComponent(uddgParam);
        }
      }

      if (!rawUrl.startsWith("http")) continue;

      // Extract Title
      const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
      const title = titleMatch ? cleanHtmlToText(titleMatch[1], 150) : "Search Result";

      // Extract Snippet
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) || block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
      const snippet = snippetMatch ? cleanHtmlToText(snippetMatch[1], 300) : "";

      if (title && rawUrl) {
        items.push({
          title,
          url: rawUrl,
          snippet,
          sourceType: rawUrl.includes(".edu") || rawUrl.includes(".gov") ? "official" : "web",
        });
      }
    }

    return items;
  } catch (err) {
    console.warn("DuckDuckGo search error (will fall back to scholarly sources):", err);
    return [];
  }
}

/**
 * Search Wikipedia public encyclopedic API for factual and encyclopedic web sources.
 */
export async function searchWikipedia(query: string, maxResults = 5): Promise<SearchResultItem[]> {
  try {
    const clean = query
      .replace(/^(what|who|when|where|why|how|can you|please|search for|tell me about)\s+/i, "")
      .replace(/[?.,!]/g, "")
      .trim();
    const effective = clean.length > 2 ? clean : query;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(effective)}&format=json&origin=*`,
      { signal: controller.signal }
    ).finally(() => clearTimeout(timer));

    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const items = data.query?.search || [];

    return items.slice(0, maxResults).map((item: any) => ({
      title: item.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`,
      snippet: cleanHtmlToText(item.snippet || "", 300),
      sourceType: "web" as const,
    }));
  } catch {
    return [];
  }
}

/**
 * Search CrossRef API for peer-reviewed academic journal publications.
 */
export async function searchCrossRef(query: string, maxResults = 4): Promise<SearchResultItem[]> {
  try {
    const clean = query
      .replace(/^(what|who|when|where|why|how|can you|please|search for|tell me about)\s+/i, "")
      .replace(/[?.,!]/g, "")
      .trim();
    const effective = clean.length > 2 ? clean : query;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(
      `https://api.crossref.org/works?query=${encodeURIComponent(effective)}&rows=${maxResults}&mailto=researcher@scholarcore.org`,
      { signal: controller.signal }
    ).finally(() => clearTimeout(timer));

    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const items = data.message?.items || [];

    return items.map((item: any) => {
      const title = Array.isArray(item.title) ? item.title[0] : item.title || "Scholarly Paper";
      const author = item.author?.[0] ? `${item.author[0].family || ""} ${item.author[0].given || ""}`.trim() : undefined;
      const year = item.created?.["date-parts"]?.[0]?.[0] || item.published?.["date-parts"]?.[0]?.[0];
      const url = item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : "https://crossref.org");
      const venue = item["container-title"]?.[0] || "";

      return {
        title,
        url,
        snippet: `${author || "Scholarly Author"} (${year || "n.d."})${venue ? ` — ${venue}` : ""}. DOI: ${item.DOI || "N/A"}`,
        sourceType: "scholarly" as const,
        publishedDate: year ? String(year) : undefined,
        author,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Search scholarly sources via OpenAlex and CrossRef as complementary academic web search.
 */
export async function searchScholarlySources(query: string, maxResults = 5): Promise<SearchResultItem[]> {
  try {
    const results = await discoverOpenAlexSources(query, maxResults).catch(() => []);
    return results.map((r) => ({
      title: r.title,
      url: r.url || `https://openalex.org`,
      snippet: `${r.authors?.slice(0, 3).join(", ") || "Unknown Author"} (${r.year || "n.d."})${r.venue ? ` — ${r.venue}` : ""}`,
      sourceType: "scholarly" as const,
      publishedDate: r.year ? String(r.year) : undefined,
      author: r.authors?.[0],
    }));
  } catch {
    return [];
  }
}

/**
 * Primary Unified Web Search: executes web search, supplements with scholarly search,
 * and optionally fetches full page content for top results.
 */
export async function executeWebSearch(
  query: string,
  options: { maxResults?: number; fetchFullContent?: boolean } = {}
): Promise<WebSearchResponse> {
  const maxResults = options.maxResults ?? 6;
  const effectiveQuery = query.trim();

  // Run DuckDuckGo web search, Wikipedia, CrossRef, and OpenAlex concurrently
  const [webResults, wikiResults, crossrefResults, scholarlyResults] = await Promise.all([
    searchDuckDuckGo(effectiveQuery, maxResults),
    searchWikipedia(effectiveQuery, 4),
    searchCrossRef(effectiveQuery, 3),
    searchScholarlySources(effectiveQuery, 3),
  ]);

  // Combine and deduplicate by URL domain/path
  const combined: SearchResultItem[] = [];
  const seenUrls = new Set<string>();

  for (const item of [...webResults, ...wikiResults, ...crossrefResults, ...scholarlyResults]) {
    try {
      const normalized = new URL(item.url).href;
      if (!seenUrls.has(normalized)) {
        seenUrls.add(normalized);
        combined.push(item);
      }
    } catch {
      combined.push(item);
    }
  }

  // If full content is requested, safely fetch the top 2 web pages
  if (options.fetchFullContent && combined.length > 0) {
    const topItems = combined.slice(0, 2);
    await Promise.all(
      topItems.map(async (item) => {
        try {
          const fetchRes = await safeFetchHtml(item.url, { timeoutMs: 4000, maxBytes: 500_000 });
          if (fetchRes && fetchRes.body) {
            const extracted = cleanHtmlToText(fetchRes.body, 1200);
            if (extracted.length > item.snippet.length) {
              item.snippet = extracted;
            }
          }
        } catch {
          // Keep existing snippet if page fetch times out or fails SSRF guard
        }
      })
    );
  }

  return {
    query: effectiveQuery,
    results: combined.slice(0, maxResults),
    retrievedAt: new Date().toISOString(),
  };
}

/**
 * Formats search results into a clean context block for LLM prompts.
 */
export function formatSearchResultsForPrompt(results: SearchResultItem[]): string {
  if (results.length === 0) {
    return "No external web sources were found for this query.";
  }

  return results
    .map(
      (r, i) =>
        `[Source ${i + 1}]: ${r.title}\nURL: ${r.url}\nType: ${r.sourceType}\nContent / Summary: ${r.snippet}\n`
    )
    .join("\n---\n");
}
