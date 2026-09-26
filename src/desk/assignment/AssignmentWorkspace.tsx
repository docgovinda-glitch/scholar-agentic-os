import React, { useState, useEffect } from "react";
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

// Lightweight minimalist skeleton placeholders conforming to light/dark themes
export function PhaseNavSkeleton() {
  return (
    <div className="w-full h-full p-4 space-y-4 bg-[#F4F4F5] dark:bg-[#1C1C1E] border-r border-neutral-200/80 dark:border-white/10 animate-pulse text-neutral-400">
      <div className="space-y-1.5 pb-3 border-b border-neutral-200/80 dark:border-white/10">
        <div className="h-4 w-28 bg-neutral-200 dark:bg-white/10 rounded" />
        <div className="h-3 w-40 bg-neutral-200 dark:bg-white/5 rounded" />
      </div>
      <div className="space-y-2 pt-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 w-full bg-neutral-200/60 dark:bg-white/5 rounded-xl border border-neutral-200/60 dark:border-white/5" />
        ))}
      </div>
    </div>
  );
}

export function MainStageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto p-6 sm:p-8 space-y-8 animate-pulse text-neutral-400">
      <div className="rounded-2xl p-6 sm:p-8 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-sm space-y-6">
        <div className="border-b border-neutral-100 dark:border-white/5 pb-4 space-y-2">
          <div className="h-6 w-60 bg-neutral-200 dark:bg-white/10 rounded-lg" />
          <div className="h-3.5 w-96 max-w-full bg-neutral-200/70 dark:bg-white/5 rounded" />
        </div>
        <div className="space-y-4">
          <div className="h-28 w-full bg-neutral-100 dark:bg-white/5 rounded-xl border border-neutral-200/60 dark:border-white/10" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-10 bg-neutral-100 dark:bg-white/5 rounded-xl border border-neutral-200/60 dark:border-white/10" />
            <div className="h-10 bg-neutral-100 dark:bg-white/5 rounded-xl border border-neutral-200/60 dark:border-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AiTutorSkeleton() {
  return (
    <div className="w-full h-full p-4 space-y-4 bg-[#F4F4F5] dark:bg-[#1C1C1E] border-l border-neutral-200/80 dark:border-white/10 animate-pulse text-neutral-400">
      <div className="flex items-center justify-between pb-3 border-b border-neutral-200/80 dark:border-white/10">
        <div className="h-4 w-24 bg-neutral-200 dark:bg-white/10 rounded" />
        <div className="h-4 w-12 bg-neutral-200 dark:bg-white/5 rounded" />
      </div>
      <div className="h-24 w-full bg-white dark:bg-[#2C2C2E] rounded-xl border border-neutral-200/60 dark:border-white/10" />
      <div className="space-y-2 pt-2">
        <div className="h-16 w-full bg-white dark:bg-[#2C2C2E] rounded-xl border border-neutral-200/60 dark:border-white/10" />
        <div className="h-16 w-full bg-white dark:bg-[#2C2C2E] rounded-xl border border-neutral-200/60 dark:border-white/10" />
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
    saveAnswers,
  } = useAssignmentWorkspace();

  const [tutorPanelOpen, setTutorPanelOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Inline-editable title with auto-save on blur / Enter
  const initialTitle =
    project?.answers?.["assignment_title"] ||
    project?.answers?.["title"] ||
    "Academic Assignment";
  const [editableTitle, setEditableTitle] = useState(initialTitle);

  useEffect(() => {
    if (project) {
      setEditableTitle(
        project.answers?.["assignment_title"] ||
        project.answers?.["title"] ||
        "Academic Assignment"
      );
    }
  }, [project]);

  const handleTitleBlur = () => {
    const trimmed = editableTitle.trim() || "Academic Assignment";
    setEditableTitle(trimmed);
    if (project && (trimmed !== (project.answers?.["assignment_title"] || project.answers?.["title"]))) {
      saveAnswers({ assignment_title: trimmed, title: trimmed });
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#F8F9FA] dark:bg-[#171717] p-6 text-center text-neutral-800 dark:text-neutral-200">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-2">
          <span className="text-2xl">⚠️</span>
        </div>
        <p className="max-w-md text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-neutral-300 dark:border-white/10 px-5 py-2.5 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            Back to projects
          </button>
        )}
      </div>
    );
  }

  // Immediate page load renders lightweight structural shell conforming to current theme
  if (isLoading || !project) {
    return (
      <div className="h-screen flex flex-col bg-[#F8F9FA] dark:bg-[#171717] text-neutral-900 dark:text-neutral-100 overflow-hidden">
        <header className="border-b border-neutral-200/80 dark:border-white/10 bg-[#F8F9FA] dark:bg-[#171717] z-20 shrink-0">
          <div className="flex items-center justify-between px-4 h-12 gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => {
                  if (onClose) onClose();
                  else if (typeof window !== "undefined") window.location.href = "/";
                }}
                title="Back"
                aria-label="Back"
                className="p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
              </button>
              <div className="h-4 w-36 bg-neutral-200 dark:bg-white/10 rounded animate-pulse" />
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="h-6 w-28 bg-neutral-200 dark:bg-white/10 rounded-full animate-pulse" />
              <div className="w-7 h-7 rounded-lg bg-neutral-200 dark:bg-white/10" />
            </div>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden relative bg-[#F8F9FA] dark:bg-[#171717]">
          <div className="hidden md:block w-64 lg:w-72 shrink-0 h-full overflow-y-auto bg-[#F4F4F5] dark:bg-[#1C1C1E] border-r border-neutral-200/80 dark:border-white/10">
            <PhaseNavSkeleton />
          </div>
          <main className="flex-1 h-full overflow-y-auto bg-[#F8F9FA] dark:bg-[#171717] text-neutral-900 dark:text-neutral-100">
            <MainStageSkeleton />
          </main>
          <div className="w-80 lg:w-96 shrink-0 h-full overflow-y-auto hidden sm:block bg-[#F4F4F5] dark:bg-[#1C1C1E] border-l border-neutral-200/80 dark:border-white/10">
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
    <div className="h-screen flex flex-col bg-[#F8F9FA] dark:bg-[#171717] text-neutral-900 dark:text-neutral-100 overflow-hidden">
      {/* Minimalist Workspace Header */}
      <header className="border-b border-neutral-200/80 dark:border-white/10 bg-[#F8F9FA] dark:bg-[#171717] z-20 shrink-0">
        <div className="flex items-center justify-between px-4 h-12 gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Mobile Nav Toggle */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 cursor-pointer transition-colors"
              aria-label="Open navigation"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>

            {/* Apple/Notion-Style Clean Back Button */}
            <button
              type="button"
              onClick={() => {
                if (onClose) onClose();
                else if (typeof window !== "undefined") window.location.href = "/";
              }}
              title="Back"
              aria-label="Back"
              className="p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>

            {/* Inline-Editable Project Title with Auto-Save onBlur */}
            <input
              type="text"
              value={editableTitle}
              onChange={(e) => setEditableTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              aria-label="Assignment Title"
              title="Click to edit assignment title"
              className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-neutral-100 bg-transparent hover:bg-neutral-200/50 dark:hover:bg-white/5 focus:bg-white dark:focus:bg-[#1C1C1E] border border-transparent hover:border-neutral-200/80 dark:hover:border-white/10 focus:border-neutral-300 dark:focus:border-white/20 rounded-lg px-2 py-1 focus:outline-none transition-all truncate max-w-xs sm:max-w-md md:max-w-lg cursor-text"
            />
          </div>

          {/* Right Section: Compact Status Badge & Socratic Tutor Drawer Toggle */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Apple-grade compact status badge: 0 / 2,000 words */}
            <div className="px-3 py-1 rounded-full text-[12px] font-medium text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 tabular-nums flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>{currentWordCount.toLocaleString()} / {targetWordCount.toLocaleString()} words</span>
            </div>

            {/* Socratic Tutor Drawer Toggle Button */}
            <button
              type="button"
              onClick={() => setTutorPanelOpen(!tutorPanelOpen)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center ${
                tutorPanelOpen
                  ? "text-neutral-900 dark:text-white bg-neutral-200/70 dark:bg-white/10 shadow-2xs"
                  : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-white/5"
              }`}
              title="Toggle Socratic Tutor drawer"
              aria-label="Toggle AI Tutor"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* 3-Column Workspace Body conforming to light & dark theme continuity */}
      <div className="flex-1 flex overflow-hidden relative bg-[#F8F9FA] dark:bg-[#171717]">
        {/* Left Column: 8-Phase Journey Rail (Desktop) */}
        <div className="hidden md:block w-64 lg:w-72 shrink-0 h-full overflow-y-auto bg-[#F4F4F5] dark:bg-[#1C1C1E] border-r border-neutral-200/80 dark:border-white/10">
          <AssignmentStageNavigation />
        </div>

        {/* Mobile Slide-out Stage Nav */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden bg-black/50 backdrop-blur-xs">
            <div className="w-4/5 max-w-xs h-full bg-[#F4F4F5] dark:bg-[#1C1C1E] border-r border-neutral-200/80 dark:border-white/10">
              <AssignmentStageNavigation onSelectStage={() => setMobileNavOpen(false)} />
            </div>
            <div className="flex-1" onClick={() => setMobileNavOpen(false)} />
          </div>
        )}

        {/* Center Column: Active Stage Workspace */}
        <main className="flex-1 h-full overflow-y-auto bg-[#F8F9FA] dark:bg-[#171717] text-neutral-900 dark:text-neutral-100">
          <React.Suspense fallback={<MainStageSkeleton />}>
            {renderActiveStage()}
          </React.Suspense>
        </main>

        {/* Right Column: Collapsible Socratic Tutor Drawer */}
        {tutorPanelOpen && (
          <div className="w-80 lg:w-96 shrink-0 h-full overflow-y-auto hidden sm:block bg-[#F4F4F5] dark:bg-[#1C1C1E] border-l border-neutral-200/80 dark:border-white/10">
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
