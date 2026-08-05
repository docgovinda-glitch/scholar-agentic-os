import { useState } from "react";
import { addVaultItems, type VaultItem } from "../../services/vaultContents";
import { parseReferences, type ImportPreview } from "./referenceImport";

/**
 * Paste-or-upload BibTeX/RIS import — the concrete thing behind
 * VaultSetupScreen's still-honest "Zotero, Mendeley, EndNote and BibTeX
 * import" note. RIS is what Zotero, Mendeley, and EndNote all export;
 * BibTeX covers the rest. Both are parsed by src/citation_compliance,
 * unchanged — this component is the preview-then-confirm UI around it.
 *
 * Parsing shows a preview before anything is saved (UX5: state what is
 * about to happen) rather than importing on paste — a wrong file pasted by
 * mistake should be obvious before it becomes dozens of vault items.
 */
export default function VaultImport({
  userId,
  onImported,
}: {
  userId: string;
  onImported: (items: VaultItem[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setOpen(false);
    setText("");
    setPreview(null);
    setError(null);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ""));
      setPreview(null);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleConfirm() {
    if (!preview || preview.items.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await addVaultItems(userId, preview.items);
      onImported(saved);
      reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-[color:var(--accent)] transition-colors duration-[var(--motion-fast)] hover:text-[color:var(--accent-hover)] cursor-pointer"
      >
        Import references
      </button>
    );
  }

  return (
    <div className="mb-5 flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-4">
      <div>
        <p className="text-sm font-medium text-[color:var(--text-primary)]">Import references</p>
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">
          Paste a BibTeX or RIS export, or upload the file — RIS is what Zotero, Mendeley, and EndNote produce.
        </p>
      </div>

      <input
        type="file"
        accept=".bib,.ris,.txt"
        onChange={handleFile}
        aria-label="Upload a BibTeX or RIS file"
        className="text-sm text-[color:var(--text-secondary)]"
      />

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
        rows={6}
        placeholder="Paste exported BibTeX or RIS text here"
        aria-label="Reference export text"
        className="w-full resize-y px-3 py-2 font-mono text-xs"
      />

      {error && (
        <p role="alert" className="text-sm text-[color:var(--state-danger)]">
          {error}
        </p>
      )}

      {!preview ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPreview(parseReferences(text))}
            disabled={!text.trim()}
            className="rounded-[var(--radius-md)] border border-[color:var(--border-control)] px-3.5 py-2 text-sm text-[color:var(--text-primary)] transition-colors duration-[var(--motion-fast)] hover:border-[color:var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
          >
            Preview import
          </button>
          <button
            type="button"
            onClick={reset}
            className="text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          {preview.warnings.length > 0 && (
            <ul className="flex flex-col gap-1">
              {preview.warnings.map((w, i) => (
                <li key={i} className="text-xs text-[color:var(--state-warning)]">
                  {w}
                </li>
              ))}
            </ul>
          )}

          {preview.items.length === 0 ? (
            <p className="text-sm text-[color:var(--text-muted)]">Nothing to import.</p>
          ) : (
            <>
              <p className="text-sm text-[color:var(--text-secondary)]">
                {preview.items.length} {preview.items.length === 1 ? "reference" : "references"} found:
              </p>
              <ul aria-label="References to import" className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {preview.items.map((item, i) => (
                  <li key={i} className="text-xs text-[color:var(--text-secondary)]">
                    {item.title}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="flex items-center gap-3">
            {preview.items.length > 0 && (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={busy}
                className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
              >
                {busy ? "Adding…" : `Add ${preview.items.length} to Vault`}
              </button>
            )}
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
            >
              {preview.items.length === 0 ? "Try again" : "Edit"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
