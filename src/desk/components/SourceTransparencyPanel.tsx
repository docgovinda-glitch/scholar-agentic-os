import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  formatAskScholarBibliography,
  getReferenceListHeading,
  type WebsiteCitationItem,
} from "../scholarCitationEngine";
import type { ExcludedSourceRecord } from "../../citation_compliance/cslEngine";

export interface SourceTransparencyPanelProps {
  messageId: string;
  citations: WebsiteCitationItem[];
  excludedSources?: ExcludedSourceRecord[];
  citationStyle: string;
  searchedCount?: number;
  readCount?: number;
  citedCount?: number;
}

export function SourceTransparencyPanel({
  messageId,
  citations,
  excludedSources = [],
  citationStyle,
  searchedCount,
  readCount,
  citedCount,
}: SourceTransparencyPanelProps) {
  const [sourcesExcludedOpen, setSourcesExcludedOpen] = useState(false);

  const bibEntries = formatAskScholarBibliography(citations, citationStyle);
  const heading = getReferenceListHeading(citationStyle);

  const effectiveCited = citedCount ?? bibEntries.length;
  const effectiveRead = Math.max(readCount ?? citations.length, effectiveCited);
  const effectiveSearched = Math.max(
    searchedCount ?? effectiveRead + excludedSources.length,
    effectiveRead
  );

  if (bibEntries.length === 0 && excludedSources.length === 0) {
    return null;
  }

  /**
   * Renders formatted reference markdown (*italics* and URLs) as semantic React nodes with proper italics and clickable DOIs/URLs.
   */
  const renderReferenceNodes = (markdownText: string) => {
    const tokenRegex = /\*([^*]+)\*|(https?:\/\/[^\s)]+)/g;
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(markdownText)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(markdownText.slice(lastIndex, match.index));
      }
      if (match[1] !== undefined) {
        nodes.push(
          <em key={`em-${match.index}`} className="italic">
            {match[1]}
          </em>
        );
      } else if (match[2] !== undefined) {
        const cleanUrl = match[2].replace(/[.,;]+$/, "");
        const trailingPunct = match[2].slice(cleanUrl.length);
        nodes.push(
          <React.Fragment key={`url-${match.index}`}>
            <a
              href={cleanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline break-all"
            >
              {cleanUrl}
            </a>
            {trailingPunct}
          </React.Fragment>
        );
      }
      lastIndex = tokenRegex.lastIndex;
    }
    if (lastIndex < markdownText.length) {
      nodes.push(markdownText.slice(lastIndex));
    }
    return nodes;
  };

  const currentYear = new Date().getFullYear();

  /** A quiet note only where a reader should weigh the source: preprints and older work. */
  const noteFor = (entry: (typeof bibEntries)[number]): string | undefined => {
    const raw = entry.rawCitation;
    const yr = entry.year ? parseInt(entry.year, 10) : undefined;
    const isPreprint =
      entry.credibilityLevel === "preprint - not peer-reviewed" || (entry.sourceTypeLabel || "").includes("preprint");
    return raw.limitationNote || (isPreprint ? "Preprint, not peer-reviewed" : yr && currentYear - yr > 10 ? `Older study (${yr})` : undefined);
  };

  return (
    <div className="mt-5 max-w-[75ch] space-y-2 border-t border-neutral-200/70 pt-3 dark:border-white/10">
      {bibEntries.length > 0 && (
        <section aria-label={heading} data-testid="reference-list-section" className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <h3 className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">{heading}</h3>
            <span data-testid="search-read-cited-banner" className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Searched {effectiveSearched} · Read {effectiveRead} · Cited {effectiveCited}.
            </span>
          </div>

          <ol className="space-y-1.5 text-[13px] leading-[1.6] text-neutral-700 dark:text-neutral-300">
            {bibEntries.map((entry) => {
              const note = noteFor(entry);
              return (
                <li
                  key={`${messageId}-ref-${entry.displayIndex}`}
                  id={`ref-entry-${messageId}-${entry.originalIndex}`}
                  data-ref-num={String(entry.originalIndex)}
                  data-ref-display-id={`ref-entry-${messageId}-${entry.displayIndex}`}
                  data-testid="reference-list-entry"
                  className="-indent-6 rounded-lg py-0.5 pl-6 transition-colors duration-300"
                >
                  {renderReferenceNodes(entry.markdownText || entry.formattedText)}
                  {entry.openAccessUrl && (
                    <>
                      {" "}
                      <a href={entry.openAccessUrl} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-neutral-500 underline-offset-2 hover:underline dark:text-neutral-400">
                        Full text
                      </a>
                    </>
                  )}
                  {note && <span className="ml-1 text-[12px] text-amber-700 dark:text-amber-400">({note})</span>}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {excludedSources.length > 0 && (
        <div>
          <button
            type="button"
            data-testid="sources-excluded-toggle"
            onClick={() => setSourcesExcludedOpen((v) => !v)}
            aria-expanded={sourcesExcludedOpen}
            className="inline-flex cursor-pointer items-center gap-1 text-xs text-neutral-500 transition-colors hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            {sourcesExcludedOpen ? <ChevronDown className="h-3 w-3" aria-hidden="true" /> : <ChevronRight className="h-3 w-3" aria-hidden="true" />}
            <span>Sources excluded ({excludedSources.length})</span>
          </button>
          {sourcesExcludedOpen && (
            <div data-testid="sources-excluded-list" className="mt-1.5 space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
              <p>These candidates failed metadata or retraction checks and were not cited.</p>
              {excludedSources.map((ex, idx) => (
                <div key={`ex-${idx}`} className="flex items-baseline justify-between gap-3">
                  <span className="truncate">{ex.title}</span>
                  <span className="shrink-0 text-amber-700 dark:text-amber-400">{ex.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
