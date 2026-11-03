/**
 * Web Search Engine for Scholar Core AI
 *
 * Implements Perplexity-grade real-time web search, multi-source retrieval,
 * authoritative source tiering, and citation metadata:
 * 1. Multi-vector search: Factual entities, official/primary records, and peer-reviewed scholarly literature.
 * 2. Source Authority Evaluation: Rigorous domain scoring (Gov/IO -> Academic -> Top News -> General Web).
 * 3. Freshness & Recency: Extracts dates/years and prioritizes current verified data.
 * 4. SSRF-guarded webpage content retrieval using safeFetchHtml.
 * 5. Strict citation metadata: Direct clickable URLs, domain badges, publisher, and evidence summaries.
 */

import { safeFetchHtml } from "../../utils/ssrfGuard.ts";
import { discoverOpenAlexSources } from "../discovery/discovery.ts";

export type SourceAuthorityTier = "A" | "B" | "C" | "D";

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  publisher?: string;
  sourceType: "official" | "scholarly" | "media" | "web";
  authorityTier: SourceAuthorityTier;
  authorityBadge: string;
  score: number;
  publishedDate?: string;
  author?: string;
  isPrimary?: boolean;
}

export interface WebSearchResponse {
  query: string;
  results: SearchResultItem[];
  retrievedAt: string;
  totalEvaluated: number;
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
 * Extracts hostname domain from a URL.
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "external";
  }
}

/**
 * Maps known domains to prestigious publisher names.
 */
function resolvePublisherName(domain: string, title?: string): string {
  const d = domain.toLowerCase();
  if (d.includes("who.int")) return "World Health Organization";
  if (d.includes("un.org")) return "United Nations";
  if (d.includes("worldbank.org")) return "The World Bank";
  if (d.includes("imf.org")) return "International Monetary Fund";
  if (d.includes("oecd.org")) return "OECD";
  if (d.includes("wto.org")) return "World Trade Organization";
  if (d.includes("nature.com")) return "Nature Portfolio";
  if (d.includes("science.org")) return "Science / AAAS";
  if (d.includes("thelancet.com")) return "The Lancet";
  if (d.includes("cell.com")) return "Cell Press";
  if (d.includes("nejm.org")) return "New England Journal of Medicine";
  if (d.includes("nih.gov") || d.includes("ncbi.nlm.nih.gov")) return "National Institutes of Health (NIH)";
  if (d.includes("cdc.gov")) return "Centers for Disease Control and Prevention";
  if (d.includes("arxiv.org")) return "arXiv.org";
  if (d.includes("ieee.org")) return "IEEE Xplore";
  if (d.includes("reuters.com")) return "Reuters";
  if (d.includes("apnews.com")) return "Associated Press (AP)";
  if (d.includes("bbc.com") || d.includes("bbc.co.uk")) return "BBC News";
  if (d.includes("bloomberg.com")) return "Bloomberg";
  if (d.includes("ft.com")) return "Financial Times";
  if (d.includes("theguardian.com")) return "The Guardian";
  if (d.includes("economist.com")) return "The Economist";
  if (d.includes("wsj.com")) return "The Wall Street Journal";
  if (d.includes("nytimes.com")) return "The New York Times";
  if (d.includes("wikipedia.org")) return "Wikipedia Foundation";
  if (d.includes("gov.np")) return "Government of Nepal";
  if (d.includes("gov.uk")) return "UK Government Portal";

  // Infer publisher from title suffix if standard e.g. "Title - The New York Times"
  if (title && title.includes(" - ")) {
    const candidate = title.split(" - ").pop()?.trim();
    if (candidate && candidate.length > 2 && candidate.length < 40) return candidate;
  }
  if (title && title.includes(" | ")) {
    const candidate = title.split(" | ").pop()?.trim();
    if (candidate && candidate.length > 2 && candidate.length < 40) return candidate;
  }

  // Capitalize main domain segment as fallback
  const parts = d.split(".");
  return parts.length >= 2 ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : d;
}

/**
 * Rigorously evaluates source authority, tier, and evidence weight.
 */
export function evaluateSourceAuthority(
  url: string,
  title: string,
  snippet: string,
  year?: number | string
): {
  domain: string;
  publisher: string;
  sourceType: "official" | "scholarly" | "media" | "web";
  authorityTier: SourceAuthorityTier;
  authorityBadge: string;
  score: number;
  isPrimary: boolean;
  publishedDate?: string;
} {
  const domain = extractDomain(url);
  const publisher = resolvePublisherName(domain, title);

  // Detect publication year from text if not provided
  let detectedYear = year ? String(year) : undefined;
  if (!detectedYear) {
    const yearMatch = (title + " " + snippet).match(/\b(201[89]|202[0-6])\b/);
    if (yearMatch) {
      detectedYear = yearMatch[1];
    }
  }

  // TIER A: Government, Intergovernmental, and Official International Portals
  const isGovDomain =
    domain.endsWith(".gov") ||
    domain.includes(".gov.") ||
    domain.endsWith(".mil") ||
    domain.endsWith(".fed.us") ||
    domain === "europa.eu" ||
    domain.endsWith(".europa.eu");

  const isIntergovernmental = [
    "un.org",
    "who.int",
    "worldbank.org",
    "imf.org",
    "oecd.org",
    "wto.org",
    "unesco.org",
    "iaea.org",
    "wipo.int",
    "ilo.org",
    "fao.org",
  ].some((d) => domain === d || domain.endsWith("." + d));

  if (isGovDomain || isIntergovernmental) {
    return {
      domain,
      publisher,
      sourceType: "official",
      authorityTier: "A",
      authorityBadge: "Government / Official",
      score: 95,
      isPrimary: true,
      publishedDate: detectedYear,
    };
  }

  // TIER A: Peer-Reviewed Scientific Journals, Research Repositories, Universities
  const isEduDomain = domain.endsWith(".edu") || domain.includes(".edu.") || domain.includes(".ac.");
  const isScholarlyRepo = [
    "nature.com",
    "science.org",
    "cell.com",
    "thelancet.com",
    "nejm.org",
    "bmj.com",
    "ieee.org",
    "acm.org",
    "arxiv.org",
    "biorxiv.org",
    "medrxiv.org",
    "ncbi.nlm.nih.gov",
    "pubmed.ncbi.nlm.nih.gov",
    "crossref.org",
    "doi.org",
    "openalex.org",
    "sciencedirect.com",
    "springer.com",
    "wiley.com",
    "jstor.org",
    "oup.com",
    "cambridge.org",
    "plos.org",
    "frontiersin.org",
    "europepmc.org",
    "ssrn.com",
    "pnas.org",
  ].some((d) => domain === d || domain.endsWith("." + d));

  if (isEduDomain || isScholarlyRepo) {
    return {
      domain,
      publisher,
      sourceType: "scholarly",
      authorityTier: "A",
      authorityBadge: "Academic or scholarly publisher",
      score: 90,
      isPrimary: true,
      publishedDate: detectedYear,
    };
  }

  // TIER B: High-Credibility Global News & Policy Think Tanks
  const isReputableMedia = [
    "reuters.com",
    "apnews.com",
    "bbc.com",
    "bbc.co.uk",
    "bloomberg.com",
    "ft.com",
    "economist.com",
    "theguardian.com",
    "wsj.com",
    "nytimes.com",
    "washingtonpost.com",
    "aljazeera.com",
    "npr.org",
    "time.com",
    "afp.com",
    "brookings.edu",
    "pewresearch.org",
    "cfr.org",
    "chathamhouse.org",
    "csis.org",
    "rand.org",
  ].some((d) => domain === d || domain.endsWith("." + d));

  if (isReputableMedia) {
    return {
      domain,
      publisher,
      sourceType: "media",
      authorityTier: "B",
      authorityBadge: "Reputable News / Policy",
      score: 80,
      isPrimary: false,
      publishedDate: detectedYear,
    };
  }

  // TIER C: Encyclopedias, Open Documentation & Standard Technical Portals
  const isEncyclopediaOrTech = [
    "wikipedia.org",
    "britannica.com",
    "developer.mozilla.org",
    "github.com",
    "w3.org",
    "investopedia.com",
    "statista.com",
  ].some((d) => domain === d || domain.endsWith("." + d));

  if (isEncyclopediaOrTech) {
    return {
      domain,
      publisher,
      sourceType: "web",
      authorityTier: "C",
      authorityBadge: "Reference / Documentation",
      score: 65,
      isPrimary: false,
      publishedDate: detectedYear,
    };
  }

  // TIER D: Low Authority / Content Farms / Unverified Forums
  const isLowAuthority = [
    "quora.com",
    "reddit.com",
    "pinterest.com",
    "answers.com",
    "yahoo.com",
    "medium.com",
  ].some((d) => domain === d || domain.endsWith("." + d));

  if (isLowAuthority) {
    return {
      domain,
      publisher,
      sourceType: "web",
      authorityTier: "D",
      authorityBadge: "Community / Unverified",
      score: 35,
      isPrimary: false,
      publishedDate: detectedYear,
    };
  }

  // Default Standard Web
  return {
    domain,
    publisher,
    sourceType: "web",
    authorityTier: "C",
    authorityBadge: "Verified Web",
    score: 55,
    isPrimary: false,
    publishedDate: detectedYear,
  };
}

/**
 * Search DuckDuckGo HTML endpoint without JavaScript requirement.
 */
export async function searchDuckDuckGo(query: string, maxResults = 8): Promise<SearchResultItem[]> {
  try {
    const encoded = encodeURIComponent(query);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);

    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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

    const resultBlocks = html.split(/class="result\s+results_links/gi).slice(1);

    for (const block of resultBlocks) {
      if (items.length >= maxResults) break;

      const linkMatch =
        block.match(/href="([^"]+)"[^>]*class="result__a"/i) ||
        block.match(/class="result__url"[^>]*href="([^"]+)"/i);
      if (!linkMatch) continue;

      let rawUrl = linkMatch[1];
      if (rawUrl.includes("uddg=")) {
        const uddgParam = rawUrl.split("uddg=")[1]?.split("&")[0];
        if (uddgParam) {
          rawUrl = decodeURIComponent(uddgParam);
        }
      }

      if (!rawUrl.startsWith("http")) continue;

      const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
      const title = titleMatch ? cleanHtmlToText(titleMatch[1], 150) : "Search Result";

      const snippetMatch =
        block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) ||
        block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
      const snippet = snippetMatch ? cleanHtmlToText(snippetMatch[1], 350) : "";

      if (title && rawUrl) {
        const auth = evaluateSourceAuthority(rawUrl, title, snippet);
        items.push({
          title,
          url: rawUrl,
          snippet,
          domain: auth.domain,
          publisher: auth.publisher,
          sourceType: auth.sourceType,
          authorityTier: auth.authorityTier,
          authorityBadge: auth.authorityBadge,
          score: auth.score,
          isPrimary: auth.isPrimary,
          publishedDate: auth.publishedDate,
        });
      }
    }

    return items;
  } catch (err) {
    console.warn("DuckDuckGo search error (falling back to complementary scholarly and encyclopedic vectors):", err);
    return [];
  }
}

/**
 * Search Wikipedia public encyclopedic API for factual and encyclopedic web sources.
 */
export async function searchWikipedia(query: string, maxResults = 4): Promise<SearchResultItem[]> {
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

    return items.slice(0, maxResults).map((item: any) => {
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`;
      const snippet = cleanHtmlToText(item.snippet || "", 300);
      const auth = evaluateSourceAuthority(url, item.title, snippet);
      return {
        title: item.title,
        url,
        snippet,
        domain: auth.domain,
        publisher: auth.publisher,
        sourceType: auth.sourceType,
        authorityTier: auth.authorityTier,
        authorityBadge: auth.authorityBadge,
        score: auth.score,
        isPrimary: auth.isPrimary,
        publishedDate: auth.publishedDate,
      };
    });
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
      const snippet = `${author || "Unknown author"} (${year || "n.d."})${venue ? ` — ${venue}` : ""}. DOI: ${item.DOI || "N/A"}`;
      const auth = evaluateSourceAuthority(url, title, snippet, year);

      return {
        title,
        url,
        snippet,
        domain: auth.domain,
        publisher: venue || auth.publisher,
        sourceType: "scholarly" as const,
        authorityTier: "A" as const,
        authorityBadge: "DOI-registered publication",
        score: 92,
        isPrimary: true,
        publishedDate: year ? String(year) : undefined,
        author,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Search scholarly sources via OpenAlex as complementary academic web search.
 */
export async function searchScholarlySources(query: string, maxResults = 4): Promise<SearchResultItem[]> {
  try {
    const results = await discoverOpenAlexSources(query, maxResults).catch(() => []);
    return results.map((r) => {
      const url = r.url || (r.doi ? `https://doi.org/${r.doi}` : `https://openalex.org`);
      const snippet = `${r.authors?.slice(0, 3).join(", ") || "Unknown author"} (${r.year || "n.d."})${r.venue ? ` — ${r.venue}` : ""}`;
      const auth = evaluateSourceAuthority(url, r.title, snippet, r.year);

      return {
        title: r.title,
        url,
        snippet,
        domain: auth.domain,
        publisher: r.venue || auth.publisher,
        sourceType: "scholarly" as const,
        authorityTier: "A" as const,
        authorityBadge: "Scholarly index (OpenAlex)",
        score: 91,
        isPrimary: true,
        publishedDate: r.year ? String(r.year) : undefined,
        author: r.authors?.[0],
      };
    });
  } catch {
    return [];
  }
}

/**
 * Generate targeted multi-vector search queries from user inquiry.
 */
export function generateMultiVectorQueries(query: string): string[] {
  const clean = query.replace(/[?.,!]/g, " ").trim();
  const queries = [clean];

  const currentYear = new Date().getFullYear();
  const lower = clean.toLowerCase();

  // If query is time-sensitive or asks about recent status/events/economic metrics, add current temporal anchor
  const hasTimeKeyword = /latest|current|recent|today|now|newest|update|status|who is|election|gdp|inflation|rate|price|market/i.test(lower);
  if (hasTimeKeyword && !lower.includes(String(currentYear))) {
    queries.push(`${clean} ${currentYear}`);
  }

  // Generate official/primary domain targeted query if inquiry looks factual/regulatory/economic
  const hasOfficialTopic = /gdp|inflation|policy|law|regulation|minister|president|statistic|treaty|health|vaccine/i.test(lower);
  if (hasOfficialTopic) {
    queries.push(`${clean} official report government`);
  }

  return Array.from(new Set(queries)).slice(0, 3);
}

/**
 * Primary Unified Web Search: executes multi-vector search, ranks by authority & recency,
 * and fetches deep page content for top results.
 */
export async function executeWebSearch(
  query: string,
  options: { maxResults?: number; fetchFullContent?: boolean } = {}
): Promise<WebSearchResponse> {
  const maxResults = options.maxResults ?? 6;
  const effectiveQuery = query.trim();
  const multiQueries = generateMultiVectorQueries(effectiveQuery);

  // Run DuckDuckGo across multi-vector queries concurrently
  const searchPromises: Promise<SearchResultItem[]>[] = multiQueries.map((q) => searchDuckDuckGo(q, 6));

  // Run academic and encyclopedic searches concurrently
  searchPromises.push(searchWikipedia(effectiveQuery, 3));
  searchPromises.push(searchCrossRef(effectiveQuery, 3));
  searchPromises.push(searchScholarlySources(effectiveQuery, 3));

  const allBatchResults = await Promise.all(searchPromises);
  const flattened = allBatchResults.flat();

  // Deduplicate results by normalized URL
  const seenUrls = new Set<string>();
  const uniqueItems: SearchResultItem[] = [];

  for (const item of flattened) {
    try {
      const parsed = new URL(item.url);
      const normalized = parsed.hostname.toLowerCase() + parsed.pathname.replace(/\/+$/, "");
      if (!seenUrls.has(normalized)) {
        seenUrls.add(normalized);
        uniqueItems.push(item);
      }
    } catch {
      uniqueItems.push(item);
    }
  }

  // Score and Rank: Prioritize Tier A (Gov & Peer-Reviewed) and Tier B (Reputable News)
  const isTimeSensitive = /latest|current|recent|today|now|202[4-6]/i.test(effectiveQuery);
  const currentYear = new Date().getFullYear();

  const rankedItems = uniqueItems.map((item) => {
    let finalScore = item.score;

    // Recency bonus for time-sensitive questions
    if (item.publishedDate) {
      const y = parseInt(item.publishedDate, 10);
      if (!isNaN(y)) {
        if (y === currentYear) finalScore += isTimeSensitive ? 15 : 6;
        else if (y === currentYear - 1) finalScore += isTimeSensitive ? 8 : 4;
        else if (y < currentYear - 5 && isTimeSensitive) finalScore -= 10;
      }
    }

    // Snippet content richness bonus
    if (item.snippet && item.snippet.length > 150) finalScore += 4;

    return { ...item, score: finalScore };
  });

  rankedItems.sort((a, b) => b.score - a.score);

  const selected = rankedItems.slice(0, maxResults);

  // If full content is requested, safely fetch the top 2 web pages
  if (options.fetchFullContent && selected.length > 0) {
    const topItems = selected.slice(0, 2);
    await Promise.all(
      topItems.map(async (item) => {
        try {
          const fetchRes = await safeFetchHtml(item.url, { timeoutMs: 4000, maxBytes: 500_000 });
          if (fetchRes && fetchRes.body) {
            const extracted = cleanHtmlToText(fetchRes.body, 1400);
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
    results: selected,
    retrievedAt: new Date().toISOString(),
    totalEvaluated: uniqueItems.length,
  };
}

/**
 * Formats search results into a clean context block for LLM prompts with clear citation keys.
 */
export function formatSearchResultsForPrompt(results: SearchResultItem[]): string {
  if (results.length === 0) {
    return "No external web sources were found for this query.";
  }

  return results
    .map((r, i) => {
      const tierBadge = r.authorityBadge ? ` [${r.authorityBadge}]` : "";
      const dateStr = r.publishedDate ? ` | Date: ${r.publishedDate}` : "";
      const pubStr = r.publisher ? ` | Publisher: ${r.publisher}` : "";
      return `[${i + 1}] Source: "${r.title}"\nURL: ${r.url}\nDomain: ${r.domain}${pubStr}${tierBadge}${dateStr}\nEvidence & Content:\n${r.snippet}\n`;
    })
    .join("\n---\n");
}
