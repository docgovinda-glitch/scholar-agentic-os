/**
 * Citation Lock Scrubber & Chronological Checker
 *
 * Implements strict [CITE:sourceId] anti-hallucination protocols:
 * 1. Exclusive Citation Ledger formatting for prompt injection.
 * 2. Post-generation conversion of [CITE:sourceId] tokens into verified APA 7 citations.
 * 3. Stripping of hallucinated (Author, Year) parenthetical strings not backed by Vault sources.
 * 4. Chronological anachronism detection (flagging papers published before referenced events).
 */

import { APA7Formatter } from "../../../src/citation_compliance/formatters/apa7.ts";
import type { ReferenceAuthor } from "../../../src/citation_compliance/model/reference.ts";

export interface VerifiedSourceItem {
  id: string;
  authors: string[] | string;
  year: number | string;
  title: string;
  doi?: string;
  url?: string;
  journal?: string;
  stance?: "Supporting" | "Contrasting" | "Methodological";
  keyFindings?: string;
}

export interface ChronologicalWarning {
  sentence: string;
  eventYear: number;
  pubYear: number;
  sourceId: string;
  warning: string;
}

export interface ScrubResult {
  scrubbedText: string;
  resolvedCitationsCount: number;
  unverifiedClaimsCount: number;
  strippedCitations: string[];
  chronologicalWarnings: ChronologicalWarning[];
  citedSources: VerifiedSourceItem[];
}

export interface ScrubberOptions {
  dialect?: "en-GB" | "en-US";
  style?: "apa-7";
  unverifiedPlaceholder?: string;
}

const DEFAULT_UNVERIFIED_PLACEHOLDER = "[Unverified Claim — Link Vault Source]";

/**
 * Parses author strings into ReferenceAuthor objects with only lastName
 * so in-text citations produce clean "(Author, Year)" without initials.
 */
function parseLastNameOnlyAuthors(authors: string[] | string): ReferenceAuthor[] {
  const authorList: string[] = Array.isArray(authors)
    ? authors
    : authors.split(/\s*(?:and|&|;)\s*/);

  return authorList
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name, idx) => {
      const clean = name.replace(/\bet\sal\.?/gi, "").trim();
      if (clean.includes(",")) {
        const [last] = clean.split(",");
        return {
          lastName: last.trim(),
          firstName: "",
          order: idx + 1,
        };
      }
      const parts = clean.split(/\s+/).filter(Boolean);
      return {
        lastName: parts[parts.length - 1] || clean,
        firstName: "",
        order: idx + 1,
      };
    });
}


/**
 * Formats a list of verified sources into an authoritative prompt injection ledger
 * with strict instructions forbidding unverified parametric citations.
 */
export function formatCitationLedger(sources: VerifiedSourceItem[]): {
  ledgerPrompt: string;
  sourceMap: Map<string, VerifiedSourceItem>;
} {
  const sourceMap = new Map<string, VerifiedSourceItem>();

  const lines: string[] = [
    "[EXCLUSIVE CITATION LEDGER — ZERO TOLERANCE FOR UNVERIFIED CITATIONS]",
    "You may ONLY cite evidence using entries explicitly registered in this ledger.",
    "MANDATORY CITATION RULES:",
    "1. Every factual assertion, data point, or empirical finding MUST cite its source using: [CITE:source_id] (e.g. [CITE:src_1]).",
    "2. You are STRICTLY FORBIDDEN from inventing, guessing, or writing raw parenthetical citations like '(Smith, 2021)' from memory.",
    "3. Any claim that lacks a backing source in this ledger must be stated without fabricated citations or marked as needing verification.",
    "",
    "REGISTERED SOURCES:",
  ];

  if (!sources || sources.length === 0) {
    lines.push("(No external sources currently assigned. Do NOT fabricate citations.)");
  } else {
    sources.forEach((src, idx) => {
      const key = src.id || `src_${idx + 1}`;
      sourceMap.set(key, src);
      // Also register sanitized variants for tolerant lookup
      sourceMap.set(key.toLowerCase(), src);
      sourceMap.set(`src_${idx + 1}`, src);
      sourceMap.set(`src-${idx + 1}`, src);

      const authorsStr = Array.isArray(src.authors) ? src.authors.join(", ") : src.authors;
      const stanceStr = src.stance ? ` | Stance: ${src.stance}` : "";
      const findingsStr = src.keyFindings ? ` | Key Findings: ${src.keyFindings}` : "";
      const doiStr = src.doi ? ` | DOI: ${src.doi}` : "";

      lines.push(
        `- [CITE:${key}]: ${authorsStr} (${src.year}). "${src.title}"${doiStr}${stanceStr}${findingsStr}`
      );
    });
  }

  return {
    ledgerPrompt: lines.join("\n"),
    sourceMap,
  };
}

/**
 * Checks whether an author and publication year match any verified source in the ledger.
 */
function findMatchingVerifiedSource(
  authorStr: string,
  yearStr: string,
  sources: VerifiedSourceItem[]
): VerifiedSourceItem | undefined {
  const normAuthor = authorStr.toLowerCase().replace(/\bet\sal\.?/g, "").trim();
  const normYear = yearStr.slice(0, 4);

  return sources.find((src) => {
    const srcYear = String(src.year).slice(0, 4);
    if (srcYear !== normYear) return false;

    const srcAuthors = Array.isArray(src.authors) ? src.authors : [src.authors];
    return srcAuthors.some((a) => {
      const parts = a.toLowerCase().replace(/,/g, " ").split(/\s+/).filter(Boolean);
      return parts.some((p) => p.length >= 3 && normAuthor.includes(p));
    });
  });
}

/**
 * Checks for chronological anachronisms in a sentence:
 * Flags if a referenced event/empirical year Y_event is later than the cited publication year Y_pub.
 */
export function checkChronologicalAnachronism(
  sentence: string,
  citedSources: VerifiedSourceItem[]
): ChronologicalWarning[] {
  if (!sentence || citedSources.length === 0) return [];

  const warnings: ChronologicalWarning[] = [];

  // Match 4-digit years in the range 1900-2099
  const yearMatches = sentence.match(/\b([12]\d{3})\b/g);
  if (!yearMatches || yearMatches.length === 0) return warnings;

  for (const src of citedSources) {
    const pubYear = parseInt(String(src.year).slice(0, 4), 10);
    if (isNaN(pubYear)) continue;

    for (const matchStr of yearMatches) {
      const candidateYear = parseInt(matchStr, 10);
      if (isNaN(candidateYear)) continue;

      // Ignore the source's own publication year
      if (candidateYear === pubYear) continue;

      // Anachronism: publication is earlier than the empirical event year mentioned in the sentence
      if (pubYear < candidateYear) {
        warnings.push({
          sentence: sentence.trim(),
          eventYear: candidateYear,
          pubYear,
          sourceId: src.id,
          warning: `Chronological Anachronism: Source "${src.title || src.id}" (${pubYear}) was published prior to referenced event year ${candidateYear}.`,
        });
      }
    }
  }

  return warnings;
}

/**
 * Scans generated text to:
 * 1. Convert valid [CITE:source_id] tokens into formatted APA 7 citations.
 * 2. Strip any hallucinated raw (Author, Year) strings not backed by Vault sources.
 * 3. Detect chronological anachronisms where eventYear > pubYear.
 */
export function scrubCitations(
  text: string,
  ledger: VerifiedSourceItem[] | Map<string, VerifiedSourceItem>,
  options: ScrubberOptions = {}
): ScrubResult {
  if (!text) {
    return {
      scrubbedText: "",
      resolvedCitationsCount: 0,
      unverifiedClaimsCount: 0,
      strippedCitations: [],
      chronologicalWarnings: [],
      citedSources: [],
    };
  }

  const placeholder = options.unverifiedPlaceholder || DEFAULT_UNVERIFIED_PLACEHOLDER;
  const formatter = new APA7Formatter();

  // Normalize ledger into Map and Array
  let sourceMap: Map<string, VerifiedSourceItem>;
  let sourceList: VerifiedSourceItem[];

  if (ledger instanceof Map) {
    sourceMap = ledger;
    sourceList = Array.from(new Set(ledger.values()));
  } else {
    sourceList = ledger;
    sourceMap = new Map();
    ledger.forEach((s, idx) => {
      sourceMap.set(s.id, s);
      sourceMap.set(s.id.toLowerCase(), s);
      sourceMap.set(`src_${idx + 1}`, s);
      sourceMap.set(`src-${idx + 1}`, s);
    });
  }

  let resolvedCitationsCount = 0;
  let unverifiedClaimsCount = 0;
  const strippedCitations: string[] = [];
  const citedSourcesSet = new Set<VerifiedSourceItem>();
  const chronologicalWarnings: ChronologicalWarning[] = [];

  // Pass 1: Replace [CITE:source_id] tokens with protected markers
  const resolvedTokens: string[] = [];
  const tokenRegex = /\[CITE:([^\]]+)\]/g;
  let textWithResolvedTokens = text.replace(tokenRegex, (fullMatch, rawId: string) => {
    const trimmedId = rawId.trim();
    const source = sourceMap.get(trimmedId) || sourceMap.get(trimmedId.toLowerCase());

    if (source) {
      resolvedCitationsCount += 1;
      citedSourcesSet.add(source);
      const authors = parseLastNameOnlyAuthors(source.authors);
      const formatted = formatter.formatInText({
        kind: "JournalArticle",
        title: source.title,
        source: source.journal || source.title,
        authors,
        publicationDate: String(source.year),
        doi: source.doi,
        url: source.url,
      });
      resolvedTokens.push(formatted);
      return `__RESOLVED_CITE_${resolvedTokens.length - 1}__`;
    }

    // Token has an unknown source ID -> unverified claim
    unverifiedClaimsCount += 1;
    strippedCitations.push(fullMatch);
    return placeholder;
  });

  // Pass 2: Detect and strip hallucinated raw (Author, Year) or (Author et al., Year) parentheticals
  // Exclude non-citation patterns like (e.g., 2023), (see Table 1), (Figure 2), (p. 23)
  const rawCitationRegex = /\(([A-Z][a-zA-Z\u00C0-\u024F\s&.,'-]+?),\s*([12]\d{3}[a-z]?)\)/g;

  let scrubbedText = textWithResolvedTokens.replace(rawCitationRegex, (fullMatch, authorPart: string, yearPart: string) => {
    const cleanAuthor = authorPart.trim();
    const cleanYear = yearPart.trim();

    // Skip known non-citation markers
    if (/^(?:e\.g\.|i\.e\.|see|table|figure|eq\.|equation|section|chapter|appendix|note|n\s*=)\b/i.test(cleanAuthor)) {
      return fullMatch;
    }

    const matchedSource = findMatchingVerifiedSource(cleanAuthor, cleanYear, sourceList);
    if (matchedSource) {
      resolvedCitationsCount += 1;
      citedSourcesSet.add(matchedSource);
      return fullMatch;
    }

    // Hallucinated raw citation not found in ledger
    unverifiedClaimsCount += 1;
    strippedCitations.push(`${cleanAuthor}, ${cleanYear}`);
    return placeholder;
  });

  // Restore resolved citation tokens from Pass 1
  scrubbedText = scrubbedText.replace(/__RESOLVED_CITE_(\d+)__/g, (_, idxStr) => {
    const idx = parseInt(idxStr, 10);
    return resolvedTokens[idx] || "";
  });


  // Pass 3: Chronological Anachronism Check across sentences
  const sentences = scrubbedText
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const allCitedSources = Array.from(citedSourcesSet);

  for (const sentence of sentences) {
    // Find sources cited within this sentence
    const sourcesInSentence = allCitedSources.filter((src) => {
      const yearStr = String(src.year).slice(0, 4);
      if (!sentence.includes(yearStr)) return false;

      const srcAuthors = Array.isArray(src.authors) ? src.authors : [src.authors];
      return srcAuthors.some((a) => {
        const parts = a.toLowerCase().replace(/,/g, " ").split(/\s+/).filter(Boolean);
        const lastName = parts[parts.length - 1];
        return lastName && lastName.length >= 3 && sentence.toLowerCase().includes(lastName);
      });
    });

    if (sourcesInSentence.length > 0) {
      const warnings = checkChronologicalAnachronism(sentence, sourcesInSentence);
      chronologicalWarnings.push(...warnings);
    }
  }

  return {
    scrubbedText,
    resolvedCitationsCount,
    unverifiedClaimsCount,
    strippedCitations,
    chronologicalWarnings,
    citedSources: allCitedSources,
  };
}
