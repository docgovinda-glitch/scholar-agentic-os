/**
 * The signed-in person's own AI connections, read from their account: the keys
 * they saved (encrypted at rest under MASTER_KEY, see aiEngine/userKeyVault.ts)
 * and their AI Access settings (default provider, chosen models).
 *
 * Why: the browser attaches this device's keys to each AI request, but a device
 * that has not synced yet (a new browser, a phone, a cleared cache) has none.
 * With this, the first request after sign-in on any device already uses the
 * person's connections. Keys are the person's own, read only for their own
 * requests, held in memory for 60 seconds and never logged or returned.
 */
import { assembleKeyring, type KeyringEntry } from "../../../src/platform/router/keyringAssemble.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../supabaseRest.ts";
import { readUserKeys, vaultAvailable } from "../aiEngine/userKeyVault.ts";

interface SettingsRow extends Record<string, unknown> { user_id: string; provider: string | null; preferences: Record<string, string> | null }
export interface AccountAiSource { load(userId: string): Promise<{ settings: { provider: string; preferences: Record<string, string> }; keys: Array<{ providerId: string; apiKey: string }> } | null> }

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; entries: KeyringEntry[] }>();

const defaultSource: AccountAiSource = {
  async load(userId) {
    if (!vaultAvailable()) return null;
    const config = getSupabaseRestConfig();
    if (!config) return null;
    const [keys, row] = await Promise.all([
      readUserKeys(userId),
      new SupabaseTable<SettingsRow>(config, "user_ai_settings").selectOne(`user_id=eq.${encodeURIComponent(userId)}`).catch(() => undefined),
    ]);
    return { settings: { provider: row?.provider ?? "gemini", preferences: row?.preferences ?? {} }, keys: keys.map((k) => ({ providerId: k.providerId, apiKey: k.apiKey })) };
  },
};
let source: AccountAiSource = defaultSource;
export function setAccountAiSource(s: AccountAiSource | undefined): void { source = s ?? defaultSource; cache.clear(); }
export function clearAccountKeyring(userId?: string): void { if (userId) cache.delete(userId); else cache.clear(); }

/** The person's connections from their account; empty when none, or when the account vault is off. Never throws. */
export async function accountKeyring(userId: string | undefined): Promise<KeyringEntry[]> {
  if (!userId) return [];
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.entries;
  let entries: KeyringEntry[] = [];
  try {
    const loaded = await source.load(userId);
    if (loaded) {
      const byId = new Map(loaded.keys.map((k) => [k.providerId, k.apiKey]));
      entries = assembleKeyring(loaded.settings, [...byId.keys()], (id) => byId.get(id));
    }
  } catch {
    entries = []; // the account being unreachable must never fail a request that has other connections
  }
  cache.set(userId, { at: Date.now(), entries });
  return entries;
}
