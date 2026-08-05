import { useState } from "react";
import { addVaultItem, type VaultItem } from "../../services/vaultContents";

/**
 * Uploading a document, or looking up a source by DOI — the two Vault
 * import paths the legacy client had (KnowledgeVaultWizard.tsx, via
 * /api/parse-file and /api/lookup-doi) that Desk's Vault didn't, despite
 * both server endpoints already existing, working, and being unused from
 * here. Kept as a peer to VaultImport.tsx's BibTeX/RIS import rather than
 * merged into it: that one previews many references at once from a single
 * paste; this previews exactly one item at a time, since a file or a DOI
 * lookup only ever produces one thing to add.
 *
 * Neither endpoint requires auth (server.ts mounts them outside
 * requireAuth) — they do no persistence of their own, matching the legacy
 * client's use of the same routes.
 */

type Mode = "file" | "doi";

interface PreviewItem {
  title: string;
  content: string;
  citation?: string;
}

/** Matches knowledgeVaultService.ts's uploadAndProcessFile exactly — the encoding already proven to work against /api/parse-file. */
async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ""));
}

export default function VaultDocumentImport({
  userId,
  onImported,
}: {
  userId: string;
  onImported: (item: VaultItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("file");
  const [doi, setDoi] = useState("");
  const [preview, setPreview] = useState<PreviewItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setOpen(false);
    setMode("file");
    setDoi("");
    setPreview(null);
    setError(null);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setPreview(null);
    setError(null);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fileContent = await fileToBase64(file);
      const res = await fetch("/api/parse-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileType: file.type, fileContent }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not read that file.");
      setPreview({ title: file.name, content: body.text || "" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLookupDoi(e: React.FormEvent) {
    e.preventDefault();
    if (!doi.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lookup-doi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doi: doi.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not look up that DOI.");
      setPreview({ title: body.metadata?.title || doi.trim(), content: body.text || "", citation: body.metadata?.bibtex });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await addVaultItem(userId, preview);
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
        Upload a document or look up a DOI
      </button>
    );
  }

  return (
    <div className="mb-5 flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-4">
      <div className="flex gap-1 border-b border-[color:var(--border-subtle)] pb-2">
        <button
          type="button"
          onClick={() => switchMode("file")}
          aria-current={mode === "file"}
          className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-sm ${mode === "file" ? "bg-[color:var(--accent-subtle)] text-[color:var(--accent)]" : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"} cursor-pointer`}
        >
          Upload a file
        </button>
        <button
          type="button"
          onClick={() => switchMode("doi")}
          aria-current={mode === "doi"}
          className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-sm ${mode === "doi" ? "bg-[color:var(--accent-subtle)] text-[color:var(--accent)]" : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"} cursor-pointer`}
        >
          Look up a DOI
        </button>
      </div>

      {!preview ? (
        mode === "file" ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-[color:var(--text-muted)]">
              PDF, Word, text, Markdown, spreadsheets, images, or audio — read on the server and never sent anywhere
              beyond what it takes to extract the text.
            </p>
            <input
              type="file"
              onChange={handleFile}
              disabled={busy}
              aria-label="Upload a document"
              className="text-sm text-[color:var(--text-secondary)]"
            />
            {busy && <p className="text-xs text-[color:var(--text-muted)]">Reading the file…</p>}
          </div>
        ) : (
          <form onSubmit={handleLookupDoi} className="flex items-center gap-2">
            <input
              type="text"
              value={doi}
              onChange={(e) => setDoi(e.target.value)}
              placeholder="10.1234/example or https://doi.org/10.1234/example"
              aria-label="DOI"
              className="flex-1 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !doi.trim()}
              className="shrink-0 rounded-[var(--radius-md)] border border-[color:var(--border-control)] px-3.5 py-2 text-sm text-[color:var(--text-primary)] transition-colors duration-[var(--motion-fast)] hover:border-[color:var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
            >
              {busy ? "Looking up…" : "Look up"}
            </button>
          </form>
        )
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-[color:var(--text-primary)]">{preview.title}</p>
          <p className="max-h-24 overflow-y-auto whitespace-pre-wrap text-xs text-[color:var(--text-secondary)]">
            {preview.content.length > 400 ? `${preview.content.slice(0, 400)}…` : preview.content || "(No text could be extracted.)"}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
            >
              {busy ? "Saving…" : "Add to Vault"}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-[color:var(--state-danger)]">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={reset}
        className="self-start text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
      >
        Cancel
      </button>
    </div>
  );
}
