/** `services/crypto`'s public types — see crypto.ts's module comment for scope. */

/** AES-256-GCM output: everything needed to decrypt, nothing that is itself secret. */
export interface EncryptedPayload {
  /** base64 */
  ciphertext: string;
  /** base64, 12 bytes */
  iv: string;
  /** base64, 16-byte GCM authentication tag — this is what makes tampering detectable, not just accidental corruption. */
  authTag: string;
}

export class MasterKeyNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MasterKeyNotConfiguredError";
  }
}

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecryptionError";
  }
}

export class InvalidKeyLengthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidKeyLengthError";
  }
}
