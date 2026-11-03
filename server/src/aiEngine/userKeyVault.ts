/**
 * A user's own provider API keys, saved to their account so every device
 * they sign in on can use them (the owner's choice; before, keys stayed in
 * the browser where they were typed).
 *
 * Same envelope as credentialVault.ts: a fresh content-encryption key per
 * key, wrapped under the server-held MASTER_KEY. The database alone yields
 * nothing without MASTER_KEY, which is never stored in it.
 *
 * Server-only. Every function takes the signed-in user's id and scopes every
 * query by it. Plaintext is returned only by `readUserKeys`, to that same
 * user, so their browser can use the keys; it is never logged.
 */

import { decryptToString, encrypt, generateCEK, getMasterKeyFromEnv, unwrapKey, wrapKey } from "../../../src/services/crypto/crypto";
import type { EncryptedPayload } from "../../../src/services/crypto/types";
import { getCloudProvider } from "../../../src/config/providerCatalog";
import { getSupabaseRestConfig, SupabaseTable } from "../supabaseRest";

interface KeyRow extends Record<string, unknown> {
  user_id: string;
  provider_id: string;
  encrypted_cek: EncryptedPayload;
  encrypted_key: EncryptedPayload;
  masked_preview: string;
  created_at: string;
  updated_at: string;
}

export interface SavedKeySummary {
  providerId: string;
  maskedPreview: string;
  updatedAt: string;
}

export interface SavedKey {
  providerId: string;
  apiKey: string;
  updatedAt: string;
}

export class UserKeyError extends Error {}

function table() {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");
  return new SupabaseTable<KeyRow>(config, "user_provider_keys");
}

const uidFilter = (userId: string) => `user_id=eq.${encodeURIComponent(userId)}`;

/** Only cloud providers in the catalogue take keys; local runners have none. */
export function checkProviderId(providerId: string): void {
  if (!getCloudProvider(providerId)) throw new UserKeyError(`Unknown provider "${providerId}".`);
}

/** Rejects empty, oversized or multi-line values before anything is stored. */
export function checkKeyShape(apiKey: unknown): string {
  if (typeof apiKey !== "string") throw new UserKeyError("The key must be text.");
  const key = apiKey.trim();
  if (key.length < 8) throw new UserKeyError("That key is too short.");
  if (key.length > 1024) throw new UserKeyError("That key is too long.");
  if (/\s/.test(key)) throw new UserKeyError("A key cannot contain spaces or line breaks.");
  return key;
}

/** Fails early (and closed) when the server has no MASTER_KEY. */
export function vaultAvailable(): boolean {
  try {
    getMasterKeyFromEnv();
    return true;
  } catch {
    return false;
  }
}

/** Metadata only; never touches the encrypted columns. */
export async function listUserKeys(userId: string): Promise<SavedKeySummary[]> {
  const rows = await table().select(`select=provider_id,masked_preview,updated_at&${uidFilter(userId)}&order=provider_id`);
  return rows.map((r) => ({ providerId: r.provider_id, maskedPreview: r.masked_preview, updatedAt: r.updated_at }));
}

export async function saveUserKey(userId: string, providerId: string, apiKey: string): Promise<SavedKeySummary> {
  checkProviderId(providerId);
  const key = checkKeyShape(apiKey);
  const masterKey = getMasterKeyFromEnv();
  const cek = generateCEK();
  const updatedAt = new Date().toISOString();
  const maskedPreview = `••••${key.slice(-4)}`;
  await table().upsert(
    {
      user_id: userId,
      provider_id: providerId,
      encrypted_cek: wrapKey(cek, masterKey),
      encrypted_key: encrypt(key, cek),
      masked_preview: maskedPreview,
      updated_at: updatedAt,
    },
    "user_id,provider_id"
  );
  return { providerId, maskedPreview, updatedAt };
}

/**
 * The user's own keys in plaintext, for their own browser. A row that cannot
 * be decrypted (for example after a MASTER_KEY rotation) is left out rather
 * than failing every other key.
 */
export async function readUserKeys(userId: string): Promise<SavedKey[]> {
  const masterKey = getMasterKeyFromEnv();
  const rows = await table().select(`${uidFilter(userId)}&order=provider_id`);
  const out: SavedKey[] = [];
  for (const row of rows) {
    if (row.user_id !== userId) continue;
    try {
      const cek = unwrapKey(row.encrypted_cek, masterKey);
      out.push({ providerId: row.provider_id, apiKey: decryptToString(row.encrypted_key, cek), updatedAt: row.updated_at });
    } catch {
      /* unreadable row: skipped, see above */
    }
  }
  return out;
}

export async function deleteUserKey(userId: string, providerId: string): Promise<void> {
  await table().delete(`${uidFilter(userId)}&provider_id=eq.${encodeURIComponent(providerId)}`);
}
