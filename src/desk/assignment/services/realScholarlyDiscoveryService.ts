/**
 * Real Scholarly Discovery Service — Production Spec §3.1–3.5
 *
 * Calls the server-side multi-portal discovery API (OpenAlex, CrossRef, DOAJ,
 * DataCite, arXiv) and maps results into the canonical DiscoveredSource schema.
 *
 * Falls back to the local mock catalog service if the server is unreachable,
 * so the UI never shows zero results.
 */

import type { DiscoveredSource, SourceVerificationStatus } from "../types";
import { authedJsonFetch } from "../../api";

// ─────────────────────────────────────────────────────────────────────────────
// Types for server response
// ─────────────────────────────────────────────────────────────────────────────

export interface ServerDiscoveredDraft {
  title: string;
  authors: string[];
  url?: string;
  doi?: string;
  venue?: string;
  year?: number;
  discoveredVia: string;
  sourceType: string;
  authorityTier: string;
}

export type DiscoveredSourceDraft = ServerDiscoveredDraft;

interface MultiPortalResponse {
  success: boolean;
  count: number;
  sources: ServerDiscoveredDraft[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping helpers
// ─────────────────────────────────────────────────────────────────────────────

function mapAuthorityToCredibility(tier: string): string {
  switch (tier) {
    case "A":
      return "peer-reviewed";
    case "B":
      return "academic-press";
    case "C":
      return "institutional-report";
    default:
      return "working-paper";
  }
}

function mapAuthorityToPeerReviewed(tier: string, sourceType: string): boolean | null {
  if (sourceType === "scholarly" && tier === "A") return true;
  if (sourceType === "scholarly" && tier === "B") return null; // preprint — unknown
  return null;
}

function mapSourceType(sourceType: string): string {
  switch (sourceType) {
    case "scholarly":
      return "journal";
    case "official":
      return "institutional";
    case "web":
      return "web";
    default:
      return "journal";
  }
}

function determineVerificationStatus(draft: ServerDiscoveredDraft): SourceVerificationStatus {
  if (draft.doi) return "verified";
  if (draft.url && draft.authorityTier === "A") return "verified";
  return "unverified";
}

function generateCitationString(draft: ServerDiscoveredDraft): string {
  const authorStr = draft.authors.length > 0
    ? draft.authors.length > 2
      ? `${draft.authors[0]} et al.`
      : draft.authors.join(" & ")
    : "Unknown Author";
  const yearStr = draft.year ? `(${draft.year})` : "(n.d.)";
  const venue = draft.venue || "";
  return `${authorStr} ${yearStr}. ${draft.title}.${venue ? ` ${venue}.` : ""}${draft.doi ? ` https://doi.org/${draft.doi}` : ""}`;
}

// Words in assignment prompts that say what to do, not what it is about.
const PROMPT_WORDS = new Set([
  "about", "affected", "analyse", "analyze", "assess", "between", "compare", "consider", "critically",
  "discuss", "does", "evaluate", "examine", "explain", "explore", "extent", "from", "have", "into",
  "role", "such", "that", "their", "these", "this", "those", "what", "when", "where", "which", "while", "with",
]);

/**
 * Measured relevance: the percentage of the question's key terms (words of
 * 4+ letters, minus instruction words) that appear in the title. 0 when the
 * question has no key terms.
 */
export function titleTermMatch(question: string, title: string): number {
  const words = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  const terms = Array.from(new Set(words(question).filter((w) => !PROMPT_WORDS.has(w))));
  if (terms.length === 0) return 0;
  const inTitle = new Set(words(title));
  return Math.round((terms.filter((t) => inTitle.has(t)).length / terms.length) * 100);
}

/**
 * Convert a server discovery draft into a canonical DiscoveredSource.
 * Never synthesizes missing metadata — marks it as unverified instead.
 */
function mapDraftToDiscoveredSource(
  draft: ServerDiscoveredDraft,
  index: number,
  question: string
): DiscoveredSource {
  const id = `real-${draft.discoveredVia}-${index}-${Date.now()}`;

  return {
    id,
    title: draft.title,
    authors: [...draft.authors], // Clone to avoid reference sharing
    year: draft.year ? String(draft.year) : "",
    type: mapSourceType(draft.sourceType),
    journal: draft.venue || undefined,
    doi: draft.doi || undefined,
    url: draft.url || (draft.doi ? `https://doi.org/${draft.doi}` : undefined),
    relevanceScore: titleTermMatch(question, draft.title),
    mainFinding: "", // Never synthesize findings from metadata alone
    suggestedUse: "",
    citation: generateCitationString(draft),
    status: "kept",

    // Canonical Source Registry Fields (Production Spec §3.3)
    verificationStatus: determineVerificationStatus(draft),
    isActive: true, // Default: eligible for retrieval (Spec §3.6)
    retrievalSource: draft.discoveredVia,
    retrievedAt: new Date().toISOString(),
    peerReviewed: mapAuthorityToPeerReviewed(draft.authorityTier, draft.sourceType),
    publicationStatus: draft.sourceType === "scholarly" && draft.authorityTier === "B"
      ? "preprint"
      : "published",

    // Quality metadata
    sourceCredibility: mapAuthorityToCredibility(draft.authorityTier),
    isVerifiedAcademic: draft.sourceType === "scholarly",
    isOpenAccess: draft.discoveredVia === "doaj", // DOAJ is always open access
    sourceOrigin: "system_found",
    originTag: "ai-research",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Deduplication (Production Spec §3.5)
// ─────────────────────────────────────────────────────────────────────────────

function deduplicateSources(sources: DiscoveredSource[]): DiscoveredSource[] {
  const seenDois = new Set<string>();
  const seenTitles = new Set<string>();
  const result: DiscoveredSource[] = [];

  for (const source of sources) {
    const cleanDoi = source.doi ? source.doi.toLowerCase().trim() : null;
    const normTitle = source.title.toLowerCase().replace(/[\W_]+/g, " ").trim();

    if (cleanDoi && seenDois.has(cleanDoi)) continue;
    if (normTitle && seenTitles.has(normTitle)) continue;

    if (cleanDoi) seenDois.add(cleanDoi);
    if (normTitle) seenTitles.add(normTitle);

    result.push(source);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query generation from assignment context (Production Spec §3.1 Stream B)
// ─────────────────────────────────────────────────────────────────────────────

function buildDiscoveryQueries(question: string): string[] {
  const queries: string[] = [];
  const clean = question.trim();
  if (!clean) return queries;

  // Primary: the full question (most complete semantic signal)
  queries.push(clean);

  // Extract key noun phrases for targeted queries
  const words = clean.split(/\s+/).filter((w) => w.length > 3);
  if (words.length > 6) {
    // Take first 6 meaningful words as a focused query
    queries.push(words.slice(0, 6).join(" "));
  }

  return queries;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discover scholarly sources via the server's multi-portal API.
 * Falls back to mock catalog if the server is unavailable.
 *
 * @param question - The research question / assignment prompt
 * @param citationStyle - Citation style for formatting fallback sources
 * @param maxResults - Maximum number of sources to return
 * @returns Deduplicated array of DiscoveredSource objects
 */
export async function discoverRealScholarlySourcesFromServer(
  question: string,
  citationStyle: string,
  maxResults = 50
): Promise<DiscoveredSource[]> {
  if (!question || question.trim().length < 5) {
    return [];
  }

  const queries = buildDiscoveryQueries(question);
  if (queries.length === 0) return [];

  try {
    // Call server multi-portal discovery endpoint
    const response = await authedJsonFetch(
      "/api/search/multi-portal",
      "POST",
      {
        query: queries[0],
        maxResults,
      }
    );

    if (response && response.ok) {
      const data: MultiPortalResponse = await response.json();
      if (data.success && Array.isArray(data.sources) && data.sources.length > 0) {
        const mapped = data.sources.map((draft, idx) =>
          mapDraftToDiscoveredSource(draft, idx, question)
        );
        const deduplicated = deduplicateSources(mapped);
        console.log(`[RealDiscovery] Discovered ${deduplicated.length} real scholarly sources via server API.`);
        return deduplicated;
      }
    }
  } catch (err) {
    console.warn("[RealDiscovery] Server discovery failed:", err);
  }

  // Fallback 1: Live OpenAlex API (Frontend direct)
  try {
    console.log("[RealDiscovery] Falling back to direct OpenAlex API...");
    const openAlexUrl = `https://api.openalex.org/works?search=${encodeURIComponent(queries[0])}&per-page=${maxResults}`;
    const oaRes = await fetch(openAlexUrl);
    
    if (oaRes.ok) {
      const oaData = await oaRes.json();
      if (oaData.results && oaData.results.length > 0) {
        const drafts: DiscoveredSourceDraft[] = oaData.results.map((w: any) => ({
          title: w.title || w.display_name || "Untitled",
          authors: (w.authorships || []).map((a: any) => a.author?.display_name).filter(Boolean),
          url: w.doi || w.primary_location?.landing_page_url,
          year: w.publication_year,
          venue: w.primary_location?.source?.display_name,
          sourceType: "scholarly",
          authorityTier: (w.type === "article" && w.primary_location?.source?.type === "journal") ? "A" : "B",
          discoveredVia: "openalex"
        }));
        
        const mapped = drafts.map((draft, idx) => mapDraftToDiscoveredSource(draft, idx, question));
        const deduplicated = deduplicateSources(mapped);
        return deduplicated;
      }
    }
  } catch (err) {
    console.warn("[RealDiscovery] OpenAlex fallback failed:", err);
  }

  // Fallback 2: Live Semantic Scholar API (Frontend direct)
  try {
    console.log("[RealDiscovery] Falling back to direct Semantic Scholar API...");
    const s2Url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(queries[0])}&limit=${maxResults}&fields=title,authors,year,url,venue`;
    const s2Res = await fetch(s2Url);
    
    if (s2Res.ok) {
      const s2Data = await s2Res.json();
      if (s2Data.data && s2Data.data.length > 0) {
        const drafts: DiscoveredSourceDraft[] = s2Data.data.map((w: any) => ({
          title: w.title || "Untitled",
          authors: (w.authors || []).map((a: any) => a.name).filter(Boolean),
          url: w.url,
          year: w.year,
          venue: w.venue,
          sourceType: "scholarly",
          authorityTier: "A", // Semantic Scholar mostly indexes peer-reviewed
          discoveredVia: "semantic_scholar"
        }));
        
        const mapped = drafts.map((draft, idx) => mapDraftToDiscoveredSource(draft, idx, question));
        const deduplicated = deduplicateSources(mapped);
        return deduplicated;
      }
    }
  } catch (err) {
    console.warn("[RealDiscovery] Semantic Scholar fallback failed:", err);
  }

  // Never substitute catalog or synthesized entries for live results: an
  // empty list lets the UI say plainly that no sources were found.
  console.warn("[RealDiscovery] All live APIs failed; returning no sources.");
  return [];
}

/**
 * Fetch additional real sources beyond what's already been discovered.
 * Uses a secondary query to get different results.
 *
 * @param existingSources - Sources already in the workspace
 * @param question - The research question
 * @param batchSize - Number of additional sources to fetch
 * @returns New, non-duplicate sources
 */
export async function fetchMoreRealSources(
  existingSources: DiscoveredSource[],
  question: string,
  batchSize = 10
): Promise<DiscoveredSource[]> {
  if (!question || question.trim().length < 5) return [];

  const existingDois = new Set(existingSources.map((s) => s.doi).filter(Boolean));
  const existingTitles = new Set(
    existingSources.map((s) => s.title.toLowerCase().replace(/[\W_]+/g, " ").trim())
  );

  try {
    // Use a different query formulation for diversity
    const queries = buildDiscoveryQueries(question);
    const searchQuery = queries.length > 1 ? queries[1] : queries[0];

    const response = await authedJsonFetch(
      "/api/search/multi-portal",
      "POST",
      {
        query: searchQuery,
        maxResults: batchSize + 20, // Over-fetch to account for dedup
      }
    );

    if (!response.ok) {
      return [];
    }

    const data: MultiPortalResponse = await response.json();

    if (!data.success || !Array.isArray(data.sources) || data.sources.length === 0) {
      return [];
    }

    // Map and filter out duplicates against existing sources
    const mapped = data.sources
      .map((draft, idx) => mapDraftToDiscoveredSource(draft, idx + 1000, question))
      .filter((source) => {
        const cleanDoi = source.doi ? source.doi.toLowerCase().trim() : null;
        const normTitle = source.title.toLowerCase().replace(/[\W_]+/g, " ").trim();

        if (cleanDoi && existingDois.has(cleanDoi)) return false;
        if (normTitle && existingTitles.has(normTitle)) return false;

        return true;
      });

    return deduplicateSources(mapped).slice(0, batchSize);
  } catch (err) {
    console.warn("[RealDiscovery] fetchMore failed; returning no sources:", err);
    return [];
  }
}
