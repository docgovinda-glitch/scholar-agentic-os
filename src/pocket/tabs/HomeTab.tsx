/**
 * Home tab — "Know" job (docs 23 §5.4).
 * Shows what needs attention: pending approvals, gates ready, unread comments, etc.
 * Empty when nothing outstanding.
 */

import type { PocketProject } from "../types";

interface HomeTabProps {
  badgeCount: number;
  projects: PocketProject[];
}

export default function HomeTab({ badgeCount, projects }: HomeTabProps) {
  const attention = projects.filter(
    (p) => p.sourcesAwaitingApproval > 0 || p.pendingStudioChanges > 0 || p.unreadComments > 0
  );

  if (attention.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center gap-4">
        <div className="text-2xl">✓</div>
        <p className="text-[#64748B] text-sm">Everything caught up</p>
        <p className="text-[#475569] text-xs max-w-sm">
          No pending approvals, comments, or refinement suggestions. Come back when new sources arrive.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-[10px] font-mono uppercase tracking-wide text-[#94A3B8]">Needs Attention</h2>
      {attention.map((p) => (
        <div key={p.projectId} className="rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-2)] p-3">
          <h3 className="text-sm font-serif font-semibold text-[#F1F5F9] mb-1">{p.projectId}</h3>
          <div className="flex gap-2 text-[11px] text-[#94A3B8]">
            {p.sourcesAwaitingApproval > 0 && <span>📬 {p.sourcesAwaitingApproval} sources</span>}
            {p.pendingStudioChanges > 0 && <span>✏️ {p.pendingStudioChanges} refinements</span>}
            {p.unreadComments > 0 && <span>💬 {p.unreadComments} comments</span>}
          </div>
        </div>
      ))}
      <div className="text-[10px] text-[#64748B] mt-4">
        {badgeCount} item{badgeCount !== 1 ? "s" : ""} awaiting action
      </div>
    </div>
  );
}
