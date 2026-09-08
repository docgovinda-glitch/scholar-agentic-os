/**
 * Add Source Modal — Simple 3-step source intake flow for Source Library.
 *
 * STEP 1: Select source location (Google Drive, OneDrive, URL, DOI, or BibTeX/RIS).
 * STEP 2: Review detected metadata, check duplicates, assign project & writing notes.
 * STEP 3: Source saved confirmation with APA 7 citation, [Copy Citation], and [Open Source].
 *
 * User source files stay in Google Drive / OneDrive — zero server-side file copies.
 */

import { useState, useId } from "react";
import type { VaultItem } from "../../services/vaultContents";
import type { CloudStorageProvider, Source, SourceType } from "../../services/vault/sourceTypes";
import { sourceToVaultItemPayload } from "../../services/vault/sourceTypes";
import { addVaultItem } from "../../services/vaultContents";
import {
  checkForDuplicates,
  type DuplicateCheckResult,
} from "../../services/vault/duplicateDetection";
import {
  resolveDoiMetadata,
  resolveUrlMetadata,
  generateAPA7Citation,
} from "../../services/vault/metadataService";
import {
  getConnectedCloudDrives,
  initiateGoogleDriveAuth,
  initiateOneDriveAuth,
  type CloudDriveAccount,
} from "../../services/vault/cloudDriveService";

export interface AddSourceModalProps {
  userId: string;
  existingItems: VaultItem[];
  existingProjects: string[];
  onClose: () => void;
  onSourceSaved: (savedItem: VaultItem) => void;
}

type Step = 1 | 2 | 3;
type IntakeMode = "google_drive" | "onedrive" | "url" | "doi" | "bibtex";

export default function AddSourceModal({
  userId,
  existingItems,
  existingProjects,
  onClose,
  onSourceSaved,
}: AddSourceModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [mode, setMode] = useState<IntakeMode>("doi");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 inputs
  const [doiInput, setDoiInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [bibtexInput, setBibtexInput] = useState("");
  const [cloudFileName, setCloudFileName] = useState("");
  const [cloudFileLink, setCloudFileLink] = useState("");
  const [cloudFileId, setCloudFileId] = useState("");

  // Step 2 metadata
  const [title, setTitle] = useState("");
  const [authorsText, setAuthorsText] = useState("");
  const [year, setYear] = useState("");
  const [journal, setJournal] = useState("");
  const [publisher, setPublisher] = useState("");
  const [doi, setDoi] = useState("");
  const [webUrl, setWebUrl] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("paper");
  const [selectedProject, setSelectedProject] = useState(existingProjects[0] || "Thesis");
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [whySaved, setWhySaved] = useState("");
  const [keyQuote, setKeyQuote] = useState("");
  const [page, setPage] = useState("");
  const [cloudReference, setCloudReference] = useState<{
    provider: CloudStorageProvider;
    fileId: string;
    fileName: string;
    webUrl?: string;
  } | undefined>(undefined);

  // Duplicate warning
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateCheckResult | null>(null);
  const [bypassDuplicate, setBypassDuplicate] = useState(false);

  // Step 3 saved result
  const [savedSource, setSavedSource] = useState<Source | null>(null);
  const [copiedCitation, setCopiedCitation] = useState(false);

  // Cloud auth prompt state
  const [connectingDrive, setConnectingDrive] = useState<CloudStorageProvider | null>(null);
  const [cloudDrives, setCloudDrives] = useState<CloudDriveAccount[]>([]);

  async function handleSelectGoogleDrive() {
    setMode("google_drive");
    setError(null);
    try {
      const drives = await getConnectedCloudDrives(userId);
      setCloudDrives(drives);
      const isConnected = drives.some((d) => d.provider === "google_drive");
      if (!isConnected) {
        setConnectingDrive("google_drive");
      }
    } catch {}
  }

  async function handleSelectOneDrive() {
    setMode("onedrive");
    setError(null);
    try {
      const drives = await getConnectedCloudDrives(userId);
      setCloudDrives(drives);
      const isConnected = drives.some((d) => d.provider === "onedrive");
      if (!isConnected) {
        setConnectingDrive("onedrive");
      }
    } catch {}
  }

  async function handleConnectCloud(provider: CloudStorageProvider) {
    setBusy(true);
    setError(null);
    try {
      if (provider === "google_drive") {
        await initiateGoogleDriveAuth(userId);
      } else {
        await initiateOneDriveAuth(userId);
      }
      const updated = await getConnectedCloudDrives(userId);
      setCloudDrives(updated);
      setConnectingDrive(null);
    } catch (err: any) {
      setError(err.message || "Cloud connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleProceedFromStep1() {
    setError(null);
    setBusy(true);

    try {
      if (mode === "doi") {
        if (!doiInput.trim()) {
          setError("Please enter a DOI (e.g. 10.1038/nature12373)");
          setBusy(false);
          return;
        }
        const resolved = await resolveDoiMetadata(doiInput.trim());
        setTitle(resolved.metadata.title);
        setAuthorsText(resolved.metadata.authors.join(", "));
        setYear(resolved.metadata.year || "");
        setJournal(resolved.metadata.journal || "");
        setDoi(resolved.metadata.doi || doiInput.trim());
        setWebUrl(resolved.metadata.url || `https://doi.org/${resolved.metadata.doi || doiInput.trim()}`);
        setSourceType("paper");
        setCloudReference(undefined);

        // Check duplicates
        const dup = checkForDuplicates(
          {
            doi: resolved.metadata.doi || doiInput.trim(),
            title: resolved.metadata.title,
            authors: resolved.metadata.authors,
            year: resolved.metadata.year,
          },
          existingItems
        );
        if (dup.isDuplicate) setDuplicateWarning(dup);
        setStep(2);
      } else if (mode === "url") {
        if (!urlInput.trim()) {
          setError("Please enter a valid website URL");
          setBusy(false);
          return;
        }
        const resolved = await resolveUrlMetadata(urlInput.trim());
        setTitle(resolved.metadata.title);
        setAuthorsText(resolved.metadata.authors.join(", "));
        setPublisher(resolved.metadata.publisher || "");
        setWebUrl(resolved.metadata.url || urlInput.trim());
        setSourceType("website");
        setCloudReference(undefined);

        const dup = checkForDuplicates({ title: resolved.metadata.title }, existingItems);
        if (dup.isDuplicate) setDuplicateWarning(dup);
        setStep(2);
      } else if (mode === "google_drive" || mode === "onedrive") {
        const provider: CloudStorageProvider = mode;
        const fileName = cloudFileName.trim() || "Research Document.pdf";
        const cleanTitle = fileName.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");

        setTitle(cleanTitle);
        setAuthorsText("");
        setYear(new Date().getFullYear().toString());
        setSourceType("paper");
        setCloudReference({
          provider,
          fileId: cloudFileId.trim() || `cloud_${Date.now()}`,
          fileName,
          webUrl: cloudFileLink.trim() || (provider === "google_drive" ? "https://drive.google.com" : "https://onedrive.live.com"),
        });

        const dup = checkForDuplicates({ title: cleanTitle }, existingItems);
        if (dup.isDuplicate) setDuplicateWarning(dup);
        setStep(2);
      } else if (mode === "bibtex") {
        if (!bibtexInput.trim()) {
          setError("Please paste a BibTeX or RIS reference string");
          setBusy(false);
          return;
        }
        // Extract basic fields via regex heuristics
        const titleMatch = bibtexInput.match(/title\s*=\s*[\{"]([^"\}]+)[\}"]/i);
        const authorMatch = bibtexInput.match(/author\s*=\s*[\{"]([^"\}]+)[\}"]/i);
        const yearMatch = bibtexInput.match(/year\s*=\s*[\{"]?(\d{4})[\}"]?/i);
        const journalMatch = bibtexInput.match(/(?:journal|booktitle|publisher)\s*=\s*[\{"]([^"\}]+)[\}"]/i);
        const doiMatch = bibtexInput.match(/doi\s*=\s*[\{"]([^"\}]+)[\}"]/i);

        const parsedTitle = titleMatch?.[1]?.trim() || "Imported Reference";
        const parsedAuthors = authorMatch?.[1]?.trim() || "";
        const parsedYear = yearMatch?.[1] || "";
        const parsedJournal = journalMatch?.[1]?.trim() || "";
        const parsedDoi = doiMatch?.[1]?.trim() || "";

        setTitle(parsedTitle);
        setAuthorsText(parsedAuthors);
        setYear(parsedYear);
        setJournal(parsedJournal);
        setDoi(parsedDoi);
        setSourceType("paper");
        setCloudReference(undefined);

        const dup = checkForDuplicates({ title: parsedTitle, doi: parsedDoi }, existingItems);
        if (dup.isDuplicate) setDuplicateWarning(dup);
        setStep(2);
      }
    } catch (err: any) {
      setError(err.message || "Could not retrieve source metadata.");
    } finally {
      setBusy(false);
    }
  }

  function handleAddTag() {
    const trimmed = tagInput.trim().replace(/^#/, "");
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  }

  function handleRemoveTag(tagToRemove: string) {
    setTags(tags.filter((t) => t !== tagToRemove));
  }

  async function handleSaveSource() {
    if (!title.trim()) {
      setError("Source title is required");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const authors = authorsText
        .split(/[,;&]|\band\b/i)
        .map((a) => a.trim())
        .filter(Boolean);

      const finalProject = isCreatingProject && newProjectName.trim()
        ? newProjectName.trim()
        : selectedProject || "General";

      const citation = generateAPA7Citation({
        authors,
        year: year.trim() || undefined,
        title: title.trim(),
        journal: journal.trim() || undefined,
        publisher: publisher.trim() || undefined,
        doi: doi.trim() || undefined,
        url: webUrl.trim() || cloudReference?.webUrl || undefined,
      });

      const sourcePayload = sourceToVaultItemPayload({
        metadata: {
          title: title.trim(),
          authors,
          year: year.trim() || undefined,
          journal: journal.trim() || undefined,
          publisher: publisher.trim() || undefined,
          doi: doi.trim() || undefined,
          url: webUrl.trim() || cloudReference?.webUrl || undefined,
          type: sourceType,
        },
        cloudReference,
        projects: [finalProject],
        tags,
        notes: {
          whySaved: whySaved.trim() || undefined,
          keyQuote: keyQuote.trim() || undefined,
          page: page.trim() || undefined,
        },
        citation,
        citationStatus: "confirmed",
        integrityStatus: "clean",
      });

      const saved = await addVaultItem(userId, sourcePayload);

      setSavedSource({
        id: saved.id,
        metadata: {
          title: title.trim(),
          authors,
          year: year.trim() || undefined,
          journal: journal.trim() || undefined,
          publisher: publisher.trim() || undefined,
          doi: doi.trim() || undefined,
          url: webUrl.trim() || cloudReference?.webUrl || undefined,
          type: sourceType,
        },
        cloudReference,
        projects: [finalProject],
        tags,
        notes: {
          whySaved: whySaved.trim() || undefined,
          keyQuote: keyQuote.trim() || undefined,
          page: page.trim() || undefined,
        },
        citation,
        citationStatus: "confirmed",
        integrityStatus: "clean",
        createdAt: saved.createdAt,
      });

      onSourceSaved(saved);
      setStep(3);
    } catch (err: any) {
      setError(err.message || "Failed to save source.");
    } finally {
      setBusy(false);
    }
  }

  function handleResetForAnother() {
    setStep(1);
    setMode("doi");
    setDoiInput("");
    setUrlInput("");
    setBibtexInput("");
    setCloudFileName("");
    setCloudFileLink("");
    setTitle("");
    setAuthorsText("");
    setYear("");
    setJournal("");
    setPublisher("");
    setDoi("");
    setWebUrl("");
    setTags([]);
    setWhySaved("");
    setKeyQuote("");
    setPage("");
    setDuplicateWarning(null);
    setBypassDuplicate(false);
    setSavedSource(null);
    setCopiedCitation(false);
  }

  function handleCopyCitation() {
    if (!savedSource?.citation) return;
    navigator.clipboard.writeText(savedSource.citation);
    setCopiedCitation(true);
    setTimeout(() => setCopiedCitation(false), 2500);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-source-title"
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
    >
      <div className="w-full max-w-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-xl)] shadow-2xl flex flex-col overflow-hidden my-6">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]">
          <div className="flex items-center gap-2">
            <h3 id="add-source-title" className="text-base font-bold text-[color:var(--text-primary)]">
              {step === 1 && "Add Source"}
              {step === 2 && "Review Source Details"}
              {step === 3 && "Source Saved"}
            </h3>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] text-[color:var(--text-muted)]">
              Step {step} of 3
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-sm text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] p-1 rounded-md hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Reassurance storage notice */}
        <div className="bg-[color:var(--accent-subtle)]/40 border-b border-[color:var(--border-subtle)] px-6 py-2.5 flex items-center gap-2 text-xs text-[color:var(--text-secondary)]">
          <span className="text-sm">🛡️</span>
          <span>
            <strong>Zero document storage:</strong> Your original files remain in your Google Drive, OneDrive, or web link. We store only citation metadata.
          </span>
        </div>

        {/* Body Content */}
        <div className="p-6 flex flex-col gap-5 max-h-[75vh] overflow-y-auto">
          {error && (
            <div
              role="alert"
              className="p-3.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-[var(--radius-md)] text-xs leading-relaxed flex items-start gap-2"
            >
              <span className="text-sm">⚠️</span>
              <div className="flex-1">{error}</div>
            </div>
          )}

          {/* STEP 1: SELECT SOURCE */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <p className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
                Where is your source?
              </p>

              {/* Source Type Selection Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={handleSelectGoogleDrive}
                  className={`p-3 rounded-[var(--radius-lg)] border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
                    mode === "google_drive"
                      ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)]/30 ring-1 ring-[color:var(--accent)]"
                      : "border-[color:var(--border-default)] hover:border-[color:var(--border-hover)] bg-[color:var(--surface-inset)]"
                  }`}
                >
                  <span className="text-xl">📁</span>
                  <div>
                    <div className="text-xs font-bold text-[color:var(--text-primary)]">Google Drive</div>
                    <div className="text-[11px] text-[color:var(--text-muted)]">Select from cloud</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleSelectOneDrive}
                  className={`p-3 rounded-[var(--radius-lg)] border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
                    mode === "onedrive"
                      ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)]/30 ring-1 ring-[color:var(--accent)]"
                      : "border-[color:var(--border-default)] hover:border-[color:var(--border-hover)] bg-[color:var(--surface-inset)]"
                  }`}
                >
                  <span className="text-xl">☁️</span>
                  <div>
                    <div className="text-xs font-bold text-[color:var(--text-primary)]">OneDrive</div>
                    <div className="text-[11px] text-[color:var(--text-muted)]">Select from 365</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode("doi");
                    setError(null);
                  }}
                  className={`p-3 rounded-[var(--radius-lg)] border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
                    mode === "doi"
                      ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)]/30 ring-1 ring-[color:var(--accent)]"
                      : "border-[color:var(--border-default)] hover:border-[color:var(--border-hover)] bg-[color:var(--surface-inset)]"
                  }`}
                >
                  <span className="text-xl">🏷️</span>
                  <div>
                    <div className="text-xs font-bold text-[color:var(--text-primary)]">DOI Lookup</div>
                    <div className="text-[11px] text-[color:var(--text-muted)]">Scholarly paper</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode("url");
                    setError(null);
                  }}
                  className={`p-3 rounded-[var(--radius-lg)] border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
                    mode === "url"
                      ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)]/30 ring-1 ring-[color:var(--accent)]"
                      : "border-[color:var(--border-default)] hover:border-[color:var(--border-hover)] bg-[color:var(--surface-inset)]"
                  }`}
                >
                  <span className="text-xl">🔗</span>
                  <div>
                    <div className="text-xs font-bold text-[color:var(--text-primary)]">Website / URL</div>
                    <div className="text-[11px] text-[color:var(--text-muted)]">Article or post</div>
                  </div>
                </button>
              </div>

              {/* Dynamic Input Pane based on mode */}
              <div className="mt-2 p-4 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] flex flex-col gap-3">
                {mode === "doi" && (
                  <div className="flex flex-col gap-2">
                    <label htmlFor="doi-input-field" className="text-xs font-bold text-[color:var(--text-primary)]">
                      Publication DOI
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="doi-input-field"
                        type="text"
                        value={doiInput}
                        onChange={(e) => setDoiInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleProceedFromStep1()}
                        placeholder="e.g. 10.1038/nature12373 or https://doi.org/10.1145/..."
                        className="flex-1 px-3 py-2 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden focus:border-[color:var(--accent)]"
                      />
                    </div>
                    <p className="text-[11px] text-[color:var(--text-muted)]">
                      Instant metadata resolution using Crossref and OpenAlex academic registries.
                    </p>
                  </div>
                )}

                {mode === "url" && (
                  <div className="flex flex-col gap-2">
                    <label htmlFor="url-input-field" className="text-xs font-bold text-[color:var(--text-primary)]">
                      Webpage or Article URL
                    </label>
                    <input
                      id="url-input-field"
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleProceedFromStep1()}
                      placeholder="https://example.com/article/research-analysis"
                      className="px-3 py-2 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden focus:border-[color:var(--accent)]"
                    />
                    <p className="text-[11px] text-[color:var(--text-muted)]">
                      Extracts clean title, author, and citation information without storing the webpage.
                    </p>
                  </div>
                )}

                {(mode === "google_drive" || mode === "onedrive") && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-[color:var(--text-primary)]">
                        {mode === "google_drive" ? "Google Drive Document" : "OneDrive Document"}
                      </label>
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Files stay in your cloud
                      </span>
                    </div>

                    {connectingDrive === mode ? (
                      <div className="p-3 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] flex flex-col gap-2">
                        <p className="text-xs text-[color:var(--text-secondary)]">
                          Connect your {mode === "google_drive" ? "Google Account" : "Microsoft 365 Account"} to browse and link your files.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleConnectCloud(mode)}
                          disabled={busy}
                          className="w-fit px-3 py-1.5 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-semibold hover:bg-[color:var(--accent-hover)] cursor-pointer disabled:opacity-50"
                        >
                          🔐 Connect {mode === "google_drive" ? "Google Drive" : "OneDrive"}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <label htmlFor="cloud-filename-input" className="text-[11px] font-medium text-[color:var(--text-secondary)]">
                            Document Name / Title
                          </label>
                          <input
                            id="cloud-filename-input"
                            type="text"
                            value={cloudFileName}
                            onChange={(e) => setCloudFileName(e.target.value)}
                            placeholder="e.g. Deep_Learning_Survey_2026.pdf"
                            className="px-3 py-2 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label htmlFor="cloud-filelink-input" className="text-[11px] font-medium text-[color:var(--text-secondary)]">
                            Cloud File URL or Sharing Link
                          </label>
                          <input
                            id="cloud-filelink-input"
                            type="text"
                            value={cloudFileLink}
                            onChange={(e) => setCloudFileLink(e.target.value)}
                            placeholder="https://drive.google.com/file/d/.../view"
                            className="px-3 py-2 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden"
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {mode === "bibtex" && (
                  <div className="flex flex-col gap-2">
                    <label htmlFor="bibtex-input-area" className="text-xs font-bold text-[color:var(--text-primary)]">
                      Paste BibTeX or RIS export
                    </label>
                    <textarea
                      id="bibtex-input-area"
                      rows={4}
                      value={bibtexInput}
                      onChange={(e) => setBibtexInput(e.target.value)}
                      placeholder="@article{author2026, title={...}, author={...}, year={2026}}"
                      className="px-3 py-2 text-xs font-mono bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden"
                    />
                  </div>
                )}
              </div>

              {/* Secondary Import Switcher */}
              <div className="flex items-center justify-between text-xs text-[color:var(--text-muted)] pt-1">
                <span>Or import reference files:</span>
                <button
                  type="button"
                  onClick={() => {
                    setMode("bibtex");
                    setError(null);
                  }}
                  className={`hover:underline cursor-pointer font-medium ${
                    mode === "bibtex" ? "text-[color:var(--accent)] font-bold" : "text-[color:var(--text-secondary)]"
                  }`}
                >
                  Zotero · RIS · BibTeX
                </button>
              </div>

              {/* Local File Guidance Callout */}
              <div className="p-3 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-[var(--radius-md)] flex items-start gap-2.5 text-[11px] text-[color:var(--text-secondary)]">
                <span className="text-sm">💡</span>
                <div className="leading-relaxed">
                  <span className="font-bold text-[color:var(--text-primary)]">Have a local PDF or document? </span>
                  First save the file to Google Drive or OneDrive, then add it to Source Library. Source Library does not become your document storage location.
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: REVIEW METADATA & WRITING NOTES */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              {/* Duplicate Detection Warning Banner */}
              {duplicateWarning?.isDuplicate && !bypassDuplicate && (
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 rounded-[var(--radius-md)] text-xs flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 font-bold">
                    <span>⚠️</span>
                    <span>
                      {duplicateWarning.confidence === "definite"
                        ? "Definite Duplicate Detected"
                        : duplicateWarning.confidence === "likely"
                        ? "Likely Duplicate Detected"
                        : "Possible Duplicate Detected"}
                    </span>
                    {duplicateWarning.similarityPercent && (
                      <span className="text-[10px] bg-amber-500/20 px-2 py-0.5 rounded-full font-mono">
                        {duplicateWarning.similarityPercent}% match
                      </span>
                    )}
                  </div>
                  <p>
                    You already have a matching source in your library:
                    <br />
                    <strong>"{duplicateWarning.existingItem?.title}"</strong>
                    {duplicateWarning.existingItem?.year ? ` (${duplicateWarning.existingItem.year})` : ""}
                  </p>
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => onClose()}
                      className="px-3 py-1 bg-[color:var(--surface-raised)] border border-amber-500/40 rounded text-xs font-semibold hover:bg-[color:var(--surface-hover)] cursor-pointer"
                    >
                      Use Existing Source
                    </button>
                    <button
                      type="button"
                      onClick={() => setBypassDuplicate(true)}
                      className="px-3 py-1 bg-amber-600 text-white rounded text-xs font-semibold hover:bg-amber-700 cursor-pointer"
                    >
                      Keep Both
                    </button>
                  </div>
                </div>
              )}

              <p className="text-xs font-semibold text-[color:var(--text-secondary)] uppercase tracking-wider">
                We found this source — verify and organize:
              </p>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="source-title-input" className="text-xs font-bold text-[color:var(--text-primary)]">
                    Title *
                  </label>
                  <input
                    id="source-title-input"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="px-3 py-2 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="source-authors-input" className="text-xs font-bold text-[color:var(--text-primary)]">
                      Authors (comma-separated)
                    </label>
                    <input
                      id="source-authors-input"
                      type="text"
                      value={authorsText}
                      onChange={(e) => setAuthorsText(e.target.value)}
                      placeholder="e.g. Vaswani, Ashish, Shazeer, Noam"
                      className="px-3 py-2 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="source-year-input" className="text-xs font-bold text-[color:var(--text-primary)]">
                      Publication Year
                    </label>
                    <input
                      id="source-year-input"
                      type="text"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      placeholder="e.g. 2024"
                      className="px-3 py-2 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="source-journal-input" className="text-xs font-bold text-[color:var(--text-primary)]">
                      Journal or Publisher
                    </label>
                    <input
                      id="source-journal-input"
                      type="text"
                      value={journal || publisher}
                      onChange={(e) => {
                        setJournal(e.target.value);
                        setPublisher(e.target.value);
                      }}
                      placeholder="e.g. Nature, Science, IEEE"
                      className="px-3 py-2 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="source-doi-input" className="text-xs font-bold text-[color:var(--text-primary)]">
                      DOI
                    </label>
                    <input
                      id="source-doi-input"
                      type="text"
                      value={doi}
                      onChange={(e) => setDoi(e.target.value)}
                      placeholder="10.1038/..."
                      className="px-3 py-2 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Project Assignment */}
                <div className="flex flex-col gap-1.5 pt-1">
                  <label htmlFor="project-select-field" className="text-xs font-bold text-[color:var(--text-primary)]">
                    Project
                  </label>
                  {!isCreatingProject ? (
                    <div className="flex gap-2">
                      <select
                        id="project-select-field"
                        value={selectedProject}
                        onChange={(e) => setSelectedProject(e.target.value)}
                        className="flex-1 px-3 py-2 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden"
                      >
                        {existingProjects.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                        {existingProjects.length === 0 && <option value="Thesis">Thesis</option>}
                      </select>
                      <button
                        type="button"
                        onClick={() => setIsCreatingProject(true)}
                        className="px-3 py-1.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-xs font-semibold text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
                      >
                        + New
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="e.g. Capstone Report"
                        className="flex-1 px-3 py-2 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => setIsCreatingProject(false)}
                        className="px-2.5 py-1 text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {/* Tags */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="tag-input-field" className="text-xs font-bold text-[color:var(--text-primary)]">
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] text-[color:var(--text-secondary)]"
                      >
                        #{t}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(t)}
                          className="hover:text-red-500 cursor-pointer ml-0.5"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      id="tag-input-field"
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder="Add tag (e.g. Methodology, Review, Empirical) and press Enter"
                      className="flex-1 px-3 py-2 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="px-3 py-1.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-xs font-semibold hover:bg-[color:var(--surface-hover)] cursor-pointer"
                    >
                      + Add Tag
                    </button>
                  </div>
                </div>

                {/* Writing Notes */}
                <div className="p-3.5 rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/50 flex flex-col gap-2.5">
                  <span className="text-xs font-bold text-[color:var(--text-primary)]">
                    ✍️ Writing Notes (For your write-up)
                  </span>

                  <div className="flex flex-col gap-1">
                    <label htmlFor="why-saved-input" className="text-[11px] text-[color:var(--text-secondary)]">
                      Why are you saving this source?
                    </label>
                    <textarea
                      id="why-saved-input"
                      rows={2}
                      value={whySaved}
                      onChange={(e) => setWhySaved(e.target.value)}
                      placeholder="e.g. This supports my core argument about neural architecture in Section 2."
                      className="px-3 py-1.5 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 flex flex-col gap-1">
                      <label htmlFor="key-quote-input" className="text-[11px] text-[color:var(--text-secondary)]">
                        Key Quote
                      </label>
                      <input
                        id="key-quote-input"
                        type="text"
                        value={keyQuote}
                        onChange={(e) => setKeyQuote(e.target.value)}
                        placeholder="Relevant passage to quote..."
                        className="px-3 py-1.5 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="page-number-input" className="text-[11px] text-[color:var(--text-secondary)]">
                        Page #
                      </label>
                      <input
                        id="page-number-input"
                        type="text"
                        value={page}
                        onChange={(e) => setPage(e.target.value)}
                        placeholder="e.g. 14"
                        className="px-3 py-1.5 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: CONFIRMATION */}
          {step === 3 && savedSource && (
            <div className="flex flex-col gap-4 py-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl font-bold">
                  ✓
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[color:var(--text-primary)]">Source Saved</h4>
                  <p className="text-xs text-[color:var(--text-muted)]">
                    Ready to cite and reference in your writing.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] flex flex-col gap-2.5">
                <div className="text-xs font-bold text-[color:var(--text-primary)] leading-snug">
                  {savedSource.metadata.title}
                </div>
                <div className="text-[11px] text-[color:var(--text-secondary)]">
                  {savedSource.metadata.authors.join(", ")}
                  {savedSource.metadata.year ? ` (${savedSource.metadata.year})` : ""}
                </div>

                <div className="mt-1 pt-2 border-t border-[color:var(--border-subtle)] flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold tracking-wider uppercase text-[color:var(--text-muted)]">
                      APA 7 Citation
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyCitation}
                      className="text-xs text-[color:var(--accent)] hover:underline font-semibold cursor-pointer"
                    >
                      {copiedCitation ? "✓ Copied" : "Copy Citation"}
                    </button>
                  </div>
                  <p className="text-xs italic text-[color:var(--text-primary)] font-serif leading-relaxed">
                    {savedSource.citation}
                  </p>
                </div>
              </div>

              {savedSource.cloudReference?.webUrl && (
                <div className="flex items-center justify-between text-xs text-[color:var(--text-secondary)] px-1">
                  <span>Source Location:</span>
                  <a
                    href={savedSource.cloudReference.webUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[color:var(--accent)] hover:underline font-medium inline-flex items-center gap-1"
                  >
                    <span>{savedSource.cloudReference.provider === "google_drive" ? "Google Drive" : "OneDrive"}</span>
                    <span>↗</span>
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]">
          {step === 1 && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProceedFromStep1}
                disabled={busy}
                className="px-5 py-2 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {busy ? "Finding Source…" : "Next →"}
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-3 py-1.5 text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleSaveSource}
                disabled={busy}
                className="px-5 py-2 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save Source"}
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <button
                type="button"
                onClick={handleResetForAnother}
                className="px-4 py-2 text-xs font-semibold text-[color:var(--accent)] hover:underline cursor-pointer"
              >
                + Add Another Source
              </button>
              <div className="flex gap-2">
                {savedSource?.cloudReference?.webUrl && (
                  <a
                    href={savedSource.cloudReference.webUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-xs font-semibold text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
                  >
                    Open Source ↗
                  </a>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] cursor-pointer"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
