/**
 * Master-key rotation for the saved user keys (`user_provider_keys`).
 *
 * Each row holds a per-key content key (`encrypted_cek`) wrapped under
 * MASTER_KEY, and the API key itself encrypted under that content key. Rotating
 * MASTER_KEY only means re-wrapping the content keys; the API keys are not
 * touched. A row is re-wrapped only after its content key has been proved to
 * decrypt its API key, so a wrong OLD key can never damage a row.
 */
import { decrypt, unwrapKey, wrapKey } from "../../../src/services/crypto/crypto";
import type { EncryptedPayload } from "../../../src/services/crypto/types";

export interface KeyRowCrypto {
  encrypted_cek: EncryptedPayload;
  encrypted_key: EncryptedPayload;
}

export type RewrapOutcome = { status: "ok"; encrypted_cek: EncryptedPayload } | { status: "unreadable" };

export function rewrapKeyRow(row: KeyRowCrypto, oldMasterKey: Buffer, newMasterKey: Buffer): RewrapOutcome {
  let cek: Buffer | undefined;
  try {
    cek = unwrapKey(row.encrypted_cek, oldMasterKey);
    decrypt(row.encrypted_key, cek).fill(0); // proves the content key matches this row; the plaintext is discarded at once
    return { status: "ok", encrypted_cek: wrapKey(cek, newMasterKey) };
  } catch {
    return { status: "unreadable" };
  } finally {
    cek?.fill(0);
  }
}
