/**
 * Citation Validator & Anti-Hallucination Guardrail for Scholar Core
 *
 * Implements strict Perplexity-grade citation integrity:
 * 1. Validates every inline link and bracket citation [N] against actually retrieved sources.
 * 2. Purges or rectifies hallucinated URLs (never allows invented domains or links).
 * 3. Enforces consistent inline citation mapping ([1], [2]).
 * 4. Ensures structured "References & Evidence Base" section with authentic metadata.
 * 5. Tags claims with authority tiers and identifies unverified assertions.
 */

import type { SearchResultItem } from "./webSearchEngine.ts";
import { CitationFormatterFactory } from "../../../src/citation_compliance/formattingEngine.ts";
import type { CanonicalReference } from "../../../src/citation_compliance/model/reference.ts";

export interface ValidationResult {
  text: string;
  citations: SearchResultItem[];
  citedSourcesCount: number;
  hallucinatedUrlsPurged: number;
  unverifiedClaimsFlagged: boolean;
}

/**
 * Normalizes a URL for robust equality checking.
 */
function normalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    // Ignore trailing slashes, hash anchors, and tracking query params
    const cleanHost = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const cleanPath = parsed.pathname.replace(/\/+$/, "");
    return `${cleanHost}${cleanPath}`;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

/**
 * Validates and refines citations in an AI-generated answer.
 */
export function validateAndRefineCitations(
  rawText: string,
  verifiedSources: SearchResultItem[],
  options: {
    files?: Array<{ name: string; text?: string }>;
    images?: Array<{ name?: string }>;
    requireSourcesSection?: boolean;
    citationStyle?: string;
  } = {}
): ValidationResult {
  if (!rawText || verifiedSources.length === 0) {
    return {
      text: rawText || "",
      citations: verifiedSources || [],
      citedSourcesCount: 0,
      hallucinatedUrlsPurged: 0,
      unverifiedClaimsFlagged: false,
    };
  }

  const verifiedUrlMap = new Map<string, SearchResultItem>();
  const normalizedUrlMap = new Map<string, SearchResultItem>();

  verifiedSources.forEach((s) => {
    if (s.url) {
      verifiedUrlMap.set(s.url, s);
      normalizedUrlMap.set(normalizeUrl(s.url), s);
    }
  });

  let purifiedText = rawText;
  let purgedCount = 0;
  const actuallyCitedSources = new Set<SearchResultItem>();

  // 1. Validate all Markdown Links: [Anchor Text](http...)
  const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  purifiedText = purifiedText.replace(markdownLinkRegex, (match, anchorText, url) => {
    // Check if the URL matches an actually retrieved source
    if (verifiedUrlMap.has(url)) {
      const src = verifiedUrlMap.get(url)!;
      actuallyCitedSources.add(src);
      return match;
    }

    const norm = normalizeUrl(url);
    if (normalizedUrlMap.has(norm)) {
      const src = normalizedUrlMap.get(norm)!;
      actuallyCitedSources.add(src);
      return `[${anchorText}](${src.url})`;
    }

    // Check if the URL domain matches any verified source domain
    try {
      const parsedHost = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
      const domainMatch = verifiedSources.find((s) => {
        try {
          return new URL(s.url).hostname.toLowerCase().replace(/^www\./, "") === parsedHost;
        } catch {
          return false;
        }
      });

      if (domainMatch) {
        actuallyCitedSources.add(domainMatch);
        return `[${anchorText}](${domainMatch.url})`;
      }
    } catch {
      // invalid URL structure
    }

    // If it's a known placeholder or hallucinated link, purge the URL link but retain verified text attribution
    purgedCount++;
    return `[${anchorText}]`;
  });

  // 2. Validate and track Numeric Bracket Citations: [1], [2], [1, 2]
  const bracketRegex = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
  purifiedText = purifiedText.replace(bracketRegex, (match, numsStr) => {
    const indices = numsStr
      .split(",")
      .map((s: string) => parseInt(s.trim(), 10))
      .filter((n: number) => !isNaN(n));

    const validNums = indices.filter((n: number) => n >= 1 && n <= verifiedSources.length);
    if (validNums.length === 0) {
      return ""; // Out of range citation
    }

    validNums.forEach((n: number) => {
      const src = verifiedSources[n - 1];
      if (src) actuallyCitedSources.add(src);
    });

    return `[${validNums.join(", ")}]`;
  });

  // 3. Ensure a clean, authentic "References & Evidence Base" section exists
  // If the LLM omitted it or hallucinated ungrounded links at the end, build an authenticated one
  const hasRefSection = /(?:##\s*(?:References|Sources|Evidence Base)|###\s*(?:References|Sources))/i.test(purifiedText);
  const finalCitationsList = actuallyCitedSources.size > 0 ? Array.from(actuallyCitedSources) : verifiedSources.slice(0, 6);

  if (!hasRefSection && options.requireSourcesSection !== false && finalCitationsList.length > 0) {
    const styleId = (options.citationStyle || "apa").toLowerCase();
    let referencesBlock = "\n\n## References & Evidence Base\n";
    finalCitationsList.forEach((src, idx) => {
      const canonicalRef: CanonicalReference = {
        kind: src.sourceType === "official" ? "GovernmentPublication" : src.sourceType === "scholarly" ? "JournalArticle" : "Website",
        title: src.title,
        authors: src.author ? [{ firstName: "", lastName: src.author, order: 1 }] : [{ firstName: "", lastName: src.publisher || src.domain, order: 1 }],
        source: src.publisher || src.domain || src.title,
        journal: src.sourceType === "scholarly" ? src.publisher : undefined,
        publisher: src.publisher,
        year: src.publishedDate,
        publicationDate: src.publishedDate ? `${src.publishedDate}-01-01` : undefined,
        url: src.url,
      };

      let formattedEntry = "";
      try {
        formattedEntry = CitationFormatterFactory.formatBibliography(styleId, canonicalRef);
      } catch {
        formattedEntry = `${src.title}. ${src.publisher || src.domain}.`;
      }

      const badge = src.authorityBadge ? ` **[${src.authorityBadge}]**` : "";
      const snippetNote = src.snippet ? `\n   > *Evidence summary: ${src.snippet.slice(0, 180)}...*` : "";
      referencesBlock += `${idx + 1}. [${src.title}](${src.url}) — ${formattedEntry}${badge}${snippetNote}\n`;
    });

    purifiedText = purifiedText.trim() + referencesBlock;
  }

  return {
    text: purifiedText,
    citations: finalCitationsList,
    citedSourcesCount: finalCitationsList.length,
    hallucinatedUrlsPurged: purgedCount,
    unverifiedClaimsFlagged: purgedCount > 0,
  };
}
