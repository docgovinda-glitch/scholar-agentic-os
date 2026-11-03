import React, { useState } from "react";
import { Globe, ExternalLink, ChevronDown, ChevronUp, Calendar, User } from "lucide-react";
import type { LiveSearchResult } from "../../services/liveSearchService";

export interface LiveSourcesDrawerProps {
  sources?: LiveSearchResult[];
  initialExpanded?: boolean;
  className?: string;
  /** When the search ran, e.g. "09:40". */
  searchedAt?: string;
}

export default function LiveSourcesDrawer({
  sources,
  initialExpanded = false,
  className = "",
  searchedAt,
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
          {sources.map((src, i) => (
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
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 shrink-0">
                  {src.source || "web"}
                </span>
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
          ))}
        </div>
      )}
    </div>
  );
}
