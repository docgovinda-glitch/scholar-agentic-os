import { useState } from "react";
import type { Claim, DiscoveredSource, EvidenceItem, EvidenceLedger, SupportStrength } from "../types";
import { CheckCircle, XCircle, ExternalLink, ChevronDown, ChevronUp, BookOpen } from "lucide-react";

interface ReferenceReviewQueueProps {
  ledger: EvidenceLedger;
  claims: Claim[];
  busy: boolean;
  onApprove: (item: EvidenceItem, strength: SupportStrength, rationale: string) => void;
  onReject: (item: EvidenceItem, reason: string) => void;
}

export default function ReferenceReviewQueue({ ledger, claims, busy, onApprove, onReject }: ReferenceReviewQueueProps) {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [approveRationale, setApproveRationale] = useState("");
  const [approveStrength, setApproveStrength] = useState<SupportStrength>("strong");

  const proposedItems = ledger.items.filter((item) => item.state === "proposed");

  if (proposedItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl transition-all duration-500">
        <div className="w-16 h-16 mb-4 rounded-full bg-gradient-to-tr from-emerald-400 to-cyan-400 flex items-center justify-center opacity-80 shadow-[0_0_30px_rgba(52,211,153,0.3)]">
          <CheckCircle className="w-8 h-8 text-white" />
        </div>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">Review Queue Empty</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
          You're all caught up! No new references are waiting for your approval.
        </p>
      </div>
    );
  }

  function sourceFor(item: EvidenceItem): DiscoveredSource | undefined {
    return ledger.sources.find((s) => s.id === item.sourceId);
  }

  function claimFor(item: EvidenceItem): Claim | undefined {
    return claims.find((c) => c.id === item.proposedClaimId);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-violet-600 dark:from-blue-400 dark:to-violet-400">
          Reference Review Queue
        </h2>
        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          {proposedItems.length} Pending
        </span>
      </div>

      <div className="grid gap-4">
        {proposedItems.map((item) => {
          const source = sourceFor(item);
          const claim = claimFor(item);
          const isExpanded = expandedItemId === item.id;

          return (
            <div
              key={item.id}
              className={`
                group relative overflow-hidden rounded-2xl border transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]
                ${isExpanded 
                  ? "bg-white/80 dark:bg-slate-900/80 border-blue-300/50 dark:border-blue-700/50 shadow-xl shadow-blue-900/5 backdrop-blur-md" 
                  : "bg-white/40 dark:bg-slate-900/40 border-gray-200/50 dark:border-gray-800/50 hover:border-blue-400/30 hover:shadow-lg backdrop-blur-sm"}
              `}
            >
              {/* Animated background gradient hint */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              <div className="relative p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                        <BookOpen className="w-3 h-3" />
                        {source?.sourceType || "Source"}
                      </span>
                      {source?.url && (
                        <a 
                          href={source.url} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                        >
                          View Original <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    
                    <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 leading-snug mb-1">
                      {source?.title || item.sourceId}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                      "{item.quote}"
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setExpandedItemId(isExpanded ? null : item.id);
                      setApproveRationale("");
                    }}
                    className="shrink-0 p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                </div>

                {isExpanded && (
                  <div className="mt-5 pt-5 border-t border-gray-200/50 dark:border-gray-700/50 animate-in slide-in-from-top-2 fade-in duration-300">
                    <div className="mb-6 bg-blue-50/50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100/50 dark:border-blue-800/30">
                      <h4 className="text-xs uppercase tracking-wider font-semibold text-blue-800 dark:text-blue-300 mb-2">
                        Alignment / AI Rationale
                      </h4>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        <span className="font-medium text-gray-900 dark:text-gray-100">Proposed for Claim:</span>{" "}
                        {claim?.text || item.proposedClaimId}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Approval Rationale
                          </label>
                          <input
                            type="text"
                            value={approveRationale}
                            onChange={(e) => setApproveRationale(e.target.value)}
                            placeholder="Why does this reference support the claim?"
                            className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all"
                          />
                        </div>
                        <div className="w-48">
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Support Strength
                          </label>
                          <select
                            value={approveStrength}
                            onChange={(e) => setApproveStrength(e.target.value as SupportStrength)}
                            className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all"
                          >
                            <option value="strong">Strong</option>
                            <option value="moderate">Moderate</option>
                            <option value="weak">Weak</option>
                            <option value="contradicts">Contradicts</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 pt-2">
                        <button
                          type="button"
                          disabled={busy || !approveRationale.trim()}
                          onClick={() => {
                            onApprove(item, approveStrength, approveRationale);
                            setExpandedItemId(null);
                          }}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-medium rounded-lg shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Approve Citation
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            onReject(item, "Rejected during review.");
                            setExpandedItemId(null);
                          }}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800 text-sm font-medium rounded-lg transition-all active:scale-[0.98]"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
