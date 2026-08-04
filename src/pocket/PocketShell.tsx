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

  const tabBadges: Record<PocketTab, number> = {
    home: 0,
    projects: projects.reduce((sum, p) => sum + Math.max(p.sourcesAwaitingApproval, p.pendingStudioChanges, p.unreadComments), 0),
    search: 0,
    me: 0,
  };

  return (
    <div className="h-screen flex flex-col bg-[color:var(--color-navy-0)] text-[#E2E8F0]">
      {/* App bar (Reference zone — docs 23 §3.1) */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-1)]">
        <button className="text-sm text-[color:var(--color-luminous-blue)]">
          {currentTab === "home" && "Scholar OS"}
          {currentTab === "projects" && "← Back"}
          {currentTab === "search" && "Search"}
          {currentTab === "me" && "Me"}
        </button>
        <button className="text-lg text-[#94A3B8]">⋯</button>
      </div>

      {/* Content zone (Read zone — docs 23 §3.1) */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {currentTab === "home" && <HomeTab badgeCount={tabBadges.home} projects={projects} />}
        {currentTab === "projects" && <ProjectsTab projects={projects} selectedId={projectDetail} onSelectProject={setProjectDetail} />}
        {currentTab === "search" && <SearchTab />}
        {currentTab === "me" && <MeTab />}
      </div>

      {/* Bottom action zone (Reach zone — docs 23 §3.1) */}
      <div className="h-18 flex flex-col gap-2 px-4 py-2 border-t border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-1)]">
        {currentTab === "home" && (
          <button className="w-full py-3 rounded-lg bg-[color:var(--color-luminous-blue-dim)] text-white text-sm font-mono uppercase tracking-wide">
            Start Reviewing
          </button>
        )}
        {currentTab === "projects" && (
          <button className="w-full py-3 rounded-lg bg-[color:var(--color-luminous-blue-dim)] text-white text-sm font-mono uppercase tracking-wide">
            New Project
          </button>
        )}
      </div>

      {/* Tab bar (4 persistent tabs — docs 23 §4) */}
      <div className="h-14 flex items-center justify-around border-t border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-1)]">
        {(["home", "projects", "search", "me"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setCurrentTab(tab)}
            className={`flex flex-col items-center gap-1 w-full h-full py-2 ${
              currentTab === tab ? "text-[color:var(--color-luminous-blue)]" : "text-[#94A3B8]"
            }`}
          >
            <span className="text-lg">
              {tab === "home" && "⌂"}
              {tab === "projects" && "▤"}
              {tab === "search" && "⌕"}
              {tab === "me" && "◍"}
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wide">
              {tab}
              {tabBadges[tab] > 0 && <span className="text-amber-400 ml-1">·{tabBadges[tab]}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
