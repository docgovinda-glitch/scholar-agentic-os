/**
 * Pocket — mobile-first web application (docs 23-MOBILE-WEB-UX-SPECIFICATION.md).
 *
 * Four jobs: Approve (source queue), Read (document review), Ask (chat),
 * Know (what needs attention). Designed for 360 px baseline, thumb-zone
 * optimized, one decision per screen.
 *
 * Layout: Reference zone (top) → Content zone (middle) → Reach zone (bottom).
 * Four persistent tabs: Home, Projects, Search, Me.
 */

import { useState } from "react";
import type { PocketTab, PocketProject, ApprovalCandidate, ApprovalQueueState } from "./types";
import HomeTab from "./tabs/HomeTab";
import ProjectsTab from "./tabs/ProjectsTab";
import SearchTab from "./tabs/SearchTab";
import MeTab from "./tabs/MeTab";
import ApprovalQueueView from "./views/ApprovalQueueView";
import AskView from "./views/AskView";
import { useApprovalQueue, usePocketChat } from "./hooks/usePocketApi";

interface PocketShellProps {
  projectId?: string;
  projects?: PocketProject[];
  approvalQueue?: ApprovalQueueState;
}

export default function PocketShell({ projectId, projects = [], approvalQueue }: PocketShellProps) {
  const [currentTab, setCurrentTab] = useState<PocketTab>("home");
  const [projectDetail, setProjectDetail] = useState<string | null>(projectId ?? null);
  const [view, setView] = useState<"tabs" | "approval-queue" | "ask">("tabs");
  const [currentIndex, setCurrentIndex] = useState(0);

  // Both hooks are called unconditionally and take "" when no project is
  // selected. The previous `projectId ? useApprovalQueue(projectId) : null`
  // was a Rules of Hooks violation: the moment projectId went from undefined
  // to defined (selecting a project), React saw a different number of hooks
  // between renders and threw "Rendered more hooks than during the previous
  // render". The hooks themselves no-op on an empty id.
  const activeProjectId = projectId ?? "";
  const approvalApi = useApprovalQueue(activeProjectId);
  const chat = usePocketChat(activeProjectId);

  const queueState = approvalQueue || {
    candidates: [],
    currentIndex: 0,
    approvedCount: 0,
    rejectedCount: 0,
  };

  const outstanding = projects.reduce(
    (sum, p) => sum + Math.max(p.sourcesAwaitingApproval, p.pendingStudioChanges, p.unreadComments),
    0
  );

  const tabBadges: Record<PocketTab, number> = {
    // Home was hardcoded to 0, so HomeTab's footer read "0 items awaiting
    // action" directly underneath a populated "Needs Attention" list.
    home: outstanding,
    projects: outstanding,
    search: 0,
    me: 0,
  };

  // The three decisions differed only in the verb, so they were three copies
  // of the same body. One handler, one place for the advance-and-report logic.
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const decide = async (decision: "approved" | "rejected" | "deferred") => {
    const candidate = queueState.candidates[currentIndex];
    if (!activeProjectId || !candidate) return;

    setDecisionError(null);
    try {
      await approvalApi.submitDecision(candidate.id || String(currentIndex), decision);
      if (currentIndex < queueState.candidates.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
    } catch (error) {
      // Previously console.error only, so a failed decision looked identical
      // to a successful one: the card just sat there with no explanation.
      setDecisionError(
        error instanceof Error ? error.message : `Failed to record "${decision}"`
      );
    }
  };

  // Pocket is a phone-shaped app that now also renders inside the desktop
  // workspace shell. `h-screen` made it claim the whole viewport while nested
  // under AppHeader, pushing the tab bar off-screen and forcing a page
  // scroll; a fixed height with a phone-width cap keeps it self-contained and
  // still gives mobile the full-bleed layout it was designed for.
  const frame =
    "flex flex-col h-[calc(100vh-13rem)] min-h-[520px] w-full max-w-md mx-auto " +
    "overflow-hidden rounded-2xl border border-[color:var(--color-border-subtle)] " +
    "bg-[color:var(--color-navy-0)] text-[color:var(--text-primary)]";

  if (view === "approval-queue") {
    return (
      <div className={frame}>
        {/* App bar */}
        <div className="h-14 shrink-0 flex items-center px-4 border-b border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-1)]">
          <p className="text-sm text-[color:var(--text-primary)] font-serif">Source Review</p>
        </div>

        {decisionError && (
          <div role="alert" className="mx-4 mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
            {decisionError}
          </div>
        )}

        {/* Content zone with approval queue */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <ApprovalQueueView
            candidates={queueState.candidates}
            currentIndex={currentIndex}
            approvedCount={queueState.approvedCount}
            rejectedCount={queueState.rejectedCount}
            onApprove={() => decide("approved")}
            onReject={() => decide("rejected")}
            onDefer={() => decide("deferred")}
            onBack={() => setView("tabs")}
          />
        </div>
      </div>
    );
  }

  if (view === "ask") {
    return (
      <div className={frame}>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <AskView
            messages={chat.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              timestamp: new Date(m.created_at),
            }))}
            isLoading={chat.loading}
            onSendMessage={(text) => {
              chat.sendMessage(text).catch(() => {
                /* surfaced via chat.error below */
              });
            }}
            onBack={() => setView("tabs")}
          />
        </div>
        {chat.error && (
          <div role="alert" className="mx-4 mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
            {chat.error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={frame}>
      {/* App bar (Reference zone — docs 23 §3.1) */}
      <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-1)]">
        <button className="text-sm text-[color:var(--color-luminous-blue)]">
          {currentTab === "home" && "Scholar OS"}
          {currentTab === "projects" && "← Back"}
          {currentTab === "search" && "Search"}
          {currentTab === "me" && "Me"}
        </button>
        <button className="text-lg text-[color:var(--text-secondary)]">⋯</button>
      </div>

      {/* Content zone (Read zone — docs 23 §3.1) */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {currentTab === "home" && <HomeTab badgeCount={tabBadges.home} projects={projects} onStartReviewing={() => setView("approval-queue")} />}
        {currentTab === "projects" && <ProjectsTab projects={projects} selectedId={projectDetail} onSelectProject={setProjectDetail} />}
        {currentTab === "search" && <SearchTab />}
        {currentTab === "me" && <MeTab />}
      </div>

      {/* Bottom action zone (Reach zone — docs 23 §3.1) */}
      {currentTab === "home" && (
        <div className="shrink-0 flex gap-2 px-4 py-2 border-t border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-1)]">
          {/* Reviewing is possible whenever there is a queue to show — the
              view has its own "all reviewed" empty state — so this gates on
              having something to review, not strictly on a selected project.
              Submitting a decision still requires a project, which `decide`
              enforces. */}
          <button
            onClick={() => setView("approval-queue")}
            disabled={!activeProjectId && queueState.candidates.length === 0}
            className="flex-1 py-3 rounded-lg bg-[color:var(--color-luminous-blue-dim)] text-white text-sm disabled:opacity-40"
            title={activeProjectId ? undefined : "Open a project first"}
          >
            Review
          </button>
          {/* Ask was a fully built view with no route into it — the chat job
              was unreachable from the shell until now. */}
          <button
            onClick={() => setView("ask")}
            disabled={!activeProjectId}
            className="flex-1 py-3 rounded-lg border border-[color:var(--color-luminous-blue-dim)] text-[color:var(--color-luminous-blue)] text-sm disabled:opacity-40"
            title={activeProjectId ? undefined : "Open a project first"}
          >
            Ask
          </button>
        </div>
      )}

      {/* Tab bar (4 persistent tabs — docs 23 §4) */}
      <div className="h-14 shrink-0 flex items-center justify-around border-t border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-1)]">
        {(["home", "projects", "search", "me"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setCurrentTab(tab)}
            className={`flex flex-col items-center gap-1 w-full h-full py-2 ${
              currentTab === tab ? "text-[color:var(--color-luminous-blue)]" : "text-[color:var(--text-secondary)]"
            }`}
          >
            <span className="text-lg">
              {tab === "home" && "⌂"}
              {tab === "projects" && "▤"}
              {tab === "search" && "⌕"}
              {tab === "me" && "◍"}
            </span>
            <span className="text-xs">
              {tab}
              {tabBadges[tab] > 0 && <span className="text-amber-400 ml-1">·{tabBadges[tab]}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
