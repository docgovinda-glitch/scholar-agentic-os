/**
 * The keyring sent with each AI request: the user's AI connections in their
 * order of preference. Keys come from this device's encrypted store and travel
 * only in the `x-ai-keyring` header of /api/ai/* requests; the server uses
 * them for that request and keeps nothing.
 */
import { loadUserAiSettings, providersWithStoredKey, readProviderKey, type UserAiSettings } from "../../services/userAiSettings";
import { assembleKeyring, type KeyringEntry } from "../../platform/router/keyringAssemble";
import { manualRouting } from "../../platform/router/privacyPolicy";
import { ROUTING_HEADER, ROUTING_MANUAL } from "../../platform/router/taskAffinity";

export type { KeyringEntry } from "../../platform/router/keyringAssemble";

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

/** Routing choices that travel with the keyring: "Use my order exactly" turns task-aware ordering off on the server. */
export const routingHeaders = (preferences: Record<string, string> | undefined): Record<string, string> =>
  manualRouting(preferences) ? { [ROUTING_HEADER]: ROUTING_MANUAL } : {};

let rotateNextRequest = false;

/** The next AI request tries the following configured connection first (one request only). */
export function requestNextModelOnce(): void {
  rotateNextRequest = true;
}

/** Moves the primary connection to the back so the next one leads. Pure. */
export function rotateKeyring<T>(ring: T[]): T[] {
  return ring.length > 1 ? [...ring.slice(1), ring[0]] : ring;
}

/** This device's keyring and the headers that carry it (and the routing choice), from one read of the person's settings. */
export async function aiRequestParts(): Promise<{ ring: KeyringEntry[]; headers: Record<string, string> }> {
  const settings = await loadUserAiSettings();
  let ring = await buildKeyring(settings);
  let routing = routingHeaders(settings.preferences);
  if (rotateNextRequest) {
    rotateNextRequest = false;
    if (ring.length > 1) {
      ring = rotateKeyring(ring);
      routing = { ...routing, [ROUTING_HEADER]: ROUTING_MANUAL };
    }
  }
  return { ring, headers: { ...(ring.length ? { "x-ai-keyring": encodeKeyring(ring) } : {}), ...routing } };
}
