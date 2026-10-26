/**
 * Citation Lock Scrubber & Claim-Evidence NLI Entailment
 *
 * Enforces zero-hallucination citation grounding by verifying:
 * 1. Explicit tokens: `[CITE:src_id]`
 * 2. Numeric brackets: `[1]`, `[2, 3]`
 * 3. Natural Author-Date citations: `(Vaswani et al., 2017)`, `(Smith & Doe, 2022)`, `According to Thorne (2021)`
 *
 * Verifies citations against the project's Vault Evidence Ledger.
 * - Hallucinated citations are stripped and replaced with `[Unverified Claim — Link Vault Source]`.
 * - Validated citations undergo Claim-Evidence Entailment Check (`verifyClaimEntailment`),
 *   flagging unsupported or contradictory assertions with `[Citation Entailment Warning: Verify claim against source findings]`.
 */

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
}

export interface CitationScrubberOptions {
  vaultSources?: VaultSource[];
  unverifiedReplacement?: string;
  checkEntailment?: boolean;
  entailmentThreshold?: number;
  bindToCanonicalTokens?: boolean;
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

export const UNVERIFIED_CITATION_TOKEN = "[Unverified Claim — Link Vault Source]";
export const ENTAILMENT_WARNING_TOKEN = "[Citation Entailment Warning: Verify claim against source findings]";

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
      // Surname is usually the last word (John Smith) or the first word before comma (Smith, John)
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
    // Check year
    const sourceYear = source.year ? String(source.year).slice(0, 4) : "";
    if (sourceYear && sourceYear !== targetYear) {
      continue;
    }

    // Check author surnames
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

  // Aggregate source evidence text
  const sourceEvidenceText = [
    source.title || "",
    source.abstract || "",
    source.excerpt || "",
    Array.isArray(source.findings) ? source.findings.join(" ") : "",
  ].join(" ");

  const sourceTokens = new Set(extractContentTokens(sourceEvidenceText));

  // Compute lexical overlap
  const overlappingTokens = claimTokens.filter((token) => sourceTokens.has(token));
  const score = overlappingTokens.length / claimTokens.length;

  // Check negation/contradiction polarity
  const claimWords = claimSentence.toLowerCase().split(/\s+/);
  const sourceWords = sourceEvidenceText.toLowerCase().split(/\s+/);

  const claimHasNegation = claimWords.some((w) => NEGATION_WORDS.has(w));
  const claimHasPositive = claimWords.some((w) => POSITIVE_WORDS.has(w));

  const sourceHasNegation = sourceWords.some((w) => NEGATION_WORDS.has(w));
  const sourceHasPositive = sourceWords.some((w) => POSITIVE_WORDS.has(w));

  // Detect contradiction: Claim is negative while source is explicitly positive on the topic, or vice versa
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
 * Scrubs citations across explicit tokens, numeric brackets, and natural author-date patterns.
 */
export function scrubCitations(
  text: string,
  options: CitationScrubberOptions = {}
): string {
  const detailed = scrubCitationsDetailed(text, options);
  return detailed.scrubbedText;
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
    // If sources ledger is provided and index is out of bounds, replace
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

    // If sources ledger exists and author-date citation is not verified, strip it!
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
