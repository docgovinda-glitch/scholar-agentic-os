import { useEffect, useMemo, useState } from "react";
import { loadVault, hasVaultPassphraseOnThisDevice } from "../../services/userVault";
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
import VaultImport from "./VaultImport";
import VaultDocumentImport from "./VaultDocumentImport";

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
/**
 * Three loading states for the vault:
 * - null: still checking
 * - "none": no vault row on server (user never created one)
 * - "other-device": vault row exists on server, but this browser has no local verifier
 * - "this-device": vault row exists AND this browser has a verifier
 */
type VaultPresence = null | "none" | "other-device" | "this-device";

export default function VaultScreen({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [vaultPresence, setVaultPresence] = useState<VaultPresence>(null);
  const [unlocked, setUnlocked] = useState(isVaultUnlocked());
  const [passphrase, setPassphrase] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const vaultRecord = await loadVault();
      if (!vaultRecord) {
        setVaultPresence("none");
        return;
      }
      // Server row exists — check whether this specific browser has the local verifier.
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
    return <VaultSetupScreen onDone={() => setVaultPresence("this-device")} onSkip={onClose} />;
  }

  // P1-4: Vault exists on the server (another device created it) but this browser has no local data.
  if (vaultPresence === "other-device") {
    return (
      <Shell onClose={onClose}>
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">
          Your Vault is on another browser
        </h1>
        <div className="mt-4 flex flex-col gap-3 text-sm text-[color:var(--text-secondary)]">
          <p>
            Your private Knowledge Vault was created in a different browser or on a different device. It is stored
            locally there and is not available here.
          </p>
          <p>
            Knowledge Vault synchronisation across devices is not currently available. Your projects are available
            normally — only the Vault is device-local.
          </p>
          <p className="rounded-[var(--radius-md)] bg-[color:var(--surface-inset)] px-3 py-2 text-xs text-[color:var(--text-muted)]">
            🔒 Private Vault · Stored in the browser where you created it · Not synced<br />
            ☁️ Projects · Synced to your Scholar account
          </p>
        </div>
        <p className="mt-6 text-sm text-[color:var(--text-secondary)]">
          To use your Vault, open Scholar in the original browser. To start a new Vault in this browser, contact
          support or clear your Scholar Vault data on the original device first.
        </p>
      </Shell>
    );
  }

  if (!unlocked) {
    return (
      <Shell onClose={onClose}>
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">Unlock your Vault</h1>
        <p className="mt-1.5 text-sm text-[color:var(--text-secondary)]">
          Your passphrase never leaves this browser and stays in memory only for this visit.
        </p>
        {/* P1-2: device-local badge */}
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-[color:var(--text-muted)]">
          <span>🔒 Private Vault</span>
          <span aria-hidden="true">·</span>
          <span>Stored in this browser</span>
          <span aria-hidden="true">·</span>
          <span>Not synced</span>
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
        {/*
          P0-2 finding: the recovery code has no automated unlock path in this version —
          it cannot be entered here to open the Vault. The passphrase is the only unlock
          credential. The recovery code is a proof-of-ownership token for future support
          use. The wording is updated to be accurate rather than implying automatic recovery.
        */}
        <p className="mt-8 text-xs text-[color:var(--text-muted)]">
          Forgotten your passphrase? In this version there is no automated way to open the Vault without it. Your
          recovery code is proof that you created this Vault, but it cannot substitute for your passphrase here. If
          you have lost your passphrase, your Vault contents cannot be recovered by anyone, including us.
        </p>
        {/* P0-1: Browser storage clearing warning */}
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

  // P3-2: Escape locks the Vault when it is unlocked and visible.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) {
        onLock();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onLock]);

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
            Notes, sources, and material you have already gathered — searchable, and encrypted in this browser.
          </p>
          {/* P1-2: Persistent device-local status indicator */}
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-[color:var(--text-muted)]">
            <span>🔒 Private Vault</span>
            <span aria-hidden="true">·</span>
            <span>Stored in this browser</span>
            <span aria-hidden="true">·</span>
            <span>Not synced</span>
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

          <div className="mb-2 flex flex-wrap gap-4">
            <VaultImport
              userId={userId}
              onImported={(saved) => setItems((current) => [...saved, ...(current ?? [])])}
            />
            <VaultDocumentImport
              userId={userId}
              onImported={(saved) => setItems((current) => [saved, ...(current ?? [])])}
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
                      {/* P3-3: autoFocus moves keyboard/screen-reader focus to the
                          destructive action so it is never missed. */}
                      <button
                        type="button"
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
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
