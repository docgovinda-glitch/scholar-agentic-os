// Stateless arXiv preprint search proxy — same accepted architectural
// exception as search-proxy (.claude/HANDOVER.md's Standing Boundary Rule):
// fetches an outbound resource and returns the response, nothing else. No
// storage, no auth, no session state.
//
// arXiv's export API (export.arxiv.org/api/query) sends no
// Access-Control-Allow-Origin header — confirmed CORS-blocked from a real
// browser fetch() (target-workflow.md §5), unlike a plain curl/server call,
// which is why this needs a proxy at all.
//
// The API returns Atom XML, not JSON. Deno's edge runtime has no built-in
// DOMParser (a browser API) and this project avoids adding an XML-DOM
// dependency for one fixed, stable, well-documented feed shape — so parsing
// below is regex-based against arXiv's actual <entry> structure (verified
// directly against a live response before writing this), the same pragmatic
// string-extraction approach this project already uses elsewhere (see
// aiService.ts's brace-extracting JSON helper) rather than a heavier parser
// dependency for a narrow, stable need.
//
// Deploy: supabase functions deploy arxiv-proxy
// No secret required — arXiv's API is public and unauthenticated.

import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RESULTS = 10;

interface ArxivProxyRequestBody {
  query: string;
  maxResults?: number;
}

interface ArxivResult {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  published: string;
  url: string;
}

interface ArxivProxyResponseBody {
  results: ArxivResult[];
  error?: string;
}

function jsonResponse(body: ArxivProxyResponseBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractTag(entryXml: string, tag: string): string {
  const match = entryXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? decodeXmlEntities(match[1]).replace(/\s+/g, " ").trim() : "";
}

function extractAuthors(entryXml: string): string[] {
  const authorBlocks = entryXml.match(/<author>[\s\S]*?<\/author>/g) || [];
  return authorBlocks
    .map((block) => extractTag(block, "name"))
    .filter((name) => name.length > 0);
}

function parseAtomFeed(xml: string): ArxivResult[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  return entries.map((entry) => {
    const id = extractTag(entry, "id");
    return {
      id,
      title: extractTag(entry, "title"),
      authors: extractAuthors(entry),
      abstract: extractTag(entry, "summary"),
      published: extractTag(entry, "published"),
      url: id,
    };
  });
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  let body: ArxivProxyRequestBody;
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
    const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(
      `all:${query}`
    )}&start=0&max_results=${maxResults}`;

    const arxivRes = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!arxivRes.ok) {
      return jsonResponse({ results: [], error: `arXiv API returned HTTP ${arxivRes.status}` });
    }

    const xml = await arxivRes.text();
    const results = parseAtomFeed(xml);

    return jsonResponse({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ results: [], error: `arXiv proxy request failed: ${message}` });
  }
});
