import { useEffect, useState } from "react";
import {
  loadVault,
  hasVaultPassphraseOnThisDevice,
  updateVaultStorageMode,
  type VaultRecord,
} from "../../services/userVault";
import {
  isVaultUnlocked,
  setSessionUnlocked,
  lockVault,
  unlockVault,
} from "../../services/vaultContents";
import VaultSetupScreen from "../setup/VaultSetupScreen";
import SourceLibraryScreen from "./SourceLibraryScreen";

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
          <p className="text-sm text-[color:var(--text-muted)]">Loading your Source Library…</p>
        </div>
      </Shell>
    );
  }

  if (vaultPresence === "none") {
    return (
      <VaultSetupScreen
        onDone={() => {
          setVaultPresence("synced");
          setUnlocked(true);
        }}
        onSkip={onClose}
      />
    );
  }

  if (vaultPresence === "other-device") {
    return (
      <Shell onClose={onClose}>
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">
          Your Vault is on another browser
        </h1>
        <div className="mt-4 flex flex-col gap-3 text-sm text-[color:var(--text-secondary)]">
          <p>
            Your Source Library stays privately in the browser on the device where you created it.
            It does not sync across devices or browsers in browser-only mode.
          </p>
          <div className="rounded-[var(--radius-md)] bg-[color:var(--surface-inset)] p-3 text-xs">
            <p className="font-medium text-[color:var(--text-primary)]">Projects vs. Source Library:</p>
            <p className="mt-1">
              Projects: Synced to your Scholar account and accessible anywhere.
            </p>
            <p>
              Source Library (Browser-Only): Kept strictly on the original browser with your passphrase.
            </p>
          </div>
          <p>
            Enable <strong>Cloud Sync</strong> to seamlessly access all your citations and source references on this device.
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
            Enable Cloud Sync
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
    <SourceLibraryScreen
      userId={userId}
      onClose={onClose}
      onLock={() => {
        lockVault();
        setUnlocked(false);
        setVaultPresence("this-device");
      }}
      onResetVault={() => setVaultPresence("none")}
    />
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
