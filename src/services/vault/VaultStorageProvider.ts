/**
 * Universal Knowledge Vault Storage Provider Layer.
 *
 * Implements clean separation of concerns:
 * - Local-Only Mode: Stores encrypted/plaintext research sources in browser IndexedDB.
 * - Synchronized Mode: Stores normalized references and text extractions in Supabase `user_vault_items` table.
 * - Resumable Migration: Syncs browser-local Vault items to account-level storage with deduplication and error recovery.
 */

import { getSupabaseClient, isSupabaseConfigured } from "../supabaseClient";
import type { CanonicalReference } from "../../citation_compliance/model/reference";

export type VaultSourceType = "file" | "web" | "video" | "reference" | "custom" | "text";

export type CitationStatus = "missing" | "needs_user_review" | "confirmed";

export interface VaultItem {
  id: string;
  title: string;
  content: string;
  sourceType?: VaultSourceType;
  filename?: string;
  mimeType?: string;
  externalReference?: string; // URL, DOI, YouTube link
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

export interface SyncProgress {
  total: number;
  completed: number;
  currentTitle: string;
  status: "idle" | "syncing" | "completed" | "error";
  error?: string;
}

export interface SyncResult {
  success: boolean;
  totalSynced: number;
  skippedDuplicates: number;
  failedCount: number;
  errors: string[];
}

export interface IVaultStorageProvider {
  getStorageMode(): "local" | "synced";
  listItems(userId: string): Promise<VaultItem[]>;
  getItem(userId: string, id: string): Promise<VaultItem | null>;
  saveItem(userId: string, item: VaultItem): Promise<void>;
  deleteItem(userId: string, id: string): Promise<void>;
  searchItems(userId: string, query: string): Promise<VaultItem[]>;
  clear(userId: string): Promise<void>;
}

/* -------------------------------------------------------------------------
 * 1. Local-Only Storage Provider (IndexedDB)
 * ---------------------------------------------------------------------- */

const IDB_STORE = "items";

function getDbName(userId: string): string {
  return `scholar-vault-items:${userId}`;
}

function openLocalDb(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB is not available in this environment."));
    }
    const request = indexedDB.open(getDbName(userId), 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class LocalVaultStorageProvider implements IVaultStorageProvider {
  getStorageMode(): "local" {
    return "local";
  }

  async listItems(userId: string): Promise<VaultItem[]> {
    try {
      const db = await openLocalDb(userId);
      return await new Promise<VaultItem[]>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).getAll();
        req.onsuccess = () => {
          db.close();
          const items: VaultItem[] = req.result || [];
          items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          resolve(items);
        };
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
      });
    } catch {
      return [];
    }
  }

  async getItem(userId: string, id: string): Promise<VaultItem | null> {
    try {
      const db = await openLocalDb(userId);
      return await new Promise<VaultItem | null>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(id);
        req.onsuccess = () => {
          db.close();
          resolve(req.result || null);
        };
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
      });
    } catch {
      return null;
    }
  }

  async saveItem(userId: string, item: VaultItem): Promise<void> {
    const db = await openLocalDb(userId);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(item);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }

  async deleteItem(userId: string, id: string): Promise<void> {
    const db = await openLocalDb(userId);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }

  async searchItems(userId: string, query: string): Promise<VaultItem[]> {
    const items = await this.listItems(userId);
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q) ||
        (item.citation && item.citation.toLowerCase().includes(q)) ||
        (item.filename && item.filename.toLowerCase().includes(q)) ||
        (item.externalReference && item.externalReference.toLowerCase().includes(q))
    );
  }

  async clear(userId: string): Promise<void> {
    const db = await openLocalDb(userId);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }
}

/* -------------------------------------------------------------------------
 * 2. Synchronized Account Storage Provider (Supabase user_vault_items)
 * ---------------------------------------------------------------------- */

export class SupabaseVaultStorageProvider implements IVaultStorageProvider {
  private localCache = new LocalVaultStorageProvider();

  getStorageMode(): "synced" {
    return "synced";
  }

  async listItems(userId: string): Promise<VaultItem[]> {
    if (!isSupabaseConfigured()) {
      return this.localCache.listItems(userId);
    }

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("user_vault_items")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error || !data) {
        // Fallback to local cache if offline
        return this.localCache.listItems(userId);
      }

      const items: VaultItem[] = data.map((row: any) => ({
        id: row.id,
        title: row.title,
        content: row.content_text || "",
        sourceType: row.source_type as VaultSourceType,
        filename: row.filename || undefined,
        mimeType: row.mime_type || undefined,
        externalReference: row.external_reference || undefined,
        storageReference: row.storage_reference || undefined,
        citation: row.metadata?.citation || undefined,
        citationStatus: (row.citation_status as CitationStatus) || (row.metadata?.citation || row.canonical_reference ? "needs_user_review" : "missing"),
        canonicalReference: row.canonical_reference || undefined,
        authors: row.metadata?.authors || undefined,
        year: row.metadata?.year || undefined,
        journal: row.metadata?.journal || undefined,
        metadata: row.metadata || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      // Update local cache asynchronously for instant offline lookup
      for (const it of items) {
        this.localCache.saveItem(userId, it).catch(() => {});
      }

      return items;
    } catch {
      return this.localCache.listItems(userId);
    }
  }

  async getItem(userId: string, id: string): Promise<VaultItem | null> {
    if (!isSupabaseConfigured()) {
      return this.localCache.getItem(userId, id);
    }

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("user_vault_items")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();

      if (error || !data) {
        return this.localCache.getItem(userId, id);
      }

      return {
        id: data.id,
        title: data.title,
        content: data.content_text || "",
        sourceType: data.source_type as VaultSourceType,
        filename: data.filename || undefined,
        mimeType: data.mime_type || undefined,
        externalReference: data.external_reference || undefined,
        storageReference: data.storage_reference || undefined,
        citation: data.metadata?.citation || undefined,
        citationStatus: (data.citation_status as CitationStatus) || (data.metadata?.citation || data.canonical_reference ? "needs_user_review" : "missing"),
        canonicalReference: data.canonical_reference || undefined,
        authors: data.metadata?.authors || undefined,
        year: data.metadata?.year || undefined,
        journal: data.metadata?.journal || undefined,
        metadata: data.metadata || {},
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch {
      return this.localCache.getItem(userId, id);
    }
  }

  async saveItem(userId: string, item: VaultItem): Promise<void> {
    // 1. Always update local cache first
    await this.localCache.saveItem(userId, item);

    if (!isSupabaseConfigured()) return;

    // 2. Persist to Supabase user_vault_items table
    const supabase = getSupabaseClient();
    const payload = {
      id: item.id || crypto.randomUUID(),
      user_id: userId,
      source_type: item.sourceType || "file",
      title: item.title,
      filename: item.filename || null,
      mime_type: item.mimeType || null,
      external_reference: item.externalReference || null,
      storage_reference: item.storageReference || null,
      content_text: item.content || "",
      citation_status: item.citationStatus || "missing",
      canonical_reference: item.canonicalReference || null,
      metadata: {
        citation: item.citation,
        authors: item.authors,
        year: item.year,
        journal: item.journal,
        ...(item.metadata || {}),
      },
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("user_vault_items").upsert(payload as any);
    if (error) {
      console.warn("[VaultStorage] Failed to sync item to Supabase, stored in local cache:", error.message);
    }
  }

  async deleteItem(userId: string, id: string): Promise<void> {
    await this.localCache.deleteItem(userId, id);

    if (!isSupabaseConfigured()) return;

    const supabase = getSupabaseClient();
    await supabase.from("user_vault_items").delete().eq("id", id).eq("user_id", userId);
  }

  async searchItems(userId: string, query: string): Promise<VaultItem[]> {
    const items = await this.listItems(userId);
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q) ||
        (item.citation && item.citation.toLowerCase().includes(q)) ||
        (item.filename && item.filename.toLowerCase().includes(q)) ||
        (item.externalReference && item.externalReference.toLowerCase().includes(q))
    );
  }

  async clear(userId: string): Promise<void> {
    await this.localCache.clear(userId);
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseClient();
    await supabase.from("user_vault_items").delete().eq("user_id", userId);
  }
}

/* -------------------------------------------------------------------------
 * 3. Provider Resolver & Resumable Migration Engine
 * ---------------------------------------------------------------------- */

export function resolveVaultProvider(mode: "local" | "synced"): IVaultStorageProvider {
  return mode === "synced" ? new SupabaseVaultStorageProvider() : new LocalVaultStorageProvider();
}

/**
 * Resumable non-destructive migration of browser-local Vault items to account-level storage.
 */
export async function syncLocalVaultToRemote(
  userId: string,
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const localProvider = new LocalVaultStorageProvider();
  const remoteProvider = new SupabaseVaultStorageProvider();

  const localItems = await localProvider.listItems(userId);
  if (localItems.length === 0) {
    return { success: true, totalSynced: 0, skippedDuplicates: 0, failedCount: 0, errors: [] };
  }

  const remoteTitles = new Set<string>();
  const remoteIds = new Set<string>();

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("user_vault_items")
        .select("id, title")
        .eq("user_id", userId);
      if (!error && data) {
        for (const row of data as any[]) {
          if (row.id) remoteIds.add(row.id);
          if (row.title) remoteTitles.add(row.title.toLowerCase().trim());
        }
      }
    } catch {}
  }

  let completed = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < localItems.length; i++) {
    const item = localItems[i];
    onProgress?.({
      total: localItems.length,
      completed,
      currentTitle: item.title,
      status: "syncing",
    });

    // Check for exact duplicate
    if (remoteIds.has(item.id) || remoteTitles.has(item.title.toLowerCase().trim())) {
      skipped++;
      completed++;
      continue;
    }

    try {
      await remoteProvider.saveItem(userId, item);
      completed++;
    } catch (err: any) {
      failed++;
      errors.push(`Failed to sync "${item.title}": ${err.message || "Unknown error"}`);
    }
  }

  const result: SyncResult = {
    success: failed === 0,
    totalSynced: completed - skipped,
    skippedDuplicates: skipped,
    failedCount: failed,
    errors,
  };

  onProgress?.({
    total: localItems.length,
    completed,
    currentTitle: "Migration Complete",
    status: result.success ? "completed" : "error",
    error: errors[0],
  });

  return result;
}
