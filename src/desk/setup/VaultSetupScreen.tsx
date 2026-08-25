import { useMemo, useState } from "react";
import {
  createVault,
  generateRecoveryCode,
  setVaultPassphraseVerifier,
} from "../../services/userVault";
import { setSessionUnlocked } from "../../services/vaultContents";
import OnboardingProgress from "./OnboardingProgress";

type Step = "offer" | "storage_choice" | "passphrase" | "recovery" | "done";

export default function VaultSetupScreen({
  onDone,
  onSkip,
}: {
  onDone: () => void;
  onSkip: () => void;
}) {
  const [step, setStep] = useState<Step>("offer");
  const [tourStep, setTourStep] = useState(0);
  const [storageMode, setStorageMode] = useState<"local" | "synced">("synced");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recoveryCode = useMemo(() => generateRecoveryCode(), []);

  const mismatch = confirm !== "" && passphrase !== confirm;
  const passphraseReady = passphrase.length >= 8 && !mismatch && confirm !== "";

  async function handleCreate(mode: "local" | "synced", pass?: string) {
    setBusy(true);
    setError(null);
    try {
      if (pass) {
        await setVaultPassphraseVerifier(pass);
        setSessionUnlocked(true, pass);
      } else {
        setSessionUnlocked(true);
      }
      const result = await createVault("My Knowledge Vault", mode);
      if (!result.success) {
        setError(result.error ?? "Could not create your Vault.");
        return;
      }
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (step === "offer") {
    return (
      <Shell>
        <OnboardingProgress current="knowledge" />

        {tourStep === 0 && (
          <div className="flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="w-16 h-16 bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] rounded-2xl flex items-center justify-center mb-6 shadow-sm">
              <svg className="w-8 h-8 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[color:var(--text-primary)]">
              A Knowledge Vault is your long-term library
            </h1>
            <p className="mt-3 text-[color:var(--text-secondary)] leading-relaxed">
              Store and synthesize all your academic material across projects: PDF papers, Word documents, Excel datasets,
              Google Drive files, OneDrive documents, lecture notes, and citation libraries.
            </p>
            <div className="mt-8 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setTourStep(1)}
                className="w-full sm:w-auto rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-6 py-3 text-sm font-semibold text-[color:var(--text-inverse)] transition-colors hover:bg-[color:var(--accent-hover)] cursor-pointer shadow-sm"
              >
                Next →
              </button>
              <button
                type="button"
                onClick={onSkip}
                className="rounded-[var(--radius-md)] px-4 py-3 text-sm font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
              >
                Not now
              </button>
            </div>
          </div>
        )}

        {tourStep === 1 && (
          <div className="flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="w-16 h-16 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-2xl flex items-center justify-center mb-6 shadow-sm">
              <svg className="w-8 h-8 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[color:var(--text-primary)]">
              Universal Sync & Cloud Drives
            </h1>
            <div className="mt-4 flex flex-col gap-3 text-[color:var(--text-secondary)] leading-relaxed bg-[color:var(--surface-inset)] p-4 rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)]">
              <p>
                Connect your <strong>Google Drive</strong> and <strong>OneDrive</strong> to easily upload and sync all kinds of data across any browser and any computer.
              </p>
              <p className="text-xs text-[color:var(--text-muted)]">
                ☁️ Sync seamlessly across devices with real-time academic citation extraction.
              </p>
            </div>

            <div className="mt-8 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  setStorageMode("synced");
                  handleCreate("synced");
                }}
                disabled={busy}
                className="rounded-[var(--radius-lg)] border-2 border-[color:var(--accent-border)] bg-[color:var(--accent-subtle)] px-5 py-4 text-left transition-all duration-[var(--motion-fast)] hover:border-[color:var(--accent)] hover:shadow-sm cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="block text-base font-bold text-[color:var(--accent)] group-hover:text-[color:var(--accent-hover)] transition-colors">
                    Enable Universal Cloud Sync (Recommended)
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[color:var(--accent)] text-[color:var(--text-inverse)]">
                    Fast & Multi-Device
                  </span>
                </div>
                <span className="mt-1 block text-xs text-[color:var(--text-secondary)]">
                  Access your Vault on any computer, connect Google Drive & OneDrive, and auto-generate citations.
                </span>
              </button>

              <button
                type="button"
                aria-label="Create a Secure Vault"
                onClick={() => {
                  setStorageMode("local");
                  setStep("passphrase");
                }}
                className="rounded-[var(--radius-lg)] border border-[color:var(--border-default)] px-5 py-4 text-left hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
              >
                <span className="block text-sm font-medium text-[color:var(--text-primary)]">
                  🔒 Create a Secure Vault (Private Browser-Only)
                </span>
                <span className="mt-1 block text-xs text-[color:var(--text-muted)] leading-relaxed">
                  Encrypt everything locally inside this browser with a private passphrase (does not sync across devices).
                </span>
              </button>

              <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border-default)] p-3 text-xs text-[color:var(--text-muted)]">
                <span className="font-semibold text-[color:var(--text-secondary)]">Import an existing library:</span> BibTeX, RIS, PDF, Excel, and Word files can be imported after initializing your Knowledge Vault. Create a Vault first to begin.
              </div>

              <div className="flex justify-between items-center mt-4">
                <button
                  type="button"
                  onClick={() => setTourStep(0)}
                  className="px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={onSkip}
                  className="rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] cursor-pointer"
                >
                  Not now
                </button>
              </div>
            </div>
          </div>
        )}
      </Shell>
    );
  }

  if (step === "passphrase") {
    return (
      <Shell>
        <OnboardingProgress current="knowledge" />
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">
          Choose a Vault Passphrase
        </h1>
        <p className="mt-1.5 text-sm text-[color:var(--text-secondary)]">
          This encrypts your Vault locally in this browser. It is <strong>not</strong> your account password.
        </p>
        <p className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--surface-inset)] px-3 py-2 text-xs text-[color:var(--text-muted)]">
          🔒 Private local mode stores data in this specific browser only.
        </p>

        <div className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="vault-pass" className="text-sm font-medium text-[color:var(--text-primary)]">
              Vault passphrase
            </label>
            <input
              id="vault-pass"
              type="password"
              autoComplete="new-password"
              autoFocus
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              aria-describedby="vault-pass-hint"
              className="w-full px-3 py-2 text-sm border border-[color:var(--border-default)] rounded-[var(--radius-md)] bg-[color:var(--surface-input)] text-[color:var(--text-primary)]"
            />
            <p id="vault-pass-hint" className="text-xs text-[color:var(--text-muted)]">
              At least 8 characters.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="vault-confirm" className="text-sm font-medium text-[color:var(--text-primary)]">
              Confirm passphrase
            </label>
            <input
              id="vault-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[color:var(--border-default)] rounded-[var(--radius-md)] bg-[color:var(--surface-input)] text-[color:var(--text-primary)]"
            />
          </div>

          {mismatch && (
            <p
              role="alert"
              className="rounded-[var(--radius-md)] border border-[color:var(--accent-border)] bg-[color:var(--state-danger-subtle)] px-3 py-2 text-sm text-[color:var(--state-danger)]"
            >
              The two passphrases do not match.
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!passphraseReady}
              onClick={() => setStep("recovery")}
              className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-inverse)] transition-colors hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={() => setStep("offer")}
              className="text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
            >
              Back
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (step === "recovery") {
    return (
      <Shell>
        <OnboardingProgress current="knowledge" />
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">
          Save your recovery code
        </h1>

        <p className="mt-5 select-all rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] px-4 py-3 text-center font-mono text-base tracking-wider text-[color:var(--text-primary)]">
          {recoveryCode}
        </p>

        <p className="mt-4 text-sm text-[color:var(--text-secondary)]">
          If you forget your passphrase, this code is the only way to open your Vault again. We do not have a copy. We
          cannot reset it.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <SecondaryButton onClick={() => void navigator.clipboard?.writeText(recoveryCode)}>Copy</SecondaryButton>
          <SecondaryButton
            onClick={() => {
              const blob = new Blob([`Scholar Knowledge Vault recovery code\n\n${recoveryCode}\n`], {
                type: "text/plain",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "scholar-vault-recovery-code.txt";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download
          </SecondaryButton>
        </div>

        <label className="mt-6 flex items-start gap-2.5 text-sm text-[color:var(--text-primary)]">
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            className="mt-0.5"
          />
          <span>I have saved this somewhere safe</span>
        </label>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--accent-border)] bg-[color:var(--state-danger-subtle)] px-3 py-2 text-sm text-[color:var(--state-danger)]"
          >
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={!saved || busy}
          onClick={() => handleCreate("local", passphrase)}
          className="mt-5 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-inverse)] transition-colors hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
        >
          {busy ? "Creating…" : "Continue"}
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <OnboardingProgress current="workshop" />
      <div className="flex flex-col animate-in fade-in duration-500">
        <div className="w-14 h-14 bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] rounded-2xl flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">
          Your Vault is ready
        </h1>
        <p className="mt-2 text-sm text-[color:var(--text-secondary)] leading-relaxed">
          Your research repository is initialized. You can upload PDFs, Word documents, Excel datasets, connect Google Drive & OneDrive, and auto-format citations at any time from the Vault screen.
        </p>
        <div className="mt-4 rounded-[var(--radius-md)] bg-[color:var(--surface-inset)] px-3.5 py-2.5 text-xs text-[color:var(--text-muted)]">
          ☁️ Sync active · Ready for cross-device research and academic citations.
        </div>
        <button
          type="button"
          onClick={onDone}
          className="mt-6 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-5 py-2.5 text-sm font-semibold text-[color:var(--text-inverse)] transition-colors hover:bg-[color:var(--accent-hover)] cursor-pointer shadow-sm"
        >
          Go to your work
        </button>
      </div>
    </Shell>
  );
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] px-3 py-1.5 text-sm text-[color:var(--text-primary)] transition-colors hover:border-[color:var(--border-strong)] cursor-pointer"
    >
      {children}
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)] px-4 py-10">
      <div className="mx-auto w-full max-w-lg">{children}</div>
    </div>
  );
}
