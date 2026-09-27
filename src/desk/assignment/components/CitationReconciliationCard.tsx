import React, { useState } from "react";
import type { CitationAuditResult } from "../types";

export interface CitationReconciliationCardProps {
  audit: CitationAuditResult | null;
  isLoading?: boolean;
  onReRunAudit?: () => void;
  onDismissCitation?: (citation: string) => void;
  onMapToSource?: (citation: string) => void;
}

export function CitationReconciliationCard({
  audit,
  isLoading = false,
  onReRunAudit,
  onDismissCitation,
  onMapToSource,
}: CitationReconciliationCardProps) {
  const [dismissedList, setDismissedList] = useState<string[]>([]);

  if (isLoading) {
    return (
      <div className="rounded-2xl p-6 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-4 animate-pulse">
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-white/5 pb-4">
          <div className="h-5 w-44 bg-neutral-200 dark:bg-white/10 rounded" />
          <div className="h-6 w-24 bg-neutral-200 dark:bg-white/10 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-16 bg-neutral-100 dark:bg-white/5 rounded-xl" />
          <div className="h-16 bg-neutral-100 dark:bg-white/5 rounded-xl" />
        </div>
        <div className="h-24 bg-neutral-100 dark:bg-white/5 rounded-xl" />
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="rounded-2xl p-6 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-white/5 text-neutral-400 dark:text-neutral-500 mx-auto flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
            Citation Reconciliation Pending
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
            Verify that 100% of in-text citations correspond to verified bibliography references.
          </p>
        </div>
        {onReRunAudit && (
          <button
            type="button"
            onClick={onReRunAudit}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer inline-flex items-center gap-1.5"
          >
            <span>Scan In-Text Citations</span>
          </button>
        )}
      </div>
    );
  }

  const activeUnresolved = (audit.unresolvedCitations || []).filter(
    (c) => !dismissedList.includes(c)
  );

  const isFullyReconciled = activeUnresolved.length === 0;

  const handleDismiss = (citation: string) => {
    setDismissedList((prev) => [...prev, citation]);
    onDismissCitation?.(citation);
  };

  return (
    <div className="rounded-2xl p-6 sm:p-7 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-6">
      {/* Header & Status Pill */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 dark:border-white/5 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold tracking-wide uppercase text-neutral-400 dark:text-neutral-500">
              Integrity Audit
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-neutral-900 dark:text-white flex items-center gap-2">
            <span>Citation Reconciliation Auditor</span>
          </h2>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
              isFullyReconciled
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
            }`}
            data-testid="citation-reconciled-pill"
          >
            {isFullyReconciled ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span>100% Reconciled</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <span>Unresolved Citations Detected</span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/5 space-y-1">
          <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 block">
            In-Text Citations
          </span>
          <div className="text-xl font-bold text-neutral-900 dark:text-white tabular-nums">
            {audit.totalInTextCitations}
          </div>
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 block">
            Anchors in draft prose
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/5 space-y-1">
          <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 block">
            Bibliography Entries
          </span>
          <div className="text-xl font-bold text-neutral-900 dark:text-white tabular-nums">
            {audit.totalBibliographyEntries}
          </div>
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 block">
            Approved sources
          </span>
        </div>

        <div className="col-span-2 sm:col-span-1 p-3.5 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/5 space-y-1">
          <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 block">
            Match Rate
          </span>
          <div className={`text-xl font-bold tabular-nums ${isFullyReconciled ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
            {audit.totalInTextCitations > 0
              ? `${Math.round(((audit.totalInTextCitations - activeUnresolved.length) / audit.totalInTextCitations) * 100)}%`
              : "100%"}
          </div>
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 block">
            Resolution integrity
          </span>
        </div>
      </div>

      {/* Unresolved Citations Alert & Actions */}
      {activeUnresolved.length > 0 && (
        <div
          className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 dark:bg-rose-500/10 space-y-3"
          data-testid="unresolved-citations-box"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span>Unresolved Citation Anchors ({activeUnresolved.length})</span>
          </div>
          <p className="text-[11.5px] text-rose-800/80 dark:text-rose-200/80 leading-relaxed">
            The following in-text citations were found in your draft but do not resolve to any active, approved source in the bibliography reference list:
          </p>

          <div className="space-y-2 pt-1">
            {activeUnresolved.map((cit) => (
              <div
                key={cit}
                className="p-2.5 rounded-lg bg-white/70 dark:bg-black/20 border border-rose-200/60 dark:border-rose-500/20 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-rose-600 dark:text-rose-400 font-medium truncate">
                    {cit}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {onMapToSource && (
                    <button
                      type="button"
                      onClick={() => onMapToSource(cit)}
                      className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      Map to Source
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDismiss(cit)}
                    className="px-2 py-1 rounded-md text-[11px] font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    title="Dismiss warning"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reconciled Citations Pool */}
      {audit.reconciledCitations && audit.reconciledCitations.length > 0 && (
        <div className="space-y-2 pt-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
            Verified In-Text Citations ({audit.reconciledCitations.length})
          </span>
          <div className="flex flex-wrap gap-1.5">
            {audit.reconciledCitations.map((cit) => (
              <span
                key={cit}
                className="px-2.5 py-1 rounded-md text-[11px] font-mono bg-neutral-100 dark:bg-white/5 text-neutral-700 dark:text-neutral-300 border border-neutral-200/60 dark:border-white/5"
              >
                {cit}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Grounding Explanation */}
      <div className="pt-3 border-t border-neutral-100 dark:border-white/5">
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
          Scholar OS strictly prevents hallucinated citations. Every bibliographic entry in the camera-ready export is guaranteed to correspond to a real, verified peer-reviewed source or user upload.
        </p>
      </div>
    </div>
  );
}
