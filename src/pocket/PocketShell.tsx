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
import type { PocketTab, PocketProject } from "./types";
import HomeTab from "./tabs/HomeTab";
import ProjectsTab from "./tabs/ProjectsTab";
import SearchTab from "./tabs/SearchTab";
import MeTab from "./tabs/MeTab";

interface PocketShellProps {
  projectId?: string;
  projects?: PocketProject[];
}

export default function PocketShell({ projectId, projects = [] }: PocketShellProps) {
  const [currentTab, setCurrentTab] = useState<PocketTab>("home");
  const [projectDetail, setProjectDetail] = useState<string | null>(projectId ?? null);

  const outstanding = projects.reduce(
    (sum, p) => sum + Math.max(p.sourcesAwaitingApproval, p.pendingStudioChanges, p.unreadComments),
    0
  );

  const tabBadges: Record<PocketTab, number> = {
    home: outstanding,
    projects: outstanding,
    search: 0,
    me: 0,
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
        {currentTab === "home" && <HomeTab badgeCount={tabBadges.home} projects={projects} />}
        {currentTab === "projects" && <ProjectsTab projects={projects} selectedId={projectDetail} onSelectProject={setProjectDetail} />}
        {currentTab === "search" && <SearchTab />}
        {currentTab === "me" && <MeTab />}
      </div>

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
