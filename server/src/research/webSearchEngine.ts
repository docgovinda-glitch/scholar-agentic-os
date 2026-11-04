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
  sourceType: "official" | "scholarly" | "media" | "web" | "vault";
  authorityTier: SourceAuthorityTier;
  authorityBadge: string;
  score: number;
  publishedDate?: string;
  year?: number | string;
  author?: string;
  authors?: string[];
  doi?: string;
  venue?: string;
  isPrimary?: boolean;
}

export interface WebSearchResponse {
  query: string;
  queriesExecuted?: string[];
  results: SearchResultItem[];
  retrievedAt: string;
  totalEvaluated: number;
}

/**
 * Neutralizes prompt-injection patterns in untrusted external webpage or document content
 * so retrieved text is strictly treated as passive evidence, never as system instructions.
 */
export function sanitizeUntrustedExternalText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\s*\/?\s*(?:system|instruction|prompt|assistant|developer|tool_call)\b[^>]*>/gi, "[filtered-tag]")
    .replace(/(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above|system)\s+(?:instructions|prompts|rules|directives)/gi, "[filtered-directive]")
    .replace(/(?:<\|im_start\|>|<\|im_end\|>|<\|endoftext\|>|\[INST\]|\[\/INST\]|<<SYS>>|<\/SYS>>)/gi, " ")
    .trim();
}

/**
 * Extracts structured metadata (publication date, author, site publisher, and article body)
 * from raw webpage HTML before stripping tags.
 */
export function extractPageMetadataFromHtml(html: string): {
  publishedDate?: string;
  author?: string;
  siteName?: string;
  articleHtml?: string;
} {
  if (!html) return {};

  const dateMatch =
    html.match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|pubdate|publishdate|date|dc\.date|dcterms\.created|sailthru\.date)["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:article:published_time|pubdate|publishdate|date|dc\.date)["']/i) ||
    html.match(/["']datePublished["']\s*:\s*["'](\d{4}-\d{2}-\d{2}[^"']*)["']/i) ||
    html.match(/<time[^>]+datetime=["'](\d{4}-\d{2}-\d{2}[^"']*)["']/i);

  let publishedDate: string | undefined;
  if (dateMatch?.[1]) {
    const yearMatch = dateMatch[1].match(/\b(19\d{2}|20[0-2]\d)\b/);
    const isoMatch = dateMatch[1].match(/(\d{4}-\d{2}-\d{2})/);
    publishedDate = isoMatch ? isoMatch[1] : yearMatch ? yearMatch[1] : undefined;
  }

  const authorMatch =
    html.match(/<meta[^>]+(?:name|property)=["'](?:author|article:author|dc\.creator)["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:author|dc\.creator)["']/i);
  const author = authorMatch?.[1]?.trim();

  const siteMatch =
    html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);
  const siteName = siteMatch?.[1]?.trim();

  const articleMatch =
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);

  return {
    publishedDate,
    author: author && author.length < 80 && !author.startsWith("http") ? author : undefined,
    siteName: siteName && siteName.length < 60 ? siteName : undefined,
    articleHtml: articleMatch?.[1],
  };
}

/**
 * Clean HTML into plain text suitable for LLM context ingestion.
 */
export function cleanHtmlToText(html: string, maxLength = 8000): string {
  if (!html) return "";

  // 1. Remove script, style, nav, footer, header, aside, svg, noscript tags and contents
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, " ")
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
    .replace(/&#039;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–");

  // 4. Normalize multiple whitespaces and excessive newlines & sanitize prompt injections
  text = sanitizeUntrustedExternalText(
    text
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n\s*\n+/g, "\n\n")
      .trim()
  );

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
  if (d.includes("adb.org")) return "Asian Development Bank";
  if (d.includes("saarc-sec.org")) return "SAARC Secretariat";
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
  if (d.includes("washingtonpost.com")) return "The Washington Post";
  if (d.includes("aljazeera.com")) return "Al Jazeera";
  if (d.includes("kathmandupost.com")) return "The Kathmandu Post";
  if (d.includes("thehindu.com")) return "The Hindu";
  if (d.includes("indianexpress.com")) return "The Indian Express";
  if (d.includes("himalayantimes.com")) return "The Himalayan Times";
  if (d.includes("nepalitimes.com")) return "Nepali Times";
  if (d.includes("myrepublica.nagariknetwork.com")) return "MyRepublica";
  if (d.includes("thediplomat.com")) return "The Diplomat";
  if (d.includes("foreignaffairs.com")) return "Foreign Affairs";
  if (d.includes("foreignpolicy.com")) return "Foreign Policy";
  if (d.includes("brookings.edu")) return "Brookings Institution";
  if (d.includes("cfr.org")) return "Council on Foreign Relations";
  if (d.includes("chathamhouse.org")) return "Chatham House";
  if (d.includes("carnegieendowment.org")) return "Carnegie Endowment for International Peace";
  if (d.includes("crisisgroup.org")) return "International Crisis Group";
  if (d.includes("sipri.org")) return "SIPRI";
  if (d.includes("orfonline.org")) return "Observer Research Foundation (ORF)";
  if (d.includes("icwa.in")) return "Indian Council of World Affairs (ICWA)";
  if (d.includes("idsa.in")) return "Manohar Parrikar IDSA";
  if (d.includes("wikipedia.org")) return "Wikipedia Foundation";
  if (d.includes("mofa.gov.np")) return "Ministry of Foreign Affairs, Nepal";
  if (d.includes("mea.gov.in")) return "Ministry of External Affairs, India";
  if (d.includes("gov.np")) return "Government of Nepal";
  if (d.includes("gov.in")) return "Government of India";
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
    const yearMatch = (title + " " + snippet).match(/\b(19[5-9]\d|20[0-2]\d)\b/);
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
    domain.endsWith(".int") ||
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
    "unicef.org",
    "undp.org",
    "unhcr.org",
    "iaea.org",
    "wipo.int",
    "ilo.org",
    "fao.org",
    "adb.org",
    "saarc-sec.org",
    "ipcc.ch",
    "icj-cij.org",
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
    "jamanetwork.com",
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
    "tandfonline.com",
    "sagepub.com",
    "jstor.org",
    "oup.com",
    "cambridge.org",
    "plos.org",
    "frontiersin.org",
    "europepmc.org",
    "semanticscholar.org",
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

  // TIER B: Policy Think Tanks & Strategic Research Institutions
  const isPolicyThinkTank = [
    "brookings.edu",
    "pewresearch.org",
    "cfr.org",
    "chathamhouse.org",
    "csis.org",
    "rand.org",
    "carnegieendowment.org",
    "crisisgroup.org",
    "sipri.org",
    "iiss.org",
    "nber.org",
    "orfonline.org",
    "icwa.in",
    "idsa.in",
    "cepr.org",
    "bruegel.org",
    "lowyinstitute.org",
    "foreignaffairs.com",
    "foreignpolicy.com",
  ].some((d) => domain === d || domain.endsWith("." + d));

  if (isPolicyThinkTank) {
    return {
      domain,
      publisher,
      sourceType: "official",
      authorityTier: "B",
      authorityBadge: "Policy & Strategic Institute",
      score: 85,
      isPrimary: false,
      publishedDate: detectedYear,
    };
  }

  // TIER B: High-Credibility Global & Regional News Organizations
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
    "dw.com",
    "france24.com",
    "npr.org",
    "pbs.org",
    "time.com",
    "afp.com",
    "thehindu.com",
    "indianexpress.com",
    "kathmandupost.com",
    "himalayantimes.com",
    "nepalitimes.com",
    "myrepublica.nagariknetwork.com",
    "thediplomat.com",
    "scmp.com",
    "nikkei.com",
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
        venue: r.venue,
        doi: r.doi,
        year: r.year,
        authors: r.authors,
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
 * Search Google News RSS feed for real-time international, diplomatic, policy, and current-affairs sources.
 * Requires zero API keys and returns verified publication dates and publisher attributions.
 */
export async function searchGoogleNewsRss(query: string, maxResults = 5): Promise<SearchResultItem[]> {
  try {
    const clean = query.replace(/[?.,!]/g, " ").trim();
    if (!clean) return [];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(clean)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(rssUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ScholarCoreResearchBot/2.0)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return [];
    const xml = await res.text();
    const itemBlocks = xml.split(/<item>/i).slice(1, maxResults + 2);
    const items: SearchResultItem[] = [];

    for (const block of itemBlocks) {
      if (items.length >= maxResults) break;
      const rawTitle = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "";
      const rawLink = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim() || "";
      const rawPubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() || "";
      const sourceMatch = block.match(/<source\s+url=["']([^"']+)["'][^>]*>([\s\S]*?)<\/source>/i);
      const rawDesc = block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "";

      const publisherUrl = sourceMatch?.[1]?.trim() || rawLink;
      const publisherName = cleanHtmlToText(sourceMatch?.[2] || "", 80);
      let title = cleanHtmlToText(rawTitle.replace(/<!\[CDATA\[|\]\]>/g, ""), 200);
      if (publisherName && title.endsWith(` - ${publisherName}`)) {
        title = title.slice(0, -(` - ${publisherName}`.length)).trim();
      }
      const snippetText = cleanHtmlToText(rawDesc.replace(/<!\[CDATA\[|\]\]>/g, ""), 360) || title;

      let isoDate: string | undefined;
      let yearNum: number | undefined;
      if (rawPubDate) {
        const parsedDate = new Date(rawPubDate);
        if (!isNaN(parsedDate.getTime())) {
          isoDate = parsedDate.toISOString().split("T")[0];
          yearNum = parsedDate.getUTCFullYear();
        }
      }

      const effectiveUrl = rawLink || publisherUrl;
      if (!title || !effectiveUrl.startsWith("http")) continue;

      const auth = evaluateSourceAuthority(publisherUrl || effectiveUrl, title, snippetText, yearNum);
      items.push({
        title,
        url: effectiveUrl,
        snippet: `${snippetText}${publisherName ? ` (Published by ${publisherName}${isoDate ? ` on ${isoDate}` : ""})` : ""}`,
        domain: auth.domain,
        publisher: publisherName || auth.publisher,
        sourceType: auth.sourceType === "web" ? "media" : auth.sourceType,
        authorityTier: auth.authorityTier === "C" ? "B" : auth.authorityTier,
        authorityBadge: auth.authorityBadge === "Verified Web" ? "Verified News / Current Affairs" : auth.authorityBadge,
        score: Math.max(auth.score, 78),
        isPrimary: auth.isPrimary,
        publishedDate: isoDate || auth.publishedDate,
        year: yearNum || auth.publishedDate,
        author: publisherName || auth.publisher,
        authors: publisherName ? [publisherName] : undefined,
      });
    }

    return items;
  } catch {
    return [];
  }
}

/**
 * Optional modular external search API adapter (Tavily / Serper / Brave Search)
 * when environment keys are configured on the server.
 */
export async function searchConfiguredWebApi(query: string, maxResults = 6): Promise<SearchResultItem[]> {
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();
  const serperKey = process.env.SERPER_API_KEY?.trim();
  const braveKey = process.env.BRAVE_SEARCH_API_KEY?.trim();

  if (tavilyKey) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyKey,
          query,
          search_depth: "advanced",
          max_results: maxResults,
        }),
        signal: AbortSignal.timeout(6500),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }>;
        };
        return (data.results ?? [])
          .filter((r): r is { title: string; url: string; content?: string; published_date?: string } => Boolean(r.title && r.url))
          .map((r) => {
            const snippet = cleanHtmlToText(r.content || "", 500);
            const auth = evaluateSourceAuthority(r.url, r.title, snippet, r.published_date);
            return {
              title: r.title,
              url: r.url,
              snippet,
              domain: auth.domain,
              publisher: auth.publisher,
              sourceType: auth.sourceType,
              authorityTier: auth.authorityTier,
              authorityBadge: auth.authorityBadge,
              score: auth.score + 5,
              isPrimary: auth.isPrimary,
              publishedDate: r.published_date || auth.publishedDate,
            };
          });
      }
    } catch {
      // fall through
    }
  }

  if (serperKey) {
    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, num: maxResults }),
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          organic?: Array<{ title?: string; link?: string; snippet?: string; date?: string }>;
        };
        return (data.organic ?? [])
          .filter((r): r is { title: string; link: string; snippet?: string; date?: string } => Boolean(r.title && r.link))
          .map((r) => {
            const snippet = cleanHtmlToText(r.snippet || "", 400);
            const auth = evaluateSourceAuthority(r.link, r.title, snippet, r.date);
            return {
              title: r.title,
              url: r.link,
              snippet,
              domain: auth.domain,
              publisher: auth.publisher,
              sourceType: auth.sourceType,
              authorityTier: auth.authorityTier,
              authorityBadge: auth.authorityBadge,
              score: auth.score + 4,
              isPrimary: auth.isPrimary,
              publishedDate: r.date || auth.publishedDate,
            };
          });
      }
    } catch {
      // fall through
    }
  }

  if (braveKey) {
    try {
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`,
        {
          headers: { Accept: "application/json", "X-Subscription-Token": braveKey },
          signal: AbortSignal.timeout(6000),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          web?: { results?: Array<{ title?: string; url?: string; description?: string; page_age?: string }> };
        };
        return (data.web?.results ?? [])
          .filter((r): r is { title: string; url: string; description?: string; page_age?: string } => Boolean(r.title && r.url))
          .map((r) => {
            const snippet = cleanHtmlToText(r.description || "", 400);
            const auth = evaluateSourceAuthority(r.url, r.title, snippet, r.page_age);
            return {
              title: r.title,
              url: r.url,
              snippet,
              domain: auth.domain,
              publisher: auth.publisher,
              sourceType: auth.sourceType,
              authorityTier: auth.authorityTier,
              authorityBadge: auth.authorityBadge,
              score: auth.score + 4,
              isPrimary: auth.isPrimary,
              publishedDate: r.page_age || auth.publishedDate,
            };
          });
      }
    } catch {
      // fall through
    }
  }

  return [];
}

/**
 * Generate targeted multi-vector search queries from user inquiry.
 */
export function generateMultiVectorQueries(query: string): string[] {
  const clean = query.replace(/[?.,!]/g, " ").trim();
  const queries = [clean];

  const currentYear = new Date().getFullYear();
  const lower = clean.toLowerCase();

  // If query is time-sensitive or asks about recent status/events/diplomatic/economic metrics, add current temporal anchor
  const hasTimeKeyword = /latest|current|recent|today|now|newest|update|developments|status|who is|election|summit|relations|bilateral|gdp|inflation|rate|price|market/i.test(lower);
  if (hasTimeKeyword && !lower.includes(String(currentYear))) {
    queries.push(`${clean} ${currentYear}`);
  }

  // Generate official/primary domain targeted query if inquiry looks factual/regulatory/diplomatic/economic
  const hasOfficialTopic = /gdp|inflation|policy|law|regulation|minister|president|statistic|treaty|bilateral|diplomatic|relations|border|trade|hydropower|agreement|health|vaccine/i.test(lower);
  if (hasOfficialTopic) {
    queries.push(`${clean} official report statement`);
  }

  return Array.from(new Set(queries)).slice(0, 3);
}

/**
 * Primary Unified Web Search: executes multi-vector search across live web, news, official portals,
 * and scholarly indices; ranks by authority & recency; and fetches deep page content via safeFetchHtml.
 */
export async function executeWebSearch(
  query: string,
  options: { maxResults?: number; fetchFullContent?: boolean } = {}
): Promise<WebSearchResponse> {
  const maxResults = options.maxResults ?? 8;
  const effectiveQuery = query.trim();
  const multiQueries = generateMultiVectorQueries(effectiveQuery);

  // Run configured API + DuckDuckGo across multi-vector queries concurrently
  const searchPromises: Promise<SearchResultItem[]>[] = [
    searchConfiguredWebApi(effectiveQuery, maxResults),
    ...multiQueries.map((q) => searchDuckDuckGo(q, 6)),
    searchGoogleNewsRss(effectiveQuery, 5),
    searchWikipedia(effectiveQuery, 3),
    searchCrossRef(effectiveQuery, 3),
    searchScholarlySources(effectiveQuery, 3),
  ];

  const allBatchResults = await Promise.all(searchPromises);
  const flattened = allBatchResults.flat();

  // Deduplicate results by normalized URL and normalized title
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const uniqueItems: SearchResultItem[] = [];

  for (const item of flattened) {
    try {
      const parsed = new URL(item.url);
      const normalizedUrl = parsed.hostname.toLowerCase() + parsed.pathname.replace(/\/+$/, "");
      const normalizedTitle = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!seenUrls.has(normalizedUrl) && (!normalizedTitle || !seenTitles.has(normalizedTitle))) {
        seenUrls.add(normalizedUrl);
        if (normalizedTitle) seenTitles.add(normalizedTitle);
        uniqueItems.push(item);
      }
    } catch {
      uniqueItems.push(item);
    }
  }

  // Score and Rank: Prioritize Tier A (Gov & Peer-Reviewed) and Tier B (Think Tanks & Reputable News)
  const isTimeSensitive = /latest|current|recent|today|now|developments|update|202[4-6]/i.test(effectiveQuery);
  const currentYear = new Date().getFullYear();

  const rankedItems = uniqueItems.map((item) => {
    let finalScore = item.score;

    // Recency bonus for time-sensitive questions
    if (item.publishedDate) {
      const yearMatch = String(item.publishedDate).match(/\b(19\d{2}|20[0-2]\d)\b/);
      const y = yearMatch ? parseInt(yearMatch[1], 10) : parseInt(String(item.publishedDate), 10);
      if (!isNaN(y)) {
        if (y === currentYear || y === currentYear - 1) finalScore += isTimeSensitive ? 16 : 6;
        else if (y === currentYear - 2) finalScore += isTimeSensitive ? 8 : 4;
        else if (y < currentYear - 5 && isTimeSensitive) finalScore -= 10;
      }
    }

    // Snippet content richness bonus
    if (item.snippet && item.snippet.length > 150) finalScore += 4;

    return { ...item, score: finalScore };
  });

  rankedItems.sort((a, b) => b.score - a.score);

  const selected = rankedItems.slice(0, maxResults);

  // If full content is requested, safely fetch & parse the top 4 web pages via SSRF-guarded safeFetchHtml
  if (options.fetchFullContent && selected.length > 0) {
    const topItems = selected.filter((item) => !item.url.includes("news.google.com/rss/")).slice(0, 4);
    await Promise.all(
      topItems.map(async (item) => {
        try {
          const fetchRes = await safeFetchHtml(item.url, { timeoutMs: 4200, maxBytes: 500_000 });
          if (fetchRes && fetchRes.body) {
            const meta = extractPageMetadataFromHtml(fetchRes.body);
            if (meta.publishedDate && !item.publishedDate) {
              item.publishedDate = meta.publishedDate;
              item.year = meta.publishedDate.slice(0, 4);
            }
            if (meta.author && !item.author) {
              item.author = meta.author;
              item.authors = [meta.author];
            }
            if (meta.siteName && (!item.publisher || item.publisher === item.domain)) {
              item.publisher = meta.siteName;
            }
            const sourceHtml = meta.articleHtml || fetchRes.body;
            const extracted = cleanHtmlToText(sourceHtml, 2200);
            if (extracted.length > item.snippet.length + 40) {
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
    queriesExecuted: multiQueries,
    results: selected,
    retrievedAt: new Date().toISOString(),
    totalEvaluated: uniqueItems.length,
  };
}

/**
 * Formats search results into a clean context block for LLM prompts with clear citation keys
 * and prompt-injection delimiters.
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
      const authorStr = r.author ? ` | Author: ${r.author}` : "";
      const doiStr = r.doi ? ` | DOI: ${r.doi}` : "";
      return `[${i + 1}] Source: "${r.title}"\nURL: ${r.url}\nDomain: ${r.domain}${pubStr}${authorStr}${tierBadge}${dateStr}${doiStr}\n<untrusted_source_evidence index="${i + 1}">\n${sanitizeUntrustedExternalText(r.snippet)}\n</untrusted_source_evidence>\n`;
    })
    .join("\n---\n");
}
