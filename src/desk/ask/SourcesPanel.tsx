import React from "react";
import { ChevronDown, Network } from "lucide-react";

export interface SourcesPanelProps {
  /** Sources the answer cites. */
  citedCount: number;
  /** Sources the search found (cited or not). */
  foundCount: number;
  /** Opens the citation graph of these sources; omitted when there is nothing to draw. */
  onOpenGraph?: () => void;
  /** Open on first render (closed by default, as a short line under the answer). */
  defaultOpen?: boolean;
  /** The reference list, the sources found but not cited, excluded sources and the answer checks. */
  children: React.ReactNode;
}

export function sourcesSummary(citedCount: number, foundCount: number): string {
  if (citedCount > 0 && foundCount > citedCount) return `${citedCount} cited · ${foundCount} found`;
  if (citedCount > 0) return `${citedCount} cited`;
  if (foundCount > 0) return `${foundCount} found, none cited`;
  return "No sources";
}

/**
 * The one place under an answer where its sources and checks live: a single closed line
 * ("Sources · 6 cited · 14 found") that opens to the reference list, the sources found but not
 * cited, any excluded sources, the answer checks and the citation graph.
 */
export function SourcesPanel({ citedCount, foundCount, onOpenGraph, defaultOpen = false, children }: SourcesPanelProps) {
  return (
    <details
      data-testid="answer-sources-panel"
      open={defaultOpen}
      className="group mt-3 rounded-xl border border-neutral-200/80 bg-neutral-50/60 dark:border-white/10 dark:bg-white/[0.02]"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[13px] text-neutral-700 marker:hidden dark:text-neutral-300 sm:min-h-9 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="font-medium text-neutral-900 dark:text-white">Sources</span>
          <span className="text-neutral-500 dark:text-neutral-400"> · {sourcesSummary(citedCount, foundCount)}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 border-t border-neutral-200/80 px-3 pb-3 pt-2 dark:border-white/10">
        {children}
        {onOpenGraph && (
          <button
            type="button"
            onClick={onOpenGraph}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-500"
          >
            <Network className="h-3.5 w-3.5" aria-hidden="true" />
            Open citation graph
          </button>
        )}
      </div>
    </details>
  );
}
