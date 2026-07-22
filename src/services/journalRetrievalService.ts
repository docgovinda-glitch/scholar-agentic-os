/**
 * Real client-side journal-metadata retrieval against Crossref, OpenAlex Sources,
 * and DOAJ — all three confirmed directly browser-callable (CORS-permissive) via
 * empirical testing on 2026-07-22. Replaces the prior LLM-naming behavior in
 * aiService.ts's discoverJournals, which asked a model to *name* journals from
 * memory ("rule out predatory journals entirely") with no verification step —
 * the same defect pattern already fixed for discoverDataSources
 * (literatureRetrievalService.ts), whose Promise.allSettled/timeout/error-tolerance
 * pattern this file reuses rather than inventing a new one.
 *
 * Honesty note: none of these three sources exposes a verified "not predatory"
 * signal. What they DO provide is real: only journals actually indexed by these
 * reputable, vetted registries are returned — a real (if partial) signal, not an
 * unverified LLM assertion. Fields none of the three sources can supply for a
 * given journal (e.g. peer-review process for a non-DOAJ-listed subscription
 * journal) are reported as explicitly unavailable, never fabricated.
 */

const PER_SOURCE_LIMIT = 5;
const FINAL_RESULT_CAP = 12;
const REQUEST_TIMEOUT_MS = 10000;
// Empirically verified 2026-07-22 (real browser requests): unlike Crossref/OpenAlex's
// /works search (tolerant of long multi-term queries), their journal-search endpoints
// — and DOAJ's — match against sparse per-journal text (a title, a handful of subject
// tags), not a full abstract. A coherent 3-word phrase ("diabetes dietary
// intervention") returned zero results on all three; a single canonical discipline
// term reliably didn't. Capping defensively here, on top of discoverJournals' own
// field-first query choice, in case a verbose field/keyword value still slips through.
const MAX_QUERY_TOKENS = 3;

function capQueryTokens(query: string): string {
  return query.split(/[,\s]+/).filter(Boolean).slice(0, MAX_QUERY_TOKENS).join(" ");
}

export interface JournalResult {
  name: string;
  publisher: string;
  issn: string | null;
  scopeFit: string;
  ranking: string;
  feeStatus: string;
  submissionOpenness: string;
  reviewContext: string;
  whyFit: string;
  source: "Crossref" | "OpenAlex" | "DOAJ";
}

export interface JournalDiscoveryResult {
  results: JournalResult[];
  sourceErrors: string[];
}

const NOT_AVAILABLE = (source: string) => `Not available from ${source} — verify directly with the publisher.`;

function normalizeIssn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9Xx]/g, "").toUpperCase();
  return cleaned.length >= 7 ? cleaned : null;
}

async function searchCrossrefJournals(query: string): Promise<JournalResult[]> {
  const url = `https://api.crossref.org/journals?query=${encodeURIComponent(query)}&rows=${PER_SOURCE_LIMIT}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Crossref returned HTTP ${res.status}`);
  const data = await res.json();
  const items: any[] = data?.message?.items || [];

  return items.map((item): JournalResult => {
    const subjects: string[] = Array.isArray(item.subjects) ? item.subjects : [];
    const totalDois = item?.counts?.["total-dois"];
    return {
      name: item.title || "Untitled Journal",
      publisher: item.publisher || "",
      issn: normalizeIssn(Array.isArray(item.ISSN) ? item.ISSN[0] : null),
      scopeFit: subjects.length > 0 ? `Subjects (Crossref): ${subjects.join(", ")}` : "No subject data available from Crossref.",
      ranking: typeof totalDois === "number" ? `${totalDois.toLocaleString()} DOIs indexed (Crossref).` : "Indexed in Crossref.",
      feeStatus: NOT_AVAILABLE("Crossref"),
      submissionOpenness: NOT_AVAILABLE("Crossref"),
      reviewContext: NOT_AVAILABLE("Crossref"),
      whyFit: "Matched your search terms via Crossref's journal index.",
      source: "Crossref",
    };
  });
}

async function searchOpenAlexSources(query: string): Promise<JournalResult[]> {
  const apiKey = import.meta.env.VITE_OPENALEX_API_KEY as string | undefined;
  const params = new URLSearchParams({
    search: query,
    filter: "type:journal",
    per_page: String(PER_SOURCE_LIMIT),
  });
  if (apiKey) params.set("api_key", apiKey);

  const res = await fetch(`https://api.openalex.org/sources?${params.toString()}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`OpenAlex returned HTTP ${res.status}`);
  const data = await res.json();
  const items: any[] = data?.results || [];

  return items.map((item): JournalResult => {
    const topics: string[] = Array.isArray(item.topics) ? item.topics.map((t: any) => t.display_name).filter(Boolean) : [];
    const doajNote = item.is_in_doaj ? "; DOAJ-listed" : "";

    let feeStatus: string;
    if (typeof item.apc_usd === "number") {
      feeStatus = `$${item.apc_usd} USD APC (OpenAlex).`;
    } else if (item.is_oa) {
      feeStatus = "Open access; exact APC not available from OpenAlex.";
    } else {
      feeStatus = NOT_AVAILABLE("OpenAlex");
    }

    return {
      name: item.display_name || "Untitled Journal",
      publisher: item.host_organization_name || "",
      issn: normalizeIssn(item.issn_l || (Array.isArray(item.issn) ? item.issn[0] : null)),
      scopeFit: topics.length > 0 ? `Topics (OpenAlex): ${topics.join(", ")}` : "No topic data available from OpenAlex.",
      ranking: `${(item.works_count ?? 0).toLocaleString()} works, cited ${(item.cited_by_count ?? 0).toLocaleString()} times (OpenAlex)${doajNote}.`,
      feeStatus,
      submissionOpenness: NOT_AVAILABLE("OpenAlex"),
      reviewContext: NOT_AVAILABLE("OpenAlex"),
      whyFit: "Matched your search terms via OpenAlex's journal index.",
      source: "OpenAlex",
    };
  });
}

async function searchDOAJJournals(query: string): Promise<JournalResult[]> {
  const url = `https://doaj.org/api/search/journals/${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`DOAJ returned HTTP ${res.status}`);
  const data = await res.json();
  const items: any[] = (data?.results || []).slice(0, PER_SOURCE_LIMIT);

  return items.map((item): JournalResult => {
    const bibjson = item.bibjson || {};
    const subjects: string[] = Array.isArray(bibjson.subject) ? bibjson.subject.map((s: any) => s.term).filter(Boolean) : [];
    const keywords: string[] = Array.isArray(bibjson.keywords) ? bibjson.keywords : [];
    const scopeTerms = subjects.length > 0 ? subjects : keywords;

    let feeStatus: string;
    if (bibjson.apc?.has_apc && Array.isArray(bibjson.apc.max) && bibjson.apc.max[0]) {
      feeStatus = `${bibjson.apc.max[0].price} ${bibjson.apc.max[0].currency} APC (DOAJ).`;
    } else if (bibjson.apc && bibjson.apc.has_apc === false) {
      feeStatus = "No APC — diamond open access (DOAJ).";
    } else {
      feeStatus = NOT_AVAILABLE("DOAJ");
    }

    const reviewProcess: string[] = Array.isArray(bibjson.editorial?.review_process) ? bibjson.editorial.review_process : [];

    return {
      name: bibjson.title || "Untitled Journal",
      publisher: bibjson.publisher?.name || "",
      issn: normalizeIssn(bibjson.eissn || bibjson.pissn || null),
      scopeFit: scopeTerms.length > 0 ? `Subjects (DOAJ): ${scopeTerms.join(", ")}` : "No subject data available from DOAJ.",
      ranking: `DOAJ-listed open-access journal${bibjson.oa_start ? ` (open access since ${bibjson.oa_start})` : ""}.`,
      feeStatus,
      submissionOpenness:
        typeof bibjson.publication_time_weeks === "number"
          ? `~${bibjson.publication_time_weeks} weeks to first decision (DOAJ).`
          : NOT_AVAILABLE("DOAJ"),
      reviewContext: reviewProcess.length > 0 ? `${reviewProcess.join(", ")} (DOAJ).` : NOT_AVAILABLE("DOAJ"),
      whyFit: "Matched your search terms via DOAJ's open-access journal index.",
      source: "DOAJ",
    };
  });
}

function normalizeNameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Queries all three sources in parallel, tolerating individual failures, then merges
 * via round-robin interleaving and dedupes — preferring ISSN as the dedup key (an
 * exact, unique identifier for a journal) and falling back to normalized name when
 * no ISSN is available from either candidate — before capping the total returned.
 */
export async function discoverJournalCandidates(query: string): Promise<JournalDiscoveryResult> {
  const trimmedQuery = capQueryTokens(query.trim());
  if (!trimmedQuery) {
    throw new Error("Cannot search for journals without a title, keywords, or field to search for.");
  }

  const searches: Array<{ source: JournalResult["source"]; run: () => Promise<JournalResult[]> }> = [
    { source: "Crossref", run: () => searchCrossrefJournals(trimmedQuery) },
    { source: "OpenAlex", run: () => searchOpenAlexSources(trimmedQuery) },
    { source: "DOAJ", run: () => searchDOAJJournals(trimmedQuery) },
  ];

  const settled = await Promise.allSettled(searches.map((s) => s.run()));

  const perSourceResults: JournalResult[][] = [];
  const sourceErrors: string[] = [];

  settled.forEach((outcome, i) => {
    if (outcome.status === "fulfilled") {
      perSourceResults.push(outcome.value);
    } else {
      perSourceResults.push([]);
      const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      sourceErrors.push(`${searches[i].source}: ${reason}`);
    }
  });

  const merged: JournalResult[] = [];
  const maxLen = Math.max(0, ...perSourceResults.map((r) => r.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of perSourceResults) {
      if (list[i]) merged.push(list[i]);
    }
  }

  const seen = new Set<string>();
  const deduped: JournalResult[] = [];
  for (const item of merged) {
    const key = item.issn ? `issn:${item.issn}` : `name:${normalizeNameKey(item.name)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  if (deduped.length === 0 && sourceErrors.length === searches.length) {
    throw new Error(`All journal sources failed: ${sourceErrors.join("; ")}`);
  }

  return { results: deduped.slice(0, FINAL_RESULT_CAP), sourceErrors };
}
