/**
 * Knowledge Vault contents — the material itself, encrypted at rest with
 * the Vault passphrase (docs 25 §6.3: "It stays on your computer,
 * encrypted").
 *
 * `userVault.ts` deliberately stores nothing about the Vault's contents
 * server-side — only that one exists. This module is the other half:
 * where the material actually lives once a Vault has one.
 *
 * MULTI-SOURCE SUPPORT:
 * Supports PDFs, DOCX, XLSX, CSV, Web URLs, YouTube videos, BibTeX/RIS, and notes.
 *
 * ENCRYPTION. Each item is encrypted independently with
 * `encryptDataAsync`/`decryptDataAsync` (src/utils/crypto.ts —
 * PBKDF2-SHA256, 100k iterations, a fresh random salt and IV per call, AES-
 * GCM-256). The passphrase itself is never persisted anywhere — it lives in
 * the module-scope `activePassphrase` below for the current tab only.
 *
 * STORAGE. IndexedDB, one database per signed-in user (`scholar-vault-items:<userId>`).
 */

import { decryptDataAsync, encryptDataAsync } from "../utils/crypto";
import { verifyVaultPassphrase } from "./userVault";
import type { CanonicalReference } from "../citation_compliance/model/reference";

export type VaultSourceType = "file" | "web" | "video" | "reference" | "custom" | "text";
export type CitationStatus = "missing" | "needs_user_review" | "confirmed";

export interface VaultItem {
  id: string;
  title: string;
  content: string;
  sourceType?: VaultSourceType;
  filename?: string;
  mimeType?: string;
  externalReference?: string;
  storageReference?: string;
  citation?: string;
  citationStatus?: CitationStatus;
  canonicalReference?: CanonicalReference;
  authors?: string[];
  year?: string;
  journal?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
}

interface StoredItem {
  id: string;
  createdAt: string;
  /** encryptDataAsync() over JSON.stringify({ title, content, citation, ... }) */
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
 * IndexedDB (Device-Local storage & offline cache)
 * ---------------------------------------------------------------------- */

function dbName(userId: string): string {
  return `scholar-vault-items:${userId}`;
}

function openDb(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB not available."));
    }
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

export async function clearVaultItems(userId: string): Promise<void> {
  const db = await openDb(userId);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/* -------------------------------------------------------------------------
 * Vault Items CRUD (Client-Side Encrypted)
 * ---------------------------------------------------------------------- */

export async function addVaultItem(
  userId: string,
  fields: {
    title: string;
    content: string;
    citation?: string;
    citationStatus?: CitationStatus;
    canonicalReference?: CanonicalReference;
    sourceType?: VaultSourceType;
    filename?: string;
    mimeType?: string;
    externalReference?: string;
    storageReference?: string;
    authors?: string[];
    year?: string;
    journal?: string;
    metadata?: Record<string, any>;
  }
): Promise<VaultItem> {
  const passphrase = requirePassphrase();

  const item: VaultItem = {
    id: crypto.randomUUID(),
    title: fields.title,
    content: fields.content,
    citation: fields.citation,
    citationStatus: fields.citationStatus || (fields.citation || fields.canonicalReference ? "confirmed" : "missing"),
    canonicalReference: fields.canonicalReference,
    sourceType: fields.sourceType || "file",
    filename: fields.filename,
    mimeType: fields.mimeType,
    externalReference: fields.externalReference,
    storageReference: fields.storageReference,
    authors: fields.authors,
    year: fields.year,
    journal: fields.journal,
    metadata: fields.metadata || {},
    createdAt: new Date().toISOString(),
  };

  const ciphertext = await encryptDataAsync(
    JSON.stringify({
      title: item.title,
      content: item.content,
      citation: item.citation,
      citationStatus: item.citationStatus,
      canonicalReference: item.canonicalReference,
      sourceType: item.sourceType,
      filename: item.filename,
      mimeType: item.mimeType,
      externalReference: item.externalReference,
      storageReference: item.storageReference,
      authors: item.authors,
      year: item.year,
      journal: item.journal,
      metadata: item.metadata,
    }),
    passphrase
  );
  await idbPut(userId, { id: item.id, createdAt: item.createdAt, ciphertext });

  return item;
}

/**
 * All items, decrypted, newest first. An item that fails to decrypt is
 * dropped rather than failing the whole list.
 */
export async function listVaultItems(userId: string): Promise<VaultItem[]> {
  const passphrase = requirePassphrase();
  const stored = await idbGetAll(userId);
  const items: VaultItem[] = [];
  for (const s of stored) {
    try {
      const plain = JSON.parse(await decryptDataAsync(s.ciphertext, passphrase)) as any;
      const citationStatus: CitationStatus = plain.citationStatus || (plain.citation || plain.canonicalReference ? "needs_user_review" : "missing");
      items.push({ id: s.id, createdAt: s.createdAt, ...plain, citationStatus });
    } catch {
      // dropped rather than failing whole list
    }
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Adds several items in sequence, returning what was saved. */
export async function addVaultItems(
  userId: string,
  items: Array<{
    title: string;
    content: string;
    citation?: string;
    citationStatus?: CitationStatus;
    canonicalReference?: CanonicalReference;
    sourceType?: VaultSourceType;
    filename?: string;
    mimeType?: string;
    externalReference?: string;
    storageReference?: string;
    authors?: string[];
    year?: string;
    journal?: string;
    metadata?: Record<string, any>;
  }>
): Promise<VaultItem[]> {
  const saved: VaultItem[] = [];
  for (const fields of items) {
    saved.push(await addVaultItem(userId, fields));
  }
  return saved;
}

/** Updates citation metadata and status for a local vault item. */
export async function updateVaultItemCitation(
  userId: string,
  id: string,
  canonicalReference: CanonicalReference,
  citationStatus: CitationStatus = "confirmed",
  formattedCitation?: string
): Promise<VaultItem | null> {
  const passphrase = requirePassphrase();
  const items = await listVaultItems(userId);
  const existing = items.find((i) => i.id === id);
  if (!existing) return null;

  const updated: VaultItem = {
    ...existing,
    canonicalReference,
    citationStatus,
    citation: formattedCitation || existing.citation,
    updatedAt: new Date().toISOString(),
  };

  const ciphertext = await encryptDataAsync(
    JSON.stringify({
      title: updated.title,
      content: updated.content,
      citation: updated.citation,
      citationStatus: updated.citationStatus,
      canonicalReference: updated.canonicalReference,
      sourceType: updated.sourceType,
      filename: updated.filename,
      mimeType: updated.mimeType,
      externalReference: updated.externalReference,
      storageReference: updated.storageReference,
      authors: updated.authors,
      year: updated.year,
      journal: updated.journal,
      metadata: updated.metadata,
    }),
    passphrase
  );

  await idbPut(userId, { id: updated.id, createdAt: updated.createdAt, ciphertext });
  return updated;
}

/** Deletes a vault item from local storage. */
export async function deleteVaultItem(userId: string, id: string): Promise<void> {
  await idbDelete(userId, id);
}

/** Client-side substring search over already-decrypted items. */
export function searchVaultItems(items: VaultItem[], query: string): VaultItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (i) =>
      i.title.toLowerCase().includes(q) ||
      i.content.toLowerCase().includes(q) ||
      (i.citation ?? "").toLowerCase().includes(q) ||
      (i.filename ?? "").toLowerCase().includes(q) ||
      (i.externalReference ?? "").toLowerCase().includes(q)
  );
}

/* -------------------------------------------------------------------------
 * AI → Vault isolation boundary (Mandatory Policy)
 * ---------------------------------------------------------------------- */

export interface VaultAIContext {
  /** The items approved for AI use in this interaction. */
  selectedItems: (Pick<VaultItem, "id" | "title" | "content" | "citation"> & { citationStatus?: CitationStatus })[];
  /** Total number of items in the Vault at selection time — for logging only. */
  _vaultSizeAtSelection: number;
}

/**
 * Prepares a strictly limited Vault context for AI use.
 *
 * The caller MUST provide explicit `selectedIds`. Passing an empty array is an
 * error. Passing the full `allItems` list without a selection is blocked.
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
    .map(({ id, title, content, citation, citationStatus }) => ({
      id,
      title,
      content,
      citation,
      citationStatus: citationStatus || (citation ? "needs_user_review" : "missing"),
    }));

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
