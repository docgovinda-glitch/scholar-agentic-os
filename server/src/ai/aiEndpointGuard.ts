/**
 * Server-side guard for AI endpoints a user names (a custom OpenAI-compatible
 * base URL in their keyring). The server must never be steered into calling
 * its own network: localhost, private ranges, cloud metadata.
 *
 * - The providers' own API hosts go straight through.
 * - Any other endpoint must be https, and its host must resolve only to public
 *   addresses (`validateSafeUrl`).
 * - The connection is pinned to the addresses that were checked, so a DNS
 *   answer that changes between the check and the connect (rebinding) fails.
 * - Redirects are not followed.
 *
 * Fail-closed. `ALLOW_PRIVATE_AI_ENDPOINTS=true` lifts it for a self-hosted
 * install that runs its model server on the same network.
 */
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import { createRebindingSafeLookup, validateSafeUrl } from "../../utils/ssrfGuard.ts";
import type { Candidate, ProviderAdapter, ProviderId } from "../../../src/platform/router/types.ts";
import { defaultAdapters, ollamaAdapter, openAiCompatibleAdapter } from "../../../src/platform/router/adapters.ts";
import { serverCanReachLocalModels } from "./clientAiConfig.ts";
import { CLOUD_PROVIDERS } from "../../../src/config/providerCatalog.ts";
import { COHERE_COMPAT_BASE } from "../../../src/platform/router/providerMap.ts";

const hostOf = (u: string): string | undefined => { try { return new URL(u).hostname; } catch { return undefined; } };

/**
 * The AI providers' own public API hosts: every provider in the catalog (so all
 * of them work without a DNS check per call) plus Cohere's two. A provider that
 * needs the user's own address (Cloudflare) contributes nothing: its address is
 * screened like any custom endpoint.
 */
export const PROVIDER_API_HOSTS: ReadonlySet<string> = new Set([
  "api.openai.com",
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
  "api.groq.com",
  "api.deepseek.com",
  "api.mistral.ai",
  "api.cohere.com",
  hostOf(COHERE_COMPAT_BASE),
  ...(CLOUD_PROVIDERS as ReadonlyArray<{ baseUrl: string; requiresCustomBaseUrl?: boolean }>).filter((p) => !p.requiresCustomBaseUrl).map((p) => hostOf(p.baseUrl)),
].filter((h): h is string => Boolean(h)));

export const allowPrivateAiEndpoints = () => process.env.ALLOW_PRIVATE_AI_ENDPOINTS === "true";

export class AiEndpointBlockedError extends Error {
  constructor(reason: string) {
    super(`This AI endpoint can't be used: ${reason}`);
    this.name = "AiEndpointBlockedError";
  }
}

export type EndpointCheck = { ok: true; pinnedIps?: string[] } | { ok: false; reason: string };

export async function checkAiEndpoint(rawUrl: string): Promise<EndpointCheck> {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return { ok: false, reason: "the address is not a valid URL" }; }
  if (url.protocol === "https:" && PROVIDER_API_HOSTS.has(url.hostname)) return { ok: true };
  if (allowPrivateAiEndpoints()) return { ok: true };
  if (url.protocol !== "https:") return { ok: false, reason: "custom endpoints must use https" };
  if (url.username || url.password) return { ok: false, reason: "put the key in the key field, not in the address" };
  const v = await validateSafeUrl(url.href);
  if (!v.safe) return { ok: false, reason: "it points to a private or internal address" };
  return { ok: true, pinnedIps: v.resolvedIps };
}

/**
 * Drops server-run candidates whose endpoint fails the check. Each drop is
 * returned with its reason so the caller can tell the user.
 */
export async function screenCandidates(candidates: Candidate[]): Promise<{ kept: Candidate[]; blocked: Array<{ label: string; reason: string }> }> {
  const kept: Candidate[] = [];
  const blocked: Array<{ label: string; reason: string }> = [];
  for (const c of candidates) {
    const baseUrl = c.credential?.baseUrl;
    // Local runners on the server are governed by serverCanReachLocalModels (serverAdapters).
    if (c.runsIn !== "server" || !baseUrl || c.lane === "local") { kept.push(c); continue; }
    const check = await checkAiEndpoint(baseUrl);
    if (check.ok) kept.push(c);
    else blocked.push({ label: c.label, reason: check.reason });
  }
  return { kept, blocked };
}

function requestUrl(input: Parameters<typeof fetch>[0]): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

/** `fetch` for server-side AI calls: provider hosts pass, anything else is checked and pinned. */
export function createAiFetch(baseFetch: typeof fetch = fetch): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.protocol === "https:" && PROVIDER_API_HOSTS.has(url.hostname)) return baseFetch(input, init);
    if (allowPrivateAiEndpoints()) return baseFetch(input, init);
    const check = await checkAiEndpoint(url.href);
    if (!check.ok) throw new AiEndpointBlockedError(check.reason);
    return pinnedRequest(url, init, new Set(check.pinnedIps ?? []));
  }) as typeof fetch;
}

function pinnedRequest(url: URL, init: RequestInit | undefined, allowedIps: Set<string>): Promise<Response> {
  const body = init?.body;
  if (body !== undefined && body !== null && typeof body !== "string") {
    return Promise.reject(new AiEndpointBlockedError("unsupported request body"));
  }
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
  const lib = url.protocol === "https:" ? https : http;

  return new Promise<Response>((resolve, reject) => {
    const req = lib.request(url, {
      method: init?.method ?? "GET",
      headers,
      lookup: createRebindingSafeLookup(allowedIps) as unknown as typeof import("node:dns").lookup,
      signal: init?.signal ?? undefined,
    }, (res) => {
      const resHeaders = new Headers();
      for (const [k, v] of Object.entries(res.headers)) {
        if (typeof v === "string") resHeaders.set(k, v);
        else if (Array.isArray(v)) resHeaders.set(k, v.join(", "));
      }
      const status = res.statusCode ?? 502;
      const nullBody = status === 204 || status === 304;
      if (nullBody) res.resume();
      resolve(new Response(nullBody ? null : (Readable.toWeb(res) as ReadableStream<Uint8Array>), { status, headers: resHeaders }));
    });
    req.on("error", reject);
    if (typeof body === "string") req.write(body);
    req.end();
  });
}

/**
 * Adapters for server-side calls. Cloud providers use the guarded fetch.
 * Local runners (Ollama, LM Studio) run on the server only where it can reach
 * them: development, or a self-hosted install that set
 * ALLOW_SERVER_LOCAL_AI=true. Anywhere else such a call is refused; the
 * router hands local models to the user's browser instead.
 */
export function serverAdapters(baseFetch: typeof fetch = fetch): Partial<Record<ProviderId, ProviderAdapter>> {
  const localFetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    serverCanReachLocalModels()
      ? baseFetch(input, init)
      : Promise.reject(new AiEndpointBlockedError("this server can't reach a model on your computer"))) as typeof fetch;
  return {
    ...defaultAdapters(createAiFetch(baseFetch)),
    lmstudio: openAiCompatibleAdapter(localFetch),
    ollama: ollamaAdapter(localFetch),
  };
}
