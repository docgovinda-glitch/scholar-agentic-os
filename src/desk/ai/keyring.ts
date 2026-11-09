/**
 * The keyring sent with each AI request: the user's AI connections in their
 * order of preference. Keys come from this device's encrypted store and travel
 * only in the `x-ai-keyring` header of /api/ai/* requests; the server uses
 * them for that request and keeps nothing.
 */
import { loadUserAiSettings, providersWithStoredKey, readProviderKey, type UserAiSettings } from "../../services/userAiSettings";
import { assembleKeyring, type KeyringEntry } from "../../platform/router/keyringAssemble";

export type { KeyringEntry } from "../../platform/router/keyringAssemble";
/** Models the user picked in AI Access, plus their known limits when the catalog had them. */
export interface ModelChoice { model: string; contextWindow?: number; maxOutputTokens?: number }

/**
 * Every AI connection on this device, primary first (see `assembleKeyring`, shared
 * with the server so both build the same keyring from the same settings).
 */
export async function buildKeyring(
  settings?: UserAiSettings,
  storedProviders: string[] = providersWithStoredKey(),
  readKey: (id: string) => Promise<string | null> = readProviderKey,
): Promise<KeyringEntry[]> {
  const s = settings ?? (await loadUserAiSettings());
  const keys = new Map<string, string | null>();
  for (const id of [s.provider, ...storedProviders]) if (id && !keys.has(id)) keys.set(id, await readKey(id));
  return assembleKeyring(s, storedProviders.includes(s.provider) ? storedProviders : [s.provider, ...storedProviders], (id) => keys.get(id));
}

export const encodeKeyring = (entries: KeyringEntry[]): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(entries));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
