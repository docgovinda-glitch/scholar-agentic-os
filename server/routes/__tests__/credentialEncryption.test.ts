import { describe, it, expect, beforeEach } from "vitest";
import { encryptCloudToken, decryptCloudToken } from "../vault.ts";
import { generateMasterKeyBase64 } from "../../../src/services/crypto/crypto.ts";

describe("Credential encryption & cloud OAuth token protection (F-11)", () => {
  const originalMasterKey = process.env.MASTER_KEY;

  beforeEach(() => {
    process.env.MASTER_KEY = generateMasterKeyBase64();
  });

  it("encrypts cloud OAuth tokens with AES-256-GCM and decrypts them accurately", () => {
    const rawToken = "ya29.a0AfH6SMBx-secret-google-drive-token";
    const encrypted = encryptCloudToken(rawToken);

    expect(encrypted).not.toBeNull();
    expect(encrypted!.startsWith("enc:v1:")).toBe(true);
    expect(encrypted).not.toContain(rawToken);

    const decrypted = decryptCloudToken(encrypted);
    expect(decrypted).toBe(rawToken);
  });

  it("fails closed (returns null) when ciphertext or authTag is tampered with", () => {
    const rawToken = "ya29.a0AfH6SMBx-secret-google-drive-token";
    const encrypted = encryptCloudToken(rawToken)!;
    const payload = JSON.parse(encrypted.slice("enc:v1:".length));
    payload.ciphertext = Buffer.from("tampered-data").toString("base64");
    const tampered = `enc:v1:${JSON.stringify(payload)}`;

    expect(decryptCloudToken(tampered)).toBeNull();
    process.env.MASTER_KEY = originalMasterKey;
  });
});

