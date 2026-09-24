import React, { useState } from "react";
import type { AssignmentStage } from "./types";
import { AssignmentProvider, useAssignmentWorkspace } from "./AssignmentContext";
import AssignmentStageNavigation from "./components/AssignmentStageNavigation";

// Aggressive code-splitting with React.lazy
const SocraticTutor = React.lazy(() => import("./components/AssignmentAiTutorPanel"));
const AssignmentUnderstandStage = React.lazy(() => import("./stages/AssignmentUnderstandStage"));
const AssignmentPlanStage = React.lazy(() => import("./stages/AssignmentPlanStage"));
const AssignmentResearchStage = React.lazy(() => import("./stages/AssignmentResearchStage"));
const AssignmentEvidenceStage = React.lazy(() => import("./stages/AssignmentEvidenceStage"));
const AssignmentThinkStage = React.lazy(() => import("./stages/AssignmentThinkStage"));
const AssignmentStructureStage = React.lazy(() => import("./stages/AssignmentStructureStage"));
const AssignmentDraftStage = React.lazy(() => import("./stages/AssignmentDraftStage"));
const AssignmentFinalStage = React.lazy(() => import("./stages/AssignmentFinalStage"));

// Subtle dark-mode skeleton placeholders
export function PhaseNavSkeleton() {
  return (
    <div className="w-full h-full p-4 space-y-4 bg-[#171717] border-r border-white/5 animate-pulse text-neutral-400">
      <div className="space-y-1.5 pb-3 border-b border-white/5">
        <div className="h-4 w-28 bg-white/10 rounded" />
        <div className="h-3 w-40 bg-white/5 rounded" />
      </div>
      <div className="space-y-2 pt-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 w-full bg-white/5 rounded-lg border border-white/5" />
        ))}
      </div>
      <div className="mt-8 pt-4 border-t border-white/5">
        <div className="h-16 w-full bg-neutral-900/60 rounded-lg border border-white/5" />
      </div>
    </div>
  );
}

export function MainStageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8 animate-pulse text-neutral-400">
      <div className="border-b border-white/5 pb-4 space-y-2">
        <div className="h-6 w-60 bg-white/10 rounded" />
        <div className="h-3.5 w-96 max-w-full bg-white/5 rounded" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-neutral-900/80 p-5 rounded-xl border border-white/5">
        <div className="md:col-span-2 space-y-2">
          <div className="h-4 w-48 bg-white/10 rounded" />
          <div className="h-28 w-full bg-neutral-800/60 rounded-lg border border-white/10" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-28 bg-white/10 rounded" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-9 bg-neutral-800/60 rounded-lg border border-white/5" />
            <div className="h-9 bg-neutral-800/60 rounded-lg border border-white/5" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-4 w-28 bg-white/10 rounded" />
          <div className="h-9 bg-neutral-800/60 rounded-lg border border-white/5" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-36 bg-white/10 rounded" />
          <div className="h-9 bg-neutral-800/60 rounded-lg border border-white/5" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-40 bg-white/10 rounded" />
          <div className="h-9 bg-neutral-800/60 rounded-lg border border-white/5" />
        </div>
      </div>
    </div>
  );
}

export function AiTutorSkeleton() {
  return (
    <div className="w-full h-full p-4 space-y-4 bg-[#171717] border-l border-white/5 animate-pulse text-neutral-400">
      <div className="flex items-center justify-between pb-3 border-b border-white/5">
        <div className="h-4 w-24 bg-white/10 rounded" />
        <div className="h-4 w-12 bg-white/5 rounded" />
      </div>
      <div className="h-24 w-full bg-neutral-900/80 rounded-xl border border-white/5" />
      <div className="space-y-2 pt-2">
        <div className="h-16 w-full bg-neutral-900/60 rounded-lg border border-white/5" />
        <div className="h-16 w-full bg-neutral-900/60 rounded-lg border border-white/5" />
      </div>
    </div>
  );
}

function AssignmentWorkspaceInner({
  onClose,
}: {
  onClose?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
}) {
  const {
    project,
    currentStage,
    targetWordCount,
    currentWordCount,
    isLoading,
    error,
  } = useAssignmentWorkspace();

  const [tutorPanelOpen, setTutorPanelOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#171717] p-6 text-center text-neutral-200">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-2">
          <span className="text-2xl">⚠️</span>
        </div>
        <p className="max-w-md text-sm text-red-400 font-medium">{error}</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-5 py-2.5 text-sm font-medium text-neutral-200 hover:bg-white/5 transition-colors cursor-pointer"
          >
            Back to projects
          </button>
        )}
      </div>
    );
  }

  // Immediate page load renders lightweight structural shell with dark skeletons
  if (isLoading || !project) {
    return (
      <div className="dark h-screen flex flex-col bg-[#171717] text-neutral-200 overflow-hidden" data-theme="dark">
        <header className="border-b border-white/5 bg-[#171717] z-20 shrink-0">
          <div className="flex items-center justify-between px-4 h-12 gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => {
                  if (onClose) onClose();
                  else if (typeof window !== "undefined") window.location.href = "/";
                }}
                title="Back"
                className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer py-1 shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                <span>Back</span>
              </button>
              <div className="h-4 w-36 bg-white/5 rounded animate-pulse" />
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="hidden sm:flex items-center gap-2">
                <div className="h-3.5 w-24 bg-white/5 rounded animate-pulse" />
              </div>
              <div className="w-7 h-7 rounded-lg bg-white/5" />
            </div>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden relative bg-[#171717]">
          <div className="hidden md:block w-64 lg:w-72 shrink-0 h-full overflow-y-auto bg-[#171717] border-r border-white/5">
            <PhaseNavSkeleton />
          </div>
          <main className="flex-1 h-full overflow-y-auto bg-[#171717] text-neutral-200">
            <MainStageSkeleton />
          </main>
          <div className="w-80 lg:w-96 shrink-0 h-full overflow-y-auto hidden sm:block bg-[#171717] border-l border-white/5">
            <AiTutorSkeleton />
          </div>
        </div>
      </div>
    );
  }

  const renderActiveStage = () => {
    switch (currentStage) {
      case "understand":
        return <AssignmentUnderstandStage />;
      case "plan":
        return <AssignmentPlanStage />;
      case "research":
        return <AssignmentResearchStage />;
      case "evidence":
        return <AssignmentEvidenceStage />;
      case "think":
        return <AssignmentThinkStage />;
      case "structure":
        return <AssignmentStructureStage />;
      case "draft":
        return <AssignmentDraftStage />;
      case "final":
        return <AssignmentFinalStage />;
      default:
        return <AssignmentUnderstandStage />;
    }
  };

  return (
    <div className="dark h-screen flex flex-col bg-[#171717] text-neutral-200 overflow-hidden" data-theme="dark">
      {/* Workspace Header */}
      <header className="border-b border-white/5 bg-[#171717] z-20 shrink-0">
        <div className="flex items-center justify-between px-4 h-12 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Nav Toggle */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden p-1 rounded text-neutral-400 hover:text-white cursor-pointer"
              aria-label="Open navigation"
            >
              ☰
            </button>

            {/* Clean Back Button */}
            <button
              type="button"
              onClick={() => {
                if (onClose) onClose();
                else if (typeof window !== "undefined") window.location.href = "/";
              }}
              title="Back"
              className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer py-1 shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              <span>Back</span>
            </button>

            {/* Plain Text Title */}
            <span className="text-xs sm:text-sm font-medium text-neutral-200 truncate">
              {project.answers["assignment_title"] || project.answers["title"] || "Academic Assignment"}
            </span>
          </div>

          {/* Right Section: Word Count & Minimalist AI Tutor Icon */}
          <div className="flex items-center gap-4 shrink-0">
            {/* Muted borderless word count tracker */}
            <div className="hidden sm:flex items-center gap-2 text-sm text-neutral-400 tabular-nums">
              <span>Target: {targetWordCount}w</span>
              <span className="text-neutral-600 dark:text-neutral-500">•</span>
              <span className="text-neutral-300">{currentWordCount}w written</span>
            </div>

            {/* Minimalist AI Tutor Icon Button */}
            <button
              type="button"
              onClick={() => setTutorPanelOpen(!tutorPanelOpen)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center ${
                tutorPanelOpen
                  ? "text-neutral-200 bg-white/10"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
              }`}
              title="Toggle AI Tutor"
              aria-label="Toggle AI Tutor"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* 3-Column Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative bg-[#171717]">
        {/* Left Column: 8-Phase Journey Rail (Desktop) */}
        <div className="hidden md:block w-64 lg:w-72 shrink-0 h-full overflow-y-auto bg-[#171717] border-r border-white/5">
          <AssignmentStageNavigation />
        </div>

        {/* Mobile Slide-out Stage Nav */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden bg-black/60 backdrop-blur-xs">
            <div className="w-4/5 max-w-xs h-full bg-[#171717] border-r border-white/5">
              <AssignmentStageNavigation onSelectStage={() => setMobileNavOpen(false)} />
            </div>
            <div className="flex-1" onClick={() => setMobileNavOpen(false)} />
          </div>
        )}

        {/* Center Column: Active Stage Workspace */}
        <main className="flex-1 h-full overflow-y-auto bg-[#171717] text-neutral-200">
          <React.Suspense fallback={<MainStageSkeleton />}>
            {renderActiveStage()}
          </React.Suspense>
        </main>

        {/* Right Column: Contextual AI Tutor & Word Count Panel */}
        {tutorPanelOpen && (
          <div className="w-80 lg:w-96 shrink-0 h-full overflow-y-auto hidden sm:block bg-[#171717] border-l border-white/5">
            <React.Suspense fallback={<AiTutorSkeleton />}>
              <SocraticTutor />
            </React.Suspense>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AssignmentWorkspace({
  projectId,
  initialStage,
  onStageChange,
  onClose,
  onOpenAccountSettings,
  onOpenVault,
  onOpenAiAccess,
}: {
  projectId: string;
  initialStage: AssignmentStage | null;
  onStageChange: (stage: AssignmentStage, options?: { replace?: boolean }) => void;
  onClose?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
}) {
  return (
    <AssignmentProvider
      projectId={projectId}
      initialStage={initialStage}
      onStageChangeCallback={onStageChange}
    >
      <AssignmentWorkspaceInner
        onClose={onClose}
        onOpenAccountSettings={onOpenAccountSettings}
        onOpenVault={onOpenVault}
        onOpenAiAccess={onOpenAiAccess}
      />
    </AssignmentProvider>
  );
}
