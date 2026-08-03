import { describe, it, expect, afterEach } from "vitest";
import {
  generateCEK,
  generateMasterKeyBase64,
  encrypt,
  decrypt,
  decryptToString,
  wrapKey,
  unwrapKey,
  getMasterKeyFromEnv,
} from "../crypto";
import { DecryptionError, InvalidKeyLengthError, MasterKeyNotConfiguredError } from "../types";

describe("services/crypto", () => {
  it("round-trips a string through encrypt/decryptToString", () => {
    const key = generateCEK();
    const payload = encrypt("the quick brown fox", key);
    expect(decryptToString(payload, key)).toBe("the quick brown fox");
  });

  it("two encryptions of the same plaintext with the same key produce different ciphertext (fresh IV each call)", () => {
    const key = generateCEK();
    const a = encrypt("same text", key);
    const b = encrypt("same text", key);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it("decrypting with the wrong key throws DecryptionError rather than returning garbage", () => {
    const payload = encrypt("secret", generateCEK());
    expect(() => decrypt(payload, generateCEK())).toThrow(DecryptionError);
  });

  it("a tampered ciphertext fails the GCM auth tag check", () => {
    const key = generateCEK();
    const payload = encrypt("secret", key);
    const tamperedBytes = Buffer.from(payload.ciphertext, "base64");
    tamperedBytes[0] ^= 0xff;
    const tampered = { ...payload, ciphertext: tamperedBytes.toString("base64") };
    expect(() => decrypt(tampered, key)).toThrow(DecryptionError);
  });

  it("rejects a key that isn't 32 bytes", () => {
    expect(() => encrypt("x", Buffer.from("too short"))).toThrow(InvalidKeyLengthError);
  });

  it("wrapKey/unwrapKey round-trip a CEK under a Master Key", () => {
    const masterKey = Buffer.from(generateMasterKeyBase64(), "base64");
    const cek = generateCEK();
    const wrapped = wrapKey(cek, masterKey);
    const unwrapped = unwrapKey(wrapped, masterKey);
    expect(unwrapped.equals(cek)).toBe(true);
  });

  it("generateMasterKeyBase64() produces a 32-byte key once base64-decoded", () => {
    const masterKey = generateMasterKeyBase64();
    expect(Buffer.from(masterKey, "base64")).toHaveLength(32);
  });

  describe("getMasterKeyFromEnv()", () => {
    const original = process.env.MASTER_KEY;
    afterEach(() => {
      if (original === undefined) delete process.env.MASTER_KEY;
      else process.env.MASTER_KEY = original;
    });

    it("throws MasterKeyNotConfiguredError when unset", () => {
      delete process.env.MASTER_KEY;
      expect(() => getMasterKeyFromEnv()).toThrow(MasterKeyNotConfiguredError);
    });

    it("decodes a configured MASTER_KEY into a usable 32-byte Buffer", () => {
      process.env.MASTER_KEY = generateMasterKeyBase64();
      const key = getMasterKeyFromEnv();
      expect(key).toHaveLength(32);
      const payload = encrypt("hello", key);
      expect(decryptToString(payload, key)).toBe("hello");
    });
  });
});
