/**
 * The keyring sent with each AI request: the user's AI connections in their
 * order of preference. Keys come from this device's encrypted store and travel
 * only in the `x-ai-keyring` header of /api/ai/* requests; the server uses
 * them for that request and keeps nothing.
 */
import { loadUserAiSettings, providersWithStoredKey, readProviderKey, type UserAiSettings } from "../../services/userAiSettings";
import { resolveRouterTarget } from "../../platform/router/providerMap";
import type { ProviderId } from "../../platform/router/types";

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

const LOCAL: Record<string, ProviderId> = { ollama: "ollama", lmstudio: "lmstudio" };
/** The server accepts at most this many connections per request. */
const MAX_ENTRIES = 8;

function cleanModelChoice(rawModel: string): string {
  const stripped = rawModel
    .split(/\s*(?:—|–|\u2014|\u2013|\u00B7)\s*/)[0]
    .replace(/\s*\((?:Live Discovered|deprecated|preview|unverified)\)\s*$/i, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
  return stripped || rawModel.replace(/[^\x20-\x7E]/g, "").trim();
}

/** Models the user picked in AI Access, plus their known limits when the catalog had them. */
export interface ModelChoice { model: string; contextWindow?: number; maxOutputTokens?: number }

/**
 * Every AI connection on this device, primary first. A provider with a key but
 * no saved model is still included, as "auto": the server picks the best model
 * the provider lists live instead of this code naming one.
 */
export async function buildKeyring(
  settings?: UserAiSettings,
  storedProviders: string[] = providersWithStoredKey(),
  readKey: (id: string) => Promise<string | null> = readProviderKey,
): Promise<KeyringEntry[]> {
  const s = settings ?? (await loadUserAiSettings());
  const prefs = s.preferences ?? {};
  const pick = (id: string): ModelChoice | null => {
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

  // Primary provider first, then every other provider with a key on this device.
  const order = [s.provider, ...storedProviders.filter((p) => p !== s.provider)];
  const entries: KeyringEntry[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    if (!id || LOCAL[id]) continue;
    const rawKey = await readKey(id);
    const key = rawKey ? rawKey.replace(/^\s*bearer\s+/i, "").replace(/[^\x21-\x7E]/g, "").trim() : null;
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
  // A local model goes last: it is the fallback that works offline.
  for (const id of Object.keys(LOCAL)) {
    const choice = pick(id);
    if (!choice) continue;
    if (id !== s.provider && !prefs[`${id}Enabled`]) continue;
    const cleanBase = endpointOf(id);
    entries.push({ provider: LOCAL[id], ...choice, ...(cleanBase ? { baseUrl: cleanBase } : {}) });
  }
  return entries.slice(0, MAX_ENTRIES);
}

export const encodeKeyring = (entries: KeyringEntry[]): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(entries));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
