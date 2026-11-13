/**
 * Academic Metadata Service for Source Library
 *
 * Resolves metadata in order of reliability:
 * 1. DOI via Crossref / OpenAlex
 * 2. URL parsing (academic articles / web)
 * 3. File metadata heuristics
 *
 * Never fabricates data. Returns confidence indicators ("verified" vs "needs_review").
 */

import { lookupCrossrefByDoi, lookupOpenAlexByDoi } from "../../shared/retrieval/providers";
import { authedJsonFetch } from "../../desk/api";
import type { SourceMetadata } from "./sourceTypes";
import { normalizeDoi } from "./duplicateDetection";

export interface ResolvedMetadataResult {
  success: boolean;
  metadata: SourceMetadata;
  citation: string;
  confidence: "verified" | "needs_review";
  notes?: string;
  abstract?: string;
  keyPoints?: string[];
  suggestedTags?: string[];
  whySaved?: string;
  keyQuote?: string;
  error?: string;
}

/**
 * Formats an APA 7 citation from raw metadata fields.
 */
export function generateAPA7Citation(meta: {
  authors?: string[];
  year?: string;
  title?: string;
  journal?: string;
  publisher?: string;
  doi?: string;
  url?: string;
}): string {
  const authors = meta.authors || [];
  let authorStr = "Unknown Author";

  if (authors.length === 1) {
    authorStr = authors[0];
  } else if (authors.length === 2) {
    authorStr = `${authors[0]} & ${authors[1]}`;
  } else if (authors.length > 2) {
    authorStr = `${authors[0]} et al.`;
  }

  const yearStr = meta.year ? `(${meta.year})` : "(n.d.)";
  const titleStr = meta.title ? `${meta.title.replace(/[\.\s]+$/, "")}.` : "Untitled Source.";
  const sourceStr = meta.journal
    ? ` ${meta.journal}.`
    : meta.publisher
    ? ` ${meta.publisher}.`
    : "";

  let linkStr = "";
  if (meta.doi) {
    const cleanDoi = normalizeDoi(meta.doi);
    linkStr = ` https://doi.org/${cleanDoi}`;
  } else if (meta.url) {
    linkStr = ` ${meta.url}`;
  }

  return `${authorStr} ${yearStr}. ${titleStr}${sourceStr}${linkStr}`.trim();
}

/** "Family, Given" -> "Given Family" (citation text is built from given-name-first names). */
function givenNameFirst(name: string): string {
  const [family, ...given] = name.split(",");
  return given.length > 0 ? `${given.join(",").trim()} ${family.trim()}` : name.trim();
}

/**
 * Resolves academic metadata from a DOI via Crossref / OpenAlex.
 */
export async function resolveDoiMetadata(rawDoi: string): Promise<ResolvedMetadataResult> {
  const clean = normalizeDoi(rawDoi);
  if (!clean) {
    return {
      success: false,
      metadata: { title: "", authors: [] },
      citation: "",
      confidence: "needs_review",
      error: "Please enter a valid DOI (e.g. 10.1038/nature12373)",
    };
  }

  try {
    // 1. First try backend endpoint /api/vault/lookup-doi
    const res = await authedJsonFetch("/api/vault/lookup-doi", "POST", { doi: clean });
    if (res.ok) {
      const data = (await res.json()) as {
        success?: boolean;
        title?: string;
        authors?: string[];
        year?: string;
        journal?: string;
        citation?: string;
        error?: string;
      };

      if (data && data.success && data.title) {
        const authors = data.authors || [];
        const year = data.year || "";
        const journal = data.journal || "";
        const citation =
          data.citation ||
          generateAPA7Citation({
            authors,
            year,
            title: data.title,
            journal,
            doi: clean,
          });

        const takeaways = generateKeyPointsAndNotes({
          title: data.title,
          rawText: (data as any).content || (data as any).abstract || "",
          authors,
          journal,
          year,
        });

        return {
          success: true,
          metadata: {
            title: data.title,
            authors,
            year,
            journal,
            doi: clean,
            url: `https://doi.org/${clean}`,
            type: "paper",
          },
          citation,
          confidence: "verified",
          keyPoints: takeaways.keyPoints,
          suggestedTags: takeaways.suggestedTags,
          whySaved: takeaways.whySaved,
          keyQuote: takeaways.keyQuote,
        };
      }
    }
  } catch {
    // Fall back to direct OpenAlex API
  }

  // 2. OpenAlex, then Crossref, through the shared provider lookups
  for (const lookup of [lookupOpenAlexByDoi, lookupCrossrefByDoi]) {
    try {
      const found = await lookup(clean, { timeoutMs: 8000 });
      if (!found || !found.title) continue;
      const authors = (Array.isArray(found.authors) ? (found.authors as string[]) : []).map(givenNameFirst);
      const year = found.year ? String(found.year) : "";
      const journal = found.venue || "";
      const title = found.title;

      const citation = generateAPA7Citation({ authors, year, title, journal, doi: clean });
      const takeaways = generateKeyPointsAndNotes({ title, authors, year, journal });

      return {
        success: true,
        metadata: { title, authors, year, journal, doi: clean, url: `https://doi.org/${clean}`, type: "paper" },
        citation,
        confidence: "verified",
        keyPoints: takeaways.keyPoints,
        suggestedTags: takeaways.suggestedTags,
        whySaved: takeaways.whySaved,
        keyQuote: takeaways.keyQuote,
      };
    } catch {
      // try the next index
    }
  }

  // 4. DataCite API (CORS enabled, covers arXiv, Zenodo, Figshare, institutional repos)
  try {
    const dataCiteUrl = `https://api.datacite.org/dois/${clean}`;
    const res = await fetch(dataCiteUrl, {
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      const dcData = await res.json();
      const attr = dcData.data?.attributes;
      if (attr) {
        const title = attr.titles?.[0]?.title || "";
        const authors: string[] = (attr.creators || [])
          .map((c: any) => c.name || `${c.givenName || ""} ${c.familyName || ""}`.trim())
          .filter(Boolean);
        const year = String(
          attr.publicationYear ||
            attr.dates?.find(
              (d: any) => d.dateType === "Issued" || d.dateType === "Created" || d.dateType === "Submitted"
            )?.date?.slice(0, 4) ||
            ""
        );
        const journal = attr.container?.title || attr.publisher || "";

        const citation = generateAPA7Citation({
          authors,
          year,
          title,
          journal,
          doi: clean,
        });

        return {
          success: true,
          metadata: {
            title,
            authors,
            year,
            journal,
            doi: clean,
            url: `https://doi.org/${clean}`,
            type: "paper",
          },
          citation,
          confidence: "verified",
        };
      }
    }
  } catch {}

  return {
    success: false,
    metadata: {
      title: "",
      authors: [],
      doi: clean,
      type: "paper",
    },
    citation: "",
    confidence: "needs_review",
    error: `Could not automatically resolve metadata for DOI ${clean}. Please fill in details manually.`,
  };
}

/**
 * Resolves metadata from a web URL.
 */
export async function resolveUrlMetadata(url: string): Promise<ResolvedMetadataResult> {
  const trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return {
      success: false,
      metadata: { title: "", authors: [], url: trimmed, type: "website" },
      citation: "",
      confidence: "needs_review",
      error: "Please enter a valid URL starting with https://",
    };
  }

  // 1. If URL directly contains a DOI, delegate to high-fidelity DOI resolver
  const directDoiMatch = trimmed.match(/(?:doi\.org\/|doi:)(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
  if (directDoiMatch?.[1]) {
    const doiResult = await resolveDoiMetadata(directDoiMatch[1]);
    if (doiResult.success && doiResult.metadata.title) {
      return doiResult;
    }
  }

  try {
    const res = await authedJsonFetch("/api/vault/parse-url", "POST", { url: trimmed });
    if (res.ok) {
      const data = (await res.json()) as {
        success?: boolean;
        title?: string;
        authors?: string[];
        year?: string;
        publisher?: string;
        journal?: string;
        doi?: string;
        sourceType?: string;
        citation?: string;
        canonicalReference?: any;
        description?: string;
        error?: string;
      };

      if (data && data.success && data.title) {
        // If DOI was discovered in page metadata, attempt to enrich with CrossRef/OpenAlex
        if (data.doi) {
          try {
            const enriched = await resolveDoiMetadata(data.doi);
            if (enriched.success && enriched.metadata.title) {
              return {
                ...enriched,
                metadata: {
                  ...enriched.metadata,
                  url: trimmed, // retain user-entered web URL
                  publisher: enriched.metadata.publisher || data.publisher,
                },
              };
            }
          } catch {}
        }

        const domain = new URL(trimmed).hostname.replace(/^www\./, "");
        const title = data.title;
        const authors = Array.isArray(data.authors) ? data.authors : [];
        const year = data.year || "";
        const journal = data.journal || "";
        const publisher = data.publisher || data.canonicalReference?.publisher || domain;
        const doi = data.doi || "";
        const isPaper = data.sourceType === "paper" || Boolean(doi || journal);

        const citation =
          generateAPA7Citation({
            title,
            authors,
            publisher,
            journal,
            year: year || undefined,
            doi: doi || undefined,
            url: trimmed,
          });

        const confidence: "verified" | "needs_review" =
          authors.length > 0 && Boolean(year) ? "verified" : "needs_review";

        const takeaways = generateKeyPointsAndNotes({
          title,
          rawText: data.description || "",
          authors,
          journal: journal || publisher,
          year,
        });

        return {
          success: true,
          metadata: {
            title,
            authors,
            year,
            journal,
            publisher,
            doi,
            url: trimmed,
            type: isPaper ? "paper" : "website",
          },
          citation,
          confidence,
          keyPoints: takeaways.keyPoints,
          suggestedTags: takeaways.suggestedTags,
          whySaved: takeaways.whySaved,
          keyQuote: takeaways.keyQuote,
        };
      }
    }
  } catch {}

  const domain = new URL(trimmed).hostname.replace(/^www\./, "");
  const fallbackTakeaways = generateKeyPointsAndNotes({ title: domain });

  return {
    success: true,
    metadata: {
      title: domain,
      authors: [],
      year: "",
      publisher: domain,
      url: trimmed,
      type: "website",
    },
    citation: `${domain}. Retrieved from ${trimmed}`,
    confidence: "needs_review",
    keyPoints: fallbackTakeaways.keyPoints,
    suggestedTags: fallbackTakeaways.suggestedTags,
    whySaved: fallbackTakeaways.whySaved,
    keyQuote: fallbackTakeaways.keyQuote,
  };
}

export interface ExtractedKeyTakeaways {
  keyPoints: string[];
  suggestedTags: string[];
  whySaved: string;
  keyQuote: string;
}

const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "as", "at",
  "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "could", "did", "do",
  "does", "doing", "down", "during", "each", "few", "for", "from", "further", "had", "has", "have", "having",
  "he", "her", "here", "hers", "herself", "him", "himself", "his", "how", "i", "if", "in", "into", "is", "it",
  "its", "itself", "just", "me", "more", "most", "my", "myself", "no", "nor", "not", "now", "of", "off", "on",
  "once", "only", "or", "other", "our", "ours", "ourselves", "out", "over", "own", "same", "she", "should",
  "so", "some", "such", "than", "that", "the", "their", "theirs", "them", "themselves", "then", "there", "these",
  "they", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "we", "were", "what",
  "when", "where", "which", "while", "who", "whom", "why", "with", "would", "you", "your", "yours", "yourself",
  "towards", "study", "paper", "review", "using", "based", "new", "via", "across", "within", "et", "al", "with",
  "journal", "article", "vol", "issue", "published", "author",
  // Common verbs and filler that made poor tags (e.g. "#provides").
  "provides", "provide", "provided", "shows", "show", "showed", "shown", "uses", "used", "use", "make", "makes", "made",
  "found", "finds", "find", "also", "many", "much", "well", "however", "including", "include", "includes", "between",
  "results", "result", "approach", "approaches", "method", "methods", "data", "analysis", "effect", "effects", "role",
  "first", "second", "three", "two", "one", "high", "large", "different", "various", "several", "among", "upon", "toward",
  "https", "http", "www", "abstract", "introduction", "conclusion", "conclusions"
]);

/**
 * Intelligent extractor and synthesizer that generates academic key points,
 * tags, research purpose (whySaved), and key quote from abstract/metadata.
 * Ideal for later project drafting, literature reviews, and evidence synthesis.
 */
export function generateKeyPointsAndNotes(params: {
  title: string;
  rawText?: string;
  authors?: string[];
  journal?: string;
  year?: string;
}): ExtractedKeyTakeaways {
  const { title, rawText, authors = [], journal = "", year = "" } = params;

  // 1. Extract topical tags from corpus
  const textCorpus = `${title} ${rawText || ""} ${journal}`;
  const words = textCorpus
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

  const wordFreq = new Map<string, number>();
  for (const w of words) {
    wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
  }
  const topWords = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w.replace(/^_+|_+$/g, ""));
  const suggestedTags = Array.from(new Set(topWords));

  // 2. Synthesize Key Points & Takeaways
  const keyPoints: string[] = [];
  let keyQuote = "";
  let whySaved = "";

  const cleanText = (rawText || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleanText.length > 35) {
    const rawSentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
    const sentences = rawSentences.map((s) => s.trim()).filter((s) => s.length > 20);

    const objective = sentences.find((s) =>
      /investigat|examin|explor|focus|aim|address|propos|develop|analyz|consid/i.test(s)
    );
    const findings = sentences.find(
      (s) =>
        /find|result|demonstrat|show|indicat|reveal|confirm|suggest|observ|discov/i.test(s) &&
        s !== objective
    );
    const conclusion = sentences.find(
      (s) =>
        /conclu|significan|polic|implicat|contribut|highlight|futur|importan/i.test(s) &&
        s !== objective &&
        s !== findings
    );

    if (objective) keyPoints.push(objective);
    if (findings) keyPoints.push(findings);
    if (conclusion) keyPoints.push(conclusion);

    // If less than 3 matched, pick additional distinct sentences
    for (const s of sentences) {
      if (keyPoints.length >= 3) break;
      if (!keyPoints.includes(s) && s.length > 25) {
        keyPoints.push(s);
      }
    }

  }

  // Key points are sentences quoted from the source's own abstract or text,
  // and nothing else. "Why I saved it" and the key quote are the student's
  // own words, so they are left empty: canned notes ("Core evidence on…",
  // "Project Relevance: Primary reference…") used to be written for them,
  // and three invented "takeaways" appeared when there was no abstract.
  void authors;
  void year;

  return {
    keyPoints,
    suggestedTags,
    whySaved,
    keyQuote,
  };
}
