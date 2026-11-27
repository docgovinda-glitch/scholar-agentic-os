import { normalizeCitationMarkers } from "../../../src/shared/citationMarkers.ts";
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

export interface PeerReviewCritique {
  type: "methodology" | "bias" | "counter_argument" | "sample_size" | "generalizability";
  title: string;
  explanation: string;
  severity: "low" | "medium" | "high";
}

export interface PeerReviewAudit {
  overallVerdict: string;
  rigorScore: number;
  critiques: PeerReviewCritique[];
  methodologicalStrengths: string[];
  counterTheories: string[];
}

export interface ValidationResult {
  text: string;
  citations: SearchResultItem[];
  citedSourcesCount: number;
  hallucinatedUrlsPurged: number;
  unverifiedClaimsFlagged: boolean;
  peerReviewAudit?: PeerReviewAudit;
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
  // A model's native citation form (【8†…】) becomes [8] before anything is checked.
  rawText = normalizeCitationMarkers(rawText);
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
  purifiedText = purifiedText.replace(bracketRegex, (match, numsStr, offset) => {
    const indices = numsStr
      .split(",")
      .map((s: string) => parseInt(s.trim(), 10))
      .filter((n: number) => !isNaN(n));

    const validNums = indices.filter((n: number) => n >= 1 && n <= verifiedSources.length);
    if (validNums.length === 0) {
      return ""; // Out of range citation
    }

    const matchOffset = typeof offset === "number" ? offset : 0;
    const windowStart = Math.max(0, matchOffset - 180);
    const windowEnd = Math.min(purifiedText.length, matchOffset + 180);
    const localSnippet = purifiedText.slice(windowStart, windowEnd).toLowerCase();

    validNums.forEach((n: number) => {
      const src = verifiedSources[n - 1];
      if (src) {
        if (!src.stance) {
          if (/\b(?:however|contrast|contradict|refute|dispute|limitation|fail to replicate|challenge|conversely|diverge|oppose|skeptical|drawback)\b/.test(localSnippet)) {
            src.stance = "contradicting";
          } else if (/\b(?:support|confirm|demonstrate|show|prove|corroborate|found that|evidence indicates|substantiate|validate|reinforce)\b/.test(localSnippet)) {
            src.stance = "supporting";
          } else {
            src.stance = "mentioning";
          }
        }
        actuallyCitedSources.add(src);
      }
    });

    return `[${validNums.join(", ")}]`;
  });

  // 3. Ensure a clean, authentic "References & Evidence Base" section exists
  // If the LLM omitted it or hallucinated ungrounded links at the end, build an authenticated one
  const hasRefSection = /(?:##\s*(?:References|Sources|Evidence Base)|###\s*(?:References|Sources))/i.test(purifiedText);
  const finalCitationsList = (actuallyCitedSources.size > 0 ? Array.from(actuallyCitedSources) : verifiedSources).map((c) => {
    if (!c.stance) c.stance = "supporting";
    return c;
  });

  // The text was written against verifiedSources' numbering, but the list returned holds only the
  // sources actually cited. Renumber [n] to the returned list, or every number after an uncited
  // source points at the wrong paper (and numbers past its end show as raw "[14]").
  if (finalCitationsList !== verifiedSources && actuallyCitedSources.size > 0) {
    const newNumber = new Map<number, number>();
    verifiedSources.forEach((src, i) => {
      const at = finalCitationsList.indexOf(src);
      if (at >= 0) newNumber.set(i + 1, at + 1);
    });
    purifiedText = purifiedText.replace(bracketRegex, (_m, numsStr: string) => {
      const mapped = numsStr
        .split(",")
        .map((x) => newNumber.get(parseInt(x.trim(), 10)))
        .filter((n): n is number => typeof n === "number");
      return mapped.length ? `[${[...new Set(mapped)].join(", ")}]` : "";
    });
  }

  if (!hasRefSection && options.requireSourcesSection !== false && finalCitationsList.length > 0) {
    const styleId = (options.citationStyle || "apa").toLowerCase();
    let referencesBlock = "\n\n## References & Evidence Base\n";
    finalCitationsList.forEach((src, idx) => {
      const canonicalRef = toCanonicalReference(src);

      let formattedEntry = "";
      try {
        formattedEntry = CitationFormatterFactory.formatBibliography(styleId, canonicalRef);
      } catch {
        formattedEntry = `${src.title}. ${src.publisher || src.domain}.`;
      }

      if (src.doi && !formattedEntry.toLowerCase().includes(src.doi.toLowerCase())) {
        formattedEntry = `${formattedEntry.trim()} https://doi.org/${src.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")}`;
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

/** Splits "Family, Given" or "Given Family" into name parts; never turns a publisher into a person. */
function splitAuthor(name: string, order: number): { firstName: string; lastName: string; order: number } {
  const clean = name.trim();
  if (clean.includes(",")) {
    const [family, ...rest] = clean.split(",");
    return { firstName: rest.join(",").trim(), lastName: family.trim(), order };
  }
  const parts = clean.split(/\s+/);
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] || clean, order };
}

function toCanonicalReference(src: SearchResultItem): CanonicalReference {
  const names = (src.authors && src.authors.length > 0 ? src.authors : src.author ? [src.author] : []).filter(Boolean);
  const yearMatch = String(src.publishedDate ?? src.year ?? "").match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : undefined;
  // A web page with no named author is attributed to its publishing organisation, as the styles do.
  const authors = names.length > 0
    ? names.slice(0, 20).map((n, i) => splitAuthor(n, i + 1))
    : src.publisher || src.domain
      ? [{ firstName: "", lastName: (src.publisher || src.domain) as string, order: 1 }]
      : [];
  return {
    kind: src.sourceType === "official" ? "GovernmentPublication" : src.sourceType === "scholarly" ? "JournalArticle" : "Website",
    title: src.title,
    authors,
    source: src.venue || src.publisher || src.domain || src.title,
    journal: src.sourceType === "scholarly" ? src.venue || src.publisher : undefined,
    publisher: src.publisher,
    year,
    publicationDate: src.publishedDate && /^\d{4}-\d{2}-\d{2}/.test(src.publishedDate) ? src.publishedDate.slice(0, 10) : year ? `${year}-01-01` : undefined,
    doi: src.doi,
    url: src.url,
  } as CanonicalReference;
}

