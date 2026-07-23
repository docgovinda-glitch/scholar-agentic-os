// Stateless WHO Global Health Observatory (GHO) indicator search proxy — same
// accepted architectural exception as search-proxy/arxiv-proxy
// (.claude/HANDOVER.md's Standing Boundary Rule): fetches an outbound
// resource and returns the response, nothing else. No storage, no auth, no
// session state.
//
// GHO's OData API (ghoapi.azureedge.net) — verified directly against a live
// response before writing this — has no keyword-search parameter of its own,
// but does support OData's `contains()` filter function against
// IndicatorName server-side, which this proxy uses rather than fetching the
// full indicator catalog and filtering client-side.
//
// The Indicator endpoint returns only {IndicatorCode, IndicatorName,
// Language} — no description field exists in this metadata, so `description`
// below is honestly reported as unavailable rather than fabricated.
//
// Deploy: supabase functions deploy who-proxy
// No secret required — the GHO OData API is public and unauthenticated.

import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RESULTS = 10;

interface WhoProxyRequestBody {
  query: string;
  maxResults?: number;
}

interface WhoResult {
  id: string;
  title: string;
  url: string;
  description: string;
}

interface WhoProxyResponseBody {
  results: WhoResult[];
  error?: string;
}

function jsonResponse(body: WhoProxyResponseBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/** Escapes a value for safe embedding in an OData string literal (single quotes double per the OData spec). */
function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

const STOPWORDS = new Set(["and", "the", "of", "in", "on", "for", "to", "a", "an", "with", "is", "are"]);

/**
 * Builds an OR-combined OData filter across significant words in the query.
 * discoverDataSources (aiService.ts) passes a full composite query (title +
 * keywords) to every proxy — a single literal contains() against that whole
 * string almost never matches a short IndicatorName, so this splits it into
 * words and matches on any of them, capped at 5 to keep the filter URL sane.
 */
function buildWordFilter(query: string): string {
  const words = query
    .split(/\s+/)
    .map((w) => w.replace(/[^\w-]/g, ""))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w.toLowerCase()))
    .slice(0, 5);
  const terms = words.length > 0 ? words : [query];
  return terms.map((word) => `contains(IndicatorName,'${escapeODataString(word)}')`).join(" or ");
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  let body: WhoProxyRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ results: [], error: "Invalid request body" }, 400);
  }

  const query = body.query?.trim();
  if (!query) {
    return jsonResponse({ results: [], error: "Query is required" }, 400);
  }

  const maxResults = body.maxResults && body.maxResults > 0 ? Math.min(body.maxResults, 50) : DEFAULT_MAX_RESULTS;

  try {
    const filter = buildWordFilter(query);
    const url = `https://ghoapi.azureedge.net/api/Indicator?$filter=${encodeURIComponent(filter)}&$top=${maxResults}`;

    const whoRes = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!whoRes.ok) {
      return jsonResponse({ results: [], error: `WHO GHO API returned HTTP ${whoRes.status}` });
    }

    const data = await whoRes.json();
    const results: WhoResult[] = (Array.isArray(data.value) ? data.value : []).slice(0, maxResults).map((r: any) => ({
      id: r.IndicatorCode ?? "",
      title: r.IndicatorName ?? "",
      // Constructed from the known, stable WHO GHO indicator-detail page
      // pattern — not a URL literally returned by the API (which provides
      // none).
      url: `https://www.who.int/data/gho/data/indicators/indicator-details/GHO/${encodeURIComponent(r.IndicatorCode ?? "")}`,
      description: "",
    }));

    return jsonResponse({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ results: [], error: `WHO proxy request failed: ${message}` });
  }
});
