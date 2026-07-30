import { describe, it, expect } from "vitest";
import {
  encryptData,
  decryptData,
  decryptDataSync,
  hashPassword,
  verifyPassword,
  encryptDataAsync,
  decryptDataAsync,
} from "../crypto";

describe("crypto.ts - legacy XOR encryption (encryptData/decryptData)", () => {
  it("round-trips text with a secret", () => {
    const secret = "my-secret-key";
    const plaintext = "Hello, this is a real API key: sk-abc123";
    const cipher = encryptData(plaintext, secret);
    expect(cipher).not.toBe(plaintext);
    expect(decryptData(cipher, secret)).toBe(plaintext);
  });

  it("does not just base64-encode the plaintext (actually XORs with the key)", () => {
    const secret = "key";
    const plaintext = "same-length-text!!";
    const cipher = encryptData(plaintext, secret);
    // A pure base64 encode of the plaintext would differ from our XOR-then-base64
    // result. Confirm cipher isn't literally btoa(plaintext).
    expect(cipher).not.toBe(btoa(plaintext));
  });

  it("returns empty string for empty text input", () => {
    expect(encryptData("", "secret")).toBe("");
    expect(decryptData("", "secret")).toBe("");
  });

  it("throws when encrypting with an empty secret", () => {
    expect(() => encryptData("text", "")).toThrow(
      "Encryption requires a secret key - no hardcoded fallback allowed"
    );
  });

  it("throws when decrypting with an empty secret", () => {
    expect(() => decryptData("someCipher", "")).toThrow(
      "Decryption requires a secret key - no hardcoded fallback allowed"
    );
  });

  it("fails to recover original plaintext with the wrong secret (does not throw, returns garbage)", () => {
    const secret = "correct-secret";
    const wrong = "wrong-secret";
    const plaintext = "sensitive-api-key-value";
    const cipher = encryptData(plaintext, secret);
    const result = decryptData(cipher, wrong);
    // Characterization: XOR cipher with wrong key does NOT throw, it silently
    // returns different (garbled) plaintext. This is inherent to XOR ciphers
    // and is documented here rather than "fixed" since decryptData is legacy/
    // deprecated and callers must not rely on it detecting wrong passphrases.
    expect(result).not.toBe(plaintext);
  });

  it("decryptData returns empty string and logs on malformed (non-base64) cipher input", () => {
    const result = decryptData("not-valid-base64-!!!@@@", "secret");
    expect(result).toBe("");
  });

  it("decryptDataSync behaves identically to decryptData", () => {
    const secret = "secret";
    const plaintext = "value";
    const cipher = encryptData(plaintext, secret);
    expect(decryptDataSync(cipher, secret)).toBe(plaintext);
    expect(decryptDataSync("", secret)).toBe("");
  });

  it("throws on non-Latin1 unicode text (legacy XOR+btoa cannot handle it) - characterization, not a fix target since this path is @deprecated", () => {
    const secret = "key123";
    // btoa() requires each char code to be <= 0xFF. XOR'ing a wide-range
    // unicode char code against the secret's char codes can easily produce
    // a result > 0xFF, which makes btoa() throw InvalidCharacterError.
    // This is a known limitation of the deprecated legacy XOR path; callers
    // needing unicode support should use encryptDataAsync/decryptDataAsync.
    const plaintext = "café — δοκιμή 日本語";
    expect(() => encryptData(plaintext, secret)).toThrow();
  });

  it("round-trips ASCII/Latin1-only text correctly", () => {
    const secret = "key123";
    const plaintext = "plain ascii text with punctuation !@#$%^&*()";
    const cipher = encryptData(plaintext, secret);
    expect(decryptData(cipher, secret)).toBe(plaintext);
  });
});

describe("crypto.ts - PBKDF2 password hashing (hashPassword/verifyPassword)", () => {
  it("hashes a password into salt$hash format", async () => {
    const hash = await hashPassword("myPassword123");
    expect(hash).toContain("$");
    const [salt, digest] = hash.split("$");
    expect(salt.length).toBeGreaterThan(0);
    expect(digest.length).toBeGreaterThan(0);
  });

  it("produces different hashes for the same password (random salt)", async () => {
    const hash1 = await hashPassword("samePassword");
    const hash2 = await hashPassword("samePassword");
    expect(hash1).not.toBe(hash2);
  });

  it("throws for empty password", async () => {
    await expect(hashPassword("")).rejects.toThrow("Password cannot be empty");
  });

  it("verifies a correct password against its hash", async () => {
    const password = "correct-horse-battery-staple";
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  it("rejects an incorrect password against a valid hash", async () => {
    const hash = await hashPassword("correct-password");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("returns false for empty password or empty stored hash", async () => {
    expect(await verifyPassword("", "somehash$abc")).toBe(false);
    expect(await verifyPassword("password", "")).toBe(false);
  });

  it("returns false for a malformed PBKDF2-format hash (wrong number of $ parts)", async () => {
    expect(await verifyPassword("password", "a$b$c")).toBe(false);
  });

  it("supports legacy plaintext comparison for short hashes without $", async () => {
    const legacyStoredPassword = "plaintextLegacyPass";
    expect(await verifyPassword(legacyStoredPassword, legacyStoredPassword)).toBe(true);
    expect(await verifyPassword("wrong", legacyStoredPassword)).toBe(false);
  });

  it("rejects long plaintext-looking hash (>= 50 chars) as neither format matches", async () => {
    const longFakeHash = "x".repeat(60);
    expect(await verifyPassword(longFakeHash, longFakeHash)).toBe(false);
  });
});

describe("crypto.ts - AES-GCM async encryption (encryptDataAsync/decryptDataAsync)", () => {
  it("round-trips text correctly with the correct secret", async () => {
    const secret = "vault-passphrase";
    const plaintext = "sk-real-api-key-1234567890";
    const cipher = await encryptDataAsync(plaintext, secret);
    expect(cipher.startsWith("v2:")).toBe(true);
    expect(cipher).not.toBe(plaintext);
    expect(cipher).not.toContain(plaintext);
    const decrypted = await decryptDataAsync(cipher, secret);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext for the same plaintext/secret each call (random salt/iv)", async () => {
    const secret = "secret";
    const plaintext = "repeatable-plaintext";
    const c1 = await encryptDataAsync(plaintext, secret);
    const c2 = await encryptDataAsync(plaintext, secret);
    expect(c1).not.toBe(c2);
    expect(await decryptDataAsync(c1, secret)).toBe(plaintext);
    expect(await decryptDataAsync(c2, secret)).toBe(plaintext);
  });

  it("fails cleanly (throws) when decrypting with the wrong passphrase, rather than silently succeeding", async () => {
    const plaintext = "top-secret-value";
    const cipher = await encryptDataAsync(plaintext, "right-secret");
    await expect(decryptDataAsync(cipher, "wrong-secret")).rejects.toThrow();
  });

  it("returns empty string for empty text on encrypt, and empty cipher on decrypt", async () => {
    expect(await encryptDataAsync("", "secret")).toBe("");
    expect(await decryptDataAsync("", "secret")).toBe("");
  });

  it("throws when encrypting with an empty secret", async () => {
    await expect(encryptDataAsync("text", "")).rejects.toThrow(
      "Encryption requires a secret key - no hardcoded fallback allowed"
    );
  });

  it("throws when decrypting with an empty secret", async () => {
    const cipher = await encryptDataAsync("text", "secret");
    await expect(decryptDataAsync(cipher, "")).rejects.toThrow(
      "Decryption requires a secret key"
    );
  });

  it("throws when decrypting a cipher without the v2: prefix (e.g. legacy XOR ciphertext)", async () => {
    const legacyCipher = encryptData("plaintext", "secret");
    await expect(decryptDataAsync(legacyCipher, "secret")).rejects.toThrow(
      "decryptDataAsync requires v2 format encrypted data"
    );
  });

  it("supports unicode text end-to-end", async () => {
    const secret = "unicode-secret";
    const plaintext = "日本語 テスト — café δοκιμή 🔒";
    const cipher = await encryptDataAsync(plaintext, secret);
    expect(await decryptDataAsync(cipher, secret)).toBe(plaintext);
  });
});
