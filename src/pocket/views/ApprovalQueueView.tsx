/**
 * Approval queue — source review interface (docs 23 §5.1).
 * One card, one decision. Swipe or tap to approve, reject, or defer.
 * Shows authenticity checks, citation, and venue metadata.
 */

import type { ApprovalCandidate } from "../types";

interface ApprovalQueueViewProps {
  candidates: ApprovalCandidate[];
  currentIndex: number;
  approvedCount: number;
  rejectedCount: number;
  onApprove: () => void;
  onReject: () => void;
  onDefer: () => void;
  onBack: () => void;
}

export default function ApprovalQueueView({
  candidates,
  currentIndex,
  approvedCount,
  rejectedCount,
  onApprove,
  onReject,
  onDefer,
  onBack,
}: ApprovalQueueViewProps) {
  if (candidates.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="text-3xl">✓</div>
        <p className="text-[color:var(--text-primary)] text-sm font-serif">All sources reviewed</p>
        <p className="text-[color:var(--text-muted)] text-xs">
          {approvedCount} approved · {rejectedCount} rejected
        </p>
        <button
          onClick={onBack}
          className="mt-4 text-[color:var(--color-luminous-blue)] text-xs"
        >
          ← Back to Home
        </button>
      </div>
    );
  }

  const current = candidates[currentIndex];
  const isLast = currentIndex === candidates.length - 1;

  const authenticityScore = Object.values(current.authenticityChecks).filter(Boolean).length;
  const authenticityTotal = Object.values(current.authenticityChecks).length;

  return (
    <div className="h-full flex flex-col gap-4 pb-4">
      {/* Progress */}
      <div className="text-center pt-2">
        <p className="text-xs text-[color:var(--text-secondary)]">
          {currentIndex + 1} of {candidates.length}
        </p>
        <div className="mt-1 h-1 bg-[color:var(--color-navy-2)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[color:var(--color-luminous-blue-dim)] transition-all"
            style={{ width: `${((currentIndex + 1) / candidates.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-2)] p-4 overflow-y-auto flex flex-col gap-4">
        {/* Title & Authors */}
        <div>
          <h2 className="text-sm font-serif font-bold text-[color:var(--text-primary)] mb-2">{current.title}</h2>
          <p className="text-xs text-[color:var(--text-secondary)]">{current.authors.join(", ")}</p>
        </div>

        {/* Venue & Year */}
        {(current.venue || current.year) && (
          <div className="text-xs text-[color:var(--text-muted)] space-y-1">
            {current.venue && <p>{current.venue}</p>}
            {current.year && <p>{current.year}</p>}
          </div>
        )}

        {/* Authenticity Checks */}
        <div className="space-y-2 pt-2 border-t border-[color:var(--color-border-subtle)]">
          <p className="text-xs text-[color:var(--text-secondary)]">
            Authenticity {authenticityScore}/{authenticityTotal}
          </p>
          <div className="space-y-1 text-xs">
            <div className="flex gap-2">
              <span>{current.authenticityChecks.doiResolves ? "✓" : "✗"}</span>
              <span className={current.authenticityChecks.doiResolves ? "text-[color:var(--state-success)]" : "text-[color:var(--state-danger)]"}>
                DOI resolves
              </span>
            </div>
            <div className="flex gap-2">
              <span>{current.authenticityChecks.publisherVerified ? "✓" : "✗"}</span>
              <span className={current.authenticityChecks.publisherVerified ? "text-[color:var(--state-success)]" : "text-[color:var(--state-danger)]"}>
                Publisher verified
              </span>
            </div>
            <div className="flex gap-2">
              <span>{current.authenticityChecks.notRetracted ? "✓" : "✗"}</span>
              <span className={current.authenticityChecks.notRetracted ? "text-[color:var(--state-success)]" : "text-[color:var(--state-danger)]"}>
                Not retracted
              </span>
            </div>
            {current.authenticityChecks.journalRanking && (
              <div className="flex gap-2">
                <span>ℹ</span>
                <span className="text-[color:var(--text-secondary)]">Ranking: {current.authenticityChecks.journalRanking}</span>
              </div>
            )}
          </div>
        </div>

        {/* Reason Suggested */}
        {current.reasonSuggested && (
          <div className="pt-2 border-t border-[color:var(--color-border-subtle)]">
            <p className="text-xs text-[color:var(--text-secondary)] mb-1">Why suggested</p>
            <p className="text-xs text-[color:var(--text-primary)]">{current.reasonSuggested}</p>
          </div>
        )}

        {/* Summary */}
        {current.summary && (
          <div className="pt-2 border-t border-[color:var(--color-border-subtle)]">
            <p className="text-xs text-[color:var(--text-secondary)] mb-1">Summary</p>
            <p className="text-xs text-[color:var(--text-primary)] line-clamp-4">{current.summary}</p>
          </div>
        )}

        {/* Citation */}
        <div className="pt-2 border-t border-[color:var(--color-border-subtle)]">
          <p className="text-xs text-[color:var(--text-secondary)] mb-1">Citation</p>
          <p className="text-xs font-mono text-[color:var(--text-secondary)] break-words">{current.citationString}</p>
        </div>

        {/* PDF Link */}
        {current.pdfUrl && (
          <div className="pt-2 border-t border-[color:var(--color-border-subtle)]">
            <a
              href={current.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[color:var(--color-luminous-blue)] underline"
            >
              Open PDF →
            </a>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onReject}
          className="flex-1 py-3 rounded-lg border border-[color:var(--state-danger)] text-[color:var(--state-danger)] text-xs hover:bg-[color:var(--state-danger)]/10"
        >
          Reject
        </button>
        <button
          onClick={onDefer}
          className="flex-1 py-3 rounded-lg border border-[color:var(--state-warning)] text-[color:var(--state-warning)] text-xs hover:bg-[color:var(--state-warning)]/10"
        >
          Defer
        </button>
        <button
          onClick={onApprove}
          className="flex-1 py-3 rounded-lg bg-[color:var(--color-luminous-blue-dim)] text-white text-xs"
        >
          Approve
        </button>
      </div>

      {/* Back Button */}
      <button
        onClick={onBack}
        className="text-xs text-[color:var(--text-muted)] text-center py-2"
      >
        ← Back to Home
      </button>
    </div>
  );
}
