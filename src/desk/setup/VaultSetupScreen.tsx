import { useMemo, useState } from "react";
import {
  createVault,
  generateRecoveryCode,
  setVaultPassphraseVerifier,
} from "../../services/userVault";

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
 * secures it — passphrase and Recovery Kit. Adding material to it from Desk
 * (PDFs, notes, datasets) and importing an existing library from Zotero or
 * BibTeX are NOT implemented in this client yet; the importers do not exist
 * anywhere in the codebase. Those options are shown as unavailable with the
 * reason, rather than as buttons that quietly do nothing — docs 22 §6.2's
 * "never a silent no-op".
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
      const result = await createVault("My Knowledge Vault");
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
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">
          A Knowledge Vault is your long-term library
        </h1>
        <div className="mt-4 flex flex-col gap-3 text-sm text-[color:var(--text-secondary)]">
          <p>
            Lecture notes. Books. Papers you have read. Your previous essays and theses. PDFs, handwritten notes you
            photograph, interview transcripts, datasets, lab notebooks.
          </p>
          <p>
            Over time it becomes the foundation your work is built on — when you write something new, Scholar can draw
            on everything you have already read, and you can search years of reading in one place.
          </p>
          <p>It stays on your computer, encrypted. It is entirely optional, and everything works without it.</p>
        </div>

        {/* Three peer options, presented without a default (docs 25 §6.1). */}
        <div className="mt-7 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setStep("passphrase")}
            className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] px-4 py-3 text-left transition-colors duration-[var(--motion-fast)] hover:border-[color:var(--border-strong)] cursor-pointer"
          >
            <span className="block text-sm font-medium text-[color:var(--text-primary)]">Create a Vault</span>
            <span className="mt-0.5 block text-xs text-[color:var(--text-muted)]">
              Choose a passphrase and save a recovery code.
            </span>
          </button>

          <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-default)] px-4 py-3">
            <span className="block text-sm font-medium text-[color:var(--text-muted)]">
              Import an existing library
            </span>
            {/* Named honestly rather than shown as a live control: the Zotero,
                Mendeley, EndNote and BibTeX importers are not built yet, in
                this client or any other. */}
            <span className="mt-0.5 block text-xs text-[color:var(--text-muted)]">
              Not available yet — Zotero, Mendeley, EndNote and BibTeX import are still to be built.
            </span>
          </div>

          <button
            type="button"
            onClick={onSkip}
            className="rounded-[var(--radius-md)] px-4 py-3 text-left text-sm text-[color:var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] cursor-pointer"
          >
            Not now
          </button>
        </div>
      </Shell>
    );
  }

  if (step === "passphrase") {
    return (
      <Shell>
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">
          Choose a Vault passphrase
        </h1>
        <p className="mt-1.5 text-sm text-[color:var(--text-secondary)]">
          This encrypts your Vault. It is <strong>not</strong> your account password, and changing one does not change
          the other.
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
      <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">Your Vault is ready</h1>
      <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
        It is encrypted with the passphrase you chose. Adding material to it from Desk is still being built — your
        Vault is set up and waiting for it.
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
