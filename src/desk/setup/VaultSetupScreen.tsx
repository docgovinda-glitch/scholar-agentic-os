import { useMemo, useState } from "react";
import {
  createVault,
  generateRecoveryCode,
  setVaultPassphraseVerifier,
} from "../../services/userVault";
import OnboardingProgress from "./OnboardingProgress";

/**
 * Knowledge Vault setup — docs 25 §6, the optional stage after AI setup.
 *
 * The explanatory copy in §6.2 and the Recovery Kit wording in §6.3 are
 * specified almost verbatim in that document and are reproduced closely here.
 * That is deliberate on the spec's part: §6.3 calls the wording "deliberately
 * unsoftened", because a user who does not believe the warning is a user who
 * loses their library. Rewording it to sound friendlier would be the one
 * change that breaks it.
 *
 * WHAT IS BUILT, AND WHAT IS NOT. Creating a Vault here establishes it and
 * secures it — passphrase and Recovery Kit. Adding manual text material
 * (notes, source citations) is built, and so is importing a BibTeX or RIS
 * export (RIS covers Zotero/Mendeley/EndNote's own export format) — see
 * ../vault/VaultScreen.tsx and VaultImport.tsx, reached from "Vault" in the
 * header once a Vault exists. What is NOT implemented is doing either of
 * those here, before a Vault exists, or importing actual files (PDFs,
 * datasets): the latter needs server-side parsing that does not exist
 * anywhere in the codebase. That option is shown as unavailable with the
 * reason, rather than as a button that quietly does nothing — docs 22
 * §6.2's "never a silent no-op".
 */

type Step = "offer" | "passphrase" | "recovery" | "done";

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

  // Generated once per mount so it is stable across re-renders — a code that
  // changed while the user was copying it down would be catastrophic, since
  // no other copy exists.
  const recoveryCode = useMemo(() => generateRecoveryCode(), []);

  const mismatch = confirm !== "" && passphrase !== confirm;
  const passphraseReady = passphrase.length >= 8 && !mismatch && confirm !== "";

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      await setVaultPassphraseVerifier(passphrase);
      const result = await createVault("My Knowledge Vault", storageMode);
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
              Lecture notes. Books. Papers you have read. Your previous essays and theses. PDFs, handwritten notes you
              photograph, interview transcripts, datasets, lab notebooks.
            </p>
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setTourStep(1)}
                className="w-full sm:w-auto rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-6 py-3 text-sm font-semibold text-[color:var(--text-inverse)] transition-colors hover:bg-[color:var(--accent-hover)] cursor-pointer shadow-sm"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {tourStep === 1 && (
          <div className="flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="w-16 h-16 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-2xl flex items-center justify-center mb-6 shadow-sm">
              <svg className="w-8 h-8 text-[color:var(--text-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[color:var(--text-primary)]">
              Privacy First. Zero Tracking.
            </h1>
            <div className="mt-4 flex flex-col gap-3 text-[color:var(--text-secondary)] leading-relaxed bg-[color:var(--surface-inset)] p-4 rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)]">
              <p>
                Your Vault stays privately in this browser on this device, encrypted with a passphrase you choose. 
              </p>
              <p>
                <strong>Why the passphrase matters:</strong> It physically locks your data. Without it, the data is scrambled and unreadable by anyone—even us. 
              </p>
            </div>
            
            {/* Three peer options, presented without a default (docs 25 §6.1). */}
            <div className="mt-8 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setStep("passphrase")}
                className="rounded-[var(--radius-lg)] border-2 border-[color:var(--accent-border)] bg-[color:var(--accent-subtle)] px-5 py-4 text-left transition-all duration-[var(--motion-fast)] hover:border-[color:var(--accent)] hover:shadow-sm cursor-pointer group"
              >
                <span className="block text-base font-bold text-[color:var(--accent)] group-hover:text-[color:var(--accent-hover)] transition-colors">Create a Secure Vault</span>
                <span className="mt-1 block text-xs text-[color:var(--text-secondary)]">
                  Choose a passphrase and save a recovery code to encrypt your library.
                </span>
              </button>
    
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border-default)] px-5 py-4 bg-[color:var(--surface-canvas)]">
                <span className="block text-sm font-medium text-[color:var(--text-primary)]">
                  Import an existing library
                </span>
                <span className="mt-1 block text-xs text-[color:var(--text-muted)] leading-relaxed">
                  Create a Vault first — then import a BibTeX or RIS file (from Zotero, Mendeley, or EndNote) from the
                  Vault screen.
                </span>
              </div>
    
              <div className="flex justify-between items-center mt-2">
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
          Choose a Vault passphrase
        </h1>
        <p className="mt-1.5 text-sm text-[color:var(--text-secondary)]">
          This encrypts your Vault locally in this browser. It is <strong>not</strong> your account password, and changing one does not change
          the other.
        </p>
        <p className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--surface-inset)] px-3 py-2 text-xs text-[color:var(--text-muted)]">
          🔒 Your Vault is stored privately in this browser. Your projects sync to your Scholar account, but your Vault does not.
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
              className="w-full px-3 py-2 text-sm"
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
              className="w-full px-3 py-2 text-sm"
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
              className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
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

        {/* Docs 25 §6.3: "deliberately unsoftened". Left as written — a user
            who does not believe this is a user who loses their library. */}
        <p className="mt-4 text-sm text-[color:var(--text-secondary)]">
          If you forget your passphrase, this code is the only way to open your Vault again. We do not have a copy. We
          cannot reset it. If you lose both, the Vault cannot be recovered by anyone, including us.
        </p>
        <p className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--state-warning-subtle,var(--border-default))] bg-[color:var(--surface-inset)] px-3 py-2 text-xs text-[color:var(--text-secondary)]">
          ⚠️ Your Vault is stored privately in this browser on this device. Clearing your browser’s site data or
          storage may permanently remove your Vault. Keep this recovery code in a safe place outside this browser.
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
          <SecondaryButton onClick={() => window.print()}>Print</SecondaryButton>
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

        {/* §6.3: this step is not skippable, and Continue stays disabled until
            the box is ticked. */}
        <button
          type="button"
          disabled={!saved || busy}
          onClick={handleCreate}
          className="mt-5 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
        >
          {busy ? "Creating…" : "Continue"}
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <OnboardingProgress current="workshop" />
      <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">Your Vault is ready</h1>
      <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
        It is encrypted with the passphrase you chose and stored privately in this browser. Find “Vault” from the header any time to add material, search
        it, or come back to what you have already gathered.
      </p>
      <p className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--surface-inset)] px-3 py-2 text-xs text-[color:var(--text-muted)]">
        ☁️ Your projects sync to your Scholar account. 🔒 Your private Vault stays in this browser and does not currently sync to other devices.
      </p>
      <button
        type="button"
        onClick={onDone}
        className="mt-6 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] cursor-pointer"
      >
        Go to your work
      </button>
    </Shell>
  );
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] px-3 py-1.5 text-sm text-[color:var(--text-primary)] transition-colors duration-[var(--motion-fast)] hover:border-[color:var(--border-strong)] cursor-pointer"
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
