// @vitest-environment jsdom
//
// Knowledge Vault contents.
//
// Doc 25 §6.3's promise is "It stays on your computer, encrypted" — this
// file is what makes that literally true rather than aspirational: every
// item that reaches IndexedDB has already been through encryptDataAsync,
// and the passphrase that key derives from is never written anywhere.

import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const verifyVaultPassphrase = vi.fn();
vi.mock("../userVault", () => ({ verifyVaultPassphrase: (...a: unknown[]) => verifyVaultPassphrase(...a) }));

const {
  addVaultItem,
  listVaultItems,
  deleteVaultItem,
  searchVaultItems,
  unlockVault,
  lockVault,
  isVaultUnlocked,
} = await import("../vaultContents");

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  verifyVaultPassphrase.mockImplementation(async (p: string) => p === "correct horse");
});

afterEach(async () => {
  lockVault();
  vi.clearAllMocks();
  // fake-indexeddb persists across tests within a file; each test that
  // writes items needs a clean database, not the previous test's leftovers.
  await Promise.all(
    [USER, OTHER_USER].map(
      (id) =>
        new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(`scholar-vault-items:${id}`);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
        })
    )
  );
});

describe("unlocking", () => {
  it("is locked until a correct passphrase is given", async () => {
    expect(isVaultUnlocked()).toBe(false);
    expect(await unlockVault("correct horse")).toBe(true);
    expect(isVaultUnlocked()).toBe(true);
  });

  it("does not unlock on a wrong passphrase", async () => {
    expect(await unlockVault("wrong")).toBe(false);
    expect(isVaultUnlocked()).toBe(false);
  });

  it("refuses to add or list while locked", async () => {
    await expect(addVaultItem(USER, { title: "x", content: "y" })).rejects.toThrow(/locked/i);
    await expect(listVaultItems(USER)).rejects.toThrow(/locked/i);
  });

  it("can be locked again explicitly", async () => {
    await unlockVault("correct horse");
    lockVault();
    expect(isVaultUnlocked()).toBe(false);
  });
});

describe("items", () => {
  beforeEach(async () => {
    await unlockVault("correct horse");
  });

  it("round-trips a saved item", async () => {
    const saved = await addVaultItem(USER, {
      title: "Longitudinal effects of microplastics",
      content: "Zhang & Petrova, 2019 — key finding was...",
      citation: "Zhang, W., & Petrova, I. (2019).",
    });

    const items = await listVaultItems(USER);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(saved);
  });

  it("never stores the plaintext title or content in IndexedDB", async () => {
    await addVaultItem(USER, { title: "A distinctive title", content: "distinctive-content-marker" });

    // Read the raw record straight out of IndexedDB, bypassing the module's
    // own decrypt path — this is the actual promise being tested.
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

    const serialised = JSON.stringify(raw);
    expect(serialised).not.toContain("A distinctive title");
    expect(serialised).not.toContain("distinctive-content-marker");
  });

  it("lists newest first", async () => {
    const first = await addVaultItem(USER, { title: "First", content: "..." });
    await new Promise((r) => setTimeout(r, 2));
    const second = await addVaultItem(USER, { title: "Second", content: "..." });

    const items = await listVaultItems(USER);
    expect(items.map((i) => i.id)).toEqual([second.id, first.id]);
  });

  it("deletes an item", async () => {
    const item = await addVaultItem(USER, { title: "Gone soon", content: "..." });
    await deleteVaultItem(USER, item.id);

    expect(await listVaultItems(USER)).toHaveLength(0);
  });

  it("keeps different users' items in separate stores", async () => {
    await addVaultItem(USER, { title: "Mine", content: "..." });
    await addVaultItem(OTHER_USER, { title: "Someone else's", content: "..." });

    expect((await listVaultItems(USER)).map((i) => i.title)).toEqual(["Mine"]);
    expect((await listVaultItems(OTHER_USER)).map((i) => i.title)).toEqual(["Someone else's"]);
  });

  it("drops a record that fails to decrypt instead of failing the whole list", async () => {
    const good = await addVaultItem(USER, { title: "Readable", content: "..." });
    await addVaultItem(USER, { title: "Will be corrupted", content: "..." });

    // Simulate corruption/wrong-key by mangling one stored ciphertext directly.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(`scholar-vault-items:${USER}`, 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("items", "readwrite");
      const store = tx.objectStore("items");
      const getReq = store.getAll();
      getReq.onsuccess = () => {
        const records = getReq.result as { id: string; createdAt: string; ciphertext: string }[];
        const corrupted = records.find((r) => r.id !== good.id)!;
        store.put({ ...corrupted, ciphertext: "v2:not-valid-ciphertext" });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const items = await listVaultItems(USER);
    expect(items.map((i) => i.id)).toEqual([good.id]);
  });
});

describe("search", () => {
  const items = [
    { id: "1", title: "Microplastics in freshwater", content: "invertebrate populations", createdAt: "2026-01-01" },
    { id: "2", title: "Remote work", content: "tacit knowledge sharing", citation: "Smith 2020", createdAt: "2026-01-02" },
  ];

  it("matches title, content, or citation", () => {
    expect(searchVaultItems(items, "microplastic").map((i) => i.id)).toEqual(["1"]);
    expect(searchVaultItems(items, "tacit").map((i) => i.id)).toEqual(["2"]);
    expect(searchVaultItems(items, "smith").map((i) => i.id)).toEqual(["2"]);
  });

  it("returns everything for a blank query", () => {
    expect(searchVaultItems(items, "  ")).toHaveLength(2);
  });

  it("returns nothing for no match", () => {
    expect(searchVaultItems(items, "nonexistent")).toHaveLength(0);
  });
});
