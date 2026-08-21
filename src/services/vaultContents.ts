/**
 * Knowledge Vault contents — the material itself, encrypted at rest with
 * the Vault passphrase (docs 25 §6.3: "It stays on your computer,
 * encrypted").
 *
 * `userVault.ts` deliberately stores nothing about the Vault's contents
 * server-side — only that one exists. This module is the other half:
 * where the material actually lives once a Vault has one.
 *
 * V1 SCOPE: manual text entries only — a title, the material itself, and an
 * optional source citation. No PDF/photo/file import: that needs
 * server-side parsing (`/api/parse-file`), which is the same
 * not-built-yet OCR/parsing gap already named honestly elsewhere (reference-
 * manager import, VaultSetupScreen's "Import an existing library"). Building
 * a fake import path here would contradict that same honesty.
 *
 * ENCRYPTION. Each item is encrypted independently with
 * `encryptDataAsync`/`decryptDataAsync` (src/utils/crypto.ts —
 * PBKDF2-SHA256, 100k iterations, a fresh random salt and IV per call, AES-
 * GCM-256). The passphrase itself is never persisted anywhere — it lives in
 * the module-scope `activePassphrase` below for the current tab only,
 * cleared on reload, mirroring `apiVault.ts`'s in-memory-only "passphrase
 * mode" and the promise the Recovery Kit makes: if it is forgotten, only the
 * recovery code opens the Vault again, because there is nothing else on
 * this device or any server that remembers it.
 *
 * STORAGE. IndexedDB, one database per signed-in user
 * (`scholar-vault-items:<userId>`) — origin-scoped storage otherwise has no
 * concept of "signed out", so without this a second account on the same
 * browser would try to decrypt the first account's items with the wrong
 * passphrase (harmless — AES-GCM fails closed — but `listVaultItems` needs
 * to not even attempt it, the same reasoning behind userVault.ts's verifier
 * scoping fix).
 */

import { decryptDataAsync, encryptDataAsync } from "../utils/crypto";
import { verifyVaultPassphrase } from "./userVault";

export interface VaultItem {
  id: string;
  title: string;
  content: string;
  citation?: string;
  authors?: string[];
  year?: string;
  journal?: string;
  createdAt: string;
}

interface StoredItem {
  id: string;
  createdAt: string;
  /** encryptDataAsync() over JSON.stringify({ title, content, citation }) */
  ciphertext: string;
}

const IDB_STORE = "items";

/* -------------------------------------------------------------------------
 * Unlock state — in memory only, this tab, until reload or explicit lock.
 * ---------------------------------------------------------------------- */

let activePassphrase: string | null = null;

export function isVaultUnlocked(): boolean {
  return activePassphrase !== null;
}

export function lockVault(): void {
  activePassphrase = null;
}

/** Verifies against userVault.ts's device-local verifier before caching anything, so a wrong passphrase never gets used to encrypt. */
export async function unlockVault(passphrase: string): Promise<boolean> {
  const ok = await verifyVaultPassphrase(passphrase);
  if (ok) activePassphrase = passphrase;
  return ok;
}

function requirePassphrase(): string {
  if (activePassphrase === null) throw new Error("The Vault is locked.");
  return activePassphrase;
}

/* -------------------------------------------------------------------------
 * IndexedDB
 * ---------------------------------------------------------------------- */

function dbName(userId: string): string {
  return `scholar-vault-items:${userId}`;
}

function openDb(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName(userId), 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGetAll(userId: string): Promise<StoredItem[]> {
  const db = await openDb(userId);
  try {
    return await new Promise<StoredItem[]>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = () => resolve(req.result as StoredItem[]);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbPut(userId: string, item: StoredItem): Promise<void> {
  const db = await openDb(userId);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbDelete(userId: string, id: string): Promise<void> {
  const db = await openDb(userId);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/* -------------------------------------------------------------------------
 * Items
 * ---------------------------------------------------------------------- */

export async function addVaultItem(
  userId: string,
  fields: { title: string; content: string; citation?: string }
): Promise<VaultItem> {
  const passphrase = requirePassphrase();
  const item: VaultItem = {
    id: crypto.randomUUID(),
    title: fields.title,
    content: fields.content,
    citation: fields.citation,
    createdAt: new Date().toISOString(),
  };
  const ciphertext = await encryptDataAsync(JSON.stringify({ title: item.title, content: item.content, citation: item.citation }), passphrase);
  await idbPut(userId, { id: item.id, createdAt: item.createdAt, ciphertext });
  return item;
}

/**
 * All items, decrypted, newest first. An item that fails to decrypt — the
 * wrong passphrase somehow got cached, or the record is corrupted — is
 * dropped rather than failing the whole list, so one bad record cannot take
 * down access to everything else in the Vault.
 */
export async function listVaultItems(userId: string): Promise<VaultItem[]> {
  const passphrase = requirePassphrase();
  const stored = await idbGetAll(userId);
  const items: VaultItem[] = [];
  for (const s of stored) {
    try {
      const plain = JSON.parse(await decryptDataAsync(s.ciphertext, passphrase)) as {
        title: string;
        content: string;
        citation?: string;
      };
      items.push({ id: s.id, createdAt: s.createdAt, ...plain });
    } catch {
      // See doc comment above.
    }
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Adds several items in sequence, returning what was actually saved — the batch shape a reference import produces. */
export async function addVaultItems(
  userId: string,
  items: Array<{ title: string; content: string; citation?: string }>
): Promise<VaultItem[]> {
  const saved: VaultItem[] = [];
  for (const fields of items) {
    saved.push(await addVaultItem(userId, fields));
  }
  return saved;
}

/** Does not require the Vault to be unlocked — deleting a record needs no decryption. */
export async function deleteVaultItem(userId: string, id: string): Promise<void> {
  await idbDelete(userId, id);
}

/** Client-side substring search over already-decrypted items — there is no server index to query. */
export function searchVaultItems(items: VaultItem[], query: string): VaultItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (i) => i.title.toLowerCase().includes(q) || i.content.toLowerCase().includes(q) || (i.citation ?? "").toLowerCase().includes(q)
  );
}

/* -------------------------------------------------------------------------
 * P2-1: AI → Vault isolation boundary
 *
 * RULE: if a user asks AI to work with a Vault item, only that explicitly
 * selected item (or a small, explicit allowlist of items) may be passed.
 * The entire Vault must NEVER be sent to AI automatically.
 *
 * Why here, not at the call site:
 * The function is the single chokepoint. Every future AI integration that
 * touches Vault content MUST call this function. Building the guard here means
 * a well-intentioned caller cannot accidentally pass `listVaultItems()` and
 * silently expose the whole Vault.
 *
 * Conflict #7 invariant: Vault content is client-held and passphrase-
 * encrypted. Only explicitly selected items may be exposed to AI, and only
 * within the client — no Vault content travels to the Scholar server.
 * ---------------------------------------------------------------------- */

export interface VaultAIContext {
  /** The items approved for AI use in this interaction. */
  selectedItems: Pick<VaultItem, "id" | "title" | "content" | "citation">[];
  /** Total number of items in the Vault at selection time — for logging only, never sent to AI. */
  _vaultSizeAtSelection: number;
}

/**
 * Prepares a strictly limited Vault context for AI use.
 *
 * The caller MUST provide explicit `selectedIds`. Passing an empty array is an
 * error — it means "no selection was made" and nothing should go to AI. Passing
 * the full `allItems` list without a selection is blocked: if the IDs cover
 * every item in the Vault, this throws rather than silently exposing all content.
 *
 * @param allItems  All decrypted Vault items for this user (from listVaultItems).
 * @param selectedIds  The IDs explicitly chosen by the user for this AI interaction.
 * @param maxItems  Upper bound on context size (default 5 — prevents accidental bulk export).
 */
export function prepareVaultContextForAI(
  allItems: VaultItem[],
  selectedIds: string[],
  maxItems = 5
): VaultAIContext {
  if (selectedIds.length === 0) {
    throw new Error(
      "[Vault AI isolation] No items were explicitly selected. " +
      "AI must only receive items the user has chosen, not the entire Vault."
    );
  }
  // Check entire-vault coverage FIRST so the error is informative rather than
  // appearing to be a count-limit issue. Any selection that covers 100% of the
  // Vault is blocked regardless of size — "all items" is never an explicit selection.
  if (allItems.length > 1 && selectedIds.length === allItems.length) {
    throw new Error(
      "[Vault AI isolation] The selection covers the entire Vault. " +
      "Pass only the items the user explicitly chose, not all items. " +
      "If full-Vault AI access is intentionally required, increase maxItems with product approval and " +
      "document the decision in the call site."
    );
  }
  if (selectedIds.length > maxItems) {
    throw new Error(
      `[Vault AI isolation] ${selectedIds.length} items selected but the limit for a single AI context is ${maxItems}. ` +
      "Reduce the selection or increase maxItems only after explicit product approval."
    );
  }
  const idSet = new Set(selectedIds);
  const selectedItems = allItems
    .filter((i) => idSet.has(i.id))
    .map(({ id, title, content, citation }) => ({ id, title, content, citation }));

  if (selectedItems.length === 0) {
    throw new Error(
      "[Vault AI isolation] None of the selected IDs matched items in the decrypted Vault. " +
      "Ensure the Vault is unlocked and the IDs are current."
    );
  }
  return {
    selectedItems,
    _vaultSizeAtSelection: allItems.length,
  };
}
