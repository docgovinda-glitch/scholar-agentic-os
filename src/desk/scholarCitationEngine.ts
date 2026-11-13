/**
 * Scholar Citation Engine & Referencing Subsystem (CSL-JSON Deterministic Engine)
 *
 * Implements authoritative CSL-JSON citation generation, strict metadata verification,
 * retraction filtering, 1-to-1 citation-reference bijection, and multi-style rendering
 * (APA 7th, MLA 9th, Chicago 17th Author-Date, Chicago 17th Notes & Bibliography,
 * Harvard, IEEE, Vancouver) for Ask Scholar responses.
 *
 * Strictly forbids placeholder authors or dates ("Contributors", "Unknown", "Anonymous", "n.d.").
 */

import type { ReferenceAuthor, ReferenceKind } from "../citation_compliance/model/reference";
import {
  verifyAndConvertToCSL,
  verifyAndDeduplicateSources,
  formatCSLInTextSingle,
  formatCSLBibliographyEntry,
  sortCSLItemsForStyle,
  normalizeCSLStyle,
  getReferenceListHeading,
  enforceCitationReferenceBijection,
  exportCSLToBibTeX,
  exportCSLToRIS,
  parseReferenceImportText,
  normalizeDoi,
  isBannedAuthorString,
  type CSLItem,
  type ExcludedSourceRecord,
  type SupportedCSLStyle,
} from "../citation_compliance/cslEngine";

export {
  verifyAndConvertToCSL,
  verifyAndDeduplicateSources,
  formatCSLInTextSingle,
  formatCSLBibliographyEntry,
  sortCSLItemsForStyle,
  normalizeCSLStyle,
  getReferenceListHeading,
  enforceCitationReferenceBijection,
  exportCSLToBibTeX,
  exportCSLToRIS,
  parseReferenceImportText,
  type CSLItem,
  type ExcludedSourceRecord,
  type SupportedCSLStyle,
};

export interface WebsiteCitationItem {
  id?: string;
  title?: string;
  url?: string;
  snippet?: string;
  domain?: string;
  publisher?: string;
  authorityBadge?: string;
  authorityTier?: string;
  source?: string;
  venue?: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  year?: number | string;
  publishedDate?: string;
  publicationDate?: string;
  author?: string;
  authors?: string[];
  doi?: string;
  isPrimary?: boolean;
  sourceType?: "official" | "scholarly" | "media" | "web" | string;
  credibilityLevel?: "high" | "moderate" | "preprint - not peer-reviewed";
  openAccessUrl?: string;
  isRetracted?: boolean;
  limitationNote?: string;
  csl?: CSLItem;
  claim?: string;
  citation?: string;
  evidenceSnippet?: string;
  mainFinding?: string;
  suggestedUse?: string;
}

export type AskCitationStyleId =
  | "apa"
  | "mla"
  | "chicago"
  | "chicago-notes"
  | "harvard"
  | "ieee"
  | "vancouver";

export interface AskCitationStyleInfo {
  id: AskCitationStyleId;
  name: string;
  shortLabel: string;
  isNumbered: boolean;
  description: string;
  exampleInText: string;
  exampleBib: string;
}

export const ASK_SCHOLAR_CITATION_STYLES: AskCitationStyleInfo[] = [
  {
    id: "apa",
    name: "APA 7th Edition",
    shortLabel: "APA 7th",
    isNumbered: false,
    description: "Author-date format: (Author, Year). Alphabetical reference list.",
    exampleInText: "(Vaswani et al., 2017)",
    exampleBib:
      "Vaswani, A., Shazeer, N., Parmar, N., & Uszkoreit, J. (2017). Attention is all you need. Advances in Neural Information Processing Systems, 30. https://doi.org/10.48550/arXiv.1706.03762",
  },
  {
    id: "mla",
    name: "MLA 9th Edition",
    shortLabel: "MLA 9th",
    isNumbered: false,
    description: "Author-page format: (Author). Alphabetical Works Cited list.",
    exampleInText: "(Vaswani et al.)",
    exampleBib:
      'Vaswani, Ashish, et al. "Attention Is All You Need." Advances in Neural Information Processing Systems, vol. 30, 2017. https://doi.org/10.48550/arXiv.1706.03762.',
  },
  {
    id: "chicago",
    name: "Chicago 17th (Author-Date)",
    shortLabel: "Chicago",
    isNumbered: false,
    description: "Author-date format: (Author Year). Alphabetical bibliography.",
    exampleInText: "(Vaswani et al. 2017)",
    exampleBib:
      'Vaswani, Ashish, et al. 2017. "Attention Is All You Need." Advances in Neural Information Processing Systems 30. https://doi.org/10.48550/arXiv.1706.03762.',
  },
  {
    id: "chicago-notes",
    name: "Chicago 17th (Notes & Bibliography)",
    shortLabel: "Chicago Notes",
    isNumbered: true,
    description: "Numbered note format: [1]. Alphabetical bibliography.",
    exampleInText: "[1]",
    exampleBib:
      'Vaswani, Ashish, et al. "Attention Is All You Need." Advances in Neural Information Processing Systems 30 (2017). https://doi.org/10.48550/arXiv.1706.03762.',
  },
  {
    id: "harvard",
    name: "Harvard Referencing",
    shortLabel: "Harvard",
    isNumbered: false,
    description: "Author-date format: (Author, Year). Alphabetical reference list.",
    exampleInText: "(Vaswani, 2017)",
    exampleBib:
      "Vaswani, A. et al. (2017) 'Attention Is All You Need', Advances in Neural Information Processing Systems, 30. doi:10.48550/arXiv.1706.03762.",
  },
  {
    id: "ieee",
    name: "IEEE",
    shortLabel: "IEEE",
    isNumbered: true,
    description: "Numbered bracket format: [1]. Appearance-ordered reference list.",
    exampleInText: "[1]",
    exampleBib:
      '[1] A. Vaswani et al., "Attention Is All You Need," Advances in Neural Information Processing Systems, vol. 30, 2017, doi: 10.48550/arXiv.1706.03762.',
  },
  {
    id: "vancouver",
    name: "Vancouver",
    shortLabel: "Vancouver",
    isNumbered: true,
    description: "Numbered format: (1). Appearance-ordered reference list.",
    exampleInText: "(1)",
    exampleBib:
      "1. Vaswani A, Shazeer N, Parmar N, Uszkoreit J. Attention Is All You Need. Advances in Neural Information Processing Systems. 2017;30. doi:10.48550/arXiv.1706.03762",
  },
];

export function getCitationStyleInfo(styleId: string): AskCitationStyleInfo {
  const norm = normalizeCSLStyle(styleId);
  const found = ASK_SCHOLAR_CITATION_STYLES.find((s) => s.id === norm);
  return found || ASK_SCHOLAR_CITATION_STYLES[0];
}

/**
 * Extracts a DOI (Digital Object Identifier) from a string, URL, or identifier.
 */
export function extractDoi(str?: string): string | undefined {
  return normalizeDoi(str);
}

/**
 * Splits a full name string into structured ReferenceAuthor parts.
 * Returns empty lastName if the name is a banned placeholder.
 */
export function splitAuthorName(fullName: string, order = 1): ReferenceAuthor {
  const clean = (fullName || "").trim().replace(/^by\s+/i, "");
  if (!clean || isBannedAuthorString(clean)) {
    return { firstName: "", lastName: "", order };
  }

  if (clean.includes(",")) {
    const [last, first] = clean.split(",").map((s) => s.trim());
    if (!last || isBannedAuthorString(last)) {
      return { firstName: "", lastName: "", order };
    }
    return { firstName: first || "", lastName: last, order };
  }

  const parts = clean.split(/\s+/);
  if (parts.length <= 1) {
    return { firstName: "", lastName: parts[0], order };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
    order,
  };
}

/**
 * Infers ReferenceKind from citation metadata.
 */
export function inferReferenceKind(item: WebsiteCitationItem): ReferenceKind {
  const type = (item.sourceType || "").toLowerCase();
  const domain = (item.domain || item.url || "").toLowerCase();

  if (type.includes("government") || type === "official" || domain.endsWith(".gov") || domain.includes("who.int") || domain.includes("un.org")) {
    return "GovernmentPublication";
  }
  if (type.includes("preprint") || domain.includes("arxiv.org") || domain.includes("biorxiv.org")) {
    return "Preprint";
  }
  if (type.includes("conference")) {
    return "ConferencePaper";
  }
  if (type.includes("book")) {
    return "Book";
  }
  if (type === "scholarly" || type.includes("peer-reviewed") || extractDoi(item.url) || extractDoi(item.doi)) {
    return "JournalArticle";
  }
  return "Website";
}

/**
 * Converts a WebsiteCitationItem into a verified CSLItem, or returns null if verification fails.
 */
export function citationItemToCSL(item: WebsiteCitationItem, index = 0): CSLItem | null {
  if (item.csl && item.csl.author?.length > 0 && item.csl.issued?.["date-parts"]?.[0]?.[0]) {
    return item.csl;
  }
  const res = verifyAndConvertToCSL(
    {
      id: item.id,
      title: item.title,
      authors: item.authors,
      author: item.author,
      year: item.year,
      publishedDate: item.publishedDate,
      publicationDate: item.publicationDate,
      venue: item.venue || item.source,
      journal: item.journal,
      volume: item.volume,
      issue: item.issue,
      pages: item.pages,
      publisher: item.publisher,
      doi: item.doi,
      url: item.url,
      sourceType: item.sourceType,
      credibilityLevel: item.credibilityLevel,
      openAccessUrl: item.openAccessUrl,
      isRetracted: item.isRetracted,
    },
    index
  );
  return res.ok ? res.item : null;
}

/**
 * Formats an in-text citation marker using the CSL-JSON Engine according to the selected style.
 * Returns empty string if the item lacks verifiable author or publication year.
 */
export function formatAskScholarInText(
  item: WebsiteCitationItem,
  index: number,
  styleId: string
): string {
  const style = normalizeCSLStyle(styleId);
  const csl = citationItemToCSL(item, index);
  if (!csl) return "";
  return formatCSLInTextSingle(csl, style, index + 1);
}

export interface FormattedBibliographyEntry {
  originalIndex: number;
  displayIndex: number;
  formattedText: string;
  markdownText?: string;
  htmlText?: string;
  rawCitation: WebsiteCitationItem;
  csl?: CSLItem;
  marker?: string;
  doi?: string;
  url?: string;
  openAccessUrl?: string;
  year?: string;
  publisher?: string;
  authorityBadge?: string;
  sourceTypeLabel?: string;
  credibilityLevel?: string;
}

/**
 * Formats a single bibliography item using the deterministic CSL-JSON Engine.
 * Returns null if the item fails verification (no verifiable author/year or retracted).
 */
export function formatAskScholarBibliographyEntry(
  item: WebsiteCitationItem,
  index: number,
  styleId: string
): FormattedBibliographyEntry | null {
  const style = normalizeCSLStyle(styleId);
  const csl = citationItemToCSL(item, index);
  if (!csl) return null;

  const formatted = formatCSLBibliographyEntry(csl, style, index + 1);
  const yearStr = String(csl.issued["date-parts"][0][0]);

  let marker: string | undefined = undefined;
  if (style === "ieee" || style === "chicago-notes") {
    marker = `[${index + 1}]`;
  } else if (style === "vancouver") {
    marker = `(${index + 1})`;
  }

  const doi = csl.DOI;
  const directUrl = doi ? (doi.startsWith("http") ? doi : `https://doi.org/${doi}`) : csl.URL;

  return {
    originalIndex: index + 1,
    displayIndex: index + 1,
    formattedText: formatted.plainText,
    markdownText: formatted.markdownText,
    htmlText: formatted.htmlText,
    rawCitation: { ...item, csl },
    csl,
    marker,
    doi: doi ? (doi.startsWith("http") ? doi : `https://doi.org/${doi}`) : undefined,
    url: directUrl,
    openAccessUrl: csl.openAccessUrl || item.openAccessUrl,
    year: yearStr,
    publisher: csl["container-title"] || csl.publisher || item.publisher || item.venue,
    authorityBadge: csl.sourceTypeLabel || item.authorityBadge || "peer-reviewed article",
    sourceTypeLabel: csl.sourceTypeLabel,
    credibilityLevel: csl.credibilityLevel,
  };
}

/**
 * Formats all verified citations into a complete reference list / bibliography according to academic standards.
 * - Filters out any unverified source (missing author, missing year, placeholder author, or retracted).
 * - Author-date styles (APA, MLA, Chicago, Harvard) are sorted alphabetically by primary author's surname.
 * - Numbered styles (IEEE, Vancouver) maintain citation appearance order.
 */
export function formatAskScholarBibliography(
  citations: WebsiteCitationItem[],
  styleId: string
): FormattedBibliographyEntry[] {
  if (!citations || citations.length === 0) return [];

  const style = normalizeCSLStyle(styleId);
  const styleInfo = getCitationStyleInfo(style);

  // Convert and filter only verified CSL items
  const validPairs: Array<{ item: WebsiteCitationItem; csl: CSLItem; origIdx: number }> = [];
  citations.forEach((c, idx) => {
    const csl = citationItemToCSL(c, idx);
    if (csl) {
      validPairs.push({ item: c, csl, origIdx: idx });
    }
  });

  if (validPairs.length === 0) return [];

  if (!styleInfo.isNumbered) {
    validPairs.sort((a, b) => {
      const surA = (a.csl.author[0]?.family || a.csl.author[0]?.literal || "").toLowerCase();
      const surB = (b.csl.author[0]?.family || b.csl.author[0]?.literal || "").toLowerCase();
      const cmp = surA.localeCompare(surB);
      if (cmp !== 0) return cmp;
      const yrA = a.csl.issued["date-parts"][0][0];
      const yrB = b.csl.issued["date-parts"][0][0];
      if (yrA !== yrB) return yrA - yrB;
      return a.csl.title.toLowerCase().localeCompare(b.csl.title.toLowerCase());
    });
  }

  return validPairs.map((pair, displayIdx) => {
    const formatted = formatCSLBibliographyEntry(pair.csl, style, displayIdx + 1);
    const yearStr = String(pair.csl.issued["date-parts"][0][0]);
    const doi = pair.csl.DOI;
    const directUrl = doi
      ? doi.startsWith("http")
        ? doi
        : `https://doi.org/${doi}`
      : pair.csl.URL;

    let marker: string | undefined = undefined;
    if (style === "ieee" || style === "chicago-notes") {
      marker = `[${displayIdx + 1}]`;
    } else if (style === "vancouver") {
      marker = `(${displayIdx + 1})`;
    }

    return {
      originalIndex: pair.origIdx + 1,
      displayIndex: displayIdx + 1,
      formattedText: formatted.plainText,
      markdownText: formatted.markdownText,
      htmlText: formatted.htmlText,
      rawCitation: { ...pair.item, csl: pair.csl },
      csl: pair.csl,
      marker,
      doi: doi ? (doi.startsWith("http") ? doi : `https://doi.org/${doi}`) : undefined,
      url: directUrl,
      openAccessUrl: pair.csl.openAccessUrl || pair.item.openAccessUrl,
      year: yearStr,
      publisher: pair.csl["container-title"] || pair.csl.publisher || pair.item.publisher || pair.item.venue,
      authorityBadge: pair.csl.sourceTypeLabel || pair.item.authorityBadge || "peer-reviewed article",
      sourceTypeLabel: pair.csl.sourceTypeLabel,
      credibilityLevel: pair.csl.credibilityLevel,
    };
  });
}

/**
 * Strips any raw markdown `## References` section generated by the LLM
 * so the Citation Engine can render an interactive, authentic reference list.
 */
export function stripRawReferencesSection(markdown: string): string {
  if (!markdown) return "";
  const refHeaderRegex =
    /(?:\n\s*---\s*\n)?\n\s*(?:##|###)\s*(?:References|References\s*&\s*Evidence\s*Base|Sources|Works\s*Cited|Bibliography)[\s\S]*$/i;
  return markdown.replace(refHeaderRegex, "").trim();
}

/**
 * Deterministically replaces bracket reference tokens ([1], [2], [1, 2])
 * with authoritative in-text citations according to the selected citation style (APA, Harvard, IEEE, MLA, Chicago, Vancouver).
 * Strictly strips any raw hallucinated bibliography section.
 */
export function replaceBracketTokensWithDeterministicCitations(
  prose: string,
  sources: WebsiteCitationItem[],
  styleId: string
): string {
  if (!prose) return "";
  const cleaned = stripRawReferencesSection(prose);
  if (!sources || sources.length === 0) return tidyRemovedCitations(cleaned.replace(/\[([^\[\]\(\)\r\n]+)\](?!\()/g, (m, inner: string) => (isCitationToken(inner) ? "" : m)));

  const style = normalizeCSLStyle(styleId);

  // Match bracket tokens not followed by '(' (which would indicate a Markdown link [text](url))
  const bracketRegex = /\[([^\[\]\(\)\r\n]+)\](?!\()/g;
  const replaced = cleaned.replace(bracketRegex, (match, innerStr) => {
    const trimmed = innerStr.trim();

    // 1. Numeric index tokens: [1], [2], [1, 2]
    if (/^\d+(?:\s*,\s*\d+)*$/.test(trimmed)) {
      const indices = trimmed
        .split(",")
        .map((s: string) => parseInt(s.trim(), 10))
        .filter((n: number) => !isNaN(n));

      const validNums = indices.filter((n: number) => {
        if (n < 1 || n > sources.length) return false;
        return citationItemToCSL(sources[n - 1], n - 1) !== null;
      });
      if (validNums.length === 0) return "";

      if (style === "ieee" || style === "chicago-notes") {
        return `[${validNums.join(", ")}]`;
      }
      if (style === "vancouver") {
        return `(${validNums.join(", ")})`;
      }

      const formattedCites = validNums
        .map((n: number) => {
          const cite = formatAskScholarInText(sources[n - 1], n - 1, style);
          return cite.replace(/^\s*\(\s*(.+?)\s*\)\s*$/, "$1").trim();
        })
        .filter(Boolean);

      if (formattedCites.length === 0) return "";
      return `(${formattedCites.join("; ")})`;
    }

    // 2. Identifier tokens: [ev-uuid], [src-1], [ev-1], matching source.id
    const matchedIdx = sources.findIndex((s, idx) => {
      if (s.id && (s.id === trimmed || s.id.toLowerCase() === trimmed.toLowerCase())) {
        return true;
      }
      const lower = trimmed.toLowerCase();
      if (lower === `ev-${idx + 1}` || lower === `src-${idx + 1}`) {
        return true;
      }
      return false;
    });

    if (matchedIdx !== -1) {
      const csl = citationItemToCSL(sources[matchedIdx], matchedIdx);
      if (!csl) return "";
      if (style === "ieee" || style === "chicago-notes") {
        return `[${matchedIdx + 1}]`;
      }
      if (style === "vancouver") {
        return `(${matchedIdx + 1})`;
      }
      const cite = formatAskScholarInText(sources[matchedIdx], matchedIdx, style);
      const trimmedCite = cite.replace(/^\s*\(\s*(.+?)\s*\)\s*$/, "$1").trim();
      return trimmedCite ? `(${trimmedCite})` : "";
    }

    // An unmatched citation token is removed; other brackets ([sic]) stay.
    return isCitationToken(trimmed) ? "" : match;
  });
  const tidied = tidyRemovedCitations(replaced);
  return style === "ieee" || style === "chicago-notes" || style === "vancouver" ? tidied : mergeAdjacentParentheticalCitations(tidied);
}

/** A bracket body that is a citation token: [3], [1, 2], [ev-…], [src-2], a UUID. */
function isCitationToken(inner: string): boolean {
  const t = inner.trim();
  return (
    /^\d+(?:\s*,\s*\d+)*$/.test(t) ||
    /^(?:ev|src|source|ref|cite|evidence|vault)[-_][\w-]+$/i.test(t) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)
  );
}

/** Close the gap a removed token leaves ("claim ." -> "claim."), never touching newlines. */
function tidyRemovedCitations(text: string): string {
  return text.replace(/[ \t]+([.,;:!?])/g, "$1").replace(/[ \t]{2,}/g, " ");
}

/**
 * "(Arute et al., 2019) (Kjaergaard et al., 2020)" or "(A, 2019), (B, 2020)" ->
 * "(Arute et al., 2019; Kjaergaard et al., 2020)", the author-date way.
 */
export function mergeAdjacentParentheticalCitations(text: string): string {
  const cite = /\(([^()]*?\b(?:1[5-9]|20)\d{2}[a-z]?(?:,\s*(?:p|pp)\.\s*[\d–-]+)?)\)/;
  const pair = new RegExp(`${cite.source}[ \t]*[,;]?[ \t]*${cite.source}`, "g");
  let prev = "";
  let out = text;
  while (prev !== out) {
    prev = out;
    out = out.replace(pair, (_m, a: string, b: string) => `(${a}; ${b})`);
  }
  return out;
}

/**
 * Compiles a formatted markdown bibliography section for the given citations.
 */
export function compileDeterministicBibliographyMarkdown(
  sources: WebsiteCitationItem[],
  styleId: string
): string {
  if (!sources || sources.length === 0) return "";
  const entries = formatAskScholarBibliography(sources, styleId);
  if (entries.length === 0) return "";

  const heading = getReferenceListHeading(styleId);
  const style = normalizeCSLStyle(styleId);

  let markdown = `\n\n## ${heading}\n\n`;
  entries.forEach((e) => {
    const text = e.markdownText || e.formattedText;
    if (style === "ieee" || style === "vancouver") {
      markdown += `${text}\n`;
    } else {
      markdown += `${text}\n\n`;
    }
  });
  return markdown.trimEnd();
}
