/**
 * Maps an AI Access catalog provider (any of the 37 in `providerCatalog.ts`) to
 * the router's wire protocol. The router speaks six native protocols plus
 * "custom" (any OpenAI-compatible endpoint), so every catalog provider is
 * reachable without a per-provider adapter:
 *
 *   gemini → google · claude → anthropic · openai / groq / deepseek / mistral → native
 *   every other OpenAI-compatible catalog entry → "custom" with the catalog base URL
 *   cohere → "custom" on Cohere's OpenAI-compatibility endpoint
 *
 * `via` keeps the catalog id so two "custom" providers never share a circuit
 * breaker, a cache entry or a candidate id.
 *
 * Pure: imported by the browser (keyring) and the server (headers, guard).
 */
import { getCloudProvider } from "../../config/providerCatalog";
import { normalizeBaseUrl } from "./baseUrl";
import type { ProviderId } from "./types";

const NATIVE: Record<string, ProviderId> = {
  gemini: "google", google: "google",
  claude: "anthropic", anthropic: "anthropic",
  openai: "openai", groq: "groq", deepseek: "deepseek", mistral: "mistral",
};

/** Cohere's OpenAI-compatible chat endpoint (its own /v1/chat is a different wire format). */
export const COHERE_COMPAT_BASE = "https://api.cohere.ai/compatibility/v1";

export interface RouterTarget {
  provider: ProviderId;
  /** Absent for native providers that use their own default host. */
  baseUrl?: string;
  /** The catalog id this target came from. */
  via: string;
  /** Provider display name, for labels. */
  name: string;
}

export type TargetResult = { ok: true; target: RouterTarget } | { ok: false; reason: string };

/**
 * `baseUrlOverride` is the address the user typed for this provider (needed for
 * Cloudflare, optional elsewhere). Returns a reason when the provider cannot be
 * reached yet, never a guess.
 */
export function resolveRouterTarget(catalogId: string, baseUrlOverride?: string): TargetResult {
  const id = catalogId.toLowerCase();
  const spec = getCloudProvider(id);
  // A typed address is tidied (full endpoint cut back to its base); one that cannot be used is ignored here
  // and reported by the caller that saves it (see normalizeBaseUrl), never guessed at.
  const typed = baseUrlOverride?.trim();
  const cleaned = typed ? normalizeBaseUrl(typed, { allowLoopbackHttp: false }) : undefined;
  if (typed && cleaned && !cleaned.ok) return { ok: false, reason: cleaned.reason };
  const override = cleaned && cleaned.ok ? cleaned.url : undefined;
  const native = NATIVE[id];
  if (native) return { ok: true, target: { provider: native, baseUrl: override, via: spec?.id ?? id, name: spec?.name ?? id } };
  if (!spec) return override ? { ok: true, target: { provider: "custom", baseUrl: override, via: id, name: id } } : { ok: false, reason: `"${catalogId}" is not a known provider` };
  if (spec.apiStyle === "cohere") return { ok: true, target: { provider: "custom", baseUrl: override ?? COHERE_COMPAT_BASE, via: spec.id, name: spec.name } };
  const baseUrl = override ?? (spec.baseUrl || undefined);
  if (!baseUrl) return { ok: false, reason: `${spec.name} needs your own endpoint address${spec.customBaseUrlHint ? ` (${spec.customBaseUrlHint})` : ""}` };
  return { ok: true, target: { provider: "custom", baseUrl, via: spec.id, name: spec.name } };
}
