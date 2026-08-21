import { useEffect, useMemo, useState } from "react";
import { loadVault, hasVaultPassphraseOnThisDevice, updateVaultStorageMode, type VaultRecord } from "../../services/userVault";
import {
  addVaultItem,
  deleteVaultItem,
  isVaultUnlocked,
  listVaultItems,
  lockVault,
  searchVaultItems,
  unlockVault,
  syncLocalVaultToRemote,
  type VaultItem,
  type SyncProgress,
} from "../../services/vaultContents";
import VaultSetupScreen from "../setup/VaultSetupScreen";
import VaultImport from "./VaultImport";
import VaultDocumentImport from "./VaultDocumentImport";

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
        <p className="mt-8 text-xs text-[color:var(--text-muted)]">
          Forgotten your passphrase? In this version there is no automated way to open the Vault without it. Your
          recovery code is proof that you created this Vault, but it cannot substitute for your passphrase here. If
          you have lost your passphrase, your Vault contents cannot be recovered by anyone, including us.
        </p>
        <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--surface-inset)] px-3 py-2 text-xs text-[color:var(--text-muted)]">
          ⚠️ Your Vault is stored privately in this browser. Clearing your browser’s site data may permanently remove
          your encrypted Vault from this device.
        </p>
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

  // Migration state
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);

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

  const visible = useMemo(() => (items ? searchVaultItems(items, query) : []), [items, query]);

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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleStartSync() {
    setSyncing(true);
    setError(null);
    try {
      const result = await syncLocalVaultToRemote(userId, setSyncProgress);
      if (result.success) {
        await updateVaultStorageMode("synced");
        onModeChanged("synced");
        loadItems();
      } else if (result.errors.length > 0) {
        setError(result.errors[0]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to synchronize Vault.");
    } finally {
      setTimeout(() => setSyncing(false), 1200);
    }
  }

  return (
    <Shell onClose={onClose}>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">Your Vault</h1>
          <p className="mt-1.5 text-sm text-[color:var(--text-secondary)]">
            Notes, sources, and material you have already gathered — searchable, and encrypted in this browser.
          </p>
          <div className="mt-2 flex items-center gap-3">
            {storageMode === "synced" ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-[color:var(--accent)] font-medium bg-[color:var(--accent-subtle)] px-2.5 py-1 rounded-[var(--radius-sm)] border border-[color:var(--accent-border)]">
                ☁️ Synced to Account (Cross-Device)
              </span>
            ) : (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs text-[color:var(--text-muted)] bg-[color:var(--surface-inset)] px-2.5 py-1 rounded-[var(--radius-sm)]">
                  🔒 This Browser Only
                </span>
                <button
                  type="button"
                  onClick={handleStartSync}
                  disabled={syncing}
                  className="text-xs font-semibold text-[color:var(--accent)] hover:underline cursor-pointer"
                >
                  {syncing ? "Syncing…" : "Sync to Account →"}
                </button>
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onLock}
          className="shrink-0 text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
        >
          Lock
        </button>
      </header>

      {syncProgress && syncing && (
        <div className="mb-5 p-4 rounded-[var(--radius-md)] border border-[color:var(--accent-border)] bg-[color:var(--surface-raised)] flex flex-col gap-2">
          <div className="flex justify-between text-xs text-[color:var(--text-secondary)] font-medium">
            <span>Synchronizing sources to account…</span>
            <span>{syncProgress.completed} / {syncProgress.total}</span>
          </div>
          <div className="w-full bg-[color:var(--surface-sunken)] h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-[color:var(--accent-solid)] h-full transition-all duration-300"
              style={{ width: `${(syncProgress.completed / Math.max(syncProgress.total, 1)) * 100}%` }}
            />
          </div>
          <p className="text-xs text-[color:var(--text-muted)] truncate">{syncProgress.currentTitle}</p>
        </div>
      )}

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
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your Vault"
              aria-label="Search your Vault"
              className="flex-1 px-3 py-2 text-sm"
            />
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
            <p className="text-sm text-[color:var(--text-muted)]">
              {items.length === 0 ? "Nothing in your Vault yet." : "Nothing matches that search."}
            </p>
          ) : (
            <ul aria-label="Vault items" className="flex flex-col gap-2.5">
              {visible.map((item) => (
                <li
                  key={item.id}
                  className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[color:var(--text-primary)]">{item.title}</p>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[color:var(--surface-inset)] text-[color:var(--text-muted)]">
                      {item.sourceType || "source"}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[color:var(--text-secondary)] line-clamp-3">
                    {item.content}
                  </p>
                  {item.citation && <p className="mt-1.5 text-xs text-[color:var(--text-muted)]">{item.citation}</p>}

                  {confirmingDelete === item.id ? (
                    <div className="mt-2 flex items-center gap-3">
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
                      className="mt-2 text-xs text-[color:var(--text-muted)] hover:text-[color:var(--state-danger)] cursor-pointer"
                    >
                      Delete
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Shell>
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
