import React,{ useState } from "react";
import { sourceVenueLabel } from "../services/sourceDisplay";
import type { DiscoveredSource } from "../types";
import {
Check,
Plus,ExternalLink,
Sparkles,
BookOpen,
Star,
ShieldCheck,
ChevronDown,
ChevronUp,
Quote,
Unlock,Table,FileUp,
Tag,
PenLine,Trash2
} from "lucide-react";

export interface CuratedSourceCardProps {
  source: DiscoveredSource;
  isApproved: boolean;
  onToggleApproval: (sourceId: string) => void;
  onDismiss?: (sourceId: string) => void;
  isReplacing?: boolean;
  isBookmarked?: boolean;
  onToggleBookmark?: (sourceId: string) => void;
  onEdit?: (source: DiscoveredSource) => void;
  onSaveEdit?: (sourceId: string, updates: Partial<DiscoveredSource>) => void;
  className?: string;
  availableSubheadings?: { id: string; numberStr: string; title: string }[];
  onUpdateSubheadingMapping?: (sourceId: string, mappedSubheadingIds: string[]) => void;
  onUpdateUserNotes?: (sourceId: string, notes: string) => void;
}

export const CuratedSourceCard: React.FC<CuratedSourceCardProps> = ({
  source,
  isApproved,
  onToggleApproval,
  onDismiss,
  isReplacing = false,
  isBookmarked = false,
  onToggleBookmark,
  className = "",
  availableSubheadings = [],
  onUpdateSubheadingMapping,
  onUpdateUserNotes,
}) => {
  const [showAbstract, setShowAbstract] = useState(false);
  const [showEvidences, setShowEvidences] = useState(true);
  const [showSubheadingPicker, setShowSubheadingPicker] = useState(false);
  const [showNotesEditor, setShowNotesEditor] = useState(false);
  const [noteText, setNoteText] = useState(source.userNotes || "");

  const rawAuthors: unknown = source.authors; // older saves may hold one string
  const authorsList: string[] = Array.isArray(rawAuthors)
    ? rawAuthors
    : typeof rawAuthors === "string" && rawAuthors.trim()
    ? [rawAuthors.trim()]
    : [];
  const authorDisplay =
    authorsList.length > 0
      ? authorsList.slice(0, 3).join(", ") + (authorsList.length > 3 ? " et al." : "")
      : source.isUserUploaded
      ? "Course Materials / Uploaded Source"
      : "Unknown author";

  const venueDisplay = sourceVenueLabel(source);

  const effectiveBookmarked = source.isBookmarked ?? isBookmarked;

  const handleToggleSubheading = (subId: string) => {
    if (!onUpdateSubheadingMapping) return;
    const current = source.mappedSubheadingIds || [];
    const updated = current.includes(subId)
      ? current.filter((id) => id !== subId)
      : [...current, subId];
    onUpdateSubheadingMapping(source.id, updated);
  };

  const handleSaveNotes = () => {
    if (onUpdateUserNotes) {
      onUpdateUserNotes(source.id, noteText);
    }
    setShowNotesEditor(false);
  };

  const evidences = source.extractedEvidences || [];

  return (
    <div
      data-testid={`curated-source-${source.id}`}
      className={`relative p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between space-y-4 bg-[color:var(--surface-raised)] shadow-xs ${
        isApproved
          ? "border-emerald-500/60 ring-1 ring-emerald-500/20 bg-emerald-50/20 dark:bg-emerald-950/10"
          : "border-[color:var(--border-subtle)] hover:border-neutral-300 dark:hover:border-white/20"
      } ${className}`}
    >
      {/* Top Bar: Badges, Relevance & Bookmark */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Origin Badge — shows real retrieval source when available */}
            {source.sourceOrigin === "user_uploaded" || source.isUserUploaded || source.sourceOrigin === "user" ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 flex items-center gap-1">
                <FileUp className="w-2.5 h-2.5" />
                <span>USER UPLOADED</span>
              </span>
            ) : source.retrievalSource ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20 flex items-center gap-1">
                <BookOpen className="w-2.5 h-2.5" />
                <span>{source.retrievalSource.toUpperCase()}</span>
              </span>
            ) : source.sourceOrigin === "system_found" ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 flex items-center gap-1">
                <BookOpen className="w-2.5 h-2.5" />
                <span>SYSTEM FOUND</span>
              </span>
            ) : source.sourceOrigin === "ai_research" || source.originTag === "ai-research" ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                <span>AI RESEARCH</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 flex items-center gap-1">
                <BookOpen className="w-2.5 h-2.5" />
                <span>ASK SCHOLAR</span>
              </span>
            )}

            {/* Academic Credibility Badge */}
            {source.isVerifiedAcademic && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5" />
                <span>ACADEMIC</span>
              </span>
            )}

            {/* Publication Type */}
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]">
              {source.sourceFormatBadge || source.type || "JOURNAL"}
            </span>

            {/* Role in Assignment */}
            {source.roleInAssignment && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]">
                {source.roleInAssignment}
              </span>
            )}

            {/* Open Access Indicator */}
            {source.isOpenAccess && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center gap-0.5">
                <Unlock className="w-2.5 h-2.5" />
                <span>OA</span>
              </span>
            )}

            {/* In Assignment Status Badge */}
            {isApproved && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Check className="w-2.5 h-2.5" />
                <span>IN ASSIGNMENT</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {source.relevanceScore !== undefined && (
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]">
                {source.relevanceScore}% Match
              </span>
            )}

            {onToggleBookmark && (
              <button
                type="button"
                onClick={() => onToggleBookmark(source.id)}
                aria-label={effectiveBookmarked ? "Remove bookmark" : "Bookmark source"}
                className={`p-1 rounded-md transition-colors cursor-pointer ${
                  effectiveBookmarked
                    ? "text-amber-500 hover:text-amber-600"
                    : "text-neutral-300 dark:text-neutral-600 hover:text-neutral-500"
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${effectiveBookmarked ? "fill-amber-500" : ""}`} />
              </button>
            )}
          </div>
        </div>

        {/* Title & Metadata */}
        <div>
          {source.prescribedInBrief && (
            <span
              data-testid="prescribed-in-brief-badge"
              className="mb-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20"
            >
              Prescribed in Brief
            </span>
          )}
          <h3 className="text-sm font-semibold text-[color:var(--text-primary)] leading-snug">
            {source.title}
          </h3>
          <p className="mt-1 text-xs text-[color:var(--text-muted)] flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-[color:var(--text-secondary)]">{authorDisplay}</span>
            <span>·</span>
            <span className="italic">{venueDisplay}</span>
            {source.year && (
              <>
                <span>·</span>
                <span className="font-mono">{source.year}</span>
              </>
            )}
          </p>
        </div>

        {/* "Why This Source?" Grounding & Rationale Box */}
        {(source.whyThisSource || source.suggestedUse || source.mainFinding) && (
          <div className="p-3 rounded-xl bg-blue-500/[0.04] dark:bg-blue-500/[0.08] border border-blue-500/20 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-blue-800 dark:text-blue-300 text-xs">
              <Sparkles className="w-3 h-3 text-blue-600 dark:text-blue-400" />
              <span>Why This Source?</span>
            </div>
            <p className="text-[color:var(--text-secondary)] leading-relaxed text-xs">
              {source.whyThisSource || source.suggestedUse || source.mainFinding}
            </p>
          </div>
        )}

        {/* Subheading Mapping Tag Section */}
        {availableSubheadings.length > 0 && (
          <div className="pt-1 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[color:var(--text-muted)] flex items-center gap-1">
                <Tag className="w-3 h-3 text-[color:var(--text-muted)]" />
                <span>Mapped to Sections:</span>
              </span>
              <button
                type="button"
                onClick={() => setShowSubheadingPicker(!showSubheadingPicker)}
                className="py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-0.5"
              >
                <span>{showSubheadingPicker ? "Done" : "Assign"}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            {/* Currently mapped tags */}
            <div className="flex flex-wrap gap-1">
              {(source.mappedSubheadingIds || []).length > 0 ? (
                source.mappedSubheadingIds?.map((subId) => {
                  const match = availableSubheadings.find((s) => s.id === subId);
                  return (
                    <span
                      key={subId}
                      className="px-2 py-0.5 rounded-md text-xs font-semibold bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)]"
                    >
                      {match ? `${match.numberStr} ${match.title}` : subId}
                    </span>
                  );
                })
              ) : (
                <span className="text-xs text-[color:var(--text-muted)] italic">
                  Not mapped to specific subheadings yet
                </span>
              )}
            </div>

            {/* Dropdown / Picker when toggled */}
            {showSubheadingPicker && (
              <div className="mt-2 p-2.5 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] space-y-1.5 animate-in fade-in duration-150">
                <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                  Select which subsections this source supports:
                </p>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {availableSubheadings.map((sub) => {
                    const isChecked = (source.mappedSubheadingIds || []).includes(sub.id);
                    return (
                      <label
                        key={sub.id}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-[color:var(--surface-hover)] cursor-pointer text-xs text-[color:var(--text-secondary)]"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSubheading(sub.id)}
                          className="rounded text-blue-600 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                        />
                        <span className="font-semibold text-[color:var(--text-primary)] font-mono text-xs">
                          {sub.numberStr}
                        </span>
                        <span className="truncate">{sub.title}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* User Notes Drawer / Reader */}
        <div className="pt-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[color:var(--text-muted)] flex items-center gap-1">
              <PenLine className="w-3 h-3 text-[color:var(--text-muted)]" />
              <span>Author Notes:</span>
            </span>
            <button
              type="button"
              onClick={() => setShowNotesEditor(!showNotesEditor)}
              className="py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              {source.userNotes ? "Edit Note" : "+ Add Note"}
            </button>
          </div>

          {showNotesEditor && (
            <div className="mt-2 space-y-2">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add research guidance, e.g.: 'Use this source primarily for the discussion of economic security in 2.2'..."
                className="w-full text-xs p-2.5 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={2}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNotesEditor(false)}
                  className="px-2 py-1 text-xs rounded text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  className="px-3 py-1 text-xs font-semibold rounded bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 cursor-pointer"
                >
                  Save Note
                </button>
              </div>
            </div>
          )}

          {!showNotesEditor && source.userNotes && (
            <p className="mt-1.5 text-xs text-[color:var(--text-secondary)] bg-amber-500/[0.07] p-2.5 rounded-lg border border-amber-500/20 italic">
              "📝 {source.userNotes}"
            </p>
          )}
        </div>

        {/* Structured Data Summary for Uploaded Spreadsheets */}
        {source.structuredDataSummary && (
          <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 dark:text-emerald-200 text-xs flex items-start gap-2">
            <Table className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            <span className="leading-relaxed">{source.structuredDataSummary}</span>
          </div>
        )}

        {/* Extracted Evidence Layer for User Uploaded Materials */}
        {source.isUserUploaded && evidences.length > 0 && (
          <div className="pt-1 border-t border-[color:var(--border-subtle)] space-y-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowEvidences(!showEvidences)}
                className="py-1 text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Quote className="w-3 h-3 text-blue-500" />
                <span>Extracted Content & Used References ({evidences.length})</span>
                {showEvidences ? <ChevronUp className="w-3 h-3 text-[color:var(--text-muted)]" /> : <ChevronDown className="w-3 h-3 text-[color:var(--text-muted)]" />}
              </button>
              <span className="text-xs text-[color:var(--text-muted)] font-mono">Provenance & Evidence</span>
            </div>

            {showEvidences && (
              <div className="space-y-2 pt-1">
                {evidences.map((ev, eIdx) => (
                  <div
                    key={ev.id || eIdx}
                    className="p-3 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        📍 {ev.sourceLocation || `Excerpt ${eIdx + 1}`}
                      </span>
                      {ev.claim && (
                        <span className="text-xs text-[color:var(--text-muted)] truncate max-w-xs">
                          {ev.claim}
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-[color:var(--text-primary)] text-xs leading-relaxed italic">
                      "{ev.excerpt}"
                    </p>
                    {ev.context && ev.context !== ev.excerpt && (
                      <p className="text-xs text-[color:var(--text-muted)] leading-normal">
                        <span className="font-semibold text-[color:var(--text-secondary)]">Context: </span>
                        {ev.context}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Abstract Expander */}
        {!source.isUserUploaded && source.abstract && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAbstract(!showAbstract)}
              className="py-1 text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>{showAbstract ? "Hide abstract" : "Read scholarly abstract"}</span>
              {showAbstract ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showAbstract && (
              <p className="mt-2 text-xs text-[color:var(--text-secondary)] bg-[color:var(--surface-inset)] p-3 rounded-xl border border-[color:var(--border-subtle)] leading-relaxed italic animate-in fade-in duration-150">
                "{source.abstract}"
              </p>
            )}
          </div>
        )}

        {/* DOI / External Link */}
        {(source.doi || source.url) && (
          <div className="pt-0.5">
            <a
              href={source.url || `https://doi.org/${source.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] transition-colors"
            >
              <span>{source.doi ? `DOI: ${source.doi}` : source.isUserUploaded ? "Open Linked Resource" : "View source article"}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="pt-3 border-t border-[color:var(--border-subtle)] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onDismiss && onDismiss(source.id)}
          disabled={isReplacing}
          aria-label={`Dismiss or replace ${source.title}`}
          title="Remove source from assignment"
          className="text-xs text-[color:var(--text-muted)] hover:text-rose-600 dark:hover:text-rose-400 py-1.5 px-2.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{source.isUserUploaded ? "Remove from assignment" : "Remove"}</span>
        </button>

        <button
          type="button"
          onClick={() => onToggleApproval(source.id)}
          aria-label={isApproved ? `Remove ${source.title} from approved` : `Approve ${source.title}`}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
            isApproved
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)]"
          }`}
        >
          {isApproved ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Approved</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>Approve Source</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default CuratedSourceCard;
