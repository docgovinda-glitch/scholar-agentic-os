import { useEffect, useMemo, useState } from "react";
import { loadVault } from "../../services/userVault";
import {
  addVaultItem,
  deleteVaultItem,
  isVaultUnlocked,
  listVaultItems,
  lockVault,
  searchVaultItems,
  unlockVault,
  type VaultItem,
} from "../../services/vaultContents";
import VaultSetupScreen from "../setup/VaultSetupScreen";

/**
 * The Knowledge Vault's contents (docs 25 §6) — reachable any time from
 * Header/ProjectListScreen, not folded into a project. A Vault is
 * explicitly "your long-term library... across future projects" (§6.2), so
 * this is a peer destination to a project, the same reasoning that already
 * moved AI settings off `PaperProject` and onto the user.
 *
 * Three states in order: no Vault yet (reuses VaultSetupScreen's own create
 * flow rather than duplicating it — "Not now" here just returns, since this
 * is a deliberate visit, not the onboarding offer `useVaultSetupStatus`
 * tracks skips for), locked (the passphrase lives in memory only, per
 * session — see vaultContents.ts), and unlocked (list, add, search, delete).
 */
export default function VaultScreen({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [hasVault, setHasVault] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(isVaultUnlocked());
  const [passphrase, setPassphrase] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadVault().then((v) => setHasVault(v !== null));
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

  if (hasVault === null) {
    return (
      <Shell onClose={onClose}>
        <p className="text-sm text-[color:var(--text-muted)]">Loading your Vault…</p>
      </Shell>
    );
  }

  if (!hasVault) {
    return <VaultSetupScreen onDone={() => setHasVault(true)} onSkip={onClose} />;
  }

  if (!unlocked) {
    return (
      <Shell onClose={onClose}>
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">Unlock your Vault</h1>
        <p className="mt-1.5 text-sm text-[color:var(--text-secondary)]">
          Your passphrase never leaves this device and stays in memory only for this visit.
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
              className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
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
        {/* Honest about the one thing this screen cannot do: §6.3's promise
            ("we cannot reset it") means there is no automated way back in
            here, not a missing feature. */}
        <p className="mt-8 text-xs text-[color:var(--text-muted)]">
          Forgotten your passphrase? Only your recovery code can open this Vault. If you have lost both, its contents
          cannot be recovered by anyone, including us.
        </p>
      </Shell>
    );
  }

  return (
    <VaultContents
      userId={userId}
      onClose={onClose}
      onLock={() => {
        lockVault();
        setUnlocked(false);
      }}
    />
  );
}

function VaultContents({ userId, onClose, onLock }: { userId: string; onClose: () => void; onLock: () => void }) {
  const [items, setItems] = useState<VaultItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [citation, setCitation] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listVaultItems(userId)
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  }, [userId]);

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

  return (
    <Shell onClose={onClose}>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">Your Vault</h1>
          <p className="mt-1.5 text-sm text-[color:var(--text-secondary)]">
            Notes, sources, and material you have already gathered — searchable, and encrypted on this device.
          </p>
        </div>
        <button
          type="button"
          onClick={onLock}
          className="shrink-0 text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
        >
          Lock
        </button>
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
              className="shrink-0 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] cursor-pointer"
            >
              {adding ? "Cancel" : "Add material"}
            </button>
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
                className="self-start rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
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
            <ul aria-label="Vault items" className="flex flex-col gap-2">
              {visible.map((item) => (
                <li
                  key={item.id}
                  className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] px-4 py-3"
                >
                  <p className="text-sm font-medium text-[color:var(--text-primary)]">{item.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[color:var(--text-secondary)]">{item.content}</p>
                  {item.citation && <p className="mt-1.5 text-xs text-[color:var(--text-muted)]">{item.citation}</p>}

                  {confirmingDelete === item.id ? (
                    <div className="mt-2 flex items-center gap-3">
                      <span className="text-xs text-[color:var(--text-secondary)]">Delete this? There is no undo.</span>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        disabled={busy}
                        className="text-xs text-[color:var(--state-danger)] hover:opacity-80 cursor-pointer"
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
          className="mb-6 text-sm text-[color:var(--accent)] transition-colors duration-[var(--motion-fast)] hover:text-[color:var(--accent-hover)] cursor-pointer"
        >
          ← Back
        </button>
        {children}
      </div>
    </div>
  );
}
