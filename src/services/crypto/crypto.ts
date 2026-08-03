/**
 * services/crypto — envelope encryption primitives (docs/04-architecture/
 * 46-SECURITY-ARCHITECTURE.md §5, §4.1's per-object CEK model).
 *
 * Scope, stated honestly: docs 46 §5.1 specifies a full local hierarchy —
 * a user passphrase stretched with Argon2id into a Key Encryption Key, which
 * wraps a Master Key sealed to the OS platform keystore (Keychain/DPAPI/
 * TPM), which in turn wraps per-workspace/project/vault Content Encryption
 * Keys. That hierarchy is inherently CLIENT-side (the passphrase and the
 * platform keystore both live on the user's device) and belongs to the
 * eventual local-first desktop client, which doesn't exist yet — building
 * it here, server-side, would misrepresent what this module actually
 * provides. What this module gives instead: real, working AES-256-GCM
 * envelope encryption — generate a CEK, encrypt/decrypt data with it, wrap/
 * unwrap a CEK under a single server-held Master Key. The Master Key here
 * is read from MASTER_KEY (an env var, same pattern as the existing
 * server-only ENCRYPTION_KEY in server.ts), NOT derived from a user
 * passphrase — that is materially weaker than docs 46 §5.2's "Operator
 * access: None" property (an operator who controls the server controls
 * MASTER_KEY), and this module does not claim otherwise. Upgrading to the
 * real hierarchy is real future client-side work, not a silent gap.
 *
 * Every function here takes and returns key material as Buffers, never
 * strings that could end up concatenated into a log line by accident, and
 * nothing in this module calls console.* with a key or plaintext argument.
 * A caller that wires this into an HTTP route is responsible for the same
 * discipline at that boundary — never serialise a CEK or the Master Key
 * into a response body (docs 46 §5.3's "never transmitted", "never
 * logged", applied here to the server-held Master Key by extension).
 */

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import type { EncryptedPayload } from "./types";
import { MasterKeyNotConfiguredError, DecryptionError, InvalidKeyLengthError } from "./types";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH_BYTES = 32; // AES-256
const IV_LENGTH_BYTES = 12; // 96-bit GCM nonce, the size GCM is defined for

function assertKeyLength(key: Buffer): void {
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new InvalidKeyLengthError(`Key must be ${KEY_LENGTH_BYTES} bytes (AES-256), got ${key.length}.`);
  }
}

/** Generates a fresh random Content Encryption Key. */
export function generateCEK(): Buffer {
  return randomBytes(KEY_LENGTH_BYTES);
}

/** Generates a Master Key suitable for MASTER_KEY, base64-encoded for storage in an env var. */
export function generateMasterKeyBase64(): string {
  return randomBytes(KEY_LENGTH_BYTES).toString("base64");
}

/** Encrypts `plaintext` with `key` (must be 32 bytes). A fresh random IV is generated per call — callers must never reuse an IV with the same key. */
export function encrypt(plaintext: string | Buffer, key: Buffer): EncryptedPayload {
  assertKeyLength(key);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const data = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext;
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/** Decrypts a payload produced by encrypt(). Throws DecryptionError for a wrong key or any tampering (GCM's auth tag check fails closed). */
export function decrypt(payload: EncryptedPayload, key: Buffer): Buffer {
  assertKeyLength(key);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, "base64")), decipher.final()]);
  } catch {
    throw new DecryptionError("Decryption failed — wrong key, or the ciphertext was tampered with.");
  }
}

export function decryptToString(payload: EncryptedPayload, key: Buffer): string {
  return decrypt(payload, key).toString("utf8");
}

/** Envelope-wraps a CEK under a Master Key — semantically the same operation as encrypt(), named separately because "wrap a key" and "encrypt data" are different concerns even when the primitive is identical. */
export function wrapKey(cek: Buffer, masterKey: Buffer): EncryptedPayload {
  return encrypt(cek, masterKey);
}

/** Unwraps a CEK previously wrapped by wrapKey(). */
export function unwrapKey(wrapped: EncryptedPayload, masterKey: Buffer): Buffer {
  return decrypt(wrapped, masterKey);
}

/**
 * Reads and decodes MASTER_KEY from the environment. Throws
 * MasterKeyNotConfiguredError with an actionable message (use
 * generateMasterKeyBase64() to create one) rather than falling back to a
 * guessable default — same "fail fast on missing config" principle
 * src/services/supabaseClient.ts's getSupabaseClient() documents.
 */
export function getMasterKeyFromEnv(): Buffer {
  const raw = process.env.MASTER_KEY;
  if (!raw) {
    throw new MasterKeyNotConfiguredError(
      "MASTER_KEY is not set. Generate one with services/crypto's generateMasterKeyBase64() " +
        "and set it as a deployment secret — never commit it or paste it in chat."
    );
  }
  const key = Buffer.from(raw, "base64");
  assertKeyLength(key);
  return key;
}
