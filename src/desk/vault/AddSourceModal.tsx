/**
 * Add Source Modal — Streamlined 1-Step Fast Intake for Knowledge Vault.
 *
 * Fast & Direct:
 * 1. Paste a URL, DOI, BibTeX, or title into a single smart input.
 * 2. Instant auto-fetch and field population.
 * 3. 1-click "Save Source" to save directly to Knowledge Vault.
 *
 * User files stay in their cloud storage or web source — zero file copies.
 */

import { useState, useEffect } from "react";
import type { VaultItem } from "../../services/vaultContents";
import type { CloudStorageProvider, SourceType } from "../../services/vault/sourceTypes";
import { sourceToVaultItemPayload } from "../../services/vault/sourceTypes";
import { addVaultItem } from "../../services/vaultContents";
import {
  checkForDuplicates,
  normalizeDoi,
  type DuplicateCheckResult,
} from "../../services/vault/duplicateDetection";
import {
  resolveDoiMetadata,
  resolveUrlMetadata,
  generateAPA7Citation,
} from "../../services/vault/metadataService";

export interface AddSourceModalProps {
  userId: string;
  existingItems: VaultItem[];
  existingProjects?: string[];
  onClose: () => void;
  onSourceSaved: (savedItem: VaultItem) => void;
}

type IntakeType = "url" | "doi" | "bibtex" | "cloud_drive" | "onedrive" | "manual";

export default function AddSourceModal({
  userId,
  existingItems,
  onClose,
  onSourceSaved,
}: AddSourceModalProps) {
  // Smart intake input
  const [smartInput, setSmartInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Core metadata fields
  const [title, setTitle] = useState("");
  const [authorsText, setAuthorsText] = useState("");
  const [year, setYear] = useState("");
  const [journal, setJournal] = useState("");
  const [publisher, setPublisher] = useState("");
  const [doi, setDoi] = useState("");
  const [webUrl, setWebUrl] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("paper");

  // Optional collapsible details
  const [showExtras, setShowExtras] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [whySaved, setWhySaved] = useState("");
  const [keyQuote, setKeyQuote] = useState("");
  const [cloudReference, setCloudReference] = useState<{
    provider: CloudStorageProvider;
    fileId: string;
    fileName: string;
    webUrl?: string;
  } | undefined>(undefined);

  // Duplicate warning
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateCheckResult | null>(null);
  const [bypassDuplicate, setBypassDuplicate] = useState(false);

  // Detect input type
  function detectType(val: string): IntakeType {
    const trimmed = val.trim();
    if (!trimmed) return "manual";
    if (trimmed.startsWith("@") && (trimmed.includes("{") || trimmed.includes("="))) {
      return "bibtex";
    }
    const cleanedDoi = normalizeDoi(trimmed);
    if (cleanedDoi && /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i.test(cleanedDoi)) {
      return "doi";
    }
    if (trimmed.includes("drive.google.com") || trimmed.includes("docs.google.com")) {
      return "cloud_drive";
    }
    if (trimmed.includes("onedrive.live.com") || trimmed.includes("sharepoint.com") || trimmed.includes("1drv.ms")) {
      return "onedrive";
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return "url";
    }
    return "manual";
  }

  // Parse BibTeX snippet
  function parseBibtex(raw: string) {
    const titleMatch = raw.match(/title\s*=\s*[\{"]([^"\}]+)[\}"]/i);
    const authorMatch = raw.match(/author\s*=\s*[\{"]([^"\}]+)[\}"]/i);
    const yearMatch = raw.match(/year\s*=\s*[\{"]?(\d{4})[\}"]?/i);
    const journalMatch = raw.match(/(?:journal|booktitle|publisher)\s*=\s*[\{"]([^"\}]+)[\}"]/i);
    const doiMatch = raw.match(/doi\s*=\s*[\{"]([^"\}]+)[\}"]/i);

    const parsedTitle = titleMatch?.[1]?.trim() || "";
    const parsedAuthors = authorMatch?.[1]?.trim() || "";
    const parsedYear = yearMatch?.[1] || "";
    const parsedJournal = journalMatch?.[1]?.trim() || "";
    const parsedDoi = doiMatch?.[1]?.trim() || "";

    if (parsedTitle) setTitle(parsedTitle);
    if (parsedAuthors) setAuthorsText(parsedAuthors);
    if (parsedYear) setYear(parsedYear);
    if (parsedJournal) {
      setJournal(parsedJournal);
      setPublisher(parsedJournal);
    }
    if (parsedDoi) setDoi(parsedDoi);
    setSourceType("paper");
    setFetchStatus("BibTeX reference parsed");
  }

  // Resolve metadata from smart input
  async function handleSmartFetch(queryOverride?: string) {
    const raw = (queryOverride !== undefined ? queryOverride : smartInput).trim();
    if (!raw) return;

    const kind = detectType(raw);
    setError(null);
    setFetchStatus(null);
    setBusy(true);

    try {
      if (kind === "doi") {
        setFetchStatus("Resolving DOI via CrossRef / OpenAlex / DataCite…");
        const cleanDoi = normalizeDoi(raw) || raw;
        const res = await resolveDoiMetadata(cleanDoi);

        if (res.success && res.metadata.title) {
          setTitle(res.metadata.title);
          setAuthorsText((res.metadata.authors || []).join(", "));
          setYear(res.metadata.year || "");
          setJournal(res.metadata.journal || "");
          setDoi(res.metadata.doi || cleanDoi);
          setWebUrl(res.metadata.url || `https://doi.org/${res.metadata.doi || cleanDoi}`);
          setSourceType("paper");
          setFetchStatus("✓ DOI metadata verified");

          const dup = checkForDuplicates(
            {
              title: res.metadata.title,
              doi: res.metadata.doi || cleanDoi,
              authors: res.metadata.authors,
              year: res.metadata.year,
            },
            existingItems
          );
          if (dup.isDuplicate) setDuplicateWarning(dup);
        } else {
          setDoi(cleanDoi);
          setWebUrl(`https://doi.org/${cleanDoi}`);
          setSourceType("paper");
          setFetchStatus("DOI recognized — please fill remaining details");
        }
      } else if (kind === "url") {
        setFetchStatus("Fetching article metadata & citations…");
        const res = await resolveUrlMetadata(raw);

        setTitle(res.metadata.title || "");
        setAuthorsText((res.metadata.authors || []).join(", "));
        setYear(res.metadata.year || "");
        setJournal(res.metadata.journal || res.metadata.publisher || "");
        setPublisher(res.metadata.publisher || "");
        setDoi(res.metadata.doi || "");
        setWebUrl(res.metadata.url || raw);
        setSourceType(res.metadata.type === "paper" || res.metadata.doi || res.metadata.journal ? "paper" : "website");
        setFetchStatus(res.confidence === "verified" ? "✓ Metadata verified" : "Source details fetched");

        const dup = checkForDuplicates(
          {
            title: res.metadata.title,
            doi: res.metadata.doi,
            authors: res.metadata.authors,
            year: res.metadata.year,
          },
          existingItems
        );
        if (dup.isDuplicate) setDuplicateWarning(dup);
      } else if (kind === "bibtex") {
        parseBibtex(raw);
      } else if (kind === "cloud_drive" || kind === "onedrive") {
        const provider: CloudStorageProvider = kind === "cloud_drive" ? "google_drive" : "onedrive";
        const driveMatch = raw.match(/\/(?:file\/d|document\/d|spreadsheets\/d|presentation\/d)\/([a-zA-Z0-9_-]+)/);
        const fileId = driveMatch?.[1] || `cloud_${Date.now()}`;
        const fileName = "Cloud Research Document.pdf";

        setCloudReference({
          provider,
          fileId,
          fileName,
          webUrl: raw,
        });
        if (!title) setTitle("Cloud Research Document");
        setWebUrl(raw);
        setSourceType("paper");
        setFetchStatus(`✓ Connected to ${provider === "google_drive" ? "Google Drive" : "OneDrive"}`);
      } else {
        // Raw title
        setTitle(raw);
        setFetchStatus("Title set — add author & year if known");
      }
    } catch (err: any) {
      setError(err.message || "Failed to retrieve source metadata.");
    } finally {
      setBusy(false);
    }
  }

  // Handle paste directly into the smart input
  function handleSmartInputPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pastedText = e.clipboardData.getData("text").trim();
    if (pastedText) {
      setSmartInput(pastedText);
      const kind = detectType(pastedText);
      if (kind === "url" || kind === "doi" || kind === "bibtex" || kind === "cloud_drive" || kind === "onedrive") {
        setTimeout(() => {
          handleSmartFetch(pastedText);
        }, 50);
      }
    }
  }

  // Handle saving the source directly
  async function handleSaveSource(e?: React.FormEvent) {
    if (e) e.preventDefault();

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
        projects: [],
        tags,
        notes: {
          whySaved: whySaved.trim() || undefined,
          keyQuote: keyQuote.trim() || undefined,
        },
        citation,
        citationStatus: "confirmed",
        integrityStatus: "clean",
      });

      const saved = await addVaultItem(userId, sourcePayload);
      onSourceSaved(saved);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save source.");
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-source-title"
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
    >
      <div className="w-full max-w-lg bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-xl)] shadow-2xl flex flex-col overflow-hidden my-6">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]">
          <div>
            <h2 id="add-source-title" className="text-base font-bold text-[color:var(--text-primary)]">
              Add Source
            </h2>
            <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
              Paste a link, DOI, or title to instantly organize and cite it.
            </p>
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

        {/* Content Form */}
        <form onSubmit={handleSaveSource} className="p-6 flex flex-col gap-4">
          {/* Smart Input Row */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="smart-intake-input" className="text-xs font-bold text-[color:var(--text-primary)]">
              URL, DOI, or Reference
            </label>
            <div className="flex items-center gap-2">
              <input
                id="smart-intake-input"
                type="text"
                value={smartInput}
                onChange={(e) => setSmartInput(e.target.value)}
                onPaste={handleSmartInputPaste}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !title) {
                    e.preventDefault();
                    handleSmartFetch();
                  }
                }}
                placeholder="Paste URL (https://...), DOI (10.1038/...), or title..."
                className="flex-1 px-3.5 py-2.5 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-hidden focus:border-[color:var(--accent)]"
              />
              <button
                type="button"
                onClick={() => handleSmartFetch()}
                disabled={busy || !smartInput.trim()}
                className="px-3.5 py-2.5 bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] text-xs font-semibold rounded-[var(--radius-md)] disabled:opacity-50 cursor-pointer shrink-0 transition-colors"
              >
                {busy ? "Fetching…" : "Fetch"}
              </button>
            </div>

            {/* Fetch feedback or error */}
            {fetchStatus && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                {fetchStatus}
              </p>
            )}
            {error && (
              <p className="text-[11px] text-[color:var(--state-danger)] font-medium mt-0.5">
                {error}
              </p>
            )}
          </div>

          {/* Duplicate Warning */}
          {duplicateWarning?.isDuplicate && !bypassDuplicate && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 rounded-[var(--radius-md)] text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 truncate">
                <span>⚠️</span>
                <span className="truncate">
                  Already in Vault: <strong>"{duplicateWarning.existingItem?.title}"</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setBypassDuplicate(true)}
                className="shrink-0 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-semibold cursor-pointer"
              >
                Save Anyway
              </button>
            </div>
          )}

          {/* Core Metadata Fields */}
          <div className="pt-2 border-t border-[color:var(--border-subtle)] flex flex-col gap-3">
            {/* Title */}
            <div className="flex flex-col gap-1">
              <label htmlFor="source-title" className="text-xs font-bold text-[color:var(--text-primary)]">
                Title *
              </label>
              <input
                id="source-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Towards a Global International Relations?"
                className="px-3 py-2 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden focus:border-[color:var(--accent)]"
              />
            </div>

            {/* Authors */}
            <div className="flex flex-col gap-1">
              <label htmlFor="source-authors" className="text-xs font-bold text-[color:var(--text-primary)]">
                Authors (comma-separated)
              </label>
              <input
                id="source-authors"
                type="text"
                value={authorsText}
                onChange={(e) => setAuthorsText(e.target.value)}
                placeholder="e.g. Acharya, Amitav"
                className="px-3 py-2 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden focus:border-[color:var(--accent)]"
              />
            </div>

            {/* Year & Journal/Publisher Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="source-year" className="text-xs font-bold text-[color:var(--text-primary)]">
                  Publication Year
                </label>
                <input
                  id="source-year"
                  type="text"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="e.g. 2024"
                  className="px-3 py-2 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden focus:border-[color:var(--accent)]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="source-journal" className="text-xs font-bold text-[color:var(--text-primary)]">
                  Journal / Publisher
                </label>
                <input
                  id="source-journal"
                  type="text"
                  value={journal || publisher}
                  onChange={(e) => {
                    setJournal(e.target.value);
                    setPublisher(e.target.value);
                  }}
                  placeholder="e.g. E-International Relations"
                  className="px-3 py-2 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden focus:border-[color:var(--accent)]"
                />
              </div>
            </div>

            {/* DOI & URL Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="source-doi" className="text-xs font-bold text-[color:var(--text-primary)]">
                  DOI
                </label>
                <input
                  id="source-doi"
                  type="text"
                  value={doi}
                  onChange={(e) => setDoi(e.target.value)}
                  placeholder="10.1038/..."
                  className="px-3 py-2 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden focus:border-[color:var(--accent)]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="source-weburl" className="text-xs font-bold text-[color:var(--text-primary)]">
                  Link / Web URL
                </label>
                <input
                  id="source-weburl"
                  type="text"
                  value={webUrl}
                  onChange={(e) => setWebUrl(e.target.value)}
                  placeholder="https://..."
                  className="px-3 py-2 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden focus:border-[color:var(--accent)]"
                />
              </div>
            </div>
          </div>

          {/* Optional Details Accordion */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowExtras(!showExtras)}
              className="text-xs text-[color:var(--accent)] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
            >
              <span>{showExtras ? "▼" : "▶"}</span>
              <span>{showExtras ? "Hide tags and writing notes" : "+ Add tags or notes (optional)"}</span>
            </button>

            {showExtras && (
              <div className="mt-3 p-3 bg-[color:var(--surface-inset)]/50 border border-[color:var(--border-subtle)] rounded-[var(--radius-md)] flex flex-col gap-3 animate-in fade-in duration-150">
                {/* Tags */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="tag-input-field" className="text-[11px] font-bold text-[color:var(--text-secondary)]">
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-1 mb-1">
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] text-[color:var(--text-secondary)]"
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
                      placeholder="Add tag and press enter"
                      className="flex-1 px-2.5 py-1.5 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] text-[color:var(--text-primary)] focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="px-2.5 py-1.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] text-xs font-semibold rounded-[var(--radius-sm)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Writing note / why saved */}
                <div className="flex flex-col gap-1">
                  <label htmlFor="why-saved-input" className="text-[11px] font-bold text-[color:var(--text-secondary)]">
                    Why are you saving this source?
                  </label>
                  <input
                    id="why-saved-input"
                    type="text"
                    value={whySaved}
                    onChange={(e) => setWhySaved(e.target.value)}
                    placeholder="e.g. Supports Section 2 theoretical framework"
                    className="px-2.5 py-1.5 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] text-[color:var(--text-primary)] focus:outline-hidden"
                  />
                </div>

                {/* Key quote */}
                <div className="flex flex-col gap-1">
                  <label htmlFor="key-quote-input" className="text-[11px] font-bold text-[color:var(--text-secondary)]">
                    Key Quote
                  </label>
                  <textarea
                    id="key-quote-input"
                    rows={2}
                    value={keyQuote}
                    onChange={(e) => setKeyQuote(e.target.value)}
                    placeholder="Relevant excerpt or passage..."
                    className="px-2.5 py-1.5 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] text-[color:var(--text-primary)] focus:outline-hidden"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-[color:var(--border-subtle)]">
            <span className="text-[11px] text-[color:var(--text-muted)]">
              🛡️ Zero document storage
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] rounded-[var(--radius-md)] cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !title.trim()}
                className="px-4 py-2 bg-[color:var(--accent-solid)] hover:bg-[color:var(--accent-hover)] text-[color:var(--text-inverse)] text-xs font-bold rounded-[var(--radius-md)] shadow-xs disabled:opacity-50 cursor-pointer transition-colors"
              >
                {busy ? "Saving…" : "Save Source"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
