import React, { useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  FileText,
} from "lucide-react";
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
  const [sourcesUsedOpen, setSourcesUsedOpen] = useState(false);
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

  return (
    <div className="mt-4 pt-3 border-t border-neutral-200/80 dark:border-white/10 space-y-3 max-w-[75ch]">
      {/* 1. Separated Reference List Section (Section 5, Section 6, Section 10) */}
      {bibEntries.length > 0 && (
        <section
          aria-label={heading}
          data-testid="reference-list-section"
          className="space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>{heading}</span>
            </h3>
            <span
              data-testid="search-read-cited-banner"
              className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400"
            >
              Searched {effectiveSearched} · Read {effectiveRead} · Cited {effectiveCited}.
            </span>
          </div>

          <ol className="space-y-2 text-[12.5px] leading-[1.6] text-neutral-800 dark:text-neutral-200">
            {bibEntries.map((entry) => {
              const mdText = entry.markdownText || entry.formattedText;
              return (
                <li
                  key={`${messageId}-ref-${entry.displayIndex}`}
                  id={`ref-entry-${messageId}-${entry.originalIndex}`}
                  data-ref-num={String(entry.originalIndex)}
                  data-ref-display-id={`ref-entry-${messageId}-${entry.displayIndex}`}
                  data-testid="reference-list-entry"
                  className="pl-7 -indent-7 py-1 px-2 rounded-lg transition-all duration-300"
                >
                  {renderReferenceNodes(mdText)}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* 2. Source Transparency Collapsible Panels (Section 14) */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {bibEntries.length > 0 && (
          <button
            type="button"
            data-testid="sources-used-toggle"
            onClick={() => setSourcesUsedOpen((v) => !v)}
            aria-expanded={sourcesUsedOpen}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-neutral-100 dark:bg-white/5 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/70 dark:hover:bg-white/10 border border-neutral-200/80 dark:border-white/10 transition-colors cursor-pointer"
          >
            {sourcesUsedOpen ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>Sources used ({bibEntries.length})</span>
          </button>
        )}

        {excludedSources.length > 0 && (
          <button
            type="button"
            data-testid="sources-excluded-toggle"
            onClick={() => setSourcesExcludedOpen((v) => !v)}
            aria-expanded={sourcesExcludedOpen}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-50/80 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100/80 dark:hover:bg-amber-950/50 border border-amber-200/70 dark:border-amber-800/40 transition-colors cursor-pointer"
          >
            {sourcesExcludedOpen ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            <span>Sources excluded ({excludedSources.length})</span>
          </button>
        )}
      </div>

      {/* Collapsible "Sources used" detail list */}
      {sourcesUsedOpen && bibEntries.length > 0 && (
        <div
          data-testid="sources-used-list"
          className="p-2.5 rounded-xl bg-neutral-50/90 dark:bg-white/[0.03] border border-neutral-200/80 dark:border-white/10 space-y-2"
        >
          {bibEntries.map((entry) => {
            const raw = entry.rawCitation;
            const authorsStr =
              raw.authors && raw.authors.length > 0
                ? raw.authors.join(", ")
                : raw.author || "";
            const yrNum = entry.year ? parseInt(entry.year, 10) : undefined;
            const isPreprint =
              entry.credibilityLevel === "preprint - not peer-reviewed" ||
              (entry.sourceTypeLabel || "").includes("preprint");
            const limitation =
              raw.limitationNote ||
              (isPreprint
                ? "preprint, not peer-reviewed"
                : yrNum && currentYear - yrNum > 10
                  ? `older study (${yrNum})`
                  : undefined);

            return (
              <div
                key={`used-${entry.displayIndex}`}
                className="p-2 rounded-lg bg-white dark:bg-ink-800 border border-neutral-200/60 dark:border-white/10 text-xs space-y-1"
              >
                <div className="flex items-start justify-between gap-2">
                  {entry.url ? (
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                    >
                      <span>{raw.title}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                      {raw.title}
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 shrink-0">
                    {entry.sourceTypeLabel || "peer-reviewed article"} ·{" "}
                    {entry.credibilityLevel || "high"}
                  </span>
                </div>

                <div className="text-[11px] text-neutral-600 dark:text-neutral-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>
                    {authorsStr} ({entry.year})
                  </span>
                  {entry.publisher && <span>· {entry.publisher}</span>}
                  {entry.openAccessUrl && (
                    <a
                      href={entry.openAccessUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
                    >
                      <FileText className="w-3 h-3" />
                      <span>Open-access full text</span>
                    </a>
                  )}
                  {limitation && (
                    <span className="px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40 text-[10px]">
                      Note: {limitation}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Collapsible "Sources excluded" detail list */}
      {sourcesExcludedOpen && excludedSources.length > 0 && (
        <div
          data-testid="sources-excluded-list"
          className="p-2.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/40 space-y-1.5"
        >
          <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
            The following candidate sources were excluded during metadata and retraction verification:
          </p>
          {excludedSources.map((ex, idx) => (
            <div
              key={`ex-${idx}`}
              className="flex items-center justify-between gap-2 text-[11px] py-1 px-2 rounded bg-white/80 dark:bg-ink-800/80 border border-amber-200/50 dark:border-amber-800/30"
            >
              <span className="text-neutral-700 dark:text-neutral-300 truncate">
                {ex.title}
              </span>
              <span className="px-1.5 py-0.5 rounded font-semibold bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 shrink-0">
                {ex.reason}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
