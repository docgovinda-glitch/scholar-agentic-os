// Stateless IMF DataMapper indicator search proxy — same accepted
// architectural exception as search-proxy/arxiv-proxy/who-proxy
// (.claude/HANDOVER.md's Standing Boundary Rule): fetches an outbound
// resource and returns the response, nothing else. No storage, no auth, no
// session state.
//
// IMF's DataMapper API (imf.org/external/datamapper/api/v1) — verified
// directly against a live response before writing this — has no
// keyword-search endpoint at all; its only indicator-listing endpoint
// (/indicators) returns the full catalog (~a few hundred indicators) keyed
// by code, each with {label, description, source, unit, dataset,
// last-modified}. This proxy fetches that full catalog and filters
// server-side by keyword against label + description, the same
// no-server-side-search limitation already disclosed for OECD/World Bank
// elsewhere in this project (literatureRetrievalService.ts).
//
// `url` below links to the indicator's own machine-readable DataMapper API
// resource (a real, guaranteed-valid endpoint) rather than a constructed
// human-browsing URL — DataMapper's indicator detail pages are
// dataset/group-specific in a way that isn't safe to generalize across every
// indicator without risking a broken link, so the honest choice here is the
// same one already made for OECD's raw SDMX endpoint.
//
// Deploy: supabase functions deploy imf-proxy
// No secret required — the DataMapper API is public and unauthenticated.

import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const REQUEST_TIMEOUT_MS = 10000;
const MAX_RESULTS = 10;

interface ImfProxyRequestBody {
  query: string;
}

interface ImfResult {
  id: string;
  title: string;
  url: string;
  description: string;
}

interface ImfProxyResponseBody {
  results: ImfResult[];
  error?: string;
}

function jsonResponse(body: ImfProxyResponseBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/** IMF's description field sometimes embeds raw HTML (e.g. <a href=...> links) — stripped for a clean plain-text snippet. */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

const STOPWORDS = new Set(["and", "the", "of", "in", "on", "for", "to", "a", "an", "with", "is", "are"]);

/**
 * discoverDataSources (aiService.ts) passes a full composite query (title +
 * keywords) to every proxy — a literal substring match of that whole string
 * almost never matches a short indicator label, so this splits the query
 * into significant words and matches an indicator if ANY of them appears in
 * its label or description.
 */
function significantWords(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\w-]/g, ""))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return words.length > 0 ? words : [query.toLowerCase()];
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  let body: ImfProxyRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ results: [], error: "Invalid request body" }, 400);
  }

  const query = body.query?.trim();
  if (!query) {
    return jsonResponse({ results: [], error: "Query is required" }, 400);
  }

  try {
    const imfRes = await fetch("https://www.imf.org/external/datamapper/api/v1/indicators", {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!imfRes.ok) {
      return jsonResponse({ results: [], error: `IMF DataMapper API returned HTTP ${imfRes.status}` });
    }

    const data = await imfRes.json();
    const indicators = data?.indicators && typeof data.indicators === "object" ? data.indicators : {};
    const words = significantWords(query);

    const results: ImfResult[] = Object.entries(indicators)
      .filter(([, meta]: [string, any]) => {
        const label = String(meta?.label ?? "").toLowerCase();
        const description = String(meta?.description ?? "").toLowerCase();
        return words.some((word) => label.includes(word) || description.includes(word));
      })
      .slice(0, MAX_RESULTS)
      .map(([code, meta]: [string, any]) => ({
        id: code,
        title: String(meta?.label ?? "").trim(),
        url: `https://www.imf.org/external/datamapper/api/v1/${encodeURIComponent(code)}`,
        description: stripHtml(String(meta?.description ?? "")),
      }));

    return jsonResponse({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ results: [], error: `IMF proxy request failed: ${message}` });
  }
});
