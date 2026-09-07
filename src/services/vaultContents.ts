/**
 * Knowledge Vault contents — Universal cross-device and client-side encrypted repository.
 *
 * MULTI-SOURCE SUPPORT:
 * Supports PDFs, DOCX, XLSX, CSV, Google Drive, OneDrive, Web URLs, YouTube videos, BibTeX/RIS, and notes.
 *
 * DUAL STORAGE ENGINE:
 * 1. Synchronized Account Storage: Supabase `user_vault_items` with strict RLS and cross-device sync.
 * 2. Device-Local Mode: IndexedDB (`scholar-vault-items:<userId>`) client-side encrypted with AES-GCM-256.
 */

import { decryptDataAsync, encryptDataAsync } from "../utils/crypto";
import { verifyVaultPassphrase, getVaultStorageMode } from "./userVault";
import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient";
import type { CanonicalReference } from "../citation_compliance/model/reference";

export type VaultSourceType = "file" | "web" | "video" | "reference" | "drive_google" | "drive_onedrive" | "custom" | "text";
export type CitationStatus = "missing" | "needs_user_review" | "confirmed";
export type RetractionStatus = "clean" | "retracted" | "expression_of_concern" | "unknown";

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
  collection?: string;
  tags?: string[];
  retractionStatus?: RetractionStatus;
  retractionDetails?: {
    noticeUrl?: string;
    reason?: string;
    date?: string;
  };
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
let sessionUnlocked: boolean = false;

export function isVaultUnlocked(): boolean {
  return activePassphrase !== null || sessionUnlocked;
}

export function setSessionUnlocked(unlocked: boolean, passphrase?: string): void {
  sessionUnlocked = unlocked;
  if (passphrase) activePassphrase = passphrase;
  if (!unlocked) activePassphrase = null;
}

export function lockVault(): void {
  activePassphrase = null;
  sessionUnlocked = false;
}

/** Verifies against userVault.ts's device-local verifier before caching anything */
export async function unlockVault(passphrase: string): Promise<boolean> {
  const ok = await verifyVaultPassphrase(passphrase);
  if (ok) {
    activePassphrase = passphrase;
    sessionUnlocked = true;
  }
  return ok;
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
  if (typeof indexedDB !== "undefined") {
    try {
      const db = await openDb(userId);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {}
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      await supabase.from("user_vault_items").delete().eq("user_id", userId);
    } catch {}
  }
}

/* -------------------------------------------------------------------------
 * Vault Items CRUD (Universal Cloud + Local Encryption Fallback)
 * ---------------------------------------------------------------------- */

async function getStorageModeSafe(): Promise<"local" | "synced"> {
  try {
    if (typeof getVaultStorageMode === "function") {
      return await getVaultStorageMode();
    }
  } catch {}
  return "local";
}

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
    collection?: string;
    tags?: string[];
    retractionStatus?: RetractionStatus;
    retractionDetails?: {
      noticeUrl?: string;
      reason?: string;
      date?: string;
    };
    metadata?: Record<string, any>;
  }
): Promise<VaultItem> {
  if (!isVaultUnlocked()) {
    throw new Error("The Vault is locked.");
  }

  const meta = {
    ...(fields.metadata || {}),
    ...(fields.collection ? { collection: fields.collection } : {}),
    ...(fields.tags ? { tags: fields.tags } : {}),
    ...(fields.retractionStatus ? { retractionStatus: fields.retractionStatus } : {}),
    ...(fields.retractionDetails ? { retractionDetails: fields.retractionDetails } : {}),
  };

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
    collection: fields.collection,
    tags: fields.tags || [],
    retractionStatus: fields.retractionStatus || "clean",
    retractionDetails: fields.retractionDetails,
    metadata: meta,
    createdAt: new Date().toISOString(),
  };

  // 1. If in synced mode (no local passphrase) and Supabase is configured, persist to remote database
  if (activePassphrase === null && sessionUnlocked && isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      await supabase.from("user_vault_items").insert({
        id: item.id,
        user_id: userId,
        title: item.title,
        content_text: item.content,
        source_type: item.sourceType,
        filename: item.filename,
        mime_type: item.mimeType,
        external_reference: item.externalReference,
        storage_reference: item.storageReference,
        citation: item.citation,
        citation_status: item.citationStatus,
        canonical_reference: item.canonicalReference,
        authors: item.authors,
        year: item.year,
        journal: item.journal,
        metadata: item.metadata,
        created_at: item.createdAt,
      });
    } catch (e) {
      console.warn("Could not save vault item to Supabase:", e);
    }
  }

  // 2. Save to local IndexedDB (with encryption if passphrase is set)
  try {
    const payload = JSON.stringify(item);
    const ciphertext = activePassphrase
      ? await encryptDataAsync(payload, activePassphrase)
      : btoa(unescape(encodeURIComponent(payload))); // Base64 encoding fallback if no passphrase

    await idbPut(userId, { id: item.id, createdAt: item.createdAt, ciphertext });
  } catch {}

  return item;
}

/**
 * Lists all vault items for the user, newest first.
 */
export async function listVaultItems(userId: string): Promise<VaultItem[]> {
  if (!isVaultUnlocked()) {
    throw new Error("The Vault is locked.");
  }

  // 1. Try fetching from Supabase if configured and in synced mode (no local passphrase)
  if (activePassphrase === null && sessionUnlocked && isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("user_vault_items")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!error && data) {
        return data.map((d: any) => ({
          id: d.id,
          title: d.title,
          content: d.content_text || "",
          sourceType: d.source_type || "file",
          filename: d.filename,
          mimeType: d.mime_type,
          externalReference: d.external_reference,
          storageReference: d.storage_reference,
          citation: d.citation,
          citationStatus: d.citation_status || (d.citation ? "confirmed" : "missing"),
          canonicalReference: d.canonical_reference,
          authors: d.authors || [],
          year: d.year,
          journal: d.journal,
          collection: d.metadata?.collection,
          tags: d.metadata?.tags || [],
          retractionStatus: d.metadata?.retractionStatus || "clean",
          retractionDetails: d.metadata?.retractionDetails,
          metadata: d.metadata || {},
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        }));
      }
    } catch (e) {
      console.warn("Supabase listVaultItems failed, falling back to local storage:", e);
    }
  }

  // 2. Fallback to local IndexedDB
  try {
    const stored = await idbGetAll(userId);
    const items: VaultItem[] = [];

    for (const s of stored) {
      try {
        let plainText = "";
        if (activePassphrase) {
          plainText = await decryptDataAsync(s.ciphertext, activePassphrase);
        } else {
          try {
            plainText = decodeURIComponent(escape(atob(s.ciphertext)));
          } catch {
            plainText = s.ciphertext;
          }
        }
        const plain = JSON.parse(plainText);
        items.push({
          id: s.id,
          createdAt: s.createdAt,
          tags: plain.tags || plain.metadata?.tags || [],
          collection: plain.collection || plain.metadata?.collection,
          retractionStatus: plain.retractionStatus || plain.metadata?.retractionStatus || "clean",
          retractionDetails: plain.retractionDetails || plain.metadata?.retractionDetails,
          ...plain,
        });
      } catch {
        // Dropped rather than failing whole list
      }
    }

    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
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
    collection?: string;
    tags?: string[];
    retractionStatus?: RetractionStatus;
    retractionDetails?: {
      noticeUrl?: string;
      reason?: string;
      date?: string;
    };
    metadata?: Record<string, any>;
  }>
): Promise<VaultItem[]> {
  const saved: VaultItem[] = [];
  for (const fields of items) {
    saved.push(await addVaultItem(userId, fields));
  }
  return saved;
}

/** Updates arbitrary details (collection, tags, retraction, citation, authors, year, journal) for a vault item. */
export async function updateVaultItemDetails(
  userId: string,
  id: string,
  updates: Partial<Pick<VaultItem, "title" | "collection" | "tags" | "retractionStatus" | "retractionDetails" | "citation" | "citationStatus" | "canonicalReference" | "authors" | "year" | "journal" | "metadata">>
): Promise<VaultItem | null> {
  const items = await listVaultItems(userId);
  const existing = items.find((i) => i.id === id);
  if (!existing) return null;

  const mergedMeta = {
    ...(existing.metadata || {}),
    ...(updates.metadata || {}),
    ...(updates.collection !== undefined ? { collection: updates.collection } : {}),
    ...(updates.tags !== undefined ? { tags: updates.tags } : {}),
    ...(updates.retractionStatus !== undefined ? { retractionStatus: updates.retractionStatus } : {}),
    ...(updates.retractionDetails !== undefined ? { retractionDetails: updates.retractionDetails } : {}),
  };

  const updated: VaultItem = {
    ...existing,
    ...updates,
    metadata: mergedMeta,
    updatedAt: new Date().toISOString(),
  };

  // Update in Supabase
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      await supabase
        .from("user_vault_items")
        .update({
          title: updated.title,
          citation: updated.citation,
          citation_status: updated.citationStatus,
          canonical_reference: updated.canonicalReference,
          authors: updated.authors,
          year: updated.year,
          journal: updated.journal,
          metadata: updated.metadata,
          updated_at: updated.updatedAt,
        })
        .eq("id", id)
        .eq("user_id", userId);
    } catch {}
  }

  // Update in local IndexedDB
  try {
    const payload = JSON.stringify(updated);
    const ciphertext = activePassphrase
      ? await encryptDataAsync(payload, activePassphrase)
      : btoa(unescape(encodeURIComponent(payload)));
    await idbPut(userId, { id: updated.id, createdAt: updated.createdAt, ciphertext });
  } catch {}

  return updated;
}

/** Updates citation metadata and status for a vault item. */
export async function updateVaultItemCitation(
  userId: string,
  id: string,
  canonicalReference: CanonicalReference,
  citationStatus: CitationStatus = "confirmed",
  formattedCitation?: string
): Promise<VaultItem | null> {
  return updateVaultItemDetails(userId, id, {
    canonicalReference,
    citationStatus,
    citation: formattedCitation,
  });
}

/** Deletes a vault item from storage. */
export async function deleteVaultItem(userId: string, id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      await supabase.from("user_vault_items").delete().eq("id", id).eq("user_id", userId);
    } catch {}
  }

  try {
    await idbDelete(userId, id);
  } catch {}
}

/** Client-side search over items with title, content, citation, filename, tags, and collections. */
export function searchVaultItems(items: VaultItem[], query: string): VaultItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (i) =>
      i.title.toLowerCase().includes(q) ||
      i.content.toLowerCase().includes(q) ||
      (i.citation ?? "").toLowerCase().includes(q) ||
      (i.filename ?? "").toLowerCase().includes(q) ||
      (i.externalReference ?? "").toLowerCase().includes(q) ||
      (i.collection ?? "").toLowerCase().includes(q) ||
      (i.tags ?? []).some((t) => t.toLowerCase().includes(q))
  );
}

/* -------------------------------------------------------------------------
 * AI → Vault isolation boundary (Mandatory Policy)
 * ---------------------------------------------------------------------- */

export interface VaultAIContext {
  selectedItems: (Pick<VaultItem, "id" | "title" | "content" | "citation"> & { citationStatus?: CitationStatus })[];
  _vaultSizeAtSelection: number;
}

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
      "Pass only the items the user explicitly chose, not all items."
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
