/**
 * The keyring sent with each AI request: the user's AI connections in their
 * order of preference. Keys come from this device's encrypted store and travel
 * only in the `x-ai-keyring` header of /api/ai/* requests; the server uses
 * them for that request and keeps nothing.
 */
import { loadUserAiSettings, providersWithStoredKey, readProviderKey, type UserAiSettings } from "../../services/userAiSettings";
import type { ProviderId } from "../../platform/router/types";
import { syncKeysWithAccount } from "../aiAccess/accountKeys";

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
const CLOUD: Record<string, ProviderId> = {
  openai: "openai",
  anthropic: "anthropic",
  claude: "anthropic",
  gemini: "google",
  google: "google",
  groq: "groq",
  deepseek: "deepseek",
  mistral: "mistral",
};
const LOCAL: Record<string, ProviderId> = { ollama: "ollama", lmstudio: "lmstudio" };

/** The router provider for an AI Access catalog id, if it has one. */
export const routerProviderFor = (catalogId: string): ProviderId | undefined => CLOUD[catalogId] ?? LOCAL[catalogId];

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
 * This device's AI connections, in order. On a device where nothing is set up
 * yet (a new sign-in), the account's saved keys are pulled once first, so AI
 * Access configured on another device works here without a visit to settings.
 */
export async function buildKeyring(
  settings?: UserAiSettings,
  storedProviders?: string[],
  readKey: (id: string) => Promise<string | null> = readProviderKey,
): Promise<KeyringEntry[]> {
  const ring = await buildKeyringFromDevice(settings, storedProviders ?? providersWithStoredKey(), readKey);
  if (ring.length > 0 || settings || storedProviders) return ring;
  const synced = await syncKeysWithAccount(30_000).catch(() => null);
  if (!synced || (synced.pulled.length === 0 && synced.removed.length === 0)) return ring;
  return buildKeyringFromDevice(undefined, providersWithStoredKey(), readKey);
}

async function buildKeyringFromDevice(
  settings: UserAiSettings | undefined,
  storedProviders: string[],
  readKey: (id: string) => Promise<string | null>,
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

  // Primary provider first, then every other provider with a key on this device.
  const order = [s.provider, ...storedProviders.filter((p) => p !== s.provider)];
  const entries: KeyringEntry[] = [];
  for (const id of order) {
    const provider = CLOUD[id];
    if (!provider) continue;
    const rawKey = await readKey(id);
    const key = rawKey ? rawKey.replace(/^\s*bearer\s+/i, "").replace(/[^\x21-\x7E]/g, "").trim() : null;
    const choice = pick(id);
    if (!key || !choice) continue;
    const endpoint = prefs[`${id}Endpoint`] || prefs[`${id}BaseUrl`];
    const cleanBase = endpoint ? endpoint.replace(/[^\x20-\x7E]/g, "").trim() : "";
    entries.push({ provider, apiKey: key, ...choice, ...(cleanBase ? { baseUrl: cleanBase } : {}) });
  }
  // A local model goes last: it is the fallback that works offline.
  for (const id of Object.keys(LOCAL)) {
    const choice = pick(id);
    if (!choice) continue;
    if (id !== s.provider && !prefs[`${id}Enabled`]) continue;
    const endpoint = prefs[`${id}Endpoint`] || prefs[`${id}BaseUrl`];
    const cleanBase = endpoint ? endpoint.replace(/[^\x20-\x7E]/g, "").trim() : "";
    entries.push({ provider: LOCAL[id], ...choice, ...(cleanBase ? { baseUrl: cleanBase } : {}) });
  }
  return entries;
}

export const encodeKeyring = (entries: KeyringEntry[]): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(entries));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Providers that have a key on this device but no chosen model, so they are not used yet. */
export async function connectionsNeedingModel(settings?: UserAiSettings): Promise<string[]> {
  const s = settings ?? (await loadUserAiSettings());
  return providersWithStoredKey().filter((id) => (CLOUD[id] ?? undefined) && !cleanModelChoice(s.preferences?.[`${id}Model`] ?? ""));
}
