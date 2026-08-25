/**
 * Universal Vault Storage Providers
 * Provides abstract storage providers for Local (IndexedDB) and Remote (Supabase)
 */

import { getSupabaseClient, isSupabaseConfigured } from "../supabaseClient";
import type { VaultItem, CitationStatus, VaultSourceType } from "../vaultContents";
import type { CanonicalReference } from "../../citation_compliance/model/reference";

export type { VaultItem, CitationStatus, VaultSourceType };

export interface IVaultStorageProvider {
  listItems(userId: string): Promise<VaultItem[]>;
  getItem(userId: string, id: string): Promise<VaultItem | null>;
  saveItem(userId: string, item: VaultItem): Promise<VaultItem>;
  deleteItem(userId: string, id: string): Promise<void>;
  clearItems(userId: string): Promise<void>;
}

const IDB_STORE = "items";

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
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class LocalVaultStorageProvider implements IVaultStorageProvider {
  async listItems(userId: string): Promise<VaultItem[]> {
    try {
      const db = await openDb(userId);
      return await new Promise<VaultItem[]>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).getAll();
        req.onsuccess = () => {
          const items = (req.result as any[]) || [];
          resolve(items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")));
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  async getItem(userId: string, id: string): Promise<VaultItem | null> {
    try {
      const db = await openDb(userId);
      return await new Promise<VaultItem | null>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(id);
        req.onsuccess = () => resolve((req.result as VaultItem) || null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }

  async saveItem(userId: string, item: VaultItem): Promise<VaultItem> {
    const db = await openDb(userId);
    return await new Promise<VaultItem>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(item);
      tx.oncomplete = () => resolve(item);
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteItem(userId: string, id: string): Promise<void> {
    const db = await openDb(userId);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clearItems(userId: string): Promise<void> {
    const db = await openDb(userId);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export class SupabaseVaultStorageProvider implements IVaultStorageProvider {
  async listItems(userId: string): Promise<VaultItem[]> {
    if (!isSupabaseConfigured()) return [];
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("user_vault_items")
      .select("*")
      .eq("user_id", userId);

    if (error || !data) return [];
    return data.map((d: any) => ({
      id: d.id,
      title: d.title,
      content: d.content_text || d.content || "",
      sourceType: d.source_type,
      filename: d.filename,
      mimeType: d.mime_type,
      externalReference: d.external_reference,
      storageReference: d.storage_reference,
      citation: d.citation,
      citationStatus: d.citation_status,
      canonicalReference: d.canonical_reference,
      authors: d.authors || [],
      year: d.year,
      journal: d.journal,
      metadata: d.metadata || {},
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }));
  }

  async getItem(userId: string, id: string): Promise<VaultItem | null> {
    if (!isSupabaseConfigured()) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("user_vault_items")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();

    if (error || !data) return null;
    return {
      id: data.id,
      title: data.title,
      content: data.content_text || data.content || "",
      sourceType: data.source_type,
      filename: data.filename,
      mimeType: data.mime_type,
      externalReference: data.external_reference,
      storageReference: data.storage_reference,
      citation: data.citation,
      citationStatus: data.citation_status,
      canonicalReference: data.canonical_reference,
      authors: data.authors || [],
      year: data.year,
      journal: data.journal,
      metadata: data.metadata || {},
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async saveItem(userId: string, item: VaultItem): Promise<VaultItem> {
    if (!isSupabaseConfigured()) return item;
    const supabase = getSupabaseClient();
    await supabase.from("user_vault_items").upsert({
      id: item.id,
      user_id: userId,
      title: item.title,
      content_text: item.content,
      source_type: item.sourceType || "file",
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
    return item;
  }

  async deleteItem(userId: string, id: string): Promise<void> {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseClient();
    await supabase.from("user_vault_items").delete().eq("user_id", userId).eq("id", id);
  }

  async clearItems(userId: string): Promise<void> {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseClient();
    await supabase.from("user_vault_items").delete().eq("user_id", userId);
  }
}

export async function syncLocalVaultToRemote(
  userId: string
): Promise<{ success: boolean; skippedDuplicates: number; totalSynced: number }> {
  const localProvider = new LocalVaultStorageProvider();
  const remoteProvider = new SupabaseVaultStorageProvider();

  const localItems = await localProvider.listItems(userId);
  const remoteItems = await remoteProvider.listItems(userId);
  const remoteIds = new Set(remoteItems.map((r) => r.id));

  let skippedDuplicates = 0;
  let totalSynced = 0;

  for (const item of localItems) {
    if (remoteIds.has(item.id)) {
      skippedDuplicates++;
    } else {
      await remoteProvider.saveItem(userId, item);
      totalSynced++;
    }
  }
  return { success: true, skippedDuplicates, totalSynced };
}
