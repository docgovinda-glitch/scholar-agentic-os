/**
 * Multi-Provider Parallel Scholarly & Web Retrieval Service (Sections 3, 4, 6, 7).
 *
 * - Dynamically selects source budget based on prompt complexity from `askScholarConfig.ts`
 *   (no hardcoded 6-source or 8-source caps).
 * - Queries multiple scholarly providers in parallel across query variations:
 *   OpenAlex, Crossref (with retraction checks), Europe PMC / PubMed, Semantic Scholar, DOAJ.
 * - Strictly verifies every candidate via `verifyAndDeduplicateSources` (CSL-JSON engine):
 *   never emits "Contributors", "Wikipedia Contributors", "Unknown", "Anonymous", or "n.d.".
 * - Records excluded sources with explicit reasons ("author not verifiable",
 *   "publication year not verifiable", "retracted") and tracks searched/read counts.
 */

import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient";
import {
  classifyResearchPrompt,
  resolveSourceBudget,
  type AskScholarRequestType,
  type AcademicDiscipline,
} from "../config/askScholarConfig";
import {
  verifyAndDeduplicateSources,
  verifyAndEnrichDOIMetadataBatch,
  type CSLItem,
  type ExcludedSourceRecord,
  type RawSourceInput,
} from "../citation_compliance/cslEngine";

export interface LiveSearchResult {
  id?: string;
  title: string;
  url: string;
  snippet: string;
  publicationDate?: string;
  year?: number | string;
  authors: string[];
  venue?: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  doi?: string;
  openAccessUrl?: string;
  source?:
    | "openalex"
    | "crossref"
    | "pubmed"
    | "semantic_scholar"
    | "arxiv"
    | "doaj"
    | "web";
  sourceType?: string;
  credibilityLevel?: "high" | "moderate" | "preprint - not peer-reviewed";
  csl?: CSLItem;
  score?: number;
  stance?: "supporting" | "contradicting" | "mentioning";
}

export interface LiveSearchOptions {
  limit?: number;
  mode?: "all" | "scholarly" | "web" | "deep_research";
  /** The reader's chosen discipline ("auto" lets the question decide). */
  discipline?: AcademicDiscipline;
  signal?: AbortSignal;
}

export interface LiveSearchTelemetryResult {
  results: LiveSearchResult[];
  excludedSources: ExcludedSourceRecord[];
  searchedCount: number;
  readCount: number;
  complexity: AskScholarRequestType;
  discipline: AcademicDiscipline;
  queriesExecuted: string[];
}

export interface LiveSearchProgressUpdate {
  stage: "searching" | "ranking" | "verifying";
  detail: string;
  candidatesFound?: number;
  verifiedCount?: number;
  excludedCount?: number;
}

const LIVE_SEARCH_GROUNDING_KEY = "scholar_live_search_grounding";
let memoryFallbackGrounding = false;
let lastSearchTelemetry: LiveSearchTelemetryResult | null = null;
const progressListeners = new Set<(update: LiveSearchProgressUpdate) => void>();

export function onLiveSearchProgress(
  listener: (update: LiveSearchProgressUpdate) => void
): () => void {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

function emitLiveSearchProgress(update: LiveSearchProgressUpdate): void {
  for (const listener of progressListeners) {
    try {
      listener(update);
    } catch {
      // ignore listener errors
    }
  }
}

export function getLastLiveSearchTelemetry(): LiveSearchTelemetryResult | null {
  return lastSearchTelemetry;
}

export function getLiveSearchGroundingEnabled(): boolean {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    try {
      const val = window.localStorage.getItem(LIVE_SEARCH_GROUNDING_KEY);
      if (val !== null) return val === "true";
    } catch {
      // fallback to memory
    }
  } else if (typeof localStorage !== "undefined") {
    try {
      const val = localStorage.getItem(LIVE_SEARCH_GROUNDING_KEY);
      if (val !== null) return val === "true";
    } catch {
      // fallback to memory
    }
  }
  return memoryFallbackGrounding;
}

export function setLiveSearchGroundingEnabled(enabled: boolean): void {
  memoryFallbackGrounding = enabled;
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    try {
      window.localStorage.setItem(LIVE_SEARCH_GROUNDING_KEY, enabled ? "true" : "false");
      window.dispatchEvent(new CustomEvent("scholar:live-search-grounding-toggled", { detail: { enabled } }));
    } catch {
      // Non-blocking storage failover
    }
  } else if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(LIVE_SEARCH_GROUNDING_KEY, enabled ? "true" : "false");
    } catch {
      // Non-blocking storage failover
    }
  }
}

export function onLiveSearchGroundingChange(callback: (enabled: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const custom = e as CustomEvent<{ enabled: boolean }>;
    if (typeof custom.detail?.enabled === "boolean") {
      callback(custom.detail.enabled);
    }
  };
  window.addEventListener("scholar:live-search-grounding-toggled", handler);
  return () => window.removeEventListener("scholar:live-search-grounding-toggled", handler);
}

/**
 * Runs one live search through the server RetrievalService (`/api/search/live`), then verifies
 * every record with the shared CSL engine: DOI metadata and retraction checks, placeholder-author
 * rejection, de-duplication. There is no browser-side provider fallback: the server is the only
 * retrieval path, so every workspace sees the same sources.
 */
export async function executeLiveSearchWithTelemetry(
  query: string,
  options: LiveSearchOptions = {}
): Promise<LiveSearchTelemetryResult> {
  const cleanQuery = query.trim();
  const classification = classifyResearchPrompt(cleanQuery, {
    isDeepResearch: options.mode === "deep_research",
    preferredDiscipline: options.discipline,
  });
  const budget = resolveSourceBudget(classification.requestType);
  const baseTelemetry = {
    complexity: classification.requestType,
    discipline: classification.discipline,
  };
  const emptyTelemetry = (queriesExecuted: string[]): LiveSearchTelemetryResult => ({
    results: [],
    excludedSources: [],
    searchedCount: 0,
    readCount: 0,
    ...baseTelemetry,
    queriesExecuted,
  });

  if (!cleanQuery) return emptyTelemetry([]);

  const requestedLimit =
    options.limit && options.limit > 6 ? options.limit : budget.maxCited;
  const candidateTarget = Math.max(budget.minCandidates, requestedLimit * 2);

  emitLiveSearchProgress({
    stage: "searching",
    detail: "Searching scholarly indexes (OpenAlex, Crossref, Semantic Scholar, Europe PMC) and the live web…",
    candidatesFound: 0,
  });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isSupabaseConfigured()) {
    try {
      const { data } = await getSupabaseClient().auth.getSession();
      const token = data?.session?.access_token?.replace(/[^\x20-\x7E]/g, "").trim();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch {
      // continue unauthenticated; the server answers 401 if it requires a session
    }
  }

  const res = await fetch("/api/search/live", {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: cleanQuery,
      limit: requestedLimit,
      candidateBudget: candidateTarget,
      discipline: classification.discipline,
      mode: options.mode ?? "all",
    }),
    signal: options.signal,
  });
  if (!res.ok) {
    throw new Error(`Live search failed (${res.status}).`);
  }
  const data = (await res.json()) as {
    results?: RawSourceInput[];
    searchedCount?: number;
    queriesExecuted?: string[];
  };
  const raw = Array.isArray(data.results) ? data.results : [];
  const searchedCount = data.searchedCount ?? raw.length;

  emitLiveSearchProgress({
    stage: "ranking",
    detail: `Retrieved ${searchedCount} candidates · Deduplicating by DOI and verifying metadata…`,
    candidatesFound: searchedCount,
  });

  const enriched = await verifyAndEnrichDOIMetadataBatch(raw, { signal: options.signal, maxLookups: 5 });
  const { verified, verifiedRaw, excluded } = verifyAndDeduplicateSources(enriched);

  const results: LiveSearchResult[] = verifiedRaw.slice(0, requestedLimit).map((r, idx) => {
    const csl = verified[idx];
    const provider = (r as { provider?: string }).provider;
    return {
      id: csl.id,
      title: csl.title,
      url: csl.URL || (csl.DOI ? `https://doi.org/${csl.DOI}` : ""),
      snippet: r.snippet || "",
      publicationDate: r.publicationDate || String(csl.issued["date-parts"][0][0]),
      year: csl.issued["date-parts"][0][0],
      authors: (r.authors as string[]) || [],
      venue: csl["container-title"],
      journal: csl["container-title"],
      volume: csl.volume,
      issue: csl.issue,
      pages: csl.page,
      publisher: csl.publisher,
      doi: csl.DOI,
      openAccessUrl: csl.openAccessUrl,
      source: toLiveSource(provider),
      sourceType: csl.sourceTypeLabel,
      credibilityLevel: csl.credibilityLevel,
      csl,
    };
  });

  emitLiveSearchProgress({
    stage: "verifying",
    detail: `Verified ${results.length} sources · Checked retractions and bibliographic metadata…`,
    candidatesFound: searchedCount,
    verifiedCount: results.length,
    excludedCount: excluded.length,
  });

  const telemetry: LiveSearchTelemetryResult = {
    results,
    excludedSources: excluded,
    searchedCount: Math.max(searchedCount, results.length + excluded.length),
    readCount: results.length,
    ...baseTelemetry,
    queriesExecuted: data.queriesExecuted ?? [],
  };
  lastSearchTelemetry = telemetry;
  return telemetry;
}

function toLiveSource(provider?: string): LiveSearchResult["source"] {
  switch (provider) {
    case "openalex":
    case "crossref":
    case "semantic_scholar":
    case "arxiv":
    case "doaj":
    case "web":
      return provider;
    case "europe_pmc":
      return "pubmed";
    case "repository":
      return "openalex";
    default:
      return undefined;
  }
}

/**
 * Executes a live search across open scholarly APIs and authoritative web indices.
 * Returns verified `LiveSearchResult[]` (never capped at 6).
 */
export async function executeLiveSearch(
  query: string,
  options: LiveSearchOptions = {}
): Promise<LiveSearchResult[]> {
  const telemetry = await executeLiveSearchWithTelemetry(query, options);
  return telemetry.results;
}

/**
 * Formats retrieved live sources into the strict grounding context block.
 * Never truncates to 6 or 8 sources and never emits "Unknown Author" or "Contributors".
 */
export function formatLiveSearchGroundingContext(
  results: LiveSearchResult[],
  currentDate: string = new Date().toISOString().split("T")[0]
): string {
  if (!results || results.length === 0) {
    return "";
  }

  const validResults = results.filter(
    (r) => Array.isArray(r.authors) && r.authors.length > 0 && r.authors.every((a) => !/contributors|unknown|anonymous/i.test(a))
  );
  if (validResults.length === 0) {
    return "";
  }

  const snippets = validResults.map((r, idx) => {
    const authors = r.authors.join(", ");
    const date = r.publicationDate || r.year ? ` | Date: ${r.publicationDate || r.year}` : "";
    const source = r.source ? ` | Source: ${r.source}` : "";
    const doi = r.doi ? ` | DOI: ${r.doi}` : "";
    return `[${idx + 1}] "${r.title}" (${authors}${date}${source}${doi})\nURL: ${r.url}\nSummary / Evidence Snippet: ${r.snippet}`;
  });

  return `[Live Web Grounding Context (Retrieved: ${currentDate})]:\n${snippets.join("\n\n")}\n\n[Grounding Instructions]: Ground your response exclusively in the verified facts and evidence from these live snippets. Whenever you state facts or draw findings from a source, insert an in-text citation using its numeric bracket index [1], [2] (or grouped [1, 2] when multiple sources support the same claim). Only cite sources you actually use in your argument, and ensure every cited source corresponds to the numbered evidence above. Never invent or guess citations, and never emit placeholder authors such as "Contributors", "Unknown", or "n.d.".`;
}

/**
 * Injects live web grounding context block into a user prompt.
 */
export function injectLiveGrounding(
  prompt: string,
  results: LiveSearchResult[],
  currentDate?: string
): { promptWithContext: string; contextBlock: string } {
  const contextBlock = formatLiveSearchGroundingContext(results, currentDate);
  if (!contextBlock) {
    return { promptWithContext: prompt, contextBlock: "" };
  }
  const promptWithContext = `${contextBlock}\n\nUser Inquired:\n${prompt}`;
  return { promptWithContext, contextBlock };
}

/**
 * Injects live web grounding context block into a system prompt.
 */
export function injectLiveGroundingToSystemPrompt(
  systemPrompt: string,
  results: LiveSearchResult[],
  currentDate?: string
): string {
  const contextBlock = formatLiveSearchGroundingContext(results, currentDate);
  if (!contextBlock) return systemPrompt;
  return `${systemPrompt}\n\n${contextBlock}`;
}

const FOLLOW_UP = /^(and|but|also|then|so|what about|how about|what else|tell me more|more on|same for|and in)\b/i;

/**
 * Builds a contextual retrieval query combining short follow-ups with the prior question.
 */
export function buildRetrievalQuery(question: string, previousQuestions: string[] = []): string {
  const q = question.trim();
  const prev = [...previousQuestions].reverse().find((p) => p.trim());
  const words = q.split(/\s+/).filter(Boolean).length;
  if (!prev || (words >= 7 && !FOLLOW_UP.test(q))) return q;
  return `${prev.trim()} ${q}`.slice(0, 300);
}
