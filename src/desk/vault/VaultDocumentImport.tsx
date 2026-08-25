import { useState, useEffect } from "react";
import { addVaultItem, type VaultItem, type VaultSourceType, type CitationStatus } from "../../services/vaultContents";
import {
  getConnectedCloudDrives,
  fetchDriveFiles,
  initiateGoogleDriveAuth,
  initiateOneDriveAuth,
  uploadFileToCloudDrive,
  disconnectCloudDrive,
  type CloudDriveAccount,
  type DriveFileItem,
} from "../../services/vault/cloudDriveService";
import type { CanonicalReference } from "../../citation_compliance/model/reference";

type Mode = "file" | "cloud_drive" | "doi" | "web";

interface PreviewItem {
  title: string;
  content: string;
  citation?: string;
  citationStatus?: CitationStatus;
  canonicalReference?: CanonicalReference;
  sourceType: VaultSourceType;
  filename?: string;
  mimeType?: string;
  externalReference?: string;
  authors?: string[];
  year?: string;
  journal?: string;
  metadata?: Record<string, any>;
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
  const [url, setUrl] = useState("");
  const [doi, setDoi] = useState("");
  const [preview, setPreview] = useState<PreviewItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Cloud Drive state
  const [cloudDrives, setCloudDrives] = useState<CloudDriveAccount[]>([]);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [selectedDrive, setSelectedDrive] = useState<"google_drive" | "onedrive">("google_drive");

  useEffect(() => {
    if (open && mode === "cloud_drive") {
      loadCloudDrives();
    }
  }, [open, mode, selectedDrive]);

  async function loadCloudDrives() {
    try {
      const drives = await getConnectedCloudDrives(userId);
      setCloudDrives(drives);
      const files = await fetchDriveFiles(selectedDrive);
      setDriveFiles(files);
    } catch {}
  }

  function reset() {
    setOpen(false);
    setMode("file");
    setUrl("");
    setDoi("");
    setPreview(null);
    setError(null);
    setProgressMsg("");
  }

  function switchMode(next: Mode) {
    setMode(next);
    setPreview(null);
    setError(null);
    setProgressMsg("");
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    setProgressMsg(`Uploading and parsing ${file.name}…`);

    try {
      const isText = file.name.endsWith(".txt") || file.name.endsWith(".md");
      if (isText) {
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target?.result as string);
          reader.onerror = () => reject(new Error("Failed to read text file"));
          reader.readAsText(file);
        });

        setPreview({
          title: file.name,
          content: text || "",
          sourceType: "file",
          filename: file.name,
        });
        return;
      }

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/vault/parse-file", {
        method: "POST",
        body: formData,
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to parse document");

      setPreview({
        title: body.title || file.name,
        content: body.text || "",
        sourceType: "file",
        filename: file.name,
        mimeType: file.type || body.mimeType,
        authors: body.authors || [],
        year: body.year,
        journal: body.journal,
        metadata: body.metadata,
        canonicalReference: body.canonicalReference,
        citation: body.citation,
        citationStatus: body.citation || body.canonicalReference ? "confirmed" : "missing",
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("Failed to parse URL") || msg.includes("Failed to fetch") || msg.includes("fetch")) {
        setError("Only .txt and .md files are supported for direct browser parsing without server.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
      setProgressMsg("");
    }
  }

  async function handleDriveFileSelect(file: DriveFileItem) {
    setBusy(true);
    setError(null);
    setProgressMsg(`Importing ${file.name} from ${selectedDrive === "google_drive" ? "Google Drive" : "OneDrive"}…`);

    try {
      setPreview({
        title: file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
        content: `Synced from ${selectedDrive === "google_drive" ? "Google Drive" : "OneDrive"}: ${file.name}\n\nThis academic resource is synchronized to your Universal Vault for cross-device analysis and citation generation.`,
        sourceType: selectedDrive === "google_drive" ? "drive_google" : "drive_onedrive",
        filename: file.name,
        mimeType: file.mimeType,
        externalReference: `drive://${selectedDrive}/${file.id}`,
        year: "2025",
        citationStatus: "needs_user_review",
        metadata: { driveId: file.id, driveProvider: selectedDrive, size: file.size },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgressMsg("");
    }
  }

  async function handleLookupDoi(e: React.FormEvent) {
    e.preventDefault();
    if (!doi.trim()) return;
    setBusy(true);
    setError(null);
    setProgressMsg("Fetching DOI metadata from CrossRef…");
    try {
      const res = await fetch("/api/lookup-doi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doi: doi.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not look up that DOI.");
      setPreview({
        title: body.metadata?.title || body.title || doi.trim(),
        content: body.text || body.content || "",
        citation: body.metadata?.bibtex || body.citation,
        citationStatus: "confirmed",
        canonicalReference: body.canonicalReference,
        sourceType: "reference",
        externalReference: body.metadata?.doiOrUrl || body.externalReference || doi.trim(),
        authors: body.authors,
        year: body.year,
        journal: body.journal,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgressMsg("");
    }
  }

  async function handleParseUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    setProgressMsg("Scraping web page and extracting content…");
    try {
      const res = await fetch("/api/vault/parse-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not parse that URL.");
      setPreview({
        title: body.title,
        content: body.content || "",
        citation: body.citation,
        citationStatus: "confirmed",
        canonicalReference: body.canonicalReference,
        sourceType: "web",
        externalReference: url.trim(),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgressMsg("");
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    setProgressMsg("Encrypting and indexing to Universal Vault…");
    try {
      const payload: any = {
        title: preview.title,
        content: preview.content,
      };
      if (preview.citation) payload.citation = preview.citation;
      if (preview.canonicalReference) payload.canonicalReference = preview.canonicalReference;
      if (preview.sourceType && preview.sourceType !== "file" && preview.sourceType !== "reference") {
        payload.sourceType = preview.sourceType;
      }
      if (preview.filename && preview.filename !== preview.title) {
        payload.filename = preview.filename;
      }
      if (preview.mimeType) payload.mimeType = preview.mimeType;
      if (preview.authors && preview.authors.length > 0) payload.authors = preview.authors;
      if (preview.year) payload.year = preview.year;
      if (preview.journal) payload.journal = preview.journal;
      if (preview.metadata && Object.keys(preview.metadata).length > 0) payload.metadata = preview.metadata;

      const saved = await addVaultItem(userId, payload);
      onImported(saved);
      reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgressMsg("");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Upload a document or look up a DOI"
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[color:var(--accent-border)] bg-[color:var(--accent-subtle)] px-3.5 py-1.5 text-xs font-semibold text-[color:var(--accent)] hover:bg-[color:var(--accent-hover)] hover:text-[color:var(--text-inverse)] transition-all cursor-pointer shadow-sm"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span>Upload a document or look up a DOI</span>
      </button>
    );
  }

  return (
    <div className="mb-6 flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-3">
        <h3 className="text-sm font-bold text-[color:var(--text-primary)]">
          Universal Knowledge Ingestion
        </h3>
        <button
          type="button"
          onClick={reset}
          className="text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] cursor-pointer"
        >
          ✕ Close
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 bg-[color:var(--surface-inset)] p-1 rounded-[var(--radius-md)]">
        <button
          type="button"
          onClick={() => switchMode("file")}
          aria-label="Upload a file"
          className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-all ${mode === "file" ? "bg-[color:var(--surface-raised)] text-[color:var(--accent)] shadow-xs" : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"} cursor-pointer`}
        >
          Upload a file
        </button>

        <button
          type="button"
          onClick={() => switchMode("cloud_drive")}
          className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-all ${mode === "cloud_drive" ? "bg-[color:var(--surface-raised)] text-[color:var(--accent)] shadow-xs" : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"} cursor-pointer`}
        >
          ☁️ Google Drive & OneDrive
        </button>

        <button
          type="button"
          onClick={() => switchMode("doi")}
          aria-label="Look up a DOI"
          className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-all ${mode === "doi" ? "bg-[color:var(--surface-raised)] text-[color:var(--accent)] shadow-xs" : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"} cursor-pointer`}
        >
          Look up a DOI
        </button>

        <button
          type="button"
          onClick={() => switchMode("web")}
          className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-all ${mode === "web" ? "bg-[color:var(--surface-raised)] text-[color:var(--accent)] shadow-xs" : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"} cursor-pointer`}
        >
          🌐 Web Link / Article
        </button>
      </div>

      {!preview ? (
        mode === "file" ? (
          <div className="flex flex-col gap-3 p-4 border border-dashed border-[color:var(--border-default)] rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)]">
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <svg className="w-10 h-10 text-[color:var(--accent)] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm font-semibold text-[color:var(--text-primary)]">Upload research documents</p>
              <p className="text-xs text-[color:var(--text-muted)] mt-1">
                Supports PDF, Word (.docx), Excel (.xlsx), CSV, Markdown (.md), and Text (.txt) up to 30MB
              </p>
              <label className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-colors cursor-pointer shadow-xs">
                <span>Select Document</span>
                <input
                  type="file"
                  onChange={handleFile}
                  disabled={busy}
                  aria-label="Upload a document"
                  accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.md,.txt"
                  className="hidden"
                />
              </label>
            </div>
          </div>
        ) : mode === "cloud_drive" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-[color:var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedDrive("google_drive")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 ${selectedDrive === "google_drive" ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)] text-[color:var(--accent)]" : "border-[color:var(--border-default)] text-[color:var(--text-secondary)]"} cursor-pointer`}
                >
                  <span>📁</span>
                  <span>Google Drive (Gmail)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDrive("onedrive")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 ${selectedDrive === "onedrive" ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)] text-[color:var(--accent)]" : "border-[color:var(--border-default)] text-[color:var(--text-secondary)]"} cursor-pointer`}
                >
                  <span>☁️</span>
                  <span>Microsoft OneDrive (Outlook)</span>
                </button>
              </div>

              {cloudDrives.some((d) => d.provider === selectedDrive) && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 text-[color:var(--state-success)] font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    {cloudDrives.find((d) => d.provider === selectedDrive)?.accountEmail}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await disconnectCloudDrive(userId, selectedDrive);
                      loadCloudDrives();
                    }}
                    className="text-[11px] text-[color:var(--state-danger)] hover:underline cursor-pointer ml-1"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>

            {!cloudDrives.some((d) => d.provider === selectedDrive) ? (
              <div className="flex flex-col items-center justify-center p-6 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] text-center">
                <div className="w-12 h-12 rounded-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] flex items-center justify-center text-2xl mb-3 shadow-xs">
                  {selectedDrive === "google_drive" ? "📁" : "☁️"}
                </div>
                <h4 className="text-sm font-bold text-[color:var(--text-primary)]">
                  Connect {selectedDrive === "google_drive" ? "Google Drive (Gmail)" : "Microsoft OneDrive (Outlook)"}
                </h4>
                <p className="text-xs text-[color:var(--text-secondary)] max-w-sm mt-1.5 leading-relaxed">
                  Authenticate your {selectedDrive === "google_drive" ? "Google / Gmail" : "Microsoft / Outlook 365"} account to upload and sync PDF papers, Word documents, and datasets directly across all your devices.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    setBusy(true);
                    setProgressMsg(`Authenticating with ${selectedDrive === "google_drive" ? "Google Drive (Gmail)" : "Microsoft OneDrive (Outlook)"}…`);
                    try {
                      if (selectedDrive === "google_drive") {
                        await initiateGoogleDriveAuth(userId);
                      } else {
                        await initiateOneDriveAuth(userId);
                      }
                      await loadCloudDrives();
                    } finally {
                      setBusy(false);
                      setProgressMsg("");
                    }
                  }}
                  disabled={busy}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-xs"
                >
                  <span>🔐</span>
                  <span>Authenticate & Connect {selectedDrive === "google_drive" ? "Google Drive" : "Microsoft OneDrive"}</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Upload directly to Drive */}
                <div className="flex items-center justify-between p-3.5 rounded-[var(--radius-lg)] border border-dashed border-[color:var(--accent-border)] bg-[color:var(--accent-subtle)]">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">⬆️</span>
                    <div>
                      <h4 className="text-xs font-bold text-[color:var(--accent)]">
                        Upload to {selectedDrive === "google_drive" ? "Google Drive" : "OneDrive"}
                      </h4>
                      <p className="text-[11px] text-[color:var(--text-secondary)]">
                        Upload PDF, Word (.docx), Excel (.xlsx), or CSV files directly to your cloud drive.
                      </p>
                    </div>
                  </div>
                  <label className="shrink-0 px-3 py-1.5 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-colors cursor-pointer shadow-xs">
                    <span>Upload to Drive</span>
                    <input
                      type="file"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        setBusy(true);
                        setError(null);
                        setProgressMsg(`Uploading ${file.name} to ${selectedDrive === "google_drive" ? "Google Drive" : "OneDrive"}…`);
                        try {
                          const uploaded = await uploadFileToCloudDrive(userId, selectedDrive, file);
                          await loadCloudDrives();
                          await handleDriveFileSelect(uploaded);
                        } catch (err: any) {
                          setError(err.message || "Failed to upload to drive");
                        } finally {
                          setBusy(false);
                          setProgressMsg("");
                        }
                      }}
                      disabled={busy}
                      accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.md,.txt"
                      className="hidden"
                    />
                  </label>
                </div>

                <div>
                  <p className="text-xs font-semibold text-[color:var(--text-secondary)] mb-2">
                    Files in your {selectedDrive === "google_drive" ? "Google Drive" : "OneDrive"}:
                  </p>
                  <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                    {driveFiles.map((file) => (
                      <div
                        key={file.id}
                        onClick={() => handleDriveFileSelect(file)}
                        className="flex items-center justify-between p-2.5 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] hover:border-[color:var(--accent)] hover:bg-[color:var(--surface-hover)] transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <span className="text-base">
                            {file.name.endsWith(".pdf") ? "📕" : file.name.endsWith(".xlsx") ? "📊" : file.name.endsWith(".docx") ? "📘" : "📄"}
                          </span>
                          <div className="truncate">
                            <p className="text-xs font-medium text-[color:var(--text-primary)] truncate group-hover:text-[color:var(--accent)]">
                              {file.name}
                            </p>
                            <p className="text-[10px] text-[color:var(--text-muted)]">
                              {file.size ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "Cloud Drive File"}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 px-2.5 py-1 text-xs font-semibold text-[color:var(--accent)] group-hover:underline"
                        >
                          Import to Vault →
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : mode === "doi" ? (
          <form onSubmit={handleLookupDoi} className="flex flex-col gap-2">
            <label className="text-xs font-medium text-[color:var(--text-primary)]">
              Digital Object Identifier (DOI)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={doi}
                onChange={(e) => setDoi(e.target.value)}
                placeholder="10.1038/nature12373 or https://doi.org/10.1145/3313831.3376727"
                aria-label="DOI"
                className="flex-1 px-3 py-2 text-sm border border-[color:var(--border-default)] rounded-[var(--radius-md)] bg-[color:var(--surface-input)] text-[color:var(--text-primary)]"
              />
              <button
                type="submit"
                disabled={busy || !doi.trim()}
                aria-label="Look up"
                className="px-4 py-2 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] disabled:opacity-50 cursor-pointer"
              >
                {busy ? "Looking up…" : "Look up"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleParseUrl} className="flex flex-col gap-2">
            <label className="text-xs font-medium text-[color:var(--text-primary)]">
              Article or Resource Web URL
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://arxiv.org/abs/2303.08774 or https://news.mit.edu/..."
                className="flex-1 px-3 py-2 text-sm border border-[color:var(--border-default)] rounded-[var(--radius-md)] bg-[color:var(--surface-input)] text-[color:var(--text-primary)]"
              />
              <button
                type="submit"
                disabled={busy || !url.trim()}
                className="px-4 py-2 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] disabled:opacity-50 cursor-pointer"
              >
                {busy ? "Scraping…" : "Ingest Web"}
              </button>
            </div>
          </form>
        )
      ) : (
        <div className="flex flex-col gap-3 bg-[color:var(--surface-inset)] p-4 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--accent)]">
                Parsed Ingestion Preview
              </span>
              <h4 className="text-sm font-bold text-[color:var(--text-primary)] mt-0.5">
                {preview.title}
              </h4>
            </div>
            {preview.citation && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold shrink-0">
                ✓ Citation Ready
              </span>
            )}
          </div>

          <p className="max-h-28 overflow-y-auto whitespace-pre-wrap text-xs text-[color:var(--text-secondary)] bg-[color:var(--surface-raised)] p-2.5 rounded border border-[color:var(--border-subtle)]">
            {preview.content.length > 500 ? `${preview.content.slice(0, 500)}…` : preview.content}
          </p>

          {preview.citation && (
            <div className="text-[11px] text-[color:var(--text-muted)] italic">
              <strong>Citation:</strong> {preview.citation}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2 text-xs font-bold text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] disabled:opacity-50 cursor-pointer"
            >
              {busy ? "Saving…" : "Add to Vault"}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {progressMsg && (
        <p className="text-xs text-[color:var(--accent)] animate-pulse flex items-center gap-1.5">
          <span>⏳</span> {progressMsg}
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-[color:var(--state-danger)] bg-[color:var(--state-danger-subtle)] p-2.5 rounded-[var(--radius-sm)] border border-[color:var(--accent-border)]">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={reset}
        className="self-start text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
      >
        Cancel
      </button>
    </div>
  );
}
