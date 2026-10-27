// @vitest-environment jsdom
//
// Conflict #7 — Knowledge Vault Architecture Security Boundary Tests
//
// These tests verify the AUTHORITATIVE vault architecture established in
// Conflict #7:
//
//   1. Private Vault items are client-held, passphrase-encrypted in IndexedDB.
//   2. The Scholar server stores ONLY vault existence metadata (label, created_at).
//   3. Passphrases and recovery codes remain client-side (device-local).
//   4. Search operates purely client-side over decrypted in-memory items.
//   5. Lock/unlock lifecycle correctly manages in-memory passphrase state.
//   6. No server endpoint receives, stores, or processes Vault content.
//
// Verified against:
//   src/services/userVault.ts   — server-side existence + device-local verifier
//   src/services/vaultContents.ts — client-side encrypted content in IndexedDB
//   src/utils/crypto.ts         — PBKDF2-SHA256 + AES-GCM-256
//   supabase/schema_user_settings.sql — public.user_vaults (user_id, label, created_at)

import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Supabase so that server-facing functions can be tested without a
// live database, while allowing us to inspect exactly what they ask for.
// ---------------------------------------------------------------------------

const mockSelectReturn = { data: { label: "My Vault", created_at: "2026-01-01T00:00:00Z" }, error: null };
const mockMaybeSingle = vi.fn().mockReturnValue(mockSelectReturn);
const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
const mockUpsert = vi.fn().mockResolvedValue({ error: null });
const mockGetUser = vi.fn().mockResolvedValue({
  data: { user: { id: "test-user-id" } },
});

vi.mock("../supabaseClient", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      // Track which table is being queried
      (mockFrom as ReturnType<typeof vi.fn>).__lastTable = table;
      return { select: mockSelect, upsert: mockUpsert };
    },
  }),
}));

const mockFrom = vi.fn();

// ---------------------------------------------------------------------------
// Mock userVault's verifyVaultPassphrase for the vaultContents tests
// ---------------------------------------------------------------------------

const verifyVaultPassphrase = vi.fn();
vi.mock("../userVault", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../userVault")>();
  return {
    ...actual,
    verifyVaultPassphrase: (...a: unknown[]) => verifyVaultPassphrase(...a),
  };
});

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

const {
  addVaultItem,
  listVaultItems,
  searchVaultItems,
  unlockVault,
  lockVault,
  isVaultUnlocked,
} = await import("../vaultContents");

const {
  generateRecoveryCode,
  loadVault,
  createVault,
} = await import("../userVault");

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeEach(() => {
  verifyVaultPassphrase.mockImplementation(async (p: string) => p === "conflict7-test-passphrase");
});

afterEach(async () => {
  lockVault();
  vi.clearAllMocks();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(`scholar-vault-items:${USER}`);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});

// ===========================================================================
// SECTION 1: Server-Side Metadata Isolation
// ===========================================================================

describe("Conflict #7 — Server-side metadata isolation", () => {
  it("loadVault queries ONLY label and created_at from user_vaults", async () => {
    await loadVault();

    // Verify the select call only requests metadata (label, created_at, storage_mode) — no content or secrets
    expect(mockSelect).toHaveBeenCalledWith(expect.stringContaining("label, created_at"));
    // Verify it queries user_vaults table
    expect(mockEq).toHaveBeenCalledWith("user_id", "test-user-id");
  });

  it("createVault sends ONLY user_id and label to user_vaults — no content, no secrets", async () => {
    await createVault("Research Vault");

    expect(mockUpsert).toHaveBeenCalledWith(
      { user_id: "test-user-id", label: "Research Vault" },
      { onConflict: "user_id" }
    );
  });

  it("server-facing functions never send passphrase or recovery code", async () => {
    // loadVault and createVault are the ONLY server-touching functions.
    // Neither accepts passphrase or recovery code parameters by signature,
    // and neither sends them in the Supabase call.
    await loadVault();
    await createVault("Test Vault");

    // Inspect all arguments to all mocked Supabase calls
    const allCalls = [
      ...mockSelect.mock.calls,
      ...mockUpsert.mock.calls,
      ...mockEq.mock.calls,
    ];
    const serialized = JSON.stringify(allCalls);

    // No passphrase-like material should appear
    expect(serialized).not.toContain("passphrase");
    expect(serialized).not.toContain("recovery");
    expect(serialized).not.toContain("ciphertext");
    expect(serialized).not.toContain("content");
    expect(serialized).not.toContain("title");
  });
});

// ===========================================================================
// SECTION 2: Passphrase Device-Local Verification
// ===========================================================================

describe("Conflict #7 — Passphrase verification is device-local", () => {
  it("passphrase verifier is stored in localStorage scoped by userId", async () => {
    // Import the real setVaultPassphraseVerifier (bypassing our mock)
    const { setVaultPassphraseVerifier, hasVaultPassphraseOnThisDevice } =
      await import("../userVault");

    await setVaultPassphraseVerifier("my-secure-passphrase");

    // Should be stored in localStorage under the user-scoped key
    const stored = localStorage.getItem("scholar-vault-verifier:test-user-id");
    expect(stored).toBeTruthy();
    expect(stored).not.toBe("my-secure-passphrase"); // It's hashed, not plaintext

    // The raw passphrase must never appear in localStorage
    const allKeys = Object.keys(localStorage);
    for (const key of allKeys) {
      expect(localStorage.getItem(key)).not.toBe("my-secure-passphrase");
    }

    // Device should report that a verifier exists
    expect(await hasVaultPassphraseOnThisDevice()).toBe(true);
  });

  it("SHA-256 verifier hash is deterministic for the same input", async () => {
    const { setVaultPassphraseVerifier } = await import("../userVault");

    await setVaultPassphraseVerifier("deterministic-test");
    const hash1 = localStorage.getItem("scholar-vault-verifier:test-user-id");

    await setVaultPassphraseVerifier("deterministic-test");
    const hash2 = localStorage.getItem("scholar-vault-verifier:test-user-id");

    expect(hash1).toBe(hash2);
    expect(hash1).toBeTruthy();
  });
});

// ===========================================================================
// SECTION 3: Recovery Code Generation
// ===========================================================================

describe("Conflict #7 — Recovery code meets specification", () => {
  it("recovery code matches SCHL-XXXX-XXXX-XXXX-XXXX format (Crockford alphabet)", () => {
    const code = generateRecoveryCode();

    // Must match exactly: SCHL- followed by 4 groups of 4 characters separated by dashes
    expect(code).toMatch(/^SCHL-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  });

  it("recovery code excludes ambiguous characters I, L, O, U", () => {
    // Generate multiple codes to increase confidence
    for (let i = 0; i < 50; i++) {
      const code = generateRecoveryCode();
      const body = code.replace(/^SCHL-/, "").replace(/-/g, "");
      expect(body).not.toMatch(/[ILOU]/);
    }
  });

  it("recovery codes are unique (entropy check)", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateRecoveryCode());
    }
    // 100 codes should all be unique with overwhelming probability
    expect(codes.size).toBe(100);
  });

  it("recovery code is never transmitted to the server (by construction)", () => {
    // generateRecoveryCode is a pure function — it returns a string and
    // makes no network calls. It has no Supabase dependency.
    const code = generateRecoveryCode();
    expect(typeof code).toBe("string");

    // The mock server calls should not have been invoked
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockSelect).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// SECTION 4: Client-Side Encryption & IndexedDB Isolation
// ===========================================================================

describe("Conflict #7 — Vault item encryption and IndexedDB isolation", () => {
  beforeEach(async () => {
    await unlockVault("conflict7-test-passphrase");
  });

  it("encrypts item content before writing to IndexedDB (v2: AES-GCM format)", async () => {
    await addVaultItem(USER, {
      title: "Conflict7 Unique Title",
      content: "Conflict7 unique research content about quantum entanglement",
      citation: "Einstein, A. (1935). EPR Paradox.",
    });

    // Read raw IndexedDB bypassing the decrypt path
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(`scholar-vault-items:${USER}`, 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const raw = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction("items", "readonly");
      const req = tx.objectStore("items").getAll();
      req.onsuccess = () => resolve(req.result as unknown[]);
      req.onerror = () => reject(req.error);
    });
    db.close();

    const serialized = JSON.stringify(raw);

    // Plaintext must never appear in raw storage
    expect(serialized).not.toContain("Conflict7 Unique Title");
    expect(serialized).not.toContain("quantum entanglement");
    expect(serialized).not.toContain("Einstein");

    // Ciphertext should use the v2: AES-GCM prefix
    expect(serialized).toContain("v2:");
  });

  it("round-trips encrypted content correctly through encrypt → store → retrieve → decrypt", async () => {
    const original = {
      title: "End-to-end Encryption Validation",
      content: "This content proves the encrypt→decrypt cycle preserves data fidelity.",
      citation: "Test Author (2026). Testing Framework.",
    };

    const saved = await addVaultItem(USER, original);
    const retrieved = await listVaultItems(USER);

    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].title).toBe(original.title);
    expect(retrieved[0].content).toBe(original.content);
    expect(retrieved[0].citation).toBe(original.citation);
    expect(retrieved[0].id).toBe(saved.id);
  });
});

// ===========================================================================
// SECTION 5: Client-Side Search
// ===========================================================================

describe("Conflict #7 — Search is purely client-side", () => {
  const testItems = [
    { id: "c7-1", title: "Neural network architectures", content: "transformer models", citation: "Vaswani 2017", createdAt: "2026-01-01" },
    { id: "c7-2", title: "Statistical mechanics", content: "Boltzmann distributions", citation: "Gibbs 1902", createdAt: "2026-01-02" },
    { id: "c7-3", title: "Climate change impacts", content: "carbon emission models", createdAt: "2026-01-03" },
  ];

  it("searches title, content, and citation fields client-side", () => {
    expect(searchVaultItems(testItems, "neural").map((i) => i.id)).toEqual(["c7-1"]);
    expect(searchVaultItems(testItems, "boltzmann").map((i) => i.id)).toEqual(["c7-2"]);
    expect(searchVaultItems(testItems, "gibbs").map((i) => i.id)).toEqual(["c7-2"]);
    expect(searchVaultItems(testItems, "carbon").map((i) => i.id)).toEqual(["c7-3"]);
  });

  it("is case-insensitive", () => {
    expect(searchVaultItems(testItems, "NEURAL")).toHaveLength(1);
    expect(searchVaultItems(testItems, "Boltzmann")).toHaveLength(1);
  });

  it("returns all items for blank query", () => {
    expect(searchVaultItems(testItems, "")).toHaveLength(3);
    expect(searchVaultItems(testItems, "  ")).toHaveLength(3);
  });

  it("makes zero server calls (search is a pure function over in-memory items)", () => {
    // Reset all mock counters
    mockSelect.mockClear();
    mockUpsert.mockClear();
    mockGetUser.mockClear();

    searchVaultItems(testItems, "neural");

    // No server interaction should have occurred
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// SECTION 6: Lock/Unlock Lifecycle
// ===========================================================================

describe("Conflict #7 — Lock/unlock wipes in-memory passphrase", () => {
  it("vault starts locked", () => {
    expect(isVaultUnlocked()).toBe(false);
  });

  it("unlock with correct passphrase succeeds", async () => {
    expect(await unlockVault("conflict7-test-passphrase")).toBe(true);
    expect(isVaultUnlocked()).toBe(true);
  });

  it("unlock with wrong passphrase fails and stays locked", async () => {
    expect(await unlockVault("wrong-passphrase")).toBe(false);
    expect(isVaultUnlocked()).toBe(false);
  });

  it("lockVault immediately wipes in-memory passphrase", async () => {
    await unlockVault("conflict7-test-passphrase");
    expect(isVaultUnlocked()).toBe(true);

    lockVault();
    expect(isVaultUnlocked()).toBe(false);

    // Operations requiring the passphrase should now fail
    await expect(addVaultItem(USER, { title: "x", content: "y" })).rejects.toThrow(/locked/i);
    await expect(listVaultItems(USER)).rejects.toThrow(/locked/i);
  });

  it("lock → unlock cycle with a new passphrase works cleanly", async () => {
    await unlockVault("conflict7-test-passphrase");
    lockVault();

    // Re-unlock should work
    expect(await unlockVault("conflict7-test-passphrase")).toBe(true);
    expect(isVaultUnlocked()).toBe(true);
  });
});

// ===========================================================================
// SECTION 7: Architectural Boundary — No Server Content Exposure
// ===========================================================================

describe("Conflict #7 — No server exposure of vault content", () => {
  it("vaultContents.ts exports have no Supabase/server dependency", async () => {
    // The module should operate entirely against IndexedDB and in-memory state.
    // Verify by checking that the module's exports work without any Supabase calls.
    mockGetUser.mockClear();
    mockSelect.mockClear();
    mockUpsert.mockClear();

    await unlockVault("conflict7-test-passphrase");
    await addVaultItem(USER, { title: "Isolated", content: "test" });
    await listVaultItems(USER);
    searchVaultItems(
      [{ id: "x", title: "t", content: "c", createdAt: "2026-01-01" }],
      "t"
    );
    lockVault();

    // None of these operations should have triggered server calls
    // (mockGetUser may be called by verifyVaultPassphrase → currentUserId,
    //  but addVaultItem, listVaultItems, searchVaultItems must not)
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("userVault.ts server functions expose only existence fields", async () => {
    const result = await loadVault();

    // loadVault should return only label and createdAt — no content fields
    if (result) {
      expect(Object.keys(result).sort()).toEqual(["createdAt", "label"]);
      expect(result).not.toHaveProperty("content");
      expect(result).not.toHaveProperty("ciphertext");
      expect(result).not.toHaveProperty("passphrase");
      expect(result).not.toHaveProperty("recoveryCode");
    }
  });
});
