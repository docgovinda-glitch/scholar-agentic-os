/**
 * Platform (Premium-pool) provider credential vault — Scholar's OWN provider
 * keys, funding Premium requests. See supabase/schema_ai_engine.sql's
 * "PLATFORM (PREMIUM-POOL) PROVIDER CREDENTIALS" section for why this is a
 * different thing from a user's BYOK key, and why encrypting it server-side
 * is correct here specifically (it's the operator's own credential, not a
 * user secret docs/04-architecture/46-SECURITY-ARCHITECTURE.md §5.3 requires
 * never reach the server).
 *
 * Uses src/services/crypto's real AES-256-GCM envelope encryption: a fresh
 * Content Encryption Key per credential, wrapped under the server-held
 * MASTER_KEY. Compromising one credential's row does not compromise any
 * other's — each has its own CEK — and compromising the database alone
 * (without MASTER_KEY, which is never stored in it) yields nothing.
 *
 * Every function here is server-only. Nothing in this module is ever
 * imported from src/desk or any browser-reachable path, and no function
 * returns plaintext credential material to an HTTP response — the two
 * callers are the Admin AI Infrastructure routes (metadata only, via
 * listCredentials) and the AI Gateway's provider adapter layer at actual
 * request time (getDecryptedCredential, used in-process and discarded
 * immediately after the provider call).
 */

import { decryptToString, encrypt, generateCEK, getMasterKeyFromEnv, unwrapKey, wrapKey } from "../../../src/services/crypto/crypto";
import type { EncryptedPayload } from "../../../src/services/crypto/types";
import { getSupabaseRestConfig, SupabaseTable } from "../supabaseRest";

interface CredentialRow extends Record<string, unknown> {
  id: string;
  provider_id: string;
  label: string;
  encrypted_cek: EncryptedPayload;
  encrypted_credential: EncryptedPayload;
  masked_preview: string;
  status: "active" | "disabled" | "error";
  last_verified_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformCredentialSummary {
  id: string;
  providerId: string;
  label: string;
  maskedPreview: string;
  status: "active" | "disabled" | "error";
  lastVerifiedAt: string | null;
  createdAt: string;
}

function table() {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");
  return new SupabaseTable<CredentialRow>(config, "platform_provider_credentials");
}

function maskedPreview(plaintext: string): string {
  const last4 = plaintext.slice(-4);
  return `••••${last4}`;
}

function toSummary(row: CredentialRow): PlatformCredentialSummary {
  return {
    id: row.id,
    providerId: row.provider_id,
    label: row.label,
    maskedPreview: row.masked_preview,
    status: row.status,
    lastVerifiedAt: row.last_verified_at,
    createdAt: row.created_at,
  };
}

/** Admin-only. Never touches the encrypted columns — safe to call as often as the panel needs. */
export async function listCredentials(): Promise<PlatformCredentialSummary[]> {
  const rows = await table().select(
    "select=id,provider_id,label,masked_preview,status,last_verified_at,created_at&order=provider_id"
  );
  return rows.map(toSummary);
}

export async function storeCredential(
  providerId: string,
  label: string,
  plaintextCredential: string,
  createdBy: string
): Promise<void> {
  const masterKey = getMasterKeyFromEnv();
  const cek = generateCEK();
  const encryptedCredential = encrypt(plaintextCredential, cek);
  const encryptedCek = wrapKey(cek, masterKey);

  // Conflict target is (provider_id, label) — the unique constraint added in
  // schema_ai_engine.sql's "CREDENTIAL ROTATION" section — so rotating a key
  // REPLACES the row for that provider rather than adding a second active
  // one alongside it. No `id` is sent: on insert the column takes its
  // gen_random_uuid() default, and on update the existing id is preserved
  // (sending a fresh one here was what defeated the upsert in the first
  // place, since a never-seen primary key cannot collide).
  //
  // last_verified_at is cleared deliberately: it described the key being
  // replaced, and leaving it behind would show the admin panel a
  // verification timestamp for a credential that is no longer stored.
  await table().upsert(
    {
      provider_id: providerId,
      label,
      encrypted_cek: encryptedCek,
      encrypted_credential: encryptedCredential,
      masked_preview: maskedPreview(plaintextCredential),
      status: "active",
      created_by: createdBy,
      last_verified_at: null,
      updated_at: new Date().toISOString(),
    },
    "provider_id,label"
  );
}

/**
 * Decrypts and returns the plaintext credential for one platform provider
 * connection. Server-side only, in-memory, for the immediate duration of the
 * provider call that needs it — callers must not log, cache, or otherwise
 * persist the return value.
 */
export async function getDecryptedCredential(providerId: string, label = "default"): Promise<string | null> {
  // The unique (provider_id, label) constraint means there is at most one
  // row to find. `order` is still explicit so that a database which has not
  // yet had that migration applied — and may therefore still hold duplicates
  // from before storeCredential() was fixed — deterministically returns the
  // NEWEST credential rather than whichever row PostgREST happened to reach
  // first under a bare `limit=1`.
  const row = await table().selectOne(
    `provider_id=eq.${encodeURIComponent(providerId)}&label=eq.${encodeURIComponent(label)}&status=eq.active&order=created_at.desc,id.desc`
  );
  if (!row) return null;

  const masterKey = getMasterKeyFromEnv();
  const cek = unwrapKey(row.encrypted_cek, masterKey);
  return decryptToString(row.encrypted_credential, cek);
}

export async function removeCredential(id: string): Promise<void> {
  await table().delete(`id=eq.${encodeURIComponent(id)}`);
}

export async function setCredentialStatus(id: string, status: "active" | "disabled" | "error"): Promise<void> {
  await table().update(`id=eq.${encodeURIComponent(id)}`, { status });
}
