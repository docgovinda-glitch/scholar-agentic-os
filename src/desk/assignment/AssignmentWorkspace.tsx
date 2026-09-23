import React, { useState } from "react";
import type { AssignmentStage } from "./types";
import { AssignmentProvider, useAssignmentWorkspace } from "./AssignmentContext";
import AssignmentStageNavigation from "./components/AssignmentStageNavigation";
import AssignmentAiTutorPanel from "./components/AssignmentAiTutorPanel";
// Stage Components
import AssignmentUnderstandStage from "./stages/AssignmentUnderstandStage";
import AssignmentPlanStage from "./stages/AssignmentPlanStage";
import AssignmentResearchStage from "./stages/AssignmentResearchStage";
import AssignmentEvidenceStage from "./stages/AssignmentEvidenceStage";
import AssignmentThinkStage from "./stages/AssignmentThinkStage";
import AssignmentStructureStage from "./stages/AssignmentStructureStage";
import AssignmentDraftStage from "./stages/AssignmentDraftStage";
import AssignmentFinalStage from "./stages/AssignmentFinalStage";

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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[color:var(--surface-canvas)] p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-[color:var(--state-danger-subtle)] flex items-center justify-center mb-2">
          <span className="text-2xl">⚠️</span>
        </div>
        <p className="max-w-md text-sm text-[color:var(--state-danger)] font-medium">{error}</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[color:var(--border-control)] px-5 py-2.5 text-sm font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
          >
            Back to projects
          </button>
        )}
      </div>
    );
  }

  if (isLoading || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--surface-canvas)]">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-[color:var(--accent)] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[color:var(--text-muted)] font-medium">
            Loading Scholar Core Assignment Workspace…
          </span>
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
    <div className="h-screen flex flex-col bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] overflow-hidden">
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
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Column: 8-Phase Journey Rail (Desktop) */}
        <div className="hidden md:block w-64 lg:w-72 shrink-0 h-full overflow-y-auto">
          <AssignmentStageNavigation />
        </div>

        {/* Mobile Slide-out Stage Nav */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden bg-black/50 backdrop-blur-xs">
            <div className="w-4/5 max-w-xs h-full bg-[color:var(--surface-canvas)]">
              <AssignmentStageNavigation onSelectStage={() => setMobileNavOpen(false)} />
            </div>
            <div className="flex-1" onClick={() => setMobileNavOpen(false)} />
          </div>
        )}

        {/* Center Column: Active Stage Workspace */}
        <main className="flex-1 h-full overflow-y-auto bg-[color:var(--surface-canvas)]">
          {renderActiveStage()}
        </main>

        {/* Right Column: Contextual AI Tutor & Word Count Panel */}
        {tutorPanelOpen && (
          <div className="w-80 lg:w-96 shrink-0 h-full overflow-y-auto hidden sm:block">
            <AssignmentAiTutorPanel />
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
