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
import { buildSourceSearchQueries, briefDomainTerms, anchorQueries, scoreSourceRelevance } from "../../../utils/briefSourceQueries";
import { extractPrescribedReferences, parseBriefQuestions, parsePrescribedBibliography } from "../../../utils/briefQuestions";
import { explainSourceFit } from "../../../utils/sourceFit";

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
  // Clean keyword phrases from the brief's questions; never the raw prompt text.
  return buildSourceSearchQueries(question, 5);
}

/** Reject after `ms` so one slow provider never holds the spinner. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function serverMultiPortal(query: string, maxResults: number): Promise<ServerDiscoveredDraft[]> {
  const response = await authedJsonFetch("/api/search/multi-portal", "POST", { query, maxResults });
  if (!response || !response.ok) return [];
  const data: MultiPortalResponse = await response.json();
  return data.success && Array.isArray(data.sources) ? data.sources : [];
}

async function directOpenAlex(query: string, maxResults: number): Promise<ServerDiscoveredDraft[]> {
  const res = await fetch(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${maxResults}`, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || []).map((w: any) => ({
    title: w.title || w.display_name || "Untitled",
    authors: (w.authorships || []).map((a: any) => a.author?.display_name).filter(Boolean),
    url: w.doi || w.primary_location?.landing_page_url,
    doi: typeof w.doi === "string" ? w.doi.replace(/^https?:\/\/doi\.org\//, "") : undefined,
    year: w.publication_year,
    venue: w.primary_location?.source?.display_name,
    sourceType: "scholarly",
    authorityTier: w.type === "article" && w.primary_location?.source?.type === "journal" ? "A" : "B",
    discoveredVia: "openalex",
  }));
}

async function directCrossref(query: string, maxResults: number): Promise<ServerDiscoveredDraft[]> {
  const res = await fetch(`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(query)}&rows=${maxResults}`, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.message?.items || []).map((w: any) => ({
    title: (w.title && w.title[0]) || "Untitled",
    authors: (w.author || []).map((a: any) => [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean),
    url: w.URL,
    doi: w.DOI,
    year: w.issued?.["date-parts"]?.[0]?.[0],
    venue: w["container-title"]?.[0],
    sourceType: "scholarly",
    authorityTier: w.type === "journal-article" ? "A" : "B",
    discoveredVia: "crossref",
  }));
}

async function directSemanticScholar(query: string, maxResults: number): Promise<ServerDiscoveredDraft[]> {
  const res = await fetch(
    `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${maxResults}&fields=title,authors,year,url,venue,externalIds`,
    { signal: AbortSignal.timeout(12_000) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data || []).map((w: any) => ({
    title: w.title || "Untitled",
    authors: (w.authors || []).map((a: any) => a.name).filter(Boolean),
    url: w.url,
    doi: w.externalIds?.DOI,
    year: w.year,
    venue: w.venue,
    sourceType: "scholarly",
    authorityTier: "A",
    discoveredVia: "semantic_scholar",
  }));
}

function settledValues<T>(results: PromiseSettledResult<T[]>[]): T[] {
  return results.flatMap((r) => (r.status === "fulfilled" && Array.isArray(r.value) ? r.value : []));
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

  const domainTerms = briefDomainTerms(question);
  // Every search carries the subject word, so "noisy" never finds Bangla sentiment analysis.
  const queries = anchorQueries(buildDiscoveryQueries(question).slice(0, 4), domainTerms);
  if (queries.length === 0) return [];
  const perQuery = Math.max(10, Math.ceil(maxResults / queries.length));

  // 1. Server multi-portal search, one request per phrase; a slow or failing phrase never blocks the rest.
  const viaServer = settledValues(
    await Promise.allSettled(queries.map((q) => withTimeout(serverMultiPortal(q, perQuery), 25_000)))
  );

  let drafts = viaServer;
  // 2. If the server gave nothing, ask the public indexes directly, all at once.
  if (drafts.length === 0) {
    const direct = await Promise.allSettled(
      queries.slice(0, 2).flatMap((q) => [
        withTimeout(directOpenAlex(q, perQuery), 15_000),
        withTimeout(directCrossref(q, perQuery), 15_000),
        withTimeout(directSemanticScholar(q, perQuery), 15_000),
      ])
    );
    drafts = settledValues(direct);
  }

  if (drafts.length === 0) {
    // Never substitute catalog or synthesized entries for live results.
    console.warn("[RealDiscovery] All live APIs returned nothing.");
    return [];
  }
  const questionRows = parseBriefQuestions(question);
  const scored = drafts
    .map((draft, idx) => {
      const src = mapDraftToDiscoveredSource(draft, idx, queries.join(" "));
      const raw = scoreSourceRelevance({ title: draft.title, venue: draft.venue }, domainTerms, queries);
      const why = explainSourceFit({ title: draft.title, venue: draft.venue }, questionRows, queries[0]);
      return { src: why ? { ...src, whyThisSource: why } : src, raw };
    })
    // Off-topic papers (no subject word at all) are dropped, not just ranked low.
    .filter((x) => x.raw > 0);
  // Scale so the best match reads 95 and the 85%+/90%+ filters show the strongest papers.
  const top = Math.max(1, ...scored.map((x) => x.raw));
  const ranked = scored
    .map((x) => ({ ...x.src, relevanceScore: Math.max(1, Math.round((x.raw / top) * 95)) }))
    .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
  return deduplicateSources(ranked).slice(0, maxResults);
}

/**
 * References the brief itself names ("Preskill (2018)"), resolved to real
 * records where an index confirms author and year, otherwise kept as named
 * (unverified). They are listed first, marked as prescribed in the brief.
 */
export async function resolvePrescribedReferences(briefText: string, topicQueries: string[] = []): Promise<DiscoveredSource[]> {
  // 1. Full entries printed in the brief's own reference list: used exactly as given.
  const bibliography = parsePrescribedBibliography(briefText);
  const fromBibliography: DiscoveredSource[] = bibliography.map((b, i) => ({
    id: `prescribed-bib-${i}-${b.year}`,
    title: b.title,
    authors: b.etAl ? [...b.authors, "et al."] : b.authors,
    year: String(b.year),
    type: b.isBook ? "book" : "journal",
    journal: b.isBook ? undefined : b.venue,
    publisher: b.publisher,
    volume: b.volume,
    issue: b.issue,
    pages: b.pages,
    doi: b.doi,
    url: b.doi ? `https://doi.org/${b.doi}` : undefined,
    mainFinding: "",
    suggestedUse: "Named in your assignment brief.",
    whyThisSource: "Named in your assignment brief.",
    citation: b.raw,
    status: "kept" as const,
    verificationStatus: b.doi ? ("verified" as const) : ("unverified" as const),
    isActive: true,
    relevanceScore: 100,
    sourceOrigin: "system_found",
    prescribedInBrief: true,
  }));
  const familyYear = (fam: string, year: number | string) => `${fam.toLowerCase()}|${year}`;
  const covered = new Set(bibliography.map((b) => familyYear((b.authors[0] ?? "").split(",")[0], b.year)));

  // 2. Citations named in the questions but not in a printed list: look them up.
  const refs = extractPrescribedReferences(briefText).filter((r) => !covered.has(familyYear(r.authors.split(/\s|&|,/)[0], r.year)));
  if (refs.length === 0) return fromBibliography;
  const topic = (topicQueries[0] || "").split(" ").slice(0, 3).join(" ");

  const resolved = await Promise.allSettled(
    refs.map(async (ref) => {
      const surname = ref.authors.split(/\s|&|,/)[0];
      const q = `${surname} ${topic}`.trim();
      const found = settledValues(
        await Promise.allSettled([withTimeout(directCrossref(q, 8), 12_000), withTimeout(directOpenAlex(q, 8), 12_000)])
      );
      return found.find(
        (d) => d.year === ref.year && d.authors.some((a) => a.toLowerCase().includes(surname.toLowerCase()))
      );
    })
  );

  const looked = refs.map((ref, i) => {
    const r = resolved[i];
    const hit = r.status === "fulfilled" ? r.value : undefined;
    if (hit) {
      return { ...mapDraftToDiscoveredSource(hit, i, ref.label), id: `prescribed-${i}-${ref.year}`, prescribedInBrief: true, status: "kept" as const, relevanceScore: 100, whyThisSource: "Named in your assignment brief." };
    }
    // Unresolved: keep the name as the brief gives it, with "et al." as a flag, never as a surname.
    const etAl = /\bet\.?\s*al/i.test(ref.authors);
    const names = ref.authors.replace(/\s*et\.?\s*al\.?/i, "").split(/\s+(?:and|&)\s+/).map((n) => n.trim()).filter(Boolean);
    return {
      id: `prescribed-${i}-${ref.year}`,
      title: `Reference named in your brief: ${ref.label}`,
      authors: etAl ? [...names, "et al."] : names,
      year: String(ref.year),
      type: "journal",
      mainFinding: "",
      suggestedUse: "Named in your assignment brief.",
      whyThisSource: "Named in your assignment brief. Add its full details to cite it.",
      citation: ref.label,
      status: "kept" as const,
      verificationStatus: "unverified" as const,
      isActive: true,
      relevanceScore: 100,
      sourceOrigin: "system_found",
      prescribedInBrief: true,
    } as DiscoveredSource;
  });
  return [...fromBibliography, ...looked];
}

/** Prescribed references first, then live discovery from clean phrases built from the brief. */
export async function discoverSourcesForAssignment(opts: {
  question: string;
  briefText?: string;
  citationStyle: string;
  maxResults?: number;
}): Promise<DiscoveredSource[]> {
  const text = opts.briefText && opts.briefText.trim().length > 20 ? opts.briefText : opts.question;
  const [prescribed, discovered] = await Promise.allSettled([
    resolvePrescribedReferences(text, buildDiscoveryQueries(text)),
    discoverRealScholarlySourcesFromServer(text, opts.citationStyle, opts.maxResults ?? 50),
  ]);
  const first = prescribed.status === "fulfilled" ? prescribed.value : [];
  const rest = discovered.status === "fulfilled" ? discovered.value : [];
  const seenDoi = new Set(first.map((s) => s.doi?.toLowerCase()).filter(Boolean));
  const seenTitle = new Set(first.map((s) => s.title.toLowerCase()));
  return [...first, ...rest.filter((s) => !(s.doi && seenDoi.has(s.doi.toLowerCase())) && !seenTitle.has(s.title.toLowerCase()))];
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
