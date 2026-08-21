/**
 * Citation Confirmation & Metadata Editor Modal
 *
 * Enforces Scholar Core's strict invariant:
 * "No research source is citable until it has passed through Scholar's Citation Engine
 * and has complete, user-confirmed canonical citation metadata."
 */

import React, { useState, useMemo } from "react";
import type { CanonicalReference, ReferenceKind, ReferenceAuthor } from "../../citation_compliance/model/reference";
import { validateCitationCompleteness } from "../../citation_compliance/validation";
import { CitationFormatterFactory } from "../../citation_compliance/formattingEngine";
import { CITATION_STYLES } from "../../app/citation/resolveCitations";
import type { CitationStatus } from "../../services/vault/VaultStorageProvider";

export interface CitationConfirmationModalProps {
  initialReference?: Partial<CanonicalReference>;
  initialStatus?: CitationStatus;
  sourceTitle?: string;
  sourceType?: string;
  onConfirm: (confirmedRef: CanonicalReference, formattedCitation: string) => Promise<void> | void;
  onClose: () => void;
}

const REFERENCE_KINDS: Array<{ value: ReferenceKind; label: string }> = [
  { value: "JournalArticle", label: "Journal Article" },
  { value: "Preprint", label: "Preprint (arXiv, bioRxiv)" },
  { value: "Book", label: "Book" },
  { value: "BookChapter", label: "Book Chapter" },
  { value: "ConferencePaper", label: "Conference Paper" },
  { value: "Website", label: "Website / Web Page" },
  { value: "TechnicalReport", label: "Technical Report / Whitepaper" },
  { value: "GovernmentPublication", label: "Government Publication" },
  { value: "Dataset", label: "Dataset" },
  { value: "Software", label: "Software / Code" },
  { value: "Thesis", label: "Thesis / Dissertation" },
];

export function CitationConfirmationModal({
  initialReference,
  initialStatus = "needs_user_review",
  sourceTitle = "",
  sourceType = "file",
  onConfirm,
  onClose,
}: CitationConfirmationModalProps) {
  const [kind, setKind] = useState<ReferenceKind>(initialReference?.kind || "JournalArticle");
  const [title, setTitle] = useState(initialReference?.title || sourceTitle || "");
  const [authors, setAuthors] = useState<ReferenceAuthor[]>(
    initialReference?.authors && initialReference.authors.length > 0
      ? initialReference.authors
      : [{ firstName: "", lastName: "", order: 1 }]
  );
  const [source, setSource] = useState(initialReference?.source || initialReference?.journal || "");
  const [publisher, setPublisher] = useState(initialReference?.publisher || "");
  const [year, setYear] = useState(initialReference?.year || "");
  const [volume, setVolume] = useState(initialReference?.volume || "");
  const [issue, setIssue] = useState(initialReference?.issue || "");
  const [pages, setPages] = useState(initialReference?.pages || "");
  const [doi, setDoi] = useState(initialReference?.doi || "");
  const [url, setUrl] = useState(initialReference?.url || "");
  const [accessDate, setAccessDate] = useState(initialReference?.accessDate || new Date().toISOString().split("T")[0]);

  const [selectedStyle, setSelectedStyle] = useState("apa7");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Construct canonical reference
  const currentReference: CanonicalReference = useMemo(() => {
    const cleanAuthors = authors
      .filter((a) => a.lastName.trim() || a.firstName.trim())
      .map((a, idx) => ({ ...a, order: idx + 1 }));

    return {
      kind,
      title: title.trim(),
      authors: cleanAuthors,
      source: source.trim(),
      journal: kind === "JournalArticle" || kind === "Preprint" ? source.trim() : undefined,
      publisher: publisher.trim() || undefined,
      year: year.trim() || undefined,
      publicationDate: year.trim() ? `${year.trim()}-01-01` : undefined,
      volume: volume.trim() || undefined,
      issue: issue.trim() || undefined,
      pages: pages.trim() || undefined,
      doi: doi.trim() || undefined,
      url: url.trim() || undefined,
      accessDate: accessDate.trim() || undefined,
    };
  }, [kind, title, authors, source, publisher, year, volume, issue, pages, doi, url, accessDate]);

  // Deterministic completeness validation
  const validation = useMemo(() => {
    return validateCitationCompleteness(currentReference);
  }, [currentReference]);

  // Real-time formatted previews
  const formattedPreview = useMemo(() => {
    try {
      const bib = CitationFormatterFactory.formatBibliography(selectedStyle, currentReference);
      const inText = CitationFormatterFactory.formatInText(selectedStyle, currentReference);
      return { bibliography: bib, inText };
    } catch (e: any) {
      return { bibliography: "Formatting error: " + e.message, inText: "" };
    }
  }, [selectedStyle, currentReference]);

  function handleAddAuthor() {
    setAuthors((prev) => [...prev, { firstName: "", lastName: "", order: prev.length + 1 }]);
  }

  function handleAuthorChange(index: number, field: "firstName" | "lastName", val: string) {
    setAuthors((prev) =>
      prev.map((a, i) => (i === index ? { ...a, [field]: val } : a))
    );
  }

  function handleRemoveAuthor(index: number) {
    if (authors.length <= 1) {
      setAuthors([{ firstName: "", lastName: "", order: 1 }]);
      return;
    }
    setAuthors((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleConfirmSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validation.isValid) {
      setError(`Missing required citation fields: ${validation.missingFields.join(", ")}`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onConfirm(currentReference, formattedPreview.bibliography);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to confirm citation metadata");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="citation-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-[var(--radius-xl)] border border-[color:var(--border-default)] bg-[color:var(--surface-canvas)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <header className="flex items-center justify-between border-b border-[color:var(--border-subtle)] px-6 py-4 bg-[color:var(--surface-raised)]">
          <div>
            <h2 id="citation-modal-title" className="text-lg font-semibold text-[color:var(--text-primary)]">
              Confirm Citation Metadata
            </h2>
            <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
              Review and confirm canonical metadata to make this source citation-ready across all styles.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-sm font-medium text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] cursor-pointer"
          >
            ✕
          </button>
        </header>

        <form onSubmit={handleConfirmSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div role="alert" className="p-3 rounded-[var(--radius-md)] bg-[color:var(--state-danger-subtle)] border border-[color:var(--state-danger)] text-sm text-[color:var(--state-danger)] font-medium">
              {error}
            </div>
          )}

          {/* Validation Checklist / Status */}
          <div className="p-4 rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-base ${validation.isValid ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/20 text-amber-600 dark:text-amber-400"}`}>
                {validation.isValid ? "✓" : "⚠️"}
              </span>
              <div>
                <p className="text-sm font-semibold text-[color:var(--text-primary)]">
                  {validation.isValid ? "Citation Ready for Confirmation" : "Incomplete Citation Metadata"}
                </p>
                <p className="text-xs text-[color:var(--text-secondary)]">
                  {validation.isValid
                    ? "All required canonical fields are present."
                    : `Missing: ${validation.missingFields.join(", ")}`}
                </p>
              </div>
            </div>
            <div className="text-xs px-2.5 py-1 rounded bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-muted)] font-mono">
              Status: {validation.isValid ? "Complete" : "Needs Input"}
            </div>
          </div>

          {/* Form Fields Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ref-kind" className="block text-xs font-semibold text-[color:var(--text-primary)] mb-1">
                Source Type / Kind *
              </label>
              <select
                id="ref-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as ReferenceKind)}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]"
              >
                {REFERENCE_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ref-year" className="block text-xs font-semibold text-[color:var(--text-primary)] mb-1">
                Publication Year *
              </label>
              <input
                id="ref-year"
                type="text"
                placeholder="e.g. 2024"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="ref-title" className="block text-xs font-semibold text-[color:var(--text-primary)] mb-1">
              Title *
            </label>
            <input
              id="ref-title"
              type="text"
              placeholder="Full article, book, or document title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]"
            />
          </div>

          {/* Authors List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-[color:var(--text-primary)]">
                Authors / Creators *
              </label>
              <button
                type="button"
                onClick={handleAddAuthor}
                className="text-xs text-[color:var(--accent)] font-semibold hover:underline cursor-pointer"
              >
                + Add Author
              </button>
            </div>
            <div className="space-y-2">
              {authors.map((author, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="First name / initials"
                    value={author.firstName}
                    onChange={(e) => handleAuthorChange(index, "firstName", e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]"
                  />
                  <input
                    type="text"
                    placeholder="Last name *"
                    value={author.lastName}
                    onChange={(e) => handleAuthorChange(index, "lastName", e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveAuthor(index)}
                    aria-label={`Remove author ${index + 1}`}
                    className="px-2 py-1.5 text-xs text-[color:var(--text-muted)] hover:text-[color:var(--state-danger)] cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ref-source" className="block text-xs font-semibold text-[color:var(--text-primary)] mb-1">
                Journal / Container / Website Name
              </label>
              <input
                id="ref-source"
                type="text"
                placeholder="e.g. Nature, Physical Review B"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]"
              />
            </div>

            <div>
              <label htmlFor="ref-publisher" className="block text-xs font-semibold text-[color:var(--text-primary)] mb-1">
                Publisher / Institution
              </label>
              <input
                id="ref-publisher"
                type="text"
                placeholder="e.g. Springer, MIT Press"
                value={publisher}
                onChange={(e) => setPublisher(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="ref-vol" className="block text-xs font-semibold text-[color:var(--text-primary)] mb-1">
                Volume
              </label>
              <input
                id="ref-vol"
                type="text"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]"
              />
            </div>
            <div>
              <label htmlFor="ref-iss" className="block text-xs font-semibold text-[color:var(--text-primary)] mb-1">
                Issue
              </label>
              <input
                id="ref-iss"
                type="text"
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]"
              />
            </div>
            <div>
              <label htmlFor="ref-pages" className="block text-xs font-semibold text-[color:var(--text-primary)] mb-1">
                Pages
              </label>
              <input
                id="ref-pages"
                type="text"
                placeholder="100-115"
                value={pages}
                onChange={(e) => setPages(e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ref-doi" className="block text-xs font-semibold text-[color:var(--text-primary)] mb-1">
                DOI (Digital Object Identifier)
              </label>
              <input
                id="ref-doi"
                type="text"
                placeholder="10.xxxx/yyyy"
                value={doi}
                onChange={(e) => setDoi(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]"
              />
            </div>
            <div>
              <label htmlFor="ref-url" className="block text-xs font-semibold text-[color:var(--text-primary)] mb-1">
                URL / Permanent Link
              </label>
              <input
                id="ref-url"
                type="text"
                placeholder="https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]"
              />
            </div>
          </div>

          {/* Real-Time Formatted Citation Preview */}
          <div className="mt-6 p-4 rounded-[var(--radius-lg)] border border-[color:var(--accent-border)] bg-[color:var(--surface-raised)] space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-[color:var(--accent)]">
                Real-Time Citation Preview (Scholar Citation Engine)
              </label>
              <select
                aria-label="Citation Style Preview"
                value={selectedStyle}
                onChange={(e) => setSelectedStyle(e.target.value)}
                className="text-xs px-2 py-1 rounded bg-[color:var(--surface-canvas)] border border-[color:var(--border-default)] text-[color:var(--text-primary)]"
              >
                {CITATION_STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <div>
                <p className="text-[10px] uppercase font-bold text-[color:var(--text-muted)]">In-Text Citation</p>
                <p className="text-xs text-[color:var(--text-primary)] font-mono bg-[color:var(--surface-inset)] p-2 rounded">
                  {formattedPreview.inText || "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-[color:var(--text-muted)]">Bibliography Entry</p>
                <p className="text-xs text-[color:var(--text-primary)] bg-[color:var(--surface-inset)] p-2.5 rounded whitespace-pre-wrap leading-relaxed">
                  {formattedPreview.bibliography || "—"}
                </p>
              </div>
            </div>
          </div>

          <footer className="pt-4 flex items-center justify-end gap-3 border-t border-[color:var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !validation.isValid}
              className="px-5 py-2 text-sm font-medium rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
            >
              {saving ? "Confirming…" : "✓ Confirm Citation Metadata"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
