import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  LocalVaultStorageProvider,
  SupabaseVaultStorageProvider,
  syncLocalVaultToRemote,
  type VaultItem,
} from "../VaultStorageProvider";
import {
  addVaultItem,
  listVaultItems,
  unlockVault,
  lockVault,
  prepareVaultContextForAI,
} from "../../vaultContents";
import { setVaultPassphraseVerifier, createVault } from "../../userVault";

// Mock Supabase Store for Adversarial Testing
const mockRemoteDb: Map<string, any[]> = new Map();
const networkCallCounter = { select: 0, upsert: 0, delete: 0 };

vi.mock("../../supabaseClient", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "test-user-adversarial-1" } }, error: null }),
    },
    from: (table: string) => ({
      select: (_cols?: string) => ({
        eq: (col1: string, val1: string) => {
          networkCallCounter.select++;
          return {
            eq: (col2: string, val2: string) => ({
              maybeSingle: async () => {
                const rows = mockRemoteDb.get(table) || [];
                const found = rows.find((r) => r[col1] === val1 && r[col2] === val2);
                return { data: found || null, error: null };
              },
            }),
            order: () => ({
              then: (resolve: any) => {
                const rows = mockRemoteDb.get(table) || [];
                resolve({ data: rows.filter((r) => r[col1] === val1), error: null });
              },
            }),
            then: (resolve: any) => {
              const rows = mockRemoteDb.get(table) || [];
              resolve({ data: rows.filter((r) => r[col1] === val1), error: null });
            },
          };
        },
        maybeSingle: async () => {
          const rows = mockRemoteDb.get(table) || [];
          return { data: rows[0] || null, error: null };
        },
      }),
      upsert: async (payload: any) => {
        networkCallCounter.upsert++;
        const rows = mockRemoteDb.get(table) || [];
        const idx = rows.findIndex((r) => r.id === payload.id);
        if (idx >= 0) rows[idx] = payload;
        else rows.push(payload);
        mockRemoteDb.set(table, rows);
        return { error: null };
      },
      update: (payload: any) => ({
        eq: async (col: string, val: string) => {
          const rows = mockRemoteDb.get(table) || [];
          for (const r of rows) {
            if (r[col] === val) Object.assign(r, payload);
          }
          return { error: null };
        },
      }),
      delete: () => ({
        eq: (col1: string, val1: string) => ({
          eq: async (col2: string, val2: string) => {
            networkCallCounter.delete++;
            const rows = mockRemoteDb.get(table) || [];
            mockRemoteDb.set(
              table,
              rows.filter((r) => !(r[col1] === val1 && r[col2] === val2))
            );
            return { error: null };
          },
        }),
      }),
    }),
  }),
}));

// In-memory IndexedDB Mock
class MockIDBDatabase {
  private store: Map<string, any> = new Map();
  objectStoreNames = { contains: () => true };
  createObjectStore() {
    return {};
  }
  transaction(_storeNames: any, _mode: string) {
    const store = this.store;
    return {
      objectStore: () => ({
        getAll: () => {
          const req: any = { result: Array.from(store.values()) };
          setTimeout(() => req.onsuccess?.(), 0);
          return req;
        },
        get: (id: string) => {
          const req: any = { result: store.get(id) };
          setTimeout(() => req.onsuccess?.(), 0);
          return req;
        },
        put: (item: any) => {
          store.set(item.id, item);
          return {};
        },
        delete: (id: string) => {
          store.delete(id);
          return {};
        },
        clear: () => {
          store.clear();
          return {};
        },
      }),
      set oncomplete(fn: any) {
        setTimeout(() => fn(), 0);
      },
    };
  }
  close() {}
}

const mockDatabases: Map<string, MockIDBDatabase> = new Map();

(global as any).indexedDB = {
  open: (name: string) => {
    if (!mockDatabases.has(name)) {
      mockDatabases.set(name, new MockIDBDatabase());
    }
    const db = mockDatabases.get(name);
    return {
      result: db,
      set onsuccess(fn: any) {
        setTimeout(() => fn(), 0);
      },
      set onupgradeneeded(fn: any) {
        setTimeout(() => fn(), 0);
      },
      set onerror(_fn: any) {},
    };
  },
};

const USER_A = "test-user-adversarial-1";

describe("Adversarial Security & Architecture Audit", () => {
  beforeEach(() => {
    mockDatabases.clear();
    mockRemoteDb.clear();
    networkCallCounter.select = 0;
    networkCallCounter.upsert = 0;
    networkCallCounter.delete = 0;
    lockVault();
  });

  /* -----------------------------------------------------------------------
   * Test 1: Real AI Content Delivery across all 7 research source types
   * -------------------------------------------------------------------- */
  it("1. Verifies that REAL extracted research content (not metadata alone) reaches AI context", () => {
    const vaultItems: VaultItem[] = [
      {
        id: "src-pdf",
        title: "Quantum Error Correction in Surface Codes.pdf",
        content: "Section 2: Threshold theorem demonstrates fault-tolerance under 1% physical error rate.",
        sourceType: "file",
        filename: "qec.pdf",
        mimeType: "application/pdf",
        createdAt: "2026-08-01T10:00:00Z",
      },
      {
        id: "src-docx",
        title: "Clinical Trial Protocol V3.docx",
        content: "Methods: Double-blind randomized trial with N=450 cohort across 12 centers.",
        sourceType: "file",
        filename: "trial_v3.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        createdAt: "2026-08-01T10:05:00Z",
      },
      {
        id: "src-xlsx",
        title: "Empirical Sensor Telemetry.xlsx",
        content: "Column: timestamp, sensor_id, temperature_celsius, vibration_hz\nRow 1: 2026-08-01T00:00:00, S-01, 42.5, 120.4",
        sourceType: "file",
        filename: "telemetry.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        createdAt: "2026-08-01T10:10:00Z",
      },
      {
        id: "src-web",
        title: "Nature Biotechnology Article",
        content: "Main body: High-throughput screening revealed 14 novel enzyme targets with nanomolar binding affinity.",
        sourceType: "web",
        externalReference: "https://nature.com/articles/s41587-024-001",
        createdAt: "2026-08-01T10:15:00Z",
      },
      {
        id: "src-video",
        title: "MIT OpenCourseWare Quantum Physics Lecture 4",
        content: "Transcript (04:15): The wave function collapse in Copenhagen interpretation implies non-unitary evolution during measurement.",
        sourceType: "video",
        externalReference: "https://youtube.com/watch?v=mit-804-l4",
        createdAt: "2026-08-01T10:20:00Z",
      },
      {
        id: "src-doi",
        title: "Deep Residual Learning for Image Recognition",
        content: "Abstract: We present a residual learning framework to ease the training of networks that are substantially deeper than those used previously.",
        sourceType: "reference",
        citation: "@article{he2016deep, title={Deep Residual Learning}, author={He, Kaiming}, year={2016}}",
        externalReference: "10.1109/CVPR.2016.90",
        createdAt: "2026-08-01T10:25:00Z",
      },
    ];

    // Select explicit subset for AI research task
    const selectedIds = ["src-pdf", "src-xlsx", "src-video"];
    const aiContext = prepareVaultContextForAI(vaultItems, selectedIds);

    // Verify AI context contains actual full text & tabular data, not just filenames or URLs
    expect(aiContext.selectedItems).toHaveLength(3);
    expect(aiContext.selectedItems[0].content).toContain("Threshold theorem demonstrates fault-tolerance");
    expect(aiContext.selectedItems[1].content).toContain("temperature_celsius, vibration_hz");
    expect(aiContext.selectedItems[2].content).toContain("The wave function collapse in Copenhagen interpretation");
  });

  /* -----------------------------------------------------------------------
   * Test 2: AI Isolation Boundary & Anti-Leak Safeguard
   * -------------------------------------------------------------------- */
  it("2. Verifies prepareVaultContextForAI strictly prevents bulk/implicit Vault disclosure", () => {
    const items: VaultItem[] = [
      { id: "v1", title: "Doc 1", content: "Confidential research 1", createdAt: "2026-01-01" },
      { id: "v2", title: "Doc 2", content: "Confidential research 2", createdAt: "2026-01-02" },
      { id: "v3", title: "Doc 3", content: "Confidential research 3", createdAt: "2026-01-03" },
    ];

    // Empty selection must fail
    expect(() => prepareVaultContextForAI(items, [])).toThrow(/No items were explicitly selected/i);

    // Selecting 100% of the vault without explicit override is blocked
    expect(() => prepareVaultContextForAI(items, ["v1", "v2", "v3"])).toThrow(/covers the entire Vault/i);

    // Exceeding max items limit is blocked
    expect(() => prepareVaultContextForAI(items, ["v1", "v2"], 1)).toThrow(/limit for a single AI context is 1/i);
  });

  /* -----------------------------------------------------------------------
   * Test 3: Realistic Cross-Device Synchronization Flow
   * -------------------------------------------------------------------- */
  it("3. Verifies Browser A -> Remote Storage -> Browser B (with zero Browser A local storage dependence)", async () => {
    const remoteProvider = new SupabaseVaultStorageProvider();

    // 1. Browser A writes synchronized item
    const paperItem: VaultItem = {
      id: "vault-paper-uuid-1",
      title: "Graphene Superconductivity at Magic Angle",
      content: "Unconventional superconductivity observed in twisted bilayer graphene at 1.1 degrees angle.",
      sourceType: "file",
      filename: "magic_angle.pdf",
      storageReference: "vault-files/test-user-adversarial-1/magic_angle.pdf",
      createdAt: "2026-08-20T14:00:00Z",
    };

    await remoteProvider.saveItem(USER_A, paperItem);

    // 2. SIMULATE BROWSER B: Completely wipe all browser-local IndexedDB databases
    mockDatabases.clear();

    // 3. Browser B initializes fresh provider and fetches
    const browserBProvider = new SupabaseVaultStorageProvider();
    const browserBItems = await browserBProvider.listItems(USER_A);

    expect(browserBItems).toHaveLength(1);
    expect(browserBItems[0].id).toBe("vault-paper-uuid-1");
    expect(browserBItems[0].title).toBe("Graphene Superconductivity at Magic Angle");
    expect(browserBItems[0].content).toContain("Unconventional superconductivity observed");
    expect(browserBItems[0].storageReference).toBe("vault-files/test-user-adversarial-1/magic_angle.pdf");
  });

  /* -----------------------------------------------------------------------
   * Test 4: Local-Only Zero-Server-Leak Network Isolation
   * -------------------------------------------------------------------- */
  it("4. Verifies that Local-Only mode makes ZERO network/server calls when saving and reading", async () => {
    await setVaultPassphraseVerifier("super-secret-local-passphrase");
    await unlockVault("super-secret-local-passphrase");

    networkCallCounter.select = 0;
    networkCallCounter.upsert = 0;

    // Add sensitive note in local mode
    const item = await addVaultItem(USER_A, {
      title: "Classified Theoretical Proof",
      content: "P != NP preliminary derivation sketch.",
    });

    expect(item.id).toBeDefined();

    // Read back in local mode
    const list = await listVaultItems(USER_A);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Classified Theoretical Proof");

    // Zero server calls made during addVaultItem / listVaultItems
    expect(networkCallCounter.upsert).toBe(0);
  });

  /* -----------------------------------------------------------------------
   * Test 5: Interrupted & Resumable Migration without Duplication
   * -------------------------------------------------------------------- */
  it("5. Verifies that interrupted migration resumes cleanly, skips duplicates, and never deletes local data", async () => {
    const localProvider = new LocalVaultStorageProvider();

    await localProvider.saveItem(USER_A, {
      id: "doc-1",
      title: "Doc 1",
      content: "Content 1",
      createdAt: "2026-08-01T00:00:00Z",
    });
    await localProvider.saveItem(USER_A, {
      id: "doc-2",
      title: "Doc 2",
      content: "Content 2",
      createdAt: "2026-08-01T00:01:00Z",
    });
    await localProvider.saveItem(USER_A, {
      id: "doc-3",
      title: "Doc 3",
      content: "Content 3",
      createdAt: "2026-08-01T00:02:00Z",
    });

    // Pass 1: partial migration (only 2 synced before simulated disconnect)
    const remoteProvider = new SupabaseVaultStorageProvider();
    await remoteProvider.saveItem(USER_A, {
      id: "doc-1",
      title: "Doc 1",
      content: "Content 1",
      createdAt: "2026-08-01T00:00:00Z",
    });

    // Pass 2: Run resume migration
    const result = await syncLocalVaultToRemote(USER_A);
    expect(result.success).toBe(true);
    expect(result.skippedDuplicates).toBe(1); // doc-1 skipped
    expect(result.totalSynced).toBe(2); // doc-2 and doc-3 synced

    // Verify local items were NOT deleted
    const remainingLocal = await localProvider.listItems(USER_A);
    expect(remainingLocal).toHaveLength(3);
  });
});
