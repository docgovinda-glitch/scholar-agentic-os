/**
 * Secure Client-Side Encryption
 * 
 * IMPORTANT: This module provides backward-compatible encryption that maintains
 * existing behavior while removing security vulnerabilities.
 * 
 * Security Improvements:
 * - No hardcoded fallback keys (throws if empty secret provided)
 * - AES-GCM encryption available via encryptDataAsync()
 * - PBKDF2 key derivation for passwords
 * - Random IV/salt for each encryption
 * 
 * Backward Compatibility:
 * - XOR cipher preserved for existing encrypted data
 * - Legacy password comparison supported for migration
 */

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

// ============================================================================
// LEGACY XOR ENCRYPTION (Preserved for backward compatibility)
// ============================================================================
//
// P4-1 TECHNICAL DEBT AUDIT (2026-08-21):
//   Active production callers:  ZERO — confirmed by grep scan.
//   Active test callers:        src/utils/__tests__/crypto.test.ts (tests of this code itself).
//   Vault/AI settings callers:  use encryptDataAsync (AES-GCM-256 via PBKDF2) exclusively.
//
//   Safe to remove when:
//     1. All ciphertext stored with the old XOR scheme has been migrated or
//        the user cohort that created it is empty.
//     2. The crypto.test.ts XOR test suite is deleted alongside.
//     3. Any third-party integration depending on decryptData() is re-evaluated.
//
//   Until removal: the functions are exported so that any data encrypted before
//   the AES-GCM migration can still be decrypted. They MUST NOT be used for
//   any new encryption — the @deprecated tag on each function enforces this in
//   editor tooling.
// ============================================================================

/**
 * @deprecated Use encryptDataAsync() for new encryption.
 * Legacy XOR encryption — kept for backward compatibility only.
 * P4-1: Zero active production callers as of 2026-08-21; safe to remove once
 * all XOR-encrypted data is migrated.
 */
export function encryptData(text: string, secret: string): string {
  if (!text) return "";
  const key = secret;
  if (!key) {
    throw new Error("Encryption requires a secret key - no hardcoded fallback allowed");
  }
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result += String.fromCharCode(charCode);
  }
  return btoa(result);
}

/**
 * @deprecated Use decryptDataAsync() for new decryption.
 * Decrypt legacy XOR-encrypted data.
 * P4-1: Zero active production callers as of 2026-08-21.
 */
export function decryptData(cipher: string, secret: string): string {
  if (!cipher) return "";
  // Reject empty secret - must have user passcode
  if (!secret) {
    throw new Error("Decryption requires a secret key - no hardcoded fallback allowed");
  }
  try {
    const raw = atob(cipher);
    const key = secret;
    let result = "";
    for (let i = 0; i < raw.length; i++) {
      const charCode = raw.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  } catch (e) {
    console.error("[Decryption Error] Failed to decrypt configuration value:", e);
    return "";
  }
}

/**
 * Decrypt data (synchronous alias for backward compatibility).
 */
export function decryptDataSync(cipher: string, secret: string): string {
  if (!cipher) return "";
  return decryptData(cipher, secret);
}

// ============================================================================
// PASSWORD HASHING (PBKDF2-SHA256 for authentication)
// ============================================================================

/**
 * Hash a password using PBKDF2-SHA256 with random salt.
 * Returns base64-encoded hash in format: "salt$hash"
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password) throw new Error("Password cannot be empty");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    TEXT_ENCODER.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const rawKey = await crypto.subtle.exportKey("raw", key);
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(rawKey)));
  const saltB64 = btoa(String.fromCharCode(...salt));

  return `${saltB64}$${hashB64}`;
}

/**
 * Verify a password against a stored hash.
 * Supports both new format (PBKDF2 salted) and legacy plaintext.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash) return false;
  
  // Check if it's the new PBKDF2 format (contains $ separator)
  if (storedHash.includes("$")) {
    const parts = storedHash.split("$");
    if (parts.length !== 2) return false;
    const [saltB64, hashB64] = parts;
    const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
    
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      TEXT_ENCODER.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );

    const rawKey = await crypto.subtle.exportKey("raw", key);
    const computedHashB64 = btoa(String.fromCharCode(...new Uint8Array(rawKey)));
    
    return computedHashB64 === hashB64;
  }
  
  // Legacy plaintext comparison (for backward compatibility)
  // Detect legacy format (no $ separator and reasonable length for plaintext)
  if (!storedHash.includes("$") && storedHash.length < 50) {
    return password === storedHash;
  }
  
  return false;
}

// ============================================================================
// SECURE ASYNC ENCRYPTION (AES-GCM with PBKDF2)
// ============================================================================

const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * Derive an AES-GCM key from a secret using PBKDF2.
 */
async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    TEXT_ENCODER.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt data using AES-GCM. Returns base64-encoded 'v2:' prefixed string.
 */
export async function encryptDataAsync(text: string, secret: string): Promise<string> {
  if (!text) return "";
  if (!secret) throw new Error("Encryption requires a secret key - no hardcoded fallback allowed");

  // Use secure random values
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(secret, salt);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    TEXT_ENCODER.encode(text)
  );
  
  const encryptedArray = new Uint8Array(encrypted);
  const combined = new Uint8Array(salt.length + iv.length + encryptedArray.length);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(encryptedArray, salt.length + iv.length);
  
  return "v2:" + btoa(String.fromCharCode(...combined));
}

// ============================================================================
// RAW CryptoKey ENCRYPTION (for the device-bound API vault)
// ============================================================================
//
// encryptDataAsync/decryptDataAsync above derive their key from a string
// secret, which means the secret must exist as a JavaScript string at some
// point. The API vault's "stay unlocked on this device" mode deliberately
// avoids that: it generates a NON-EXTRACTABLE AES-GCM CryptoKey and keeps it
// in IndexedDB, so the raw key material can never be read out by any script —
// including a script injected by an XSS attack, which can use the key while
// the page is open but cannot exfiltrate it for offline decryption. These two
// helpers are the encrypt/decrypt path for a key held that way.
//
// Same wire format as v2 minus the salt, since there is no derivation step:
// "k1:" + base64(iv | ciphertext).

/** Encrypt with an existing AES-GCM CryptoKey. Returns a "k1:"-prefixed string. */
export async function encryptWithKey(text: string, key: CryptoKey): Promise<string> {
  if (!text) return "";
  const iv = new Uint8Array(crypto.getRandomValues(new Uint8Array(IV_LENGTH)));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, TEXT_ENCODER.encode(text));

  const encryptedArray = new Uint8Array(encrypted);
  const combined = new Uint8Array(iv.length + encryptedArray.length);
  combined.set(iv, 0);
  combined.set(encryptedArray, iv.length);

  return "k1:" + btoa(String.fromCharCode(...combined));
}

/** Decrypt data produced by encryptWithKey. Throws on a wrong key or tampering. */
export async function decryptWithKey(cipher: string, key: CryptoKey): Promise<string> {
  if (!cipher) return "";
  if (!cipher.startsWith("k1:")) {
    throw new Error("decryptWithKey requires k1 format encrypted data");
  }
  const combined = Uint8Array.from(atob(cipher.slice(3)), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, IV_LENGTH);
  const encrypted = combined.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
  return TEXT_DECODER.decode(decrypted);
}

/**
 * Generate a fresh, non-extractable AES-GCM-256 key.
 *
 * `extractable: false` is the entire point — exportKey() on the result throws,
 * so the key can be used but never read.
 */
export async function generateDeviceKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/**
 * Decrypt AES-GCM encrypted data (v2 format).
 */
export async function decryptDataAsync(cipher: string, secret: string): Promise<string> {
  if (!cipher) return "";
  if (!cipher.startsWith("v2:")) {
    throw new Error("decryptDataAsync requires v2 format encrypted data");
  }
  if (!secret) throw new Error("Decryption requires a secret key");
  
  const combined = Uint8Array.from(atob(cipher.slice(3)), c => c.charCodeAt(0));
  const salt = combined.slice(0, SALT_LENGTH);
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH);
  
  const key = await deriveKey(secret, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encrypted
  );
  
  return TEXT_DECODER.decode(decrypted);
}