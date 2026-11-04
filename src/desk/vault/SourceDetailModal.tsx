/**
 * Source Detail Modal / Drawer — Clean academic inspection view.
 *
 * Exposes APA 7 citation, cloud file location, projects, tags, writing notes,
 * and quiet research integrity without any technical parser output or raw internals.
 */

import { useState } from "react";
import type { Source } from "../../services/vault/sourceTypes";

export interface SourceDetailModalProps {
  source: Source;
  onClose: () => void;
  onEdit?: (source: Source) => void;
  onDelete?: (sourceId: string) => void;
  allProjects?: string[];
  onToggleProject?: (sourceId: string, projectName: string) => void;
}

export default function SourceDetailModal({
  source,
  onClose,
  onEdit,
  onDelete,
  allProjects = [],
  onToggleProject,
}: SourceDetailModalProps) {
  const [copied, setCopied] = useState(false);
  const [copiedKeyPoints, setCopiedKeyPoints] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAddProjectMenu, setShowAddProjectMenu] = useState(false);

  function handleCopyCitation() {
    if (!source.citation) return;
    navigator.clipboard.writeText(source.citation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCopyKeyPoints() {
    const points = source.notes.keyPoints || source.writingNotes?.keyPoints;
    if (!points || points.length === 0) return;
    navigator.clipboard.writeText(points.map((p) => `• ${p}`).join("\n"));
    setCopiedKeyPoints(true);
    setTimeout(() => setCopiedKeyPoints(false), 2000);
  }

  const isRetracted =
    source.integrityStatus === "retracted" || source.integrityStatus === "expression_of_concern";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="source-detail-title"
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
    >
      <div className="w-full max-w-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-xl)] shadow-2xl flex flex-col overflow-hidden my-6">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
          >
            <span>←</span>
            <span>Sources</span>
          </button>
          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(source)}
                className="px-3 py-1 text-xs font-semibold bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
              >
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-sm text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] p-1 rounded-md cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body content */}
        <div className="p-6 flex flex-col gap-6 max-h-[80vh] overflow-y-auto">
          {/* Header Title & Author */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xl">📄</span>
              <h2
                id="source-detail-title"
                className="text-lg font-bold text-[color:var(--text-primary)] leading-snug"
              >
                {source.metadata.title}
              </h2>
            </div>
            <div className="text-xs text-[color:var(--text-secondary)] pl-7">
              {source.metadata.authors && source.metadata.authors.length > 0
                ? source.metadata.authors.join(", ")
                : "Unknown Authors"}
              {source.metadata.year ? ` · ${source.metadata.year}` : ""}
              {source.metadata.journal ? ` · ${source.metadata.journal}` : ""}
              {source.metadata.publisher ? ` · ${source.metadata.publisher}` : ""}
            </div>
          </div>

          <hr className="border-[color:var(--border-subtle)]" />

          {/* Citation Section */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
                  Citation
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] text-[color:var(--text-muted)]">
                  APA 7
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyCitation}
                className="text-xs text-[color:var(--accent)] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>{copied ? "✓" : "📋"}</span>
                <span>{copied ? "Copied" : "Copy Citation"}</span>
              </button>
            </div>
            <div className="p-3.5 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] text-xs font-serif italic leading-relaxed text-[color:var(--text-primary)]">
              {source.citation || "No citation generated yet."}
            </div>
          </div>

          <hr className="border-[color:var(--border-subtle)]" />

          {/* Source Location */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
              Source Location
            </span>
            <div className="p-3.5 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {source.cloudReference?.provider === "google_drive"
                    ? "📁"
                    : source.cloudReference?.provider === "onedrive"
                    ? "☁️"
                    : "🔗"}
                </span>
                <div>
                  <div className="text-xs font-bold text-[color:var(--text-primary)]">
                    {source.cloudReference?.provider === "google_drive"
                      ? "Google Drive"
                      : source.cloudReference?.provider === "onedrive"
                      ? "Microsoft OneDrive"
                      : "Website"}
                  </div>
                  <div className="text-[11px] text-[color:var(--text-muted)] truncate max-w-sm">
                    {source.cloudReference?.fileName || source.metadata.url || "Cloud Document"}
                  </div>
                </div>
              </div>

              {(source.cloudReference?.webUrl || source.metadata.url) && (
                <a
                  href={source.cloudReference?.webUrl || source.metadata.url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-semibold hover:bg-[color:var(--accent-hover)] transition-colors inline-flex items-center gap-1.5 shadow-xs"
                >
                  <span>Open Source</span>
                  <span>↗</span>
                </a>
              )}
            </div>
          </div>

          <hr className="border-[color:var(--border-subtle)]" />

          {/* Projects & Tags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
                  Projects
                </span>
                {onToggleProject && allProjects.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAddProjectMenu(!showAddProjectMenu)}
                    className="text-[11px] text-[color:var(--accent)] hover:underline font-semibold cursor-pointer"
                  >
                    {showAddProjectMenu ? "Done" : "+ Link Project"}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 items-center">
                {source.projects && source.projects.length > 0 ? (
                  source.projects.map((p) => (
                    <span
                      key={p}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-[var(--radius-md)] bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] text-[color:var(--text-primary)]"
                    >
                      <span>📁 {p}</span>
                      {onToggleProject && (
                        <button
                          type="button"
                          onClick={() => onToggleProject(source.id, p)}
                          className="text-[10px] text-[color:var(--text-muted)] hover:text-red-500 cursor-pointer ml-0.5"
                          title={`Unlink from ${p}`}
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-[color:var(--text-muted)] italic">General (No project)</span>
                )}
              </div>

              {/* Add Project Quick Menu */}
              {showAddProjectMenu && onToggleProject && (
                <div className="p-2.5 rounded-[var(--radius-md)] bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] flex flex-col gap-1.5 mt-1 animate-in fade-in duration-150">
                  <span className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase">
                    Select a project to link/unlink:
                  </span>
                  <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                    {allProjects.map((proj) => {
                      const isLinked = source.projects.includes(proj);
                      return (
                        <button
                          key={proj}
                          type="button"
                          onClick={() => onToggleProject(source.id, proj)}
                          className={`px-2 py-0.5 text-xs rounded border transition-colors cursor-pointer ${
                            isLinked
                              ? "bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] border-transparent"
                              : "bg-[color:var(--surface-raised)] border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:border-[color:var(--accent)]"
                          }`}
                        >
                          {isLinked ? "✓ " : "+ "}
                          {proj}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
                Tags
              </span>
              <div className="flex flex-wrap gap-1.5">
                {source.tags && source.tags.length > 0 ? (
                  source.tags.map((t) => (
                    <span
                      key={t}
                      className="px-2.5 py-0.5 text-[11px] font-medium rounded-full bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)]"
                    >
                      #{t}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-[color:var(--text-muted)] italic">No tags</span>
                )}
              </div>
            </div>
          </div>

          <hr className="border-[color:var(--border-subtle)]" />

          {/* Writing Notes */}
          <div className="flex flex-col gap-3">
            <span className="text-xs font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
              Writing Notes
            </span>

            {source.notes.whySaved && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-[color:var(--text-secondary)]">
                  Why I saved this:
                </span>
                <p className="text-xs text-[color:var(--text-primary)] leading-relaxed bg-[color:var(--surface-inset)] p-3 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)]">
                  {source.notes.whySaved}
                </p>
              </div>
            )}

            {source.notes.keyPoints && source.notes.keyPoints.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[color:var(--text-secondary)]">
                    Key sentences from the abstract:
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyKeyPoints}
                    className="text-[11px] text-[color:var(--accent)] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <span>{copiedKeyPoints ? "✓" : "📋"}</span>
                    <span>{copiedKeyPoints ? "Copied" : "Copy Key Points"}</span>
                  </button>
                </div>
                <div className="flex flex-col gap-1.5 bg-[color:var(--surface-inset)] p-3 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)]">
                  {source.notes.keyPoints.map((kp, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-[color:var(--text-primary)] leading-relaxed">
                      <span className="text-[color:var(--accent)] font-bold">•</span>
                      <span>{kp}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {source.notes.keyQuote && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[color:var(--text-secondary)]">Key Quote:</span>
                  {source.notes.page && (
                    <span className="text-[10px] text-[color:var(--text-muted)]">
                      Page {source.notes.page}
                    </span>
                  )}
                </div>
                <blockquote className="text-xs italic text-[color:var(--text-primary)] leading-relaxed bg-[color:var(--surface-inset)] p-3 rounded-[var(--radius-md)] border-l-2 border-[color:var(--accent)] border-y border-r border-[color:var(--border-subtle)]">
                  "{source.notes.keyQuote}"
                </blockquote>
              </div>
            )}

            {!source.notes.whySaved && !source.notes.keyQuote && (!source.notes.keyPoints || source.notes.keyPoints.length === 0) && (
              <p className="text-xs text-[color:var(--text-muted)] italic">No writing notes added yet.</p>
            )}
          </div>

          <hr className="border-[color:var(--border-subtle)]" />

          {/* Metadata Section */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
              Metadata
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {source.metadata.doi && (
                <div>
                  <span className="text-[color:var(--text-muted)]">DOI: </span>
                  <span className="font-mono text-[color:var(--text-primary)]">{source.metadata.doi}</span>
                </div>
              )}
              {source.metadata.year && (
                <div>
                  <span className="text-[color:var(--text-muted)]">Year: </span>
                  <span className="text-[color:var(--text-primary)]">{source.metadata.year}</span>
                </div>
              )}
              {source.metadata.journal && (
                <div className="col-span-2">
                  <span className="text-[color:var(--text-muted)]">Publication: </span>
                  <span className="text-[color:var(--text-primary)]">{source.metadata.journal}</span>
                </div>
              )}
              <div>
                <span className="text-[color:var(--text-muted)]">Added: </span>
                <span className="text-[color:var(--text-primary)]">
                  {new Date(source.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          <hr className="border-[color:var(--border-subtle)]" />

          {/* Research Integrity Section */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
              Research Integrity
            </span>
            <div className="flex items-center gap-2 text-xs">
              {isRetracted ? (
                <div className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-[var(--radius-md)] flex items-center gap-2 w-full">
                  <span>⚠️</span>
                  <span>Publication update: This work has received an official expression of concern or retraction notice.</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <span>✓</span>
                  <span>Integrity status: No retraction notices found across checked registries.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[color:var(--state-danger)] font-semibold">
                Delete source? (No undo)
              </span>
              <button
                type="button"
                onClick={() => onDelete && onDelete(source.id)}
                className="px-2.5 py-1 bg-[color:var(--state-danger)] text-white text-xs font-bold rounded hover:opacity-90 cursor-pointer"
              >
                Confirm Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            onDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-[color:var(--state-danger)] hover:underline cursor-pointer"
              >
                Delete Source
              </button>
            )
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] text-[color:var(--text-primary)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--surface-hover)] cursor-pointer ml-auto"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
