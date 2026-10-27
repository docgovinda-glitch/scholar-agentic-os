/**
 * Citation Lock Scrubber, Claim-Evidence NLI Entailment & Chronological Checker
 *
 * Implements strict [CITE:sourceId] anti-hallucination protocols:
 * 1. Exclusive Citation Ledger formatting for prompt injection.
 * 2. Post-generation conversion of [CITE:sourceId] tokens into verified APA 7 citations.
 * 3. Stripping of hallucinated (Author, Year) parenthetical strings not backed by Vault sources.
 * 4. Chronological anachronism detection (flagging papers published before referenced events).
 * 5. Claim-Evidence NLI Entailment verification (`verifyClaimEntailment`).
 */

import { APA7Formatter } from "../../../src/citation_compliance/formatters/apa7.ts";
import type { ReferenceAuthor } from "../../../src/citation_compliance/model/reference.ts";

export interface VaultSource {
  id: string;
  title: string;
  authors?: string[];
  author?: string;
  year?: number | string;
  abstract?: string;
  findings?: string[];
  excerpt?: string;
  doi?: string;
  url?: string;
  journal?: string;
  stance?: "Supporting" | "Contrasting" | "Methodological";
  keyFindings?: string;
  summary?: string;
}

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
  abstract?: string;
  findings?: string[];
  excerpt?: string;
  author?: string;
  summary?: string;
}

export interface CitationScrubberOptions {
  vaultSources?: VaultSource[];
  unverifiedReplacement?: string;
  checkEntailment?: boolean;
  entailmentThreshold?: number;
  bindToCanonicalTokens?: boolean;
}

export interface ScrubberOptions {
  dialect?: "en-GB" | "en-US";
  style?: "apa-7";
  unverifiedPlaceholder?: string;
}

export interface EntailmentResult {
  score: number;
  supported: boolean;
  contradiction: boolean;
  warning?: string;
  overlappingTokens: string[];
}

export interface DetailedScrubResult {
  scrubbedText: string;
  verifiedCount: number;
  unverifiedCount: number;
  warnings: string[];
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

export const UNVERIFIED_CITATION_TOKEN = "[Unverified Claim — Link Vault Source]";
export const ENTAILMENT_WARNING_TOKEN = "[Citation Entailment Warning: Verify claim against source findings]";
const DEFAULT_UNVERIFIED_PLACEHOLDER = "[Unverified Claim — Link Vault Source]";

const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but",
  "by", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from",
  "further", "had", "has", "have", "having", "he", "her", "here", "hers", "herself", "him",
  "himself", "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just",
  "me", "more", "most", "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only",
  "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "she",
  "should", "so", "some", "such", "than", "that", "the", "their", "theirs", "them", "themselves",
  "then", "there", "these", "they", "this", "those", "through", "to", "too", "under", "until",
  "up", "very", "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom",
  "why", "with", "would", "you", "your", "yours", "yourself", "yourselves"
]);

const NEGATION_WORDS = new Set([
  "not", "never", "no", "neither", "nor", "fails", "failed", "failing", "failure",
  "cannot", "can't", "contradicts", "contradicted", "disproved", "disproves",
  "ineffective", "refutes", "refuted", "absent", "without", "decreased", "decreases",
  "worse", "inferior", "null", "flawed"
]);

const POSITIVE_WORDS = new Set([
  "increases", "increased", "enhances", "enhanced", "effective", "effectively",
  "proves", "proven", "proved", "superior", "confirms", "confirmed", "validates",
  "validated", "improves", "improved", "significant", "significantly", "outperforms",
  "outperformed", "state-of-the-art", "sota", "breakthrough", "success", "successful"
]);

/**
 * Extracts content tokens from a text string, stripping punctuation and stop words.
 */
export function extractContentTokens(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Extracts author surname candidates from an author string or citation segment.
 */
function extractAuthorSurnames(authorStr: string): string[] {
  if (!authorStr) return [];
  const cleaned = authorStr
    .replace(/\bet\s+al\.?\b/gi, "")
    .replace(/[()]/g, "")
    .replace(/&/g, ",");

  return cleaned
    .split(/[,;]/)
    .map((part) => {
      const tokens = part.trim().split(/\s+/).filter(Boolean);
      return tokens[0] ?? "";
    })
    .filter((name) => name.length >= 2)
    .map((name) => name.toLowerCase());
}

/**
 * Matches an author-date pair against the Vault source ledger.
 */
export function matchVaultSourceByAuthorDate(
  authorSnippet: string,
  yearStr: string,
  sources: VaultSource[]
): VaultSource | undefined {
  if (!sources || sources.length === 0) return undefined;

  const targetSurnames = extractAuthorSurnames(authorSnippet);
  const targetYear = yearStr.trim().slice(0, 4);

  for (const source of sources) {
    const sourceYear = source.year ? String(source.year).slice(0, 4) : "";
    if (sourceYear && sourceYear !== targetYear) {
      continue;
    }

    const sourceAuthors: string[] = [];
    if (source.authors && Array.isArray(source.authors)) {
      for (const a of source.authors) {
        sourceAuthors.push(...extractAuthorSurnames(a));
      }
    }
    if (source.author) {
      sourceAuthors.push(...extractAuthorSurnames(source.author));
    }

    const matchesAuthor = targetSurnames.some((targetName) =>
      sourceAuthors.some((sourceName) => sourceName.includes(targetName) || targetName.includes(sourceName))
    );

    if (matchesAuthor) {
      return source;
    }
  }

  return undefined;
}

/**
 * Verifies claim entailment against the source evidence text.
 * Calculates lexical overlap and checks for negation/contradiction polarity.
 */
export function verifyClaimEntailment(
  claimSentence: string,
  source: VaultSource,
  threshold: number = 0.12
): EntailmentResult {
  const claimTokens = extractContentTokens(claimSentence);
  if (claimTokens.length === 0) {
    return {
      score: 1.0,
      supported: true,
      contradiction: false,
      overlappingTokens: [],
    };
  }

  const sourceEvidenceText = [
    source.title || "",
    source.abstract || "",
    source.excerpt || "",
    Array.isArray(source.findings) ? source.findings.join(" ") : "",
  ].join(" ");

  const sourceTokens = new Set(extractContentTokens(sourceEvidenceText));
  const overlappingTokens = claimTokens.filter((token) => sourceTokens.has(token));
  const score = overlappingTokens.length / claimTokens.length;

  const claimWords = claimSentence.toLowerCase().split(/\s+/);
  const sourceWords = sourceEvidenceText.toLowerCase().split(/\s+/);

  const claimHasNegation = claimWords.some((w) => NEGATION_WORDS.has(w));
  const claimHasPositive = claimWords.some((w) => POSITIVE_WORDS.has(w));

  const sourceHasNegation = sourceWords.some((w) => NEGATION_WORDS.has(w));
  const sourceHasPositive = sourceWords.some((w) => POSITIVE_WORDS.has(w));

  const contradiction =
    (claimHasNegation && !claimHasPositive && sourceHasPositive && !sourceHasNegation && overlappingTokens.length > 0) ||
    (claimHasPositive && !claimHasNegation && sourceHasNegation && !sourceHasPositive && overlappingTokens.length > 0);

  const supported = score >= threshold && !contradiction;

  return {
    score: Math.round(score * 100) / 100,
    supported,
    contradiction,
    warning: !supported ? ENTAILMENT_WARNING_TOKEN : undefined,
    overlappingTokens,
  };
}

/**
 * Finds the whole sentence containing a given index in a text.
 */
function getSurroundingSentence(text: string, index: number): string {
  const start = Math.max(0, text.lastIndexOf(".", index));
  let end = text.indexOf(".", index);
  if (end === -1) end = text.length;
  return text.slice(start === 0 ? 0 : start + 1, end + 1).trim();
}

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
  const yearMatches = sentence.match(/\b([12]\d{3})\b/g);
  if (!yearMatches || yearMatches.length === 0) return warnings;

  for (const src of citedSources) {
    const pubYear = parseInt(String(src.year).slice(0, 4), 10);
    if (isNaN(pubYear)) continue;

    for (const matchStr of yearMatches) {
      const candidateYear = parseInt(matchStr, 10);
      if (isNaN(candidateYear)) continue;

      if (candidateYear === pubYear) continue;

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
 * Scans generated text with ledger to:
 * 1. Convert valid [CITE:source_id] tokens into formatted APA 7 citations.
 * 2. Strip any hallucinated raw (Author, Year) strings not backed by Vault sources.
 * 3. Detect chronological anachronisms where eventYear > pubYear.
 */
function scrubCitationsWithLedger(
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

    unverifiedClaimsCount += 1;
    strippedCitations.push(fullMatch);
    return placeholder;
  });

  // Pass 2: Detect and strip hallucinated raw (Author, Year) or (Author et al., Year) parentheticals
  const rawCitationRegex = /\(([A-Z][a-zA-Z\u00C0-\u024F\s&.,'-]+?),\s*([12]\d{3}[a-z]?)\)/g;

  let scrubbedText = textWithResolvedTokens.replace(rawCitationRegex, (fullMatch, authorPart: string, yearPart: string) => {
    const cleanAuthor = authorPart.trim();
    const cleanYear = yearPart.trim();

    if (/^(?:e\.g\.|i\.e\.|see|table|figure|eq\.|equation|section|chapter|appendix|note|n\s*=)\b/i.test(cleanAuthor)) {
      return fullMatch;
    }

    const matchedSource = findMatchingVerifiedSource(cleanAuthor, cleanYear, sourceList);
    if (matchedSource) {
      resolvedCitationsCount += 1;
      citedSourcesSet.add(matchedSource);
      return fullMatch;
    }

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

/**
 * Detailed citation scrubber returning modified text and ledger statistics.
 */
export function scrubCitationsDetailed(
  text: string,
  options: CitationScrubberOptions = {}
): DetailedScrubResult {
  if (!text || typeof text !== "string") {
    return {
      scrubbedText: "",
      verifiedCount: 0,
      unverifiedCount: 0,
      warnings: [],
    };
  }

  const sources = options.vaultSources ?? [];
  const unverifiedReplacement = options.unverifiedReplacement ?? UNVERIFIED_CITATION_TOKEN;
  const checkEntailment = options.checkEntailment ?? false;
  const entailmentThreshold = options.entailmentThreshold ?? 0.12;

  let verifiedCount = 0;
  let unverifiedCount = 0;
  const warnings: string[] = [];

  let result = text;

  // 1. Check explicit tokens: [CITE:src_id]
  result = result.replace(/\[CITE:([A-Za-z0-9_-]+)\]/g, (match, srcId: string) => {
    const found = sources.find(
      (s) => s.id === srcId || s.id.toLowerCase() === srcId.toLowerCase()
    );
    if (found) {
      verifiedCount++;
      return match;
    }
    unverifiedCount++;
    return unverifiedReplacement;
  });

  // 2. Check numeric brackets: [1] or [1, 2]
  result = result.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (match, numsStr: string) => {
    const indices = numsStr.split(",").map((n) => parseInt(n.trim(), 10));
    const allValid = indices.every((idx) => idx >= 1 && idx <= sources.length);

    if (sources.length > 0 && allValid) {
      verifiedCount++;
      return match;
    }
    if (sources.length > 0) {
      unverifiedCount++;
      return unverifiedReplacement;
    }
    return match;
  });

  // 3. Check natural Author-Date parentheticals: (Author et al., 2020) or (Smith & Doe, 2019)
  const authorDateRegex = /\(([A-Z][A-Za-z\s&,.-]+?),\s*((?:19|20)\d{2}[a-z]?)\)/g;
  result = result.replace(authorDateRegex, (match, authorPart: string, yearPart: string, offset: number) => {
    const matchedSource = matchVaultSourceByAuthorDate(authorPart, yearPart, sources);

    if (matchedSource) {
      verifiedCount++;
      if (checkEntailment) {
        const sentence = getSurroundingSentence(result, offset);
        const entailment = verifyClaimEntailment(sentence, matchedSource, entailmentThreshold);
        if (!entailment.supported) {
          const warning = ENTAILMENT_WARNING_TOKEN;
          warnings.push(`Claim "${sentence.slice(0, 60)}..." failed entailment against ${matchedSource.id}`);
          return `${match} ${warning}`;
        }
      }
      return match;
    }

    if (sources.length > 0) {
      unverifiedCount++;
      return unverifiedReplacement;
    }

    return match;
  });

  // 4. Check narrative Author-Date citations: According to Thorne (2021) or Thorne (2021)
  const narrativeAuthorDateRegex = /\b([A-Z][a-zA-Z]+(?:\s+et\s+al\.)?)\s+\(((?:19|20)\d{2}[a-z]?)\)/g;
  result = result.replace(narrativeAuthorDateRegex, (match, authorPart: string, yearPart: string, offset: number) => {
    const matchedSource = matchVaultSourceByAuthorDate(authorPart, yearPart, sources);

    if (matchedSource) {
      verifiedCount++;
      if (checkEntailment) {
        const sentence = getSurroundingSentence(result, offset);
        const entailment = verifyClaimEntailment(sentence, matchedSource, entailmentThreshold);
        if (!entailment.supported) {
          warnings.push(`Claim "${sentence.slice(0, 60)}..." failed entailment against ${matchedSource.id}`);
          return `${match} ${ENTAILMENT_WARNING_TOKEN}`;
        }
      }
      return match;
    }

    if (sources.length > 0) {
      unverifiedCount++;
      return `${authorPart} ${unverifiedReplacement}`;
    }

    return match;
  });

  return {
    scrubbedText: result,
    verifiedCount,
    unverifiedCount,
    warnings,
  };
}

/**
 * Scrubs citations across explicit tokens, numeric brackets, and natural author-date patterns.
 * Supports both options-based interface (returns string) and ledger-based interface (returns ScrubResult).
 */
export function scrubCitations(
  text: string,
  options?: CitationScrubberOptions
): string;
export function scrubCitations(
  text: string,
  ledger: VerifiedSourceItem[] | Map<string, VerifiedSourceItem>,
  options?: ScrubberOptions
): ScrubResult;
export function scrubCitations(
  text: string,
  arg2?: CitationScrubberOptions | VerifiedSourceItem[] | Map<string, VerifiedSourceItem>,
  arg3?: ScrubberOptions
): string | ScrubResult {
  if (Array.isArray(arg2) || arg2 instanceof Map) {
    return scrubCitationsWithLedger(text, arg2, arg3);
  }
  const detailed = scrubCitationsDetailed(text, arg2 as CitationScrubberOptions | undefined);
  return detailed.scrubbedText;
}
