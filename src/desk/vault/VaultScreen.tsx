import { useEffect, useMemo, useState } from "react";
import { loadVault, hasVaultPassphraseOnThisDevice, updateVaultStorageMode, clearVaultPassphraseVerifier, type VaultRecord } from "../../services/userVault";
import {
  addVaultItem,
  deleteVaultItem,
  isVaultUnlocked,
  listVaultItems,
  lockVault,
  searchVaultItems,
  unlockVault,
  type VaultItem,
  type VaultSourceType,
  type CitationStatus,
} from "../../services/vaultContents";
import VaultSetupScreen from "../setup/VaultSetupScreen";
import VaultImport from "./VaultImport";
import VaultDocumentImport, { fileToBase64 } from "./VaultDocumentImport";
import { CitationConfirmationModal } from "./CitationConfirmationModal";
import { clearVaultItems, updateVaultItemCitation } from "../../services/vaultContents";

/**
 * The Universal Knowledge Vault's contents — reachable any time from Header/ProjectListScreen.
 *
 * Supports:
 * - Synchronized Account Storage (accessible across all devices).
 * - This Browser Only (device-local IndexedDB storage).
 * - Non-destructive, resumable local migration engine.
 * - Multi-source types (PDF, Word, Excel, CSV, Text, Web URLs, YouTube, DOI).
 */

type VaultPresence = null | "none" | "other-device" | "this-device" | "synced";

export default function VaultScreen({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [vaultPresence, setVaultPresence] = useState<VaultPresence>(null);
  const [vaultRecord, setVaultRecord] = useState<VaultRecord | null>(null);
  const [unlocked, setUnlocked] = useState(isVaultUnlocked());
  const [passphrase, setPassphrase] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const record = await loadVault();
      setVaultRecord(record);
      if (!record) {
        setVaultPresence("none");
        return;
      }
      if (record.storageMode === "synced") {
        setVaultPresence("synced");
        setUnlocked(true); // Account-synced storage is authenticated via Supabase session
        return;
      }
      // Local mode: check whether this specific browser has the local verifier.
      const localVerifier = await hasVaultPassphraseOnThisDevice();
      setVaultPresence(localVerifier ? "this-device" : "other-device");
    })();
  }, []);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setUnlockError(null);
    try {
      const ok = await unlockVault(passphrase);
      if (!ok) {
        setUnlockError("That passphrase does not match this Vault.");
        return;
      }
      setUnlocked(true);
      setPassphrase("");
    } finally {
      setBusy(false);
    }
  }

  if (vaultPresence === null) {
    return (
      <Shell onClose={onClose}>
        <p className="text-sm text-[color:var(--text-muted)]">Loading your Vault…</p>
      </Shell>
    );
  }

  if (vaultPresence === "none") {
    return <VaultSetupScreen onDone={() => setVaultPresence("synced")} onSkip={onClose} />;
  }

  // Local-only vault created on another browser without sync enabled
  if (vaultPresence === "other-device") {
    return (
      <Shell onClose={onClose}>
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">
          Your Vault is on another browser
        </h1>
        <div className="mt-4 flex flex-col gap-3 text-sm text-[color:var(--text-secondary)]">
          <p>
            Your Knowledge Vault is currently configured in <strong>Browser-Only mode</strong> on a different device.
          </p>
          <p>
            To access your Vault across all devices, open Scholar on your original device and select <strong>Sync to Account</strong>.
          </p>
          <p className="rounded-[var(--radius-md)] bg-[color:var(--surface-inset)] px-3 py-2 text-xs text-[color:var(--text-muted)]">
            🔒 Private Browser Vault · Stored in the original browser · Sync optional<br />
            ☁️ Projects · Synced to your Scholar account
          </p>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={async () => {
              await updateVaultStorageMode("synced");
              setVaultPresence("synced");
              setUnlocked(true);
            }}
            className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-inverse)] transition-colors hover:bg-[color:var(--accent-hover)] cursor-pointer"
          >
            Enable Synchronized Storage on this Account
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
          >
            Close
          </button>
        </div>
      </Shell>
    );
  }

  if (!unlocked && vaultPresence === "this-device") {
    return (
      <Shell onClose={onClose}>
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">Unlock your Vault</h1>
        <p className="mt-1.5 text-sm text-[color:var(--text-secondary)]">
          Your passphrase unlocks your device-encrypted research sources for this visit.
        </p>
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-[color:var(--text-muted)]">
          <span>🔒 Private Local Vault</span>
          <span aria-hidden="true">·</span>
          <span>Stored in this browser</span>
        </p>
        <form onSubmit={handleUnlock} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="vault-unlock" className="text-sm font-medium text-[color:var(--text-primary)]">
              Vault passphrase
            </label>
            <input
              id="vault-unlock"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className="w-full px-3 py-2 text-sm"
            />
          </div>
          {unlockError && (
            <p role="alert" className="text-sm text-[color:var(--state-danger)]">
              {unlockError}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || !passphrase}
              className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-inverse)] transition-colors hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
            >
              {busy ? "Unlocking…" : "Unlock"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
            >
              ← Back
            </button>
          </div>
        </form>
        <div className="mt-8 pt-6 border-t border-[color:var(--border-subtle)]">
          <p className="text-xs text-[color:var(--text-muted)] mb-3">
            Forgotten your passphrase? There is no automated way to recover it. If you have lost it, you can delete this local Vault and start over.
          </p>
          <button
            type="button"
            onClick={async () => {
              if (window.confirm("WARNING: This will permanently delete your private local vault and all its contents on this device. This action cannot be undone.\n\nAre you absolutely sure you want to proceed?")) {
                await clearVaultPassphraseVerifier();
                await clearVaultItems(userId);
                setVaultPresence("none");
              }
            }}
            className="text-xs font-semibold text-[color:var(--state-danger)] hover:underline cursor-pointer"
          >
            Delete & Reset Local Vault
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <VaultContents
      userId={userId}
      storageMode={vaultPresence === "synced" ? "synced" : "local"}
      onClose={onClose}
      onLock={() => {
        lockVault();
        setUnlocked(false);
        setVaultPresence("this-device");
      }}
      onModeChanged={(mode) => setVaultPresence(mode === "synced" ? "synced" : "this-device")}
    />
  );
}

function VaultContents({
  userId,
  storageMode,
  onClose,
  onLock,
  onModeChanged,
}: {
  userId: string;
  storageMode: "local" | "synced";
  onClose: () => void;
  onLock: () => void;
  onModeChanged: (mode: "local" | "synced") => void;
}) {
  const [items, setItems] = useState<VaultItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [citation, setCitation] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Citation editing modal state
  const [editingCitationItem, setEditingCitationItem] = useState<VaultItem | null>(null);

  // Filtering & Sorting state
  const [filterType, setFilterType] = useState<VaultSourceType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<CitationStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "title">("newest");

  // Bulk Actions & Drag Drop state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) {
        onLock();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onLock]);

  const loadItems = () => {
    listVaultItems(userId)
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  };

  useEffect(() => {
    loadItems();
  }, [userId, storageMode]);

  const visible = useMemo(() => {
    if (!items) return [];
    let result = searchVaultItems(items, query);
    
    if (filterType !== "all") {
      result = result.filter(item => item.sourceType === filterType);
    }
    
    if (filterStatus !== "all") {
      result = result.filter(item => item.citationStatus === filterStatus);
    }
    
    result.sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sortBy === "oldest" ? timeA - timeB : timeB - timeA;
    });
    
    return result;
  }, [items, query, filterType, filterStatus, sortBy]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await addVaultItem(userId, {
        title: title.trim(),
        content: content.trim(),
        citation: citation.trim() || undefined,
        citationStatus: citation.trim() ? "confirmed" : "missing",
      });
      setItems((current) => [saved, ...(current ?? [])]);
      setTitle("");
      setContent("");
      setCitation("");
      setAdding(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      await deleteVaultItem(userId, id);
      setItems((current) => (current ?? []).filter((i) => i.id !== id));
      setConfirmingDelete(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await deleteVaultItem(userId, id);
      }
      setItems((current) => (current ?? []).filter((i) => !selectedIds.has(i.id)));
      setSelectedIds(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        if (!file.name.endsWith('.txt') && !file.name.endsWith('.md')) {
            throw new Error(`Cannot parse ${file.name}. Only .txt and .md files are supported for local parsing.`);
        }
        
        const text = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = (e) => reject(new Error("Failed to read file"));
            reader.readAsText(file);
        });
        
        const saved = await addVaultItem(userId, {
          title: file.name,
          content: text || "",
          sourceType: "file",
          filename: file.name,
        });
        setItems((current) => [saved, ...(current ?? [])]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div 
      className="relative w-full h-full"
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); if (e.currentTarget.contains(e.relatedTarget as Node)) return; setIsDraggingOver(false); }}
      onDrop={handleDrop}
    >
      <Shell onClose={onClose}>
        {isDraggingOver && (
          <div className="absolute inset-0 z-50 bg-[color:var(--surface-sunken)] bg-opacity-90 backdrop-blur-sm flex flex-col items-center justify-center border-4 border-dashed border-[color:var(--accent)] rounded-[var(--radius-xl)] m-4 pointer-events-none transition-all duration-200">
            <svg className="w-16 h-16 text-[color:var(--accent)] mb-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <h2 className="text-2xl font-bold text-[color:var(--text-primary)]">Drop files to add to Vault</h2>
            <p className="text-[color:var(--text-secondary)] mt-2">TXT, MD</p>
          </div>
        )}
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3 relative z-10">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">Your Vault</h1>
          <p className="mt-1.5 text-sm text-[color:var(--text-secondary)]">
            Notes, sources, and material you have already gathered — searchable, and encrypted in this browser.
          </p>
          <div className="mt-2 flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs text-[color:var(--text-muted)] bg-[color:var(--surface-inset)] px-2.5 py-1 rounded-[var(--radius-sm)]">
                  🔒 This Browser Only
                </span>
              </div>
          </div>
        </div>
        {storageMode === "local" && (
          <button
            type="button"
            onClick={onLock}
            className="shrink-0 text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
          >
            Lock
          </button>
        )}
      </header>

      {error && (
        <p
          role="alert"
          className="mb-5 rounded-[var(--radius-md)] border border-[color:var(--accent-border)] bg-[color:var(--state-danger-subtle)] px-3 py-2 text-sm text-[color:var(--state-danger)]"
        >
          {error}
        </p>
      )}

      {items === null ? (
        <p className="text-sm text-[color:var(--text-muted)]">Decrypting your Vault…</p>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex-1 min-w-[200px] flex items-center gap-2 relative">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your Vault"
                aria-label="Search your Vault"
                className="w-full px-3 py-2 text-sm border border-[color:var(--border-default)] rounded-[var(--radius-md)] bg-[color:var(--surface-input)] text-[color:var(--text-primary)]"
              />
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="text-xs px-2 py-1.5 rounded bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] text-[color:var(--text-secondary)] outline-none"
              >
                <option value="all">All Types</option>
                <option value="file">Files & Docs</option>
                <option value="web">Web Links</option>
                <option value="video">Videos</option>
                <option value="reference">References</option>
              </select>
              
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="text-xs px-2 py-1.5 rounded bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] text-[color:var(--text-secondary)] outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="confirmed">Confirmed</option>
                <option value="needs_user_review">Needs Review</option>
                <option value="missing">Missing Citation</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="text-xs px-2 py-1.5 rounded bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] text-[color:var(--text-secondary)] outline-none"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="title">Title (A-Z)</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="shrink-0 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-inverse)] transition-colors hover:bg-[color:var(--accent-hover)] cursor-pointer"
            >
              {adding ? "Cancel" : "Add material"}
            </button>
          </div>

          <div className="mb-4 flex flex-wrap gap-4">
            <VaultDocumentImport
              userId={userId}
              onImported={(saved) => setItems((current) => [saved, ...(current ?? [])])}
            />
            <VaultImport
              userId={userId}
              onImported={(saved) => setItems((current) => [...saved, ...(current ?? [])])}
            />
          </div>

          {adding && (
            <form
              onSubmit={handleAdd}
              className="mb-5 flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-4"
            >
              <div>
                <label htmlFor="vault-item-title" className="mb-1 block text-sm font-medium text-[color:var(--text-primary)]">
                  Title
                </label>
                <input
                  id="vault-item-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="vault-item-content" className="mb-1 block text-sm font-medium text-[color:var(--text-primary)]">
                  Notes or material
                </label>
                <textarea
                  id="vault-item-content"
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full resize-y px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="vault-item-citation" className="mb-1 block text-sm font-medium text-[color:var(--text-primary)]">
                  Source citation <span className="font-normal text-[color:var(--text-muted)]">(optional)</span>
                </label>
                <input
                  id="vault-item-citation"
                  type="text"
                  value={citation}
                  onChange={(e) => setCitation(e.target.value)}
                  className="w-full px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={busy || !title.trim() || !content.trim()}
                className="self-start rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-inverse)] transition-colors hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
              >
                {busy ? "Saving…" : "Save to Vault"}
              </button>
            </form>
          )}

          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-16 h-16 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                <svg className="w-8 h-8 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {items.length === 0 
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  }
                </svg>
              </div>
              <h3 className="text-lg font-bold text-[color:var(--text-primary)] mb-1">
                {items.length === 0 ? "Your Vault is Empty" : "No results found"}
              </h3>
              <p className="text-sm text-[color:var(--text-secondary)] max-w-sm mx-auto mb-6">
                {items.length === 0 
                  ? "Build your knowledge base by uploading documents, importing references, or adding manual notes. Your Vault securely encrypts your research." 
                  : `We couldn't find anything matching "${query}". Try a different search term.`}
              </p>
              {items.length === 0 && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setAdding(true)}
                    className="px-4 py-2 bg-[color:var(--accent)] text-[color:var(--text-inverse)] text-sm font-bold rounded-lg hover:bg-[color:var(--accent-hover)] transition-colors"
                  >
                    Add a Note
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {selectedIds.size > 0 && (
                <div className="flex items-center justify-between p-3 rounded-[var(--radius-md)] bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)]">
                  <span className="text-sm font-medium text-[color:var(--accent)]">
                    {selectedIds.size} item{selectedIds.size === 1 ? "" : "s"} selected
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedIds(new Set())}
                      className="text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors"
                    >
                      Deselect All
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkDelete}
                      disabled={busy}
                      className="px-3 py-1.5 bg-[color:var(--state-danger)] text-[color:var(--text-inverse)] text-xs font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {busy ? "Deleting…" : "Delete Selected"}
                    </button>
                  </div>
                </div>
              )}
              <ul aria-label="Vault items" className="flex flex-col gap-2.5">
                {visible.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] px-4 py-3 flex gap-3 group"
                  >
                    <div className="pt-0.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={(e) => {
                          const next = new Set(selectedIds);
                          if (e.target.checked) next.add(item.id);
                          else next.delete(item.id);
                          setSelectedIds(next);
                        }}
                        className="w-4 h-4 rounded border-[color:var(--border-strong)] text-[color:var(--accent)] cursor-pointer"
                      />
                    </div>
                    <div className="flex-1 flex flex-col min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[color:var(--text-primary)]">{item.title}</p>
                        <div className="flex items-center gap-2">
                          {item.citationStatus === "confirmed" ? (
                            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 px-2 py-0.5 rounded">
                              🟢 Citation Ready
                            </span>
                          ) : item.citationStatus === "needs_user_review" ? (
                            <button
                              type="button"
                              onClick={() => setEditingCitationItem(item)}
                              className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 px-2 py-0.5 rounded hover:underline cursor-pointer"
                            >
                              🟡 Review Citation →
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingCitationItem(item)}
                              className="text-[10px] font-semibold text-[color:var(--text-muted)] bg-[color:var(--surface-inset)] px-2 py-0.5 rounded hover:underline cursor-pointer"
                            >
                              🔴 Missing Citation →
                            </button>
                          )}
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[color:var(--surface-inset)] text-[color:var(--text-muted)]">
                            {item.sourceType || "source"}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-[color:var(--text-secondary)] line-clamp-3">
                        {item.content}
                      </p>
                      {item.citation && <p className="mt-1.5 text-xs text-[color:var(--text-muted)]">{item.citation}</p>}

                      <div className="mt-2 flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => setEditingCitationItem(item)}
                          className="text-xs text-[color:var(--accent)] hover:underline cursor-pointer font-medium"
                        >
                          {item.citationStatus === "confirmed" ? "Edit Citation" : "Complete Citation"}
                        </button>

                        {confirmingDelete === item.id ? (
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-[color:var(--text-secondary)]">Delete this? There is no undo.</span>
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
                              disabled={busy}
                              className="text-xs text-[color:var(--state-danger)] hover:opacity-80 cursor-pointer font-bold"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmingDelete(null)}
                              className="text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmingDelete(item.id)}
                            className="text-xs text-[color:var(--text-muted)] hover:text-[color:var(--state-danger)] cursor-pointer"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {editingCitationItem && (
            <CitationConfirmationModal
              initialReference={
                editingCitationItem.canonicalReference || {
                  title: editingCitationItem.title,
                  source: editingCitationItem.journal,
                  year: editingCitationItem.year,
                  authors: editingCitationItem.authors?.map((name, i) => ({
                    firstName: "",
                    lastName: name,
                    order: i + 1,
                  })) || [],
                }
              }
              initialStatus={editingCitationItem.citationStatus}
              sourceTitle={editingCitationItem.title}
              sourceType={editingCitationItem.sourceType}
              onClose={() => setEditingCitationItem(null)}
              onConfirm={async (confirmedRef, formattedCitation) => {
                const updatedItem = await updateVaultItemCitation(
                  userId,
                  editingCitationItem.id,
                  confirmedRef,
                  "confirmed",
                  formattedCitation
                );
                
                if (updatedItem) {
                  setItems((prev) =>
                    prev ? prev.map((it) => (it.id === updatedItem.id ? updatedItem : it)) : [updatedItem]
                  );
                }
                setEditingCitationItem(null);
              }}
            />
          )}
        </>
      )}
      </Shell>
    </div>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)] px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <button
          type="button"
          onClick={onClose}
          className="mb-6 text-sm text-[color:var(--accent)] transition-colors hover:text-[color:var(--accent-hover)] cursor-pointer"
        >
          ← Back
        </button>
        {children}
      </div>
    </div>
  );
}
