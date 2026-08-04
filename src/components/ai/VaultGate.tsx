/**
 * Vault unlock, creation, and recovery.
 *
 * The old gate asked for a passphrase on every page load and stored nothing,
 * so keys appeared to vanish after each reload and the app reported "no key
 * configured" rather than "locked". This offers the honest choice instead:
 * stay unlocked on this device (the default, backed by a non-extractable
 * IndexedDB key that no script can read out), or require a passphrase each
 * session. The tradeoff of each is stated on the screen where it is made,
 * not buried in documentation.
 *
 * Recovery is presented as part of setup rather than as an advanced option,
 * because a device-bound vault has exactly one failure mode — clearing site
 * data or changing machine — and a backup taken afterwards is worthless.
 */

import React, { useEffect, useRef, useState } from "react";
import { Lock, Unlock, ShieldCheck, Download, Upload, KeyRound, AlertTriangle, Loader2, Monitor } from "lucide-react";
import * as vault from "../../services/apiVault";

interface VaultGateProps {
  onUnlocked: () => void;
}

export default function VaultGate({ onUnlocked }: VaultGateProps) {
  const [mode, setMode] = useState<"loading" | "create" | "unlock" | "unlocked" | "unrecoverable">("loading");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (vault.isVaultUnlocked()) {
        setMode("unlocked");
        return;
      }
      if (!vault.vaultExists()) {
        setMode("create");
        return;
      }
      // A device-mode vault opens with no interaction at all — the whole
      // point of that mode is that returning users never see this screen.
      if (vault.canAutoUnlock()) {
        const result = await vault.unlockVault();
        if (cancelled) return;
        if (result.ok) {
          setMode("unlocked");
          onUnlocked();
          return;
        }
        if (result.reason === "corrupted") {
          setError(result.message ?? null);
          setMode("unrecoverable");
          return;
        }
      }
      setMode("unlock");
    })();

    return () => {
      cancelled = true;
    };
  }, [onUnlocked]);

  const handleCreate = async () => {
    setError(null);
    if (usePassphrase) {
      if (passphrase.length < 8) {
        setError("Use at least 8 characters.");
        return;
      }
      if (passphrase !== confirmPassphrase) {
        setError("The two passphrases do not match.");
        return;
      }
    }
    setBusy(true);
    try {
      const result = await vault.unlockVault(usePassphrase ? passphrase : undefined);
      if (result.ok) {
        setPassphrase("");
        setConfirmPassphrase("");
        setMode("unlocked");
        onUnlocked();
      } else {
        setError(result.message ?? "Could not create the vault.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await vault.unlockVault(passphrase);
      if (result.ok) {
        setPassphrase("");
        setMode("unlocked");
        onUnlocked();
      } else {
        setError(result.message ?? "Could not unlock the vault.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (mode === "loading") {
    return (
      <div className="flex items-center gap-2 text-xs text-[color:var(--text-secondary)] p-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        Opening your key vault...
      </div>
    );
  }

  if (mode === "unlocked") return <VaultManagement />;

  if (mode === "unrecoverable") {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-xs font-bold">Vault key missing</span>
        </div>
        <p className="text-xs text-[color:var(--text-primary)] leading-relaxed">{error}</p>
        <div className="flex flex-wrap gap-2">
          <RestoreFromBackupButton onRestored={() => { setMode("unlocked"); onUnlocked(); }} />
          <button
            type="button"
            onClick={async () => {
              await vault.destroyVault();
              setMode("create");
              setError(null);
            }}
            className="px-3 py-1.5 border border-[color:var(--color-navy-4)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] text-xs font-semibold rounded-lg cursor-pointer"
          >
            Start a new vault
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 space-y-4 max-w-lg">
      <div className="flex items-center gap-2">
        <Lock className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
        <span className="text-xs font-bold text-[color:var(--text-secondary)]">
          {mode === "create" ? "Set up your key vault" : "Unlock your key vault"}
        </span>
      </div>

      {mode === "create" ? (
        <>
          <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
            Your API keys are encrypted before they are saved, and never leave this device.
            Choose how the vault should open:
          </p>

          <div className="space-y-2">
            <label
              className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                !usePassphrase
                  ? "border-[color:var(--color-luminous-blue)]/50 bg-[color:var(--color-luminous-blue)]/5"
                  : "border-[color:var(--color-navy-4)] hover:border-[color:var(--color-navy-4)]"
              }`}
            >
              <input
                type="radio"
                checked={!usePassphrase}
                onChange={() => setUsePassphrase(false)}
                className="mt-0.5 accent-[color:var(--color-luminous-blue)]"
              />
              <div>
                <span className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5" />
                  Stay unlocked on this device
                </span>
                <p className="text-xs text-[color:var(--text-secondary)] mt-1 leading-relaxed">
                  Recommended. No prompt, ever. The encryption key is stored so that no website
                  code can read it — but anyone using this browser profile can use your keys.
                </p>
              </div>
            </label>

            <label
              className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                usePassphrase
                  ? "border-[color:var(--color-luminous-blue)]/50 bg-[color:var(--color-luminous-blue)]/5"
                  : "border-[color:var(--color-navy-4)]"
              }`}
            >
              <input
                type="radio"
                checked={usePassphrase}
                onChange={() => setUsePassphrase(true)}
                className="mt-0.5 accent-[color:var(--color-luminous-blue)]"
              />
              <div>
                <span className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  Ask for a passphrase each session
                </span>
                <p className="text-xs text-[color:var(--text-secondary)] mt-1 leading-relaxed">
                  Strongest protection on a shared computer. The passphrase is never stored, so
                  losing it means losing every saved key unless you have a backup file.
                </p>
              </div>
            </label>
          </div>

          {usePassphrase && (
            <div className="space-y-2">
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Vault passphrase"
                autoComplete="new-password"
                className="w-full bg-[color:var(--color-navy-3)] border border-[color:var(--color-navy-4)] rounded-lg px-3 py-2 text-sm text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--color-luminous-blue)]"
              />
              <input
                type="password"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                placeholder="Confirm passphrase"
                autoComplete="new-password"
                className="w-full bg-[color:var(--color-navy-3)] border border-[color:var(--color-navy-4)] rounded-lg px-3 py-2 text-sm text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--color-luminous-blue)]"
              />
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
            Enter the passphrase you chose when you set up the vault.
          </p>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
            placeholder="Vault passphrase"
            autoComplete="current-password"
            autoFocus
            className="w-full bg-[color:var(--color-navy-3)] border border-[color:var(--color-navy-4)] rounded-lg px-3 py-2 text-sm text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--color-luminous-blue)]"
          />
        </>
      )}

      {error && <p className="text-xs text-red-400 leading-relaxed">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={mode === "create" ? handleCreate : handleUnlock}
          disabled={busy}
          className="px-4 py-2 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
          {mode === "create" ? "Create vault" : "Unlock"}
        </button>
        <RestoreFromBackupButton onRestored={() => { setMode("unlocked"); onUnlocked(); }} />
      </div>
    </div>
  );
}

/** Post-unlock controls: backup, restore, and switching unlock mode. */
function VaultManagement() {
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [showBackup, setShowBackup] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const entryCount = vault.listEntries().length;

  const handleExport = async () => {
    setMessage(null);
    if (backupPassphrase.length < 8) {
      setMessage({ tone: "error", text: "Use at least 8 characters for the recovery passphrase." });
      return;
    }
    try {
      vault.downloadBackupFile(await vault.exportBackup(backupPassphrase));
      setBackupPassphrase("");
      setShowBackup(false);
      setMessage({
        tone: "ok",
        text: "Backup downloaded. Store it somewhere safe — it is the only way back if this browser's data is cleared.",
      });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not create the backup." });
    }
  };

  return (
    <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
          <span className="text-xs font-bold text-[color:var(--text-secondary)]">
            Vault unlocked · {entryCount} {entryCount === 1 ? "key" : "keys"} saved
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowBackup((v) => !v)}
            className="px-2.5 py-1.5 border border-[color:var(--color-navy-4)] hover:border-[color:var(--color-luminous-blue)] text-[color:var(--text-primary)] text-xs font-semibold rounded-lg cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3 h-3" />
            Back up
          </button>
          <RestoreFromBackupButton onRestored={() => setMessage({ tone: "ok", text: "Keys restored from backup." })} compact />
        </div>
      </div>

      {entryCount > 0 && !showBackup && (
        <p className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed">
          If this browser's data is cleared, these keys cannot be recovered. Take a backup now
          while it is easy.
        </p>
      )}

      {showBackup && (
        <div className="space-y-2 border-t border-[color:var(--color-navy-4)] pt-3">
          <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
            Choose a passphrase for the backup file. You will need it to restore, and it is not
            stored anywhere — write it down.
          </p>
          <input
            type="password"
            value={backupPassphrase}
            onChange={(e) => setBackupPassphrase(e.target.value)}
            placeholder="Recovery passphrase"
            autoComplete="new-password"
            className="w-full bg-[color:var(--color-navy-3)] border border-[color:var(--color-navy-4)] rounded-lg px-3 py-2 text-sm text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--color-luminous-blue)]"
          />
          <button
            type="button"
            onClick={handleExport}
            className="px-3 py-1.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            Download backup
          </button>
        </div>
      )}

      {message && (
        <p className={`text-xs leading-relaxed ${message.tone === "ok" ? "text-[color:var(--color-luminous-blue)]" : "text-red-400"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

function RestoreFromBackupButton({
  onRestored,
  compact,
}: {
  onRestored: () => void;
  compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<unknown | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    try {
      setPendingFile(JSON.parse(await file.text()));
    } catch {
      setError("That file could not be read as a backup.");
    }
  };

  const handleRestore = async () => {
    if (!pendingFile) return;
    setBusy(true);
    setError(null);
    try {
      // A restore needs somewhere to restore INTO. When the vault has never
      // been created (or was destroyed after losing its device key), open a
      // fresh device-mode vault first so importBackup has a target.
      if (!vault.isVaultUnlocked()) {
        const unlocked = await vault.unlockVault();
        if (!unlocked.ok) {
          setError(unlocked.message ?? "Could not open a vault to restore into.");
          return;
        }
      }
      const result = await vault.importBackup(pendingFile, passphrase);
      if (result.ok) {
        setPendingFile(null);
        setPassphrase("");
        onRestored();
      } else {
        setError(result.message ?? "Could not restore this backup.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className={`border border-[color:var(--color-navy-4)] hover:border-[color:var(--color-luminous-blue)] text-[color:var(--text-primary)] font-semibold rounded-lg cursor-pointer flex items-center gap-1.5 ${ compact ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-xs" }`}
      >
        <Upload className="w-3 h-3" />
        Restore backup
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />

      {pendingFile !== null && (
        <div className="w-full mt-2 bg-[color:var(--color-navy-3)]/60 border border-[color:var(--color-navy-4)] rounded-xl p-3 space-y-2">
          <p className="text-xs text-[color:var(--text-secondary)]">Enter the recovery passphrase for this backup file.</p>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRestore()}
            placeholder="Recovery passphrase"
            autoComplete="off"
            className="w-full bg-[color:var(--color-navy-3)] border border-[color:var(--color-navy-4)] rounded-lg px-3 py-2 text-sm text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--color-luminous-blue)]"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRestore}
              disabled={busy}
              className="px-3 py-1.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50"
            >
              {busy ? "Restoring..." : "Restore"}
            </button>
            <button
              type="button"
              onClick={() => { setPendingFile(null); setError(null); }}
              className="px-3 py-1.5 border border-[color:var(--color-navy-4)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] text-xs font-semibold rounded-lg cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
