import React, { useState } from "react";
import { Globe, ExternalLink, ChevronDown, ChevronUp, Calendar, User, BookmarkPlus, Check } from "lucide-react";
import type { LiveSearchResult } from "../../services/liveSearchService";

export interface LiveSourcesDrawerProps {
  sources?: LiveSearchResult[];
  initialExpanded?: boolean;
  className?: string;
  /** When the search ran, e.g. "09:40". */
  searchedAt?: string;
  /** Optional 1-click handler to save a retrieved source into the user's Knowledge Vault. */
  onSaveToVault?: (source: LiveSearchResult) => void;
  /** Map of source URLs or titles already saved to the Vault in this session. */
  savedUrls?: Record<string, boolean>;
}

export default function LiveSourcesDrawer({
  sources,
  initialExpanded = false,
  className = "",
  searchedAt,
  onSaveToVault,
  savedUrls = {},
}: LiveSourcesDrawerProps) {
  const [isOpen, setIsOpen] = useState(initialExpanded);

  if (!sources || sources.length === 0) return null;

  return (
    <div
      className={`mt-3 rounded-xl border border-sky-200/80 dark:border-sky-900/50 bg-sky-50/40 dark:bg-sky-950/20 overflow-hidden text-left ${className}`}
      data-testid="live-sources-drawer"
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="live-sources-content"
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-sky-900 dark:text-sky-200 hover:bg-sky-100/60 dark:hover:bg-sky-900/30 transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" aria-hidden="true" />
          <span className="font-semibold text-sky-950 dark:text-sky-100 shrink-0">
            Sources ({sources.length})
          </span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/50 min-w-0 truncate">
            {searchedAt ? `Searched at ${searchedAt}` : "Searched for this answer"}
          </span>
        </div>
        <div className="flex items-center gap-1 text-sky-700 dark:text-sky-300">
          <span className="text-[11px] font-normal">{isOpen ? "Hide" : "Show"}</span>
          {isOpen ? (
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </div>
      </button>

      {isOpen && (
        <div
          id="live-sources-content"
          className="p-3 border-t border-sky-200/60 dark:border-sky-900/40 space-y-2.5 max-h-80 overflow-y-auto scholar-scrollbar"
        >
          {sources.map((src, i) => {
            const key = src.url || src.title;
            const isSaved = Boolean(key && savedUrls[key]);
            let domain = "";
            try {
              if (src.url) {
                domain = new URL(src.url).hostname.replace(/^www\./, "");
              }
            } catch {
              domain = "";
            }
            return (
              <div
                key={i}
                className="p-3 rounded-lg bg-white dark:bg-ink-800 border border-neutral-200/80 dark:border-white/10 shadow-2xs space-y-1.5 transition-all hover:border-sky-300 dark:hover:border-sky-700"
                data-testid={`live-source-card-${i}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-mono font-semibold text-sky-700 dark:text-sky-300 shrink-0" aria-label={`Source ${i + 1}`}>
                    [{i + 1}]
                  </span>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-w-0 text-xs font-semibold text-sky-700 dark:text-sky-400 hover:text-sky-900 dark:hover:text-sky-200 hover:underline cursor-pointer flex items-start gap-1.5"
                    title={src.title}
                  >
                    <span className="line-clamp-2">{src.title}</span>
                    <ExternalLink className="w-3 h-3 shrink-0 opacity-70" aria-hidden="true" />
                  </a>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {onSaveToVault && (
                      <button
                        type="button"
                        onClick={() => onSaveToVault(src)}
                        disabled={isSaved}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                          isSaved
                            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40"
                            : "bg-neutral-50 dark:bg-white/[0.04] hover:bg-sky-50 dark:hover:bg-sky-950/40 text-neutral-600 dark:text-neutral-300 hover:text-sky-700 dark:hover:text-sky-300 border-neutral-200/80 dark:border-white/10"
                        }`}
                        title={isSaved ? "Saved in Knowledge Vault" : "Save source to Knowledge Vault"}
                      >
                        {isSaved ? (
                          <>
                            <Check className="w-2.5 h-2.5 text-emerald-500" />
                            <span>Saved</span>
                          </>
                        ) : (
                          <>
                            <BookmarkPlus className="w-2.5 h-2.5" />
                            <span>Save</span>
                          </>
                        )}
                      </button>
                    )}
                    <span
                      className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 shrink-0"
                      title={domain || undefined}
                    >
                      {src.source || "web"}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-neutral-700 dark:text-neutral-300 line-clamp-3 leading-relaxed">
                  {src.snippet}
                </p>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[10px] text-neutral-500 dark:text-neutral-400 border-t border-neutral-100 dark:border-white/5">
                  {src.authors && src.authors.length > 0 && (
                    <span className="flex items-center gap-1 truncate max-w-[220px]">
                      <User className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>{src.authors.join(", ")}</span>
                    </span>
                  )}
                  {src.publicationDate && (
                    <span className="flex items-center gap-1 shrink-0">
                      <Calendar className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>{src.publicationDate}</span>
                    </span>
                  )}
                  <span className="truncate max-w-[240px] font-mono text-[9px] text-neutral-400 dark:text-neutral-500">
                    {src.url}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
