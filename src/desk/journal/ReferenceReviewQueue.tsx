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
      <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] font-sans">
        <div className="w-16 h-16 mb-4 rounded-full bg-[var(--accent-success)]/10 text-[var(--accent-success)] flex items-center justify-center">
          <CheckCircle className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2 font-sans">Review Queue Empty</h3>
        <p className="text-sm text-[var(--text-secondary)] max-w-sm font-sans">
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
    <div className="space-y-6 font-sans">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-[var(--text-primary)] font-sans">
          Reference Review Queue
        </h2>
        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-subtle)]">
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
                relative overflow-hidden rounded-2xl border transition-all duration-200
                ${isExpanded 
                  ? "bg-[var(--bg-card)] border-[var(--text-primary)]/40 shadow-md" 
                  : "bg-[var(--bg-card)] border-[var(--border-subtle)] hover:border-[var(--text-primary)]/30 hover:shadow-xs"}
              `}
            >
              <div className="relative p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)] bg-[var(--bg-canvas)] border border-[var(--border-subtle)] px-2 py-0.5 rounded">
                        <BookOpen className="w-3 h-3" />
                        {source?.sourceType || "Source"}
                      </span>
                      {source?.url && (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-0.5"
                        >
                          View External <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                    <h4 className="text-base font-bold text-[var(--text-primary)] truncate font-sans">
                      {source?.title || "Unknown Document"}
                    </h4>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      {source?.authors?.join(", ") || "Unknown Authors"} {source?.year ? `(${source.year})` : ""}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setExpandedItemId(isExpanded ? null : item.id);
                      setApproveRationale("");
                    }}
                    className="p-2 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--text-primary)]/5 text-[var(--text-secondary)] transition-colors cursor-pointer"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {claim && (
                  <div className="mt-4 p-3 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] block mb-1">
                      Supports Claim:
                    </span>
                    <p className="text-xs text-[var(--text-primary)] font-medium">
                      "{claim.text}"
                    </p>
                  </div>
                )}

                {item.quote && (
                  <div className="mt-3 text-xs text-[var(--text-secondary)] italic border-l-2 border-[var(--border-subtle)] pl-3">
                    "{item.quote}"
                  </div>
                )}

                {isExpanded && (
                  <div className="mt-6 pt-5 border-t border-[var(--border-subtle)] space-y-4">
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                            Approval Rationale
                          </label>
                          <input
                            type="text"
                            value={approveRationale}
                            onChange={(e) => setApproveRationale(e.target.value)}
                            placeholder="Why does this reference support the claim?"
                            className="w-full px-3 py-2 text-sm bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-xl focus:ring-2 focus:ring-[var(--border-subtle)] outline-none transition-all"
                          />
                        </div>
                        <div className="w-full sm:w-48">
                          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                            Support Strength
                          </label>
                          <select
                            value={approveStrength}
                            onChange={(e) => setApproveStrength(e.target.value as SupportStrength)}
                            className="w-full px-3 py-2 text-sm bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-xl focus:ring-2 focus:ring-[var(--border-subtle)] outline-none transition-all"
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
                          className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[var(--bg-button-primary)] text-[var(--text-button)] text-sm font-medium rounded-full shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-transform active:scale-95 cursor-pointer"
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
                          className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-red-500 hover:border-red-500/40 text-sm font-medium rounded-full transition-colors cursor-pointer"
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
