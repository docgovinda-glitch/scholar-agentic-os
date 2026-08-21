import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  LocalVaultStorageProvider,
  SupabaseVaultStorageProvider,
  resolveVaultProvider,
  syncLocalVaultToRemote,
  type VaultItem,
} from "../VaultStorageProvider";

const mockSupabaseStore: Map<string, any[]> = new Map();

vi.mock("../../supabaseClient", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "user_vault_items") {
        return {
          select: (_cols?: string) => ({
            eq: (col1: string, val1: string) => ({
              eq: (col2: string, val2: string) => ({
                maybeSingle: async () => {
                  const rows = mockSupabaseStore.get(table) || [];
                  const found = rows.find((r) => r[col1] === val1 && r[col2] === val2);
                  return { data: found || null, error: null };
                },
              }),
              order: () => async () => {
                const rows = mockSupabaseStore.get(table) || [];
                return { data: rows.filter((r) => r[col1] === val1), error: null };
              },
              then: (resolve: any) => {
                const rows = mockSupabaseStore.get(table) || [];
                resolve({ data: rows.filter((r) => r[col1] === val1), error: null });
              },
            }),
          }),
          upsert: async (payload: any) => {
            const rows = mockSupabaseStore.get(table) || [];
            const idx = rows.findIndex((r) => r.id === payload.id);
            if (idx >= 0) rows[idx] = payload;
            else rows.push(payload);
            mockSupabaseStore.set(table, rows);
            return { error: null };
          },
          delete: () => ({
            eq: (col1: string, val1: string) => ({
              eq: async (col2: string, val2: string) => {
                const rows = mockSupabaseStore.get(table) || [];
                mockSupabaseStore.set(
                  table,
                  rows.filter((r) => !(r[col1] === val1 && r[col2] === val2))
                );
                return { error: null };
              },
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

// Mock IndexedDB
class MockIDBDatabase {
  private store: Map<string, any> = new Map();
  objectStoreNames = {
    contains: (_name: string) => true,
  };

  createObjectStore(_name: string, _options?: any) {
    return {};
  }

  transaction(_storeNames: any, _mode: string) {
    const store = this.store;
    return {
      objectStore: (_name: string) => ({
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

const TEST_USER = "user-test-vault-123";

describe("Universal Knowledge Vault Storage Provider Layer", () => {
  beforeEach(() => {
    mockDatabases.clear();
    mockSupabaseStore.clear();
  });

  it("1. LocalVaultStorageProvider saves, lists, searches, and deletes multi-source items", async () => {
    const provider = new LocalVaultStorageProvider();
    expect(provider.getStorageMode()).toBe("local");

    const item1: VaultItem = {
      id: "vault-1",
      title: "Quantum Key Distribution Protocol",
      content: "Detailed notes on Bennett-Brassard 1984 protocol.",
      sourceType: "file",
      filename: "bb84.pdf",
      mimeType: "application/pdf",
      createdAt: new Date().toISOString(),
    };

    const item2: VaultItem = {
      id: "vault-2",
      title: "Nature Physics Article",
      content: "Entanglement distribution over satellite links.",
      sourceType: "web",
      externalReference: "https://nature.com/articles/s41567-024",
      createdAt: new Date().toISOString(),
    };

    await provider.saveItem(TEST_USER, item1);
    await provider.saveItem(TEST_USER, item2);

    const all = await provider.listItems(TEST_USER);
    expect(all).toHaveLength(2);

    const searchResults = await provider.searchItems(TEST_USER, "satellite");
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0].id).toBe("vault-2");

    await provider.deleteItem(TEST_USER, "vault-1");
    const remaining = await provider.listItems(TEST_USER);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("vault-2");
  });

  it("2. resolveVaultProvider returns correct provider instance based on mode", () => {
    const local = resolveVaultProvider("local");
    expect(local.getStorageMode()).toBe("local");

    const synced = resolveVaultProvider("synced");
    expect(synced.getStorageMode()).toBe("synced");
  });

  it("3. syncLocalVaultToRemote migrates local items to remote storage without duplicates", async () => {
    const localProvider = new LocalVaultStorageProvider();

    // Populate local items
    await localProvider.saveItem(TEST_USER, {
      id: "local-item-1",
      title: "Empirical Analysis of LLM Reasoning",
      content: "Benchmark scores on GSM8K and MATH datasets.",
      sourceType: "file",
      filename: "eval.xlsx",
      createdAt: new Date().toISOString(),
    });

    await localProvider.saveItem(TEST_USER, {
      id: "local-item-2",
      title: "YouTube Lecture on Quantum Computing",
      content: "Transcript: Introduction to Shor's algorithm.",
      sourceType: "video",
      externalReference: "https://youtube.com/watch?v=xyz",
      createdAt: new Date().toISOString(),
    });

    const progressUpdates: any[] = [];
    const result = await syncLocalVaultToRemote(TEST_USER, (p) => progressUpdates.push(p));

    expect(result.success).toBe(true);
    expect(result.totalSynced).toBe(2);
    expect(result.skippedDuplicates).toBe(0);
    expect(progressUpdates.length).toBeGreaterThan(0);

    // Run sync again to verify deduplication
    const secondResult = await syncLocalVaultToRemote(TEST_USER);
    expect(secondResult.success).toBe(true);
    expect(secondResult.skippedDuplicates).toBe(2);
    expect(secondResult.totalSynced).toBe(0);
  });

  it("4. Cross-Device Simulation: Browser A saves synchronized item -> Browser B retrieves it", async () => {
    const browserAProvider = new SupabaseVaultStorageProvider();
    const browserBProvider = new SupabaseVaultStorageProvider();

    const sharedItem: VaultItem = {
      id: "synced-cross-device-1",
      title: "Interdisciplinary Research Notes",
      content: "Full extracted textual content from research paper.",
      sourceType: "file",
      filename: "research.docx",
      createdAt: new Date().toISOString(),
    };

    // Browser A adds item
    await browserAProvider.saveItem(TEST_USER, sharedItem);

    // Browser B logs in and fetches
    const browserBItems = await browserBProvider.listItems(TEST_USER);
    expect(browserBItems.length).toBeGreaterThanOrEqual(1);
    const found = browserBItems.find((i) => i.id === "synced-cross-device-1");
    expect(found).toBeDefined();
    expect(found?.content).toBe("Full extracted textual content from research paper.");
  });
});
