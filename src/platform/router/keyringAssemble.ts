/**
 * Turns a person's AI settings (default provider + per-provider preferences)
 * and their keys into the keyring the router uses. Pure, so the browser (keys
 * from this device) and the server (keys from the person's encrypted account
 * vault) build the same keyring from the same inputs: that is what makes AI
 * Access work identically on every device after sign-in.
 *
 * No model name appears here: a provider with a key but no saved model is
 * included as "auto" and the server picks from the provider's live list.
 */
import { resolveRouterTarget } from "./providerMap";
import type { ProviderId } from "./types";

export interface KeyringEntry {
  provider: ProviderId;
  /** The catalog provider this is (e.g. "openrouter"); `provider` is only its wire protocol. */
  via?: string;
  /** A model id, or "auto": the server then uses the best model the provider lists live. */
  model: string;
  apiKey?: string;
  baseUrl?: string;
  label?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
}

export interface AssembleSettings { provider: string; preferences?: Record<string, string> }

const LOCAL: Record<string, ProviderId> = { ollama: "ollama", lmstudio: "lmstudio" };
/** The server accepts at most this many connections per request. */
export const MAX_KEYRING_ENTRIES = 8;

export function cleanModelChoice(rawModel: string): string {
  const stripped = rawModel
    .split(/\s*(?:—|–|—|–|·)\s*/)[0]
    .replace(/\s*\((?:Live Discovered|deprecated|preview|unverified)\)\s*$/i, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
  return stripped || rawModel.replace(/[^\x20-\x7E]/g, "").trim();
}

export const cleanApiKey = (raw: string | null | undefined): string | null => {
  const key = raw ? raw.replace(/^\s*bearer\s+/i, "").replace(/[^\x21-\x7E]/g, "").trim() : "";
  return key || null;
};

/**
 * `keyOf` returns the key for a catalog provider id (or null). Order: the
 * default provider first, then the other providers that have a key, then
 * enabled local runners (the offline fallback).
 */
export function assembleKeyring(settings: AssembleSettings, providersWithKey: string[], keyOf: (id: string) => string | null | undefined): KeyringEntry[] {
  const prefs = settings.preferences ?? {};
  const pick = (id: string) => {
    const rawModel = prefs[`${id}Model`];
    if (!rawModel) return null;
    const model = cleanModelChoice(rawModel);
    if (!model) return null;
    const ctx = Number(prefs[`${id}ContextWindow`]);
    const out = Number(prefs[`${id}MaxOutput`]);
    return { model, contextWindow: Number.isFinite(ctx) && ctx > 0 ? ctx : undefined, maxOutputTokens: Number.isFinite(out) && out > 0 ? out : undefined };
  };
  const endpointOf = (id: string) => {
    const endpoint = prefs[`${id}Endpoint`] || prefs[`${id}BaseUrl`];
    return endpoint ? endpoint.replace(/[^\x20-\x7E]/g, "").trim() : "";
  };

  const order = [settings.provider, ...providersWithKey.filter((p) => p !== settings.provider)];
  const entries: KeyringEntry[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    if (!id || LOCAL[id]) continue;
    const key = cleanApiKey(keyOf(id));
    if (!key) continue;
    const target = resolveRouterTarget(id, endpointOf(id));
    if (!target.ok || seen.has(target.target.via)) continue; // e.g. Cloudflare without its address
    seen.add(target.target.via);
    const choice = pick(id);
    entries.push({
      provider: target.target.provider,
      via: target.target.via,
      apiKey: key,
      model: choice?.model ?? "auto",
      ...(choice?.contextWindow ? { contextWindow: choice.contextWindow } : {}),
      ...(choice?.maxOutputTokens ? { maxOutputTokens: choice.maxOutputTokens } : {}),
      ...(target.target.baseUrl ? { baseUrl: target.target.baseUrl } : {}),
    });
  }
  for (const id of Object.keys(LOCAL)) {
    const choice = pick(id);
    if (!choice) continue;
    if (id !== settings.provider && !prefs[`${id}Enabled`]) continue;
    const cleanBase = endpointOf(id);
    entries.push({ provider: LOCAL[id], model: choice.model, ...(choice.contextWindow ? { contextWindow: choice.contextWindow } : {}), ...(choice.maxOutputTokens ? { maxOutputTokens: choice.maxOutputTokens } : {}), ...(cleanBase ? { baseUrl: cleanBase } : {}) });
  }
  return entries.slice(0, MAX_KEYRING_ENTRIES);
}
