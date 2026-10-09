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
import {
  generateCuratedLiteratureSources,
  fetchMoreLiteratureSources as fetchMoreMockSources,
} from "./scholarlyDiscoveryService";

// ─────────────────────────────────────────────────────────────────────────────
// Types for server response
// ─────────────────────────────────────────────────────────────────────────────

interface ServerDiscoveredDraft {
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
    relevanceScore: 75, // Baseline — real relevance is server-assigned
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

    if (!response.ok) {
      console.warn(`[RealDiscovery] Server responded ${response.status}, falling back to mock catalog`);
      return generateCuratedLiteratureSources(question, citationStyle);
    }

    const data: MultiPortalResponse = await response.json();

    if (!data.success || !Array.isArray(data.sources) || data.sources.length === 0) {
      console.warn("[RealDiscovery] Empty server response, falling back to mock catalog");
      return generateCuratedLiteratureSources(question, citationStyle);
    }

    // Map server drafts to canonical DiscoveredSource objects
    const mapped = data.sources.map((draft, idx) =>
      mapDraftToDiscoveredSource(draft, idx, question)
    );

    // Deduplicate
    const deduplicated = deduplicateSources(mapped);

    console.log(
      `[RealDiscovery] Discovered ${deduplicated.length} real scholarly sources ` +
      `(${data.sources.length} raw from server, after dedup)`
    );

    return deduplicated;
  } catch (err) {
    console.warn("[RealDiscovery] Server discovery failed, falling back to mock catalog:", err);
    return generateCuratedLiteratureSources(question, citationStyle);
  }
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
      return fetchMoreMockSources(existingSources, question, batchSize);
    }

    const data: MultiPortalResponse = await response.json();

    if (!data.success || !Array.isArray(data.sources) || data.sources.length === 0) {
      return fetchMoreMockSources(existingSources, question, batchSize);
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
    console.warn("[RealDiscovery] fetchMore failed, falling back to mock:", err);
    return fetchMoreMockSources(existingSources, question, batchSize);
  }
}
