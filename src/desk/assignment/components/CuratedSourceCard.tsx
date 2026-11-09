import React, { useState } from "react";
import type { DiscoveredSource } from "../types";
import {
  Check,
  Plus,
  X,
  ExternalLink,
  Sparkles,
  BookOpen,
  Star,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Quote,
  Unlock,
  FileText,
  Table,
  Globe,
  FileUp,
  Tag,
  PenLine,
  Search,
  Edit2,
  Copy,
  Trash2,
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
  onEdit,
  onSaveEdit,
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

  const rawAuthors = (source as any).authors;
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

  const venueDisplay =
    source.journal ||
    source.publisher ||
    (source.type === "journal"
      ? "Academic Journal"
      : source.type === "book"
      ? "University Press"
      : source.type === "conference"
      ? "Conference Proceedings"
      : source.type === "institutional"
      ? "Institutional Research"
      : "Scholarly Publication");

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
      className={`relative p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between space-y-4 bg-white dark:bg-ink-750 shadow-xs ${
        isApproved
          ? "border-emerald-500/60 ring-1 ring-emerald-500/20 bg-emerald-50/20 dark:bg-emerald-950/10"
          : "border-neutral-200/80 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20"
      } ${className}`}
    >
      {/* Top Bar: Badges, Relevance & Bookmark */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Origin Badge — shows real retrieval source when available */}
            {source.sourceOrigin === "user_uploaded" || source.isUserUploaded || source.sourceOrigin === "user" ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 flex items-center gap-1">
                <FileUp className="w-2.5 h-2.5" />
                <span>USER UPLOADED</span>
              </span>
            ) : source.retrievalSource ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20 flex items-center gap-1">
                <BookOpen className="w-2.5 h-2.5" />
                <span>{source.retrievalSource.toUpperCase()}</span>
              </span>
            ) : source.sourceOrigin === "system_found" ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 flex items-center gap-1">
                <BookOpen className="w-2.5 h-2.5" />
                <span>SYSTEM FOUND</span>
              </span>
            ) : source.sourceOrigin === "ai_research" || source.originTag === "ai-research" ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                <span>AI RESEARCH</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 flex items-center gap-1">
                <BookOpen className="w-2.5 h-2.5" />
                <span>ASK SCHOLAR</span>
              </span>
            )}

            {/* Academic Credibility Badge */}
            {source.isVerifiedAcademic && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5" />
                <span>ACADEMIC</span>
              </span>
            )}

            {/* Publication Type */}
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300">
              {source.sourceFormatBadge || source.type || "JOURNAL"}
            </span>

            {/* Role in Assignment */}
            {source.roleInAssignment && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300">
                {source.roleInAssignment}
              </span>
            )}

            {/* Open Access Indicator */}
            {source.isOpenAccess && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center gap-0.5">
                <Unlock className="w-2.5 h-2.5" />
                <span>OA</span>
              </span>
            )}

            {/* In Assignment Status Badge */}
            {isApproved && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Check className="w-2.5 h-2.5" />
                <span>IN ASSIGNMENT</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {source.relevanceScore !== undefined && (
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-white/5 text-neutral-700 dark:text-neutral-300">
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
              className="mb-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20"
            >
              Prescribed in Brief
            </span>
          )}
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white leading-snug">
            {source.title}
          </h3>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-neutral-700 dark:text-neutral-300">{authorDisplay}</span>
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
            <div className="flex items-center gap-1.5 font-semibold text-blue-800 dark:text-blue-300 text-[11px]">
              <Sparkles className="w-3 h-3 text-blue-600 dark:text-blue-400" />
              <span>Why This Source?</span>
            </div>
            <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed text-[11px]">
              {source.whyThisSource || source.suggestedUse || source.mainFinding}
            </p>
          </div>
        )}

        {/* Subheading Mapping Tag Section */}
        {availableSubheadings.length > 0 && (
          <div className="pt-1 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                <Tag className="w-3 h-3 text-neutral-400" />
                <span>Mapped to Sections:</span>
              </span>
              <button
                type="button"
                onClick={() => setShowSubheadingPicker(!showSubheadingPicker)}
                className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-0.5"
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
                      className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-white/10"
                    >
                      {match ? `${match.numberStr} ${match.title}` : subId}
                    </span>
                  );
                })
              ) : (
                <span className="text-[11px] text-neutral-400 italic">
                  Not mapped to specific subheadings yet
                </span>
              )}
            </div>

            {/* Dropdown / Picker when toggled */}
            {showSubheadingPicker && (
              <div className="mt-2 p-2.5 rounded-xl bg-neutral-50 dark:bg-white/[0.04] border border-neutral-200/80 dark:border-white/10 space-y-1.5 animate-in fade-in duration-150">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  Select which subsections this source supports:
                </p>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {availableSubheadings.map((sub) => {
                    const isChecked = (source.mappedSubheadingIds || []).includes(sub.id);
                    return (
                      <label
                        key={sub.id}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-neutral-200/50 dark:hover:bg-white/5 cursor-pointer text-xs text-neutral-700 dark:text-neutral-300"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSubheading(sub.id)}
                          className="rounded text-blue-600 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                        />
                        <span className="font-semibold text-neutral-900 dark:text-white font-mono text-[11px]">
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
            <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
              <PenLine className="w-3 h-3 text-neutral-400" />
              <span>Author Notes:</span>
            </span>
            <button
              type="button"
              onClick={() => setShowNotesEditor(!showNotesEditor)}
              className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
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
                className="w-full text-xs p-2.5 rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-ink-750 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={2}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNotesEditor(false)}
                  className="px-2 py-1 text-[11px] rounded text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  className="px-3 py-1 text-[11px] font-semibold rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 cursor-pointer"
                >
                  Save Note
                </button>
              </div>
            </div>
          )}

          {!showNotesEditor && source.userNotes && (
            <p className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-300 bg-amber-500/[0.07] p-2.5 rounded-lg border border-amber-500/20 italic">
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
          <div className="pt-1 border-t border-neutral-100 dark:border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowEvidences(!showEvidences)}
                className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Quote className="w-3 h-3 text-blue-500" />
                <span>Extracted Content & Used References ({evidences.length})</span>
                {showEvidences ? <ChevronUp className="w-3 h-3 text-neutral-400" /> : <ChevronDown className="w-3 h-3 text-neutral-400" />}
              </button>
              <span className="text-[10px] text-neutral-400 font-mono">Provenance & Evidence</span>
            </div>

            {showEvidences && (
              <div className="space-y-2 pt-1">
                {evidences.map((ev, eIdx) => (
                  <div
                    key={ev.id || eIdx}
                    className="p-3 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/10 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        📍 {ev.sourceLocation || `Excerpt ${eIdx + 1}`}
                      </span>
                      {ev.claim && (
                        <span className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate max-w-xs">
                          {ev.claim}
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-neutral-800 dark:text-neutral-200 text-xs leading-relaxed italic">
                      "{ev.excerpt}"
                    </p>
                    {ev.context && ev.context !== ev.excerpt && (
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-normal">
                        <span className="font-semibold text-neutral-600 dark:text-neutral-300">Context: </span>
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
              className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>{showAbstract ? "Hide abstract" : "Read scholarly abstract"}</span>
              {showAbstract ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showAbstract && (
              <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-white/[0.02] p-3 rounded-xl border border-neutral-200/50 dark:border-white/5 leading-relaxed italic animate-in fade-in duration-150">
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
              className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              <span>{source.doi ? `DOI: ${source.doi}` : source.isUserUploaded ? "Open Linked Resource" : "View source article"}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="pt-3 border-t border-neutral-100 dark:border-white/5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onDismiss && onDismiss(source.id)}
          disabled={isReplacing}
          aria-label={`Dismiss or replace ${source.title}`}
          title="Remove source from assignment"
          className="text-xs text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 py-1.5 px-2.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
              : "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100"
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
