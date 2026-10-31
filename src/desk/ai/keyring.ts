/**
 * The keyring sent with each AI request: the user's AI connections in their
 * order of preference. Keys come from this device's encrypted store and travel
 * only in the `x-ai-keyring` header of /api/ai/* requests; the server uses
 * them for that request and keeps nothing.
 */
import { loadUserAiSettings, providersWithStoredKey, readProviderKey, type UserAiSettings } from "../../services/userAiSettings";
import type { ProviderId } from "../../platform/router/types";

export interface KeyringEntry {
  provider: ProviderId;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  label?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
}

/** Catalog ids (AI Access) → router provider ids. */
const CLOUD: Record<string, ProviderId> = { openai: "openai", anthropic: "anthropic", gemini: "google", google: "google", groq: "groq", deepseek: "deepseek", mistral: "mistral" };
const LOCAL: Record<string, ProviderId> = { ollama: "ollama", lmstudio: "lmstudio" };

/** Models the user picked in AI Access, plus their known limits when the catalog had them. */
export interface ModelChoice { model: string; contextWindow?: number; maxOutputTokens?: number }

export async function buildKeyring(
  settings?: UserAiSettings,
  storedProviders: string[] = providersWithStoredKey(),
  readKey: (id: string) => Promise<string | null> = readProviderKey,
): Promise<KeyringEntry[]> {
  const s = settings ?? (await loadUserAiSettings());
  const prefs = s.preferences ?? {};
  const pick = (id: string): ModelChoice | null => {
    const model = prefs[`${id}Model`];
    if (!model) return null;
    const ctx = Number(prefs[`${id}ContextWindow`]);
    const out = Number(prefs[`${id}MaxOutput`]);
    return { model, contextWindow: Number.isFinite(ctx) && ctx > 0 ? ctx : undefined, maxOutputTokens: Number.isFinite(out) && out > 0 ? out : undefined };
  };

  // Primary provider first, then every other provider with a key on this device.
  const order = [s.provider, ...storedProviders.filter((p) => p !== s.provider)];
  const entries: KeyringEntry[] = [];
  for (const id of order) {
    const provider = CLOUD[id];
    if (!provider) continue;
    const key = await readKey(id);
    const choice = pick(id);
    if (!key || !choice) continue;
    entries.push({ provider, apiKey: key, ...choice, ...(prefs[`${id}Endpoint`] ? { baseUrl: prefs[`${id}Endpoint`] } : {}) });
  }
  // A local model goes last: it is the fallback that works offline.
  for (const id of Object.keys(LOCAL)) {
    const choice = pick(id);
    if (!choice) continue;
    if (id !== s.provider && !prefs[`${id}Enabled`]) continue;
    entries.push({ provider: LOCAL[id], ...choice, ...(prefs[`${id}Endpoint`] ? { baseUrl: prefs[`${id}Endpoint`] } : {}) });
  }
  return entries;
}

export const encodeKeyring = (entries: KeyringEntry[]): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(entries));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
