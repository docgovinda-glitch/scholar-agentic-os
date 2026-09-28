/**
 * Scholar Citation Engine & Referencing Subsystem
 *
 * Implements authoritative citation generation, anti-fabrication verification,
 * and dynamic multi-style formatting (APA, MLA, Chicago, Harvard, IEEE, Vancouver)
 * for Ask Scholar responses.
 */

import { CitationFormatterFactory, CitationStyleRegistry } from "../citation_compliance/formattingEngine";
import type { CanonicalReference, ReferenceAuthor, ReferenceKind } from "../citation_compliance/model/reference";
import type { WebsiteCitationItem } from "./ProjectListScreen";

export type AskCitationStyleId = "apa" | "mla" | "chicago" | "harvard" | "ieee" | "vancouver";

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
    exampleBib: "Vaswani, A., et al. (2017). Attention is all you need. arXiv. https://doi.org/10.48550/arXiv.1706.03762",
  },
  {
    id: "mla",
    name: "MLA 9th Edition",
    shortLabel: "MLA 9th",
    isNumbered: false,
    description: "Author format: (Author). Works Cited list with containers.",
    exampleInText: "(Vaswani)",
    exampleBib: 'Vaswani, Ashish, et al. "Attention Is All You Need." arXiv, 2017.',
  },
  {
    id: "chicago",
    name: "Chicago 17th (Author-Date)",
    shortLabel: "Chicago",
    isNumbered: false,
    description: "Author-date format: (Author Year). Alphabetical bibliography.",
    exampleInText: "(Vaswani 2017)",
    exampleBib: 'Vaswani, Ashish, et al. 2017. "Attention Is All You Need." arXiv.',
  },
  {
    id: "harvard",
    name: "Harvard Referencing",
    shortLabel: "Harvard",
    isNumbered: false,
    description: "Author-date format: (Author, Year). Harvard reference list.",
    exampleInText: "(Vaswani, 2017)",
    exampleBib: "Vaswani, A. (2017) 'Attention is all you need', arXiv.",
  },
  {
    id: "ieee",
    name: "IEEE",
    shortLabel: "IEEE",
    isNumbered: true,
    description: "Numbered bracket format: [1]. Citation-ordered references list.",
    exampleInText: "[1]",
    exampleBib: '[1] A. Vaswani et al., "Attention is all you need," arXiv, 2017.',
  },
  {
    id: "vancouver",
    name: "Vancouver",
    shortLabel: "Vancouver",
    isNumbered: true,
    description: "Numbered format: [1]. Uniform requirements citation order.",
    exampleInText: "[1]",
    exampleBib: "1. Vaswani A, et al. Attention is all you need. arXiv; 2017.",
  },
];

export function getCitationStyleInfo(styleId: string): AskCitationStyleInfo {
  const norm = (styleId || "apa").toLowerCase().replace(/[^a-z]/g, "");
  const found = ASK_SCHOLAR_CITATION_STYLES.find((s) => s.id === norm || norm.includes(s.id));
  return found || ASK_SCHOLAR_CITATION_STYLES[0];
}

/**
 * Extracts a DOI (Digital Object Identifier) from a string, URL, or identifier.
 */
export function extractDoi(str?: string): string | undefined {
  if (!str) return undefined;
  const doiRegex = /(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/i;
  const match = str.match(doiRegex);
  if (match) {
    return match[1].replace(/[.,;)]+$/, "");
  }
  return undefined;
}

/**
 * Splits a full name string into structured ReferenceAuthor parts.
 */
export function splitAuthorName(fullName: string, order = 1): ReferenceAuthor {
  const clean = fullName.trim().replace(/^by\s+/i, "");
  if (!clean) {
    return { firstName: "", lastName: "Unknown", order };
  }

  // Handle "Lastname, Firstname"
  if (clean.includes(",")) {
    const [last, first] = clean.split(",").map((s) => s.trim());
    return { firstName: first || "", lastName: last || "Unknown", order };
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
  const type = (item as any).sourceType || "";
  const domain = (item.domain || item.url || "").toLowerCase();

  if (type === "official" || domain.endsWith(".gov") || domain.includes("who.int") || domain.includes("un.org")) {
    return "GovernmentPublication";
  }
  if (type === "scholarly" || domain.includes("arxiv.org") || domain.includes("biorxiv.org")) {
    return "Preprint";
  }
  if (type === "scholarly" || extractDoi(item.url) || extractDoi((item as any).doi)) {
    return "JournalArticle";
  }
  return "Website";
}

/**
 * Converts a verified WebsiteCitationItem or SearchResultItem into a CanonicalReference.
 */
export function citationItemToCanonicalReference(
  item: WebsiteCitationItem,
  index = 0
): CanonicalReference {
  const doi = extractDoi((item as any).doi) || extractDoi(item.url);
  const kind = inferReferenceKind(item);

  // Extract authors
  let authors: ReferenceAuthor[] = [];
  const rawAuthors: any = (item as any).authors || (item as any).author;

  if (Array.isArray(rawAuthors) && rawAuthors.length > 0) {
    authors = rawAuthors.map((a, i) =>
      typeof a === "string" ? splitAuthorName(a, i + 1) : a
    );
  } else if (typeof rawAuthors === "string" && rawAuthors.trim()) {
    // Check for comma or semicolon delimited authors
    const authorList = rawAuthors.split(/[;]|\band\b/i).map((s) => s.trim()).filter(Boolean);
    authors = authorList.map((a, i) => splitAuthorName(a, i + 1));
  } else if (item.publisher) {
    // If no human author is named, institutional attribution serves as author
    authors = [{ firstName: "", lastName: item.publisher.trim(), order: 1 }];
  } else if (item.domain) {
    authors = [{ firstName: "", lastName: item.domain.replace(/^www\./, ""), order: 1 }];
  } else {
    authors = [{ firstName: "", lastName: "Scholar Reference", order: 1 }];
  }

  // Publication year extraction
  let yearStr = item.year !== undefined ? String(item.year) : undefined;
  if (!yearStr) {
    const textToScan = `${item.title || ""} ${item.snippet || ""}`;
    const yearMatch = textToScan.match(/\b(201\d|202\d)\b/);
    if (yearMatch) {
      yearStr = yearMatch[1];
    }
  }

  const cleanTitle = (item.title || "Scholarly Resource").trim();
  const venue = item.venue || (item as any).publisher || item.domain || undefined;

  return {
    kind,
    title: cleanTitle,
    authors,
    source: venue || cleanTitle,
    journal: kind === "JournalArticle" || kind === "Preprint" ? venue : undefined,
    publisher: item.publisher || undefined,
    year: yearStr,
    publicationDate: yearStr ? `${yearStr}-01-01` : undefined,
    doi: doi ? (doi.startsWith("http") ? doi : `https://doi.org/${doi}`) : undefined,
    url: item.url || undefined,
    _position: index + 1,
    _meta: { sourceRecordId: item.url || `source-${index + 1}` },
  };
}

/**
 * Formats an in-text citation marker using the Citation Engine according to the selected style.
 */
export function formatAskScholarInText(
  item: WebsiteCitationItem,
  index: number,
  styleId: string
): string {
  const ref = citationItemToCanonicalReference(item, index);
  const styleInfo = getCitationStyleInfo(styleId);

  if (styleInfo.id === "ieee") {
    return `[${index + 1}]`;
  }
  if (styleInfo.id === "vancouver") {
    return `(${index + 1})`;
  }

  try {
    const formatted = CitationFormatterFactory.formatInText(styleId, ref);
    if (formatted && formatted !== "[Citation: Unknown]") {
      return formatted.trim();
    }
  } catch {
    // fallback below
  }

  // Fallback for author-date styles if formatter returns bare string
  const primaryAuthor = ref.authors[0]?.lastName || item.publisher || item.domain || "Source";
  const year = ref.year || "n.d.";
  if (styleInfo.id === "mla") {
    return `(${primaryAuthor})`;
  }
  return `(${primaryAuthor}, ${year})`;
}

export interface FormattedBibliographyEntry {
  originalIndex: number;
  displayIndex: number;
  formattedText: string;
  rawCitation: WebsiteCitationItem;
  marker?: string;
  doi?: string;
  url?: string;
  year?: string;
  publisher?: string;
  authorityBadge?: string;
}

/**
 * Formats a single bibliography item using the Citation Engine.
 */
export function formatAskScholarBibliographyEntry(
  item: WebsiteCitationItem,
  index: number,
  styleId: string
): FormattedBibliographyEntry {
  const ref = citationItemToCanonicalReference(item, index);
  const styleInfo = getCitationStyleInfo(styleId);

  let formatted = "";
  try {
    formatted = CitationFormatterFactory.formatBibliography(styleId, ref);
  } catch {
    formatted = `${ref.title || item.title || "Scholarly Resource"}.`;
  }

  let marker: string | undefined = undefined;
  if (styleInfo.id === "ieee") {
    marker = `[${index + 1}]`;
    if (!formatted.startsWith("[")) {
      formatted = `[${index + 1}] ${formatted}`;
    }
  } else if (styleInfo.id === "vancouver") {
    marker = `(${index + 1})`;
    if (!/^\d+\./.test(formatted) && !formatted.startsWith("(")) {
      formatted = `${index + 1}. ${formatted}`;
    }
  }

  const doi = ref.doi || extractDoi(item.url);
  const directUrl = doi ? (doi.startsWith("http") ? doi : `https://doi.org/${doi}`) : item.url;

  return {
    originalIndex: index + 1,
    displayIndex: index + 1,
    formattedText: formatted.trim(),
    rawCitation: item,
    marker,
    doi: doi ? (doi.startsWith("http") ? doi : `https://doi.org/${doi}`) : undefined,
    url: directUrl,
    year: ref.year,
    publisher: item.publisher || item.venue || item.domain,
    authorityBadge: item.authorityBadge || "Verified Source",
  };
}

/**
 * Formats all citations into a complete reference list / bibliography according to academic standards.
 * Author-date styles (APA, MLA, Chicago, Harvard) are sorted alphabetically by author.
 * Numbered styles (IEEE, Vancouver) maintain citation appearance order.
 */
export function formatAskScholarBibliography(
  citations: WebsiteCitationItem[],
  styleId: string
): FormattedBibliographyEntry[] {
  if (!citations || citations.length === 0) return [];

  const styleInfo = getCitationStyleInfo(styleId);
  const entries = citations.map((c, i) => formatAskScholarBibliographyEntry(c, i, styleId));

  if (!styleInfo.isNumbered) {
    // Sort alphabetically by primary author's last name (or title if no author)
    entries.sort((a, b) => {
      const getSortKey = (entry: FormattedBibliographyEntry) => {
        const auth = entry.rawCitation.authors?.[0] || entry.rawCitation.author;
        if (auth) {
          const parts = auth.trim().split(/\s+/);
          return parts[parts.length - 1].toLowerCase();
        }
        return (entry.rawCitation.title || entry.formattedText).toLowerCase();
      };
      return getSortKey(a).localeCompare(getSortKey(b));
    });

    // Re-index display positions
    return entries.map((e, i) => ({ ...e, displayIndex: i + 1 }));
  }

  return entries;
}

/**
 * Strips any raw markdown `## References` section generated by the LLM
 * so the Citation Engine can render an interactive, authentic reference list.
 */
export function stripRawReferencesSection(markdown: string): string {
  if (!markdown) return "";
  const refHeaderRegex = /(?:\n\s*---\s*\n)?\n\s*(?:##|###)\s*(?:References|References\s*&\s*Evidence\s*Base|Sources|Works\s*Cited|Bibliography)[\s\S]*$/i;
  return markdown.replace(refHeaderRegex, "").trim();
}
