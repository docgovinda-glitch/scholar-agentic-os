import { describe, it, expect, beforeEach } from "vitest";
import { LocalVaultStorageProvider, type VaultItem } from "../VaultStorageProvider";
import type { CanonicalReference } from "../../../citation_compliance/model/reference";

// Mock IndexedDB in-memory store
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

describe("Vault Citation Readiness Persistence", () => {
  const userId = "test-user-citation-42";
  const localProvider = new LocalVaultStorageProvider();

  beforeEach(async () => {
    const items = await localProvider.listItems(userId);
    for (const item of items) {
      await localProvider.deleteItem(userId, item.id);
    }
  });

  it("stores and retrieves raw items with missing citation status", async () => {
    const item: VaultItem = {
      id: "vault-item-raw-1",
      title: "Raw Research Notes",
      content: "Important experimental findings without formal publication metadata.",
      createdAt: new Date().toISOString(),
      citationStatus: "missing",
    };

    await localProvider.saveItem(userId, item);
    const retrieved = await localProvider.getItem(userId, "vault-item-raw-1");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.citationStatus).toBe("missing");
    expect(retrieved?.canonicalReference).toBeUndefined();
  });

  it("stores and retrieves items in needs_user_review state", async () => {
    const item: VaultItem = {
      id: "vault-item-review-1",
      title: "Imported PDF without full verification",
      content: "Deep Learning text extraction...",
      citation: "LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature, 521(7553), 436-444.",
      citationStatus: "needs_user_review",
      createdAt: new Date().toISOString(),
    };

    await localProvider.saveItem(userId, item);
    const retrieved = await localProvider.getItem(userId, "vault-item-review-1");
    expect(retrieved?.citationStatus).toBe("needs_user_review");
    expect(retrieved?.citation).toContain("Nature");
  });

  it("stores and retrieves confirmed items with full CanonicalReference", async () => {
    const canonicalRef: CanonicalReference = {
      kind: "JournalArticle",
      title: "Deep Learning",
      authors: [
        { firstName: "Yann", lastName: "LeCun", order: 1 },
        { firstName: "Yoshua", lastName: "Bengio", order: 2 },
        { firstName: "Geoffrey", lastName: "Hinton", order: 3 },
      ],
      journal: "Nature",
      source: "Nature",
      year: "2015",
      volume: "521",
      pages: "436-444",
      doi: "10.1038/nature14539",
    };

    const item: VaultItem = {
      id: "vault-item-confirmed-1",
      title: "Deep Learning",
      content: "Deep learning allows computational models composed of multiple processing layers...",
      citation: "LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature, 521(7553), 436–444.",
      citationStatus: "confirmed",
      canonicalReference: canonicalRef,
      createdAt: new Date().toISOString(),
    };

    await localProvider.saveItem(userId, item);
    const retrieved = await localProvider.getItem(userId, "vault-item-confirmed-1");
    expect(retrieved?.citationStatus).toBe("confirmed");
    expect(retrieved?.canonicalReference).toEqual(canonicalRef);
    expect(retrieved?.canonicalReference?.doi).toBe("10.1038/nature14539");
  });
});
