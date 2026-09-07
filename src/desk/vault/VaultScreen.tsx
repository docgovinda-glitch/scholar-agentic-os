import { useEffect, useMemo, useState } from "react";
import {
  loadVault,
  hasVaultPassphraseOnThisDevice,
  updateVaultStorageMode,
  getVaultStorageMode,
  resetVault,
  type VaultRecord,
} from "../../services/userVault";
import {
  addVaultItem,
  deleteVaultItem,
  isVaultUnlocked,
  setSessionUnlocked,
  listVaultItems,
  lockVault,
  searchVaultItems,
  unlockVault,
  updateVaultItemCitation,
  type VaultItem,
  type VaultSourceType,
  type CitationStatus,
} from "../../services/vaultContents";
import { formatVaultCitation, toBibTeX, type CitationStyleType } from "../../services/vault/citationService";
import {
  getConnectedCloudDrives,
  initiateGoogleDriveAuth,
  initiateOneDriveAuth,
  connectCloudDrive,
  disconnectCloudDrive,
  type CloudDriveAccount,
} from "../../services/vault/cloudDriveService";
import VaultSetupScreen from "../setup/VaultSetupScreen";
import VaultImport from "./VaultImport";
import VaultDocumentImport from "./VaultDocumentImport";
import { CitationConfirmationModal } from "./CitationConfirmationModal";
import { downloadVaultZip } from "../../services/vault/vaultExportService";

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
        setSessionUnlocked(true);
        setVaultPresence("synced");
        setUnlocked(true);
        return;
      }
      const localVerifier = await hasVaultPassphraseOnThisDevice();
      if (localVerifier) {
        setVaultPresence("this-device");
        setUnlocked(isVaultUnlocked());
        return;
      }
      setVaultPresence("other-device");
    })();
  }, [userId]);

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
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[color:var(--accent)] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-[color:var(--text-muted)]">Loading your Knowledge Vault…</p>
        </div>
      </Shell>
    );
  }

  if (vaultPresence === "none") {
    return <VaultSetupScreen onDone={() => {
      setVaultPresence("synced");
      setUnlocked(true);
    }} onSkip={onClose} />;
  }

  if (vaultPresence === "other-device") {
    return (
      <Shell onClose={onClose}>
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">
          Your Vault is on another browser
        </h1>
        <div className="mt-4 flex flex-col gap-3 text-sm text-[color:var(--text-secondary)]">
          <p>
            Your Knowledge Vault stays privately in the browser on the device where you created it.
            It does not sync across devices or browsers in browser-only mode.
          </p>
          <div className="rounded-[var(--radius-md)] bg-[color:var(--surface-inset)] p-3 text-xs">
            <p className="font-medium text-[color:var(--text-primary)]">Projects vs. Vault:</p>
            <p className="mt-1">
              Projects: Synced to your Scholar account and accessible anywhere.
            </p>
            <p>
              Vault (Browser-Only): Kept strictly on the original browser with your passphrase.
            </p>
          </div>
          <p>
            Enable <strong>Universal Cloud Sync</strong> to seamlessly access all your papers, datasets, and citations on this device.
          </p>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={async () => {
              await updateVaultStorageMode("synced");
              setSessionUnlocked(true);
              setVaultPresence("synced");
              setUnlocked(true);
            }}
            className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] cursor-pointer"
          >
            Enable Universal Cloud Sync
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
          Enter your passphrase to decrypt your research sources for this session.
        </p>
        <p className="mt-2 text-xs text-[color:var(--text-muted)] leading-relaxed">
          There is no automated way to open the Vault without it (your passphrase). If you have lost it, the contents cannot be recovered by anyone, including us.
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
              className="w-full px-3 py-2 text-sm border border-[color:var(--border-default)] rounded-[var(--radius-md)] bg-[color:var(--surface-input)] text-[color:var(--text-primary)]"
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
              className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] disabled:opacity-50 cursor-pointer"
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
      </Shell>
    );
  }

  return (
    <VaultContents
      userId={userId}
      storageMode={vaultPresence === "synced" ? "synced" : "local"}
      onClose={onClose}
      onReset={() => setVaultPresence("none")}
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
  onReset,
  onLock,
  onModeChanged,
}: {
  userId: string;
  storageMode: "local" | "synced";
  onClose: () => void;
  onReset: () => void;
  onLock: () => void;
  onModeChanged: (mode: "local" | "synced") => void;
}) {
  const [items, setItems] = useState<VaultItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [citation, setCitation] = useState("");
  const [busy, setBusy] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cloud drive integration modal
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [connectedDrives, setConnectedDrives] = useState<CloudDriveAccount[]>([]);

  // Citation editing modal state
  const [editingCitationItem, setEditingCitationItem] = useState<VaultItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Filtering & Sorting state
  const [filterType, setFilterType] = useState<VaultSourceType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<CitationStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "title">("newest");
  const [selectedStyle, setSelectedStyle] = useState<CitationStyleType>("apa7");

  // Drag & drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  useEffect(() => {
    loadItems();
    loadDrives();
  }, [userId, storageMode]);

  async function loadDrives() {
    try {
      const drives = await getConnectedCloudDrives(userId);
      setConnectedDrives(drives);
    } catch {}
  }

  const loadItems = () => {
    setError(null);
    try {
      const res = listVaultItems(userId);
      if (res && typeof (res as any).then === "function") {
        (res as Promise<VaultItem[]>)
          .then((data) => {
            setItems(data || []);
          })
          .catch((e: Error) => {
            setError(e?.message || "Failed to load vault items");
            setItems([]);
          });
      } else {
        setItems(Array.isArray(res) ? res : []);
      }
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    }
  };

  const visible = useMemo(() => {
    if (!items) return [];
    let result = searchVaultItems(items, query);

    if (filterType !== "all") {
      result = result.filter((item) => item.sourceType === filterType);
    }

    if (filterStatus !== "all") {
      result = result.filter((item) => item.citationStatus === filterStatus);
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
        citationStatus: "needs_user_review",
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyCitation(item: VaultItem) {
    const formatted = formatVaultCitation(item, selectedStyle);
    await navigator.clipboard.writeText(formatted);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
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
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/vault/parse-file", {
          method: "POST",
          body: formData,
        });

        const body = await res.json();
        if (!res.ok) throw new Error(body.error || `Failed to parse ${file.name}`);

        const saved = await addVaultItem(userId, {
          title: body.title || file.name,
          content: body.text || "",
          filename: file.name,
          mimeType: file.type || body.mimeType,
          sourceType: "file",
          authors: body.authors,
          year: body.year,
          journal: body.journal,
          metadata: body.metadata,
          canonicalReference: body.canonicalReference,
          citation: body.citation,
          citationStatus: body.citation || body.canonicalReference ? "confirmed" : "missing",
        });

        setItems((current) => [saved, ...(current ?? [])]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function getSourceIcon(type?: VaultSourceType) {
    switch (type) {
      case "drive_google":
      case "drive_onedrive":
        return "☁️";
      case "reference":
        return "📚";
      case "web":
        return "🌐";
      case "video":
        return "🎥";
      default:
        return "📄";
    }
  }

  return (
    <div
      className="relative w-full h-full"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDraggingOver(false);
      }}
      onDrop={handleDrop}
    >
      <Shell onClose={onClose}>
        {isDraggingOver && (
          <div className="absolute inset-0 z-50 bg-[color:var(--surface-sunken)] bg-opacity-95 backdrop-blur-sm flex flex-col items-center justify-center border-4 border-dashed border-[color:var(--accent)] rounded-[var(--radius-xl)] m-4 pointer-events-none transition-all">
            <svg className="w-16 h-16 text-[color:var(--accent)] mb-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <h2 className="text-2xl font-bold text-[color:var(--text-primary)]">Drop files to add to Vault</h2>
            <p className="text-[color:var(--text-secondary)] mt-2">PDF, DOCX, XLSX, CSV, Markdown, Text</p>
          </div>
        )}

        <header className="mb-6 flex flex-wrap items-start justify-between gap-3 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-[color:var(--text-primary)]">Knowledge Vault</h1>
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border border-[color:var(--accent-border)]">
                {storageMode === "synced" ? "☁️ Universal Sync" : "🔒 Browser Only"}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-[color:var(--text-secondary)]">
              Your long-term library across all devices: papers, spreadsheets, notes, and academic citations.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDriveModal(true)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[color:var(--border-default)] text-[color:var(--text-primary)] hover:border-[color:var(--accent)] transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>☁️ Cloud Drives</span>
              {connectedDrives.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              )}
            </button>

            <button
              type="button"
              disabled={isExporting || !items || items.length === 0}
              onClick={async () => {
                if (!items || items.length === 0) return;
                setIsExporting(true);
                try {
                  await downloadVaultZip(items);
                } catch (err: any) {
                  setError(err.message || "Failed to export Vault");
                } finally {
                  setIsExporting(false);
                }
              }}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[color:var(--border-default)] text-[color:var(--text-primary)] hover:border-[color:var(--accent)] hover:bg-[color:var(--surface-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1.5"
              title="Export complete Vault archive as open-format ZIP"
            >
              <span>📦</span>
              <span>{isExporting ? "Exporting…" : "Export (.zip)"}</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                if (window.confirm("Reset your Vault? This will clear existing materials and allow you to re-initialize your Vault fresh.")) {
                  await resetVault(userId);
                  onReset();
                }
              }}
              className="px-2.5 py-1.5 text-xs text-[color:var(--text-muted)] hover:text-[color:var(--state-danger)] transition-colors cursor-pointer"
            >
              Reset
            </button>

            {onLock && (
              <button
                type="button"
                onClick={onLock}
                className="px-3 py-1.5 text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
              >
                Lock
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="mb-5 flex items-center justify-between rounded-[var(--radius-md)] border border-[color:var(--accent-border)] bg-[color:var(--state-danger-subtle)] px-3.5 py-2.5 text-sm text-[color:var(--state-danger)]">
            <span>{error}</span>
            <button
              type="button"
              onClick={loadItems}
              className="text-xs font-bold underline ml-2 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Multi-source Ingestion Bar */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <VaultDocumentImport
            userId={userId}
            onImported={(saved) => setItems((curr) => [saved, ...(curr ?? [])])}
          />
          <VaultImport
            userId={userId}
            onImported={(saved) => setItems((curr) => [...saved, ...(curr ?? [])])}
          />
          <button
            type="button"
            aria-label="Add material"
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[color:var(--border-default)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)] transition-all cursor-pointer"
          >
            <span>✍️</span> {adding ? "Cancel" : "Add material"}
          </button>
        </div>

        {adding && (
          <form
            onSubmit={handleAdd}
            className="mb-6 flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-5 shadow-sm"
          >
            <h3 className="text-sm font-bold text-[color:var(--text-primary)]">Add Note to Vault</h3>
            <div>
              <label htmlFor="vault-item-title" className="mb-1 block text-xs font-semibold text-[color:var(--text-primary)]">
                Title
              </label>
              <input
                id="vault-item-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Key findings on LLM agent architectures"
                className="w-full px-3 py-2 text-sm border border-[color:var(--border-default)] rounded-[var(--radius-md)] bg-[color:var(--surface-input)] text-[color:var(--text-primary)]"
              />
            </div>
            <div>
              <label htmlFor="vault-item-content" className="mb-1 block text-xs font-semibold text-[color:var(--text-primary)]">
                Notes or material
              </label>
              <textarea
                id="vault-item-content"
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Type or paste your notes, summary, or findings..."
                className="w-full resize-y px-3 py-2 text-sm border border-[color:var(--border-default)] rounded-[var(--radius-md)] bg-[color:var(--surface-input)] text-[color:var(--text-primary)]"
              />
            </div>
            <div>
              <label htmlFor="vault-item-citation" className="mb-1 block text-xs font-semibold text-[color:var(--text-primary)]">
                Source citation <span className="font-normal text-[color:var(--text-muted)]">(optional)</span>
              </label>
              <input
                id="vault-item-citation"
                type="text"
                value={citation}
                onChange={(e) => setCitation(e.target.value)}
                placeholder="e.g., Vaswani et al., 2017, NeurIPS"
                className="w-full px-3 py-2 text-sm border border-[color:var(--border-default)] rounded-[var(--radius-md)] bg-[color:var(--surface-input)] text-[color:var(--text-primary)]"
              />
            </div>
            <div className="flex items-center gap-3 mt-1">
              <button
                type="submit"
                aria-label="Save to Vault"
                disabled={busy || !title.trim() || !content.trim()}
                className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2 text-xs font-bold text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] disabled:opacity-50 cursor-pointer"
              >
                {busy ? "Saving…" : "Save to Vault"}
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {items === null ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-7 h-7 border-2 border-[color:var(--accent)] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-[color:var(--text-muted)]">Loading Vault contents…</p>
          </div>
        ) : (
          <>
            {/* Search, Filters, and Style Toolbar */}
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[220px]">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search across all papers, datasets, notes, and citations…"
                  aria-label="Search your Vault"
                  className="w-full px-3.5 py-2 text-sm border border-[color:var(--border-default)] rounded-[var(--radius-md)] bg-[color:var(--surface-input)] text-[color:var(--text-primary)] shadow-xs"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                  className="text-xs px-2.5 py-2 rounded-lg bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] text-[color:var(--text-secondary)] outline-none"
                >
                  <option value="all">All Sources</option>
                  <option value="file">📄 Documents & PDFs</option>
                  <option value="drive_google">☁️ Google Drive</option>
                  <option value="drive_onedrive">☁️ OneDrive</option>
                  <option value="reference">📚 References</option>
                  <option value="web">🌐 Web Articles</option>
                  <option value="text">📝 Notes</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="text-xs px-2.5 py-2 rounded-lg bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] text-[color:var(--text-secondary)] outline-none"
                >
                  <option value="all">All Citations</option>
                  <option value="confirmed">✓ Confirmed</option>
                  <option value="needs_user_review">⚠️ Needs Review</option>
                  <option value="missing">✕ Missing Citation</option>
                </select>

                <select
                  value={selectedStyle}
                  onChange={(e) => setSelectedStyle(e.target.value as CitationStyleType)}
                  className="text-xs px-2.5 py-2 rounded-lg bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] text-[color:var(--accent)] font-semibold outline-none"
                >
                  <option value="apa7">Format: APA 7th</option>
                  <option value="ieee">Format: IEEE</option>
                  <option value="mla9">Format: MLA 9th</option>
                  <option value="chicago">Format: Chicago</option>
                  <option value="harvard">Format: Harvard</option>
                  <option value="vancouver">Format: Vancouver</option>
                </select>
              </div>
            </div>

            {/* Content List */}
            {visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-[color:var(--border-subtle)] rounded-[var(--radius-xl)] bg-[color:var(--surface-raised)]">
                <div className="w-14 h-14 bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] rounded-2xl flex items-center justify-center mb-3">
                  <svg className="w-7 h-7 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-[color:var(--text-primary)]">
                  {items.length === 0 ? "Nothing in your Vault yet." : "No matching items found"}
                </h3>
                <p className="text-xs text-[color:var(--text-secondary)] max-w-md mt-1.5">
                  {items.length === 0
                    ? "Upload PDF papers, connect Google Drive/OneDrive, or import BibTeX references to build your long-term research foundation."
                    : `No materials matched "${query}". Try clearing filters or searching for different terms.`}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {visible.map((item) => {
                  const isConfirmed = item.citationStatus === "confirmed";
                  const isNeedsReview = item.citationStatus === "needs_user_review";
                  const isConfirmingDelete = confirmDeleteId === item.id;

                  return (
                    <div
                      key={item.id}
                      className="flex flex-col gap-2.5 p-4 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] hover:border-[color:var(--accent-border)] transition-all shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <span className="text-xl shrink-0 mt-0.5">{getSourceIcon(item.sourceType)}</span>
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-[color:var(--text-primary)] truncate">
                              {item.title}
                            </h4>
                            <div className="flex items-center gap-2 flex-wrap mt-1">
                              {item.authors && item.authors.length > 0 && (
                                <span className="text-xs text-[color:var(--text-secondary)]">
                                  {item.authors.slice(0, 2).join(", ")}
                                  {item.authors.length > 2 ? " et al." : ""}
                                </span>
                              )}
                              {item.year && (
                                <span className="text-xs text-[color:var(--text-muted)]">
                                  ({item.year})
                                </span>
                              )}
                              {item.journal && (
                                <span className="text-xs italic text-[color:var(--text-muted)] truncate max-w-xs">
                                  {item.journal}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Citation status badge */}
                        <div className="shrink-0 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingCitationItem(item)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors cursor-pointer ${
                              isConfirmed
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : isNeedsReview
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                            }`}
                          >
                            {isConfirmed ? "✓ Citation Ready" : isNeedsReview ? "⚠️ Needs Review" : "✕ Missing Citation"}
                          </button>
                        </div>
                      </div>

                      {/* Content snippet */}
                      <p className="text-xs text-[color:var(--text-secondary)] line-clamp-2 leading-relaxed bg-[color:var(--surface-inset)] p-2.5 rounded border border-[color:var(--border-subtle)]">
                        {item.content}
                      </p>

                      {/* Citation preview & actions */}
                      <div className="flex items-center justify-between gap-3 pt-1 border-t border-[color:var(--border-subtle)] mt-1">
                        <span className="text-[11px] text-[color:var(--text-muted)] italic truncate max-w-lg">
                          {formatVaultCitation(item, selectedStyle)}
                        </span>

                        <div className="flex items-center gap-2 shrink-0">
                          {isConfirmingDelete ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-[color:var(--state-danger)] font-medium">This action has no undo.</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmDeleteId(null);
                                  handleDelete(item.id);
                                }}
                                className="px-2.5 py-1 text-xs bg-[color:var(--state-danger)] text-white font-bold rounded cursor-pointer"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleCopyCitation(item)}
                                className="px-2.5 py-1 text-xs font-semibold rounded bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] text-[color:var(--text-primary)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] transition-all cursor-pointer"
                              >
                                {copiedId === item.id ? "✓ Copied!" : "Copy Citation"}
                              </button>

                              <button
                                type="button"
                                onClick={() => setEditingCitationItem(item)}
                                className="px-2 py-1 text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer"
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(item.id)}
                                className="px-2 py-1 text-xs text-[color:var(--text-muted)] hover:text-[color:var(--state-danger)] transition-colors cursor-pointer"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Cloud Drive Connection Modal */}
        {showDriveModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-xl)] p-6 shadow-xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-3">
                <h3 className="text-base font-bold text-[color:var(--text-primary)]">
                  Cloud Drive Integrations
                </h3>
                <button
                  type="button"
                  onClick={() => setShowDriveModal(false)}
                  className="text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] cursor-pointer"
                >
                  ✕ Close
                </button>
              </div>

              <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
                Connect your cloud storage providers to automatically sync your research papers, datasets, and citation libraries across all devices.
              </p>

              <div className="flex flex-col gap-3">
                {/* Google Drive Card */}
                <div className="flex items-center justify-between p-3.5 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)]">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📁</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-[color:var(--text-primary)]">Google Drive</h4>
                        {connectedDrives.some((d) => d.provider === "google_drive") && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Connected
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[color:var(--text-muted)] mt-0.5">
                        {connectedDrives.find((d) => d.provider === "google_drive")?.accountEmail || "Sync Google Docs, PDFs, & Sheets (Gmail / Workspace)"}
                      </p>
                    </div>
                  </div>
                  {connectedDrives.some((d) => d.provider === "google_drive") ? (
                    <button
                      type="button"
                      onClick={async () => {
                        await disconnectCloudDrive(userId, "google_drive");
                        loadDrives();
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-[color:var(--state-danger)] border border-[color:var(--border-default)] rounded hover:bg-[color:var(--surface-hover)] cursor-pointer"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        await initiateGoogleDriveAuth(userId);
                        loadDrives();
                      }}
                      className="px-3.5 py-1.5 text-xs font-semibold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                    >
                      <span>🔐</span>
                      <span>Sign in with Google</span>
                    </button>
                  )}
                </div>

                {/* Microsoft OneDrive Card */}
                <div className="flex items-center justify-between p-3.5 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)]">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">☁️</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-[color:var(--text-primary)]">Microsoft OneDrive</h4>
                        {connectedDrives.some((d) => d.provider === "onedrive") && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Connected
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[color:var(--text-muted)] mt-0.5">
                        {connectedDrives.find((d) => d.provider === "onedrive")?.accountEmail || "Sync Office 365, Word, Excel, & OneDrive (Outlook)"}
                      </p>
                    </div>
                  </div>
                  {connectedDrives.some((d) => d.provider === "onedrive") ? (
                    <button
                      type="button"
                      onClick={async () => {
                        await disconnectCloudDrive(userId, "onedrive");
                        loadDrives();
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-[color:var(--state-danger)] border border-[color:var(--border-default)] rounded hover:bg-[color:var(--surface-hover)] cursor-pointer"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        await initiateOneDriveAuth(userId);
                        loadDrives();
                      }}
                      className="px-3.5 py-1.5 text-xs font-semibold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                    >
                      <span>🔐</span>
                      <span>Sign in with Outlook</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowDriveModal(false)}
                  className="px-4 py-2 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Citation Confirmation / Editor Modal */}
        {editingCitationItem && (
          <CitationConfirmationModal
            initialReference={editingCitationItem.canonicalReference}
            initialStatus={editingCitationItem.citationStatus}
            sourceTitle={editingCitationItem.title}
            sourceType={editingCitationItem.sourceType}
            onConfirm={async (confirmedRef, formattedCitation) => {
              await updateVaultItemCitation(
                userId,
                editingCitationItem.id,
                confirmedRef,
                "confirmed",
                formattedCitation
              );
              setEditingCitationItem(null);
              loadItems();
            }}
            onClose={() => setEditingCitationItem(null)}
          />
        )}
      </Shell>
    </div>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)] px-4 py-8">
      <div className="mx-auto w-full max-w-4xl">
        {onClose && (
          <div className="mb-4">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer flex items-center gap-1"
            >
              ← Back to Workspace
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
