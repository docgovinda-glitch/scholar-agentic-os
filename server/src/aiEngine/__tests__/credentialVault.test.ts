/**
 * Tests for the Premium-pool credential vault. The properties worth pinning:
 * a stored credential round-trips correctly, listCredentials() never
 * requests or exposes the encrypted columns, and the masked preview only
 * ever shows the last 4 characters.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateMasterKeyBase64 } from "../../../../src/services/crypto/crypto";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const { storeCredential, getDecryptedCredential, listCredentials, removeCredential } = await import("../credentialVault");

const originalFetch = global.fetch;
const originalMasterKey = process.env.MASTER_KEY;

beforeEach(() => {
  process.env.MASTER_KEY = generateMasterKeyBase64();
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalMasterKey === undefined) delete process.env.MASTER_KEY;
  else process.env.MASTER_KEY = originalMasterKey;
  vi.restoreAllMocks();
});

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(impl(typeof input === "string" ? input : input.toString(), init))
  ) as unknown as typeof fetch;
}

const textResponse = (status: number, body: string) => ({ ok: status >= 200 && status < 300, status, text: async () => body }) as Response;

describe("storeCredential / getDecryptedCredential", () => {
  it("round-trips: what is stored encrypted is what comes back decrypted", async () => {
    let storedRow: any = null;

    mockFetch((url, init) => {
      if (init?.method === "POST") {
        storedRow = JSON.parse(init.body as string);
        return textResponse(201, "");
      }
      // select for getDecryptedCredential
      return textResponse(200, JSON.stringify([storedRow]));
    });

    await storeCredential("gemini", "default", "sk-super-secret-key-12345", "admin-1");

    // The wire payload never contains the plaintext anywhere.
    expect(JSON.stringify(storedRow)).not.toContain("sk-super-secret-key-12345");
    expect(storedRow.masked_preview).toBe("••••2345");

    const decrypted = await getDecryptedCredential("gemini");
    expect(decrypted).toBe("sk-super-secret-key-12345");
  });

  it("returns null when no active credential exists for the provider", async () => {
    mockFetch(() => textResponse(200, JSON.stringify([])));
    expect(await getDecryptedCredential("nonexistent")).toBeNull();
  });
});

describe("listCredentials", () => {
  it("requests only metadata columns, never the encrypted ones", async () => {
    let requestedUrl = "";
    mockFetch((url) => {
      requestedUrl = url;
      return textResponse(
        200,
        JSON.stringify([
          {
            id: "c1",
            provider_id: "gemini",
            label: "default",
            masked_preview: "••••ab12",
            status: "active",
            last_verified_at: null,
            created_at: "2026-01-01T00:00:00Z",
          },
        ])
      );
    });

    const result = await listCredentials();

    expect(requestedUrl).toContain("select=id,provider_id,label,masked_preview,status,last_verified_at,created_at");
    expect(requestedUrl).not.toContain("encrypted");
    expect(result).toEqual([
      {
        id: "c1",
        providerId: "gemini",
        label: "default",
        maskedPreview: "••••ab12",
        status: "active",
        lastVerifiedAt: null,
        createdAt: "2026-01-01T00:00:00Z",
      },
    ]);
    // No encrypted material anywhere in what the admin panel receives.
    expect(JSON.stringify(result)).not.toMatch(/ciphertext|authTag/);
  });
});

describe("removeCredential", () => {
  it("issues a DELETE scoped to the given id", async () => {
    let method = "";
    let url = "";
    mockFetch((u, init) => {
      method = init?.method ?? "";
      url = u;
      return textResponse(204, "");
    });

    await removeCredential("c1");

    expect(method).toBe("DELETE");
    expect(url).toContain("id=eq.c1");
  });
});

describe("credential rotation", () => {
  it("upserts on (provider_id, label) and sends no id, so a rotation replaces the row instead of adding a second active one", async () => {
    let writeUrl = "";
    let writtenRow: any = null;

    mockFetch((url, init) => {
      if (init?.method === "POST") {
        writeUrl = url;
        writtenRow = JSON.parse(init.body as string);
        return textResponse(201, "");
      }
      return textResponse(200, "[]");
    });

    await storeCredential("openai", "default", "sk-rotated-key-9999", "admin-1");

    // Without a conflict target PostgREST resolves against the primary key.
    // The payload used to carry a freshly generated `id`, which can never
    // collide, so merge-duplicates silently degraded to a plain INSERT and
    // every rotation left the previous key behind, still status='active'.
    expect(writeUrl).toContain("on_conflict=provider_id%2Clabel");
    expect(writtenRow).not.toHaveProperty("id");
    expect(writtenRow.status).toBe("active");
    // The previous key's verification timestamp must not carry over onto a
    // credential that is no longer the one stored.
    expect(writtenRow.last_verified_at).toBeNull();
  });

  it("asks for the newest active row deterministically, so a pre-migration database with duplicates cannot serve a rotated-away key", async () => {
    let selectUrl = "";
    mockFetch((url) => {
      selectUrl = url;
      return textResponse(200, "[]");
    });

    await getDecryptedCredential("openai");

    expect(selectUrl).toContain("status=eq.active");
    // A bare `limit=1` with no ORDER BY lets PostgREST return either
    // duplicate; the order makes "newest wins" the guaranteed outcome.
    expect(selectUrl).toContain("order=created_at.desc,id.desc");
  });
});
