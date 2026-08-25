import React from "react";
import { DocumentChunk, LongDocumentPipelineProgress } from "../../../domain/humanizer/types";

interface LongDocumentDashboardProps {
  chunks: DocumentChunk[];
  progress?: LongDocumentPipelineProgress;
  onCancel?: () => void;
  isProcessing?: boolean;
}

export default function LongDocumentDashboard({
  chunks,
  progress,
  onCancel,
  isProcessing,
}: LongDocumentDashboardProps) {
  if (!chunks || chunks.length <= 1) return null;

  return (
    <div
      data-testid="long-document-dashboard"
      className="p-4 mb-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Multi-Section Manuscript Pipeline ({chunks.length} Chunks)
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Hierarchical section-by-section processing with isolated failure boundaries and context preservation.
          </p>
        </div>

        {isProcessing && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg border border-rose-200 dark:border-rose-800 transition-colors"
          >
            Cancel Processing
          </button>
        )}
      </div>

      {/* Chunk Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 mt-3 max-h-48 overflow-y-auto pr-1">
        {chunks.map((chunk) => {
          const isValidated = chunk.status === "VALIDATED";
          const isFailed = chunk.status === "FAILED";
          const isReview = chunk.status === "REVIEW_REQUIRED";
          const isProcessing = chunk.status === "PROCESSING";

          return (
            <div
              key={chunk.chunkId}
              className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                isValidated
                  ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500/20 text-emerald-900 dark:text-emerald-200"
                  : isFailed
                  ? "bg-amber-50/50 dark:bg-amber-950/20 border-amber-500/20 text-amber-900 dark:text-amber-200"
                  : isReview
                  ? "bg-yellow-50/50 dark:bg-yellow-950/20 border-yellow-500/20 text-yellow-900 dark:text-yellow-200"
                  : isProcessing
                  ? "bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-500/30 text-indigo-900 dark:text-indigo-200 animate-pulse"
                  : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              <div className="truncate mr-2">
                <span className="font-semibold block truncate">{chunk.title || `Chunk ${chunk.order}`}</span>
                <span className="text-[10px] opacity-70">{chunk.sourceWordCount} words</span>
              </div>

              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/60 dark:bg-slate-900/60 shadow-xs flex-shrink-0">
                {isValidated ? "✓ Done" : isFailed ? "✕ Fallback" : isReview ? "⚠ Review" : isProcessing ? "● Busy" : "Pending"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
