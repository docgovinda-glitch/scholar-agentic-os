/**
 * Pocket responsive layout — adapts to tablet and desktop screens.
 * 360px mobile: Single-column tabs.
 * 600px+ tablet: Master-detail sidebar layout.
 * Extends PocketShell with media queries for larger viewports.
 */

import { useState } from "react";
import type { PocketTab, PocketProject, ApprovalQueueState } from "./types";
import HomeTab from "./tabs/HomeTab";
import ProjectsTab from "./tabs/ProjectsTab";
import SearchTab from "./tabs/SearchTab";
import MeTab from "./tabs/MeTab";
import ApprovalQueueView from "./views/ApprovalQueueView";

interface PocketResponsiveProps {
  projectId?: string;
  projects?: PocketProject[];
  approvalQueue?: ApprovalQueueState;
}

export default function PocketResponsive({
  projectId,
  projects = [],
  approvalQueue,
}: PocketResponsiveProps) {
  const [currentTab, setCurrentTab] = useState<PocketTab>("home");
  const [projectDetail, setProjectDetail] = useState<string | null>(projectId ?? null);
  const [view, setView] = useState<"tabs" | "approval-queue">("tabs");

  const queueState = approvalQueue || {
    candidates: [],
    currentIndex: 0,
    approvedCount: 0,
    rejectedCount: 0,
  };

  const tabBadges: Record<PocketTab, number> = {
    home: 0,
    projects: projects.reduce((sum, p) => sum + Math.max(p.sourcesAwaitingApproval, p.pendingStudioChanges, p.unreadComments), 0),
    search: 0,
    me: 0,
  };

  const handleApprove = () => {
    // Stub for API integration
  };

  const handleReject = () => {
    // Stub for API integration
  };

  const handleDefer = () => {
    // Stub for API integration
  };

  // Mobile view (360px - 599px)
  if (view === "approval-queue") {
    return (
      <div className="h-screen flex flex-col bg-[color:var(--color-navy-0)] text-[#E2E8F0]">
        <div className="h-14 flex items-center px-4 border-b border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-1)]">
          <p className="text-sm text-[#F1F5F9] font-serif">Source Review</p>
        </div>

        <div className="flex-1 overflow-hidden px-4 py-4">
          <ApprovalQueueView
            candidates={queueState.candidates}
            currentIndex={queueState.currentIndex}
            approvedCount={queueState.approvedCount}
            rejectedCount={queueState.rejectedCount}
            onApprove={handleApprove}
            onReject={handleReject}
            onDefer={handleDefer}
            onBack={() => setView("tabs")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[color:var(--color-navy-0)] text-[#E2E8F0]">
      {/* Tablet/Desktop layout: sidebar + main area */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {/* Sidebar (tablet/desktop only) */}
        <div className="w-64 border-r border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-1)] flex flex-col">
          {/* Sidebar header */}
          <div className="h-14 flex items-center px-4 border-b border-[color:var(--color-border-subtle)]">
            <h1 className="text-sm font-serif font-bold text-[#F1F5F9]">Scholar OS</h1>
          </div>

          {/* Tab navigation (vertical on tablet) */}
          <div className="flex-1 overflow-y-auto space-y-1 px-2 py-4">
            {(["home", "projects", "search", "me"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setCurrentTab(tab)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  currentTab === tab
                    ? "bg-[color:var(--color-luminous-blue-dim)] text-white"
                    : "text-[#94A3B8] hover:bg-[color:var(--color-navy-2)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {tab === "home" && "⌂"}
                    {tab === "projects" && "▤"}
                    {tab === "search" && "⌕"}
                    {tab === "me" && "◍"}
                  </span>
                  <span className="capitalize font-mono text-xs uppercase tracking-wide">
                    {tab}
                    {tabBadges[tab] > 0 && <span className="text-amber-400 ml-1">·{tabBadges[tab]}</span>}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="h-14 flex items-center justify-between px-6 border-b border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-1)]">
            <h2 className="text-sm font-serif font-semibold text-[#F1F5F9]">
              {currentTab === "home" && "What Needs Attention"}
              {currentTab === "projects" && "Your Projects"}
              {currentTab === "search" && "Search"}
              {currentTab === "me" && "Account Settings"}
            </h2>
            <button className="text-lg text-[#94A3B8]">⋯</button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {currentTab === "home" && <HomeTab badgeCount={tabBadges.home} projects={projects} onStartReviewing={() => setView("approval-queue")} />}
            {currentTab === "projects" && <ProjectsTab projects={projects} selectedId={projectDetail} onSelectProject={setProjectDetail} />}
            {currentTab === "search" && <SearchTab />}
            {currentTab === "me" && <MeTab />}
          </div>

          {/* Bottom action area (tablet) */}
          <div className="px-6 py-4 border-t border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-1)]">
            {currentTab === "home" && (
              <button
                onClick={() => setView("approval-queue")}
                className="w-full py-2 px-4 rounded-lg bg-[color:var(--color-luminous-blue-dim)] text-white text-sm font-mono uppercase tracking-wide"
              >
                Start Reviewing
              </button>
            )}
            {currentTab === "projects" && (
              <button className="w-full py-2 px-4 rounded-lg bg-[color:var(--color-luminous-blue-dim)] text-white text-sm font-mono uppercase tracking-wide">
                New Project
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile view (360px - 599px) */}
      <div className="md:hidden flex flex-col flex-1 overflow-hidden">
        {/* App bar */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-1)]">
          <button className="text-sm text-[color:var(--color-luminous-blue)]">
            {currentTab === "home" && "Scholar OS"}
            {currentTab === "projects" && "← Back"}
            {currentTab === "search" && "Search"}
            {currentTab === "me" && "Me"}
          </button>
          <button className="text-lg text-[#94A3B8]">⋯</button>
        </div>

        {/* Content zone */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {currentTab === "home" && <HomeTab badgeCount={tabBadges.home} projects={projects} onStartReviewing={() => setView("approval-queue")} />}
          {currentTab === "projects" && <ProjectsTab projects={projects} selectedId={projectDetail} onSelectProject={setProjectDetail} />}
          {currentTab === "search" && <SearchTab />}
          {currentTab === "me" && <MeTab />}
        </div>

        {/* Reach zone */}
        <div className="h-18 flex flex-col gap-2 px-4 py-2 border-t border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-1)]">
          {currentTab === "home" && (
            <button
              onClick={() => setView("approval-queue")}
              className="w-full py-3 rounded-lg bg-[color:var(--color-luminous-blue-dim)] text-white text-sm font-mono uppercase tracking-wide"
            >
              Start Reviewing
            </button>
          )}
          {currentTab === "projects" && (
            <button className="w-full py-3 rounded-lg bg-[color:var(--color-luminous-blue-dim)] text-white text-sm font-mono uppercase tracking-wide">
              New Project
            </button>
          )}
        </div>

        {/* Tab bar */}
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
    </div>
  );
}
