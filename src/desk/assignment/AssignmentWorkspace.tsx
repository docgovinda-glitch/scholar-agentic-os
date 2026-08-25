import React, { useState } from "react";
import type { AssignmentStage } from "./types";
import { AssignmentProvider, useAssignmentWorkspace } from "./AssignmentContext";
import AssignmentStageNavigation from "./components/AssignmentStageNavigation";
import AssignmentAiTutorPanel from "./components/AssignmentAiTutorPanel";
import ScholarCoreLogo from "../../components/ScholarCoreLogo";

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
  onOpenAccountSettings,
  onOpenVault,
  onOpenAiAccess,
}: {
  onClose?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
}) {
  const {
    project,
    currentStage,
    academicLevel,
    assignmentType,
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
      <header className="border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)]/80 backdrop-blur-md z-20 shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Nav Toggle */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden p-1.5 rounded-lg text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
            >
              ☰
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title="Back to projects"
                className="hidden md:flex shrink-0 rounded-[var(--radius-sm)] p-1.5 text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer"
              >
                ← Back
              </button>
            )}

            <ScholarCoreLogo size="sm" withText className="hidden sm:flex text-[color:var(--text-primary)]" />

            <div className="h-4 w-px bg-[color:var(--border-subtle)] hidden sm:block" />

            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-bold text-[color:var(--text-primary)] truncate max-w-[200px] md:max-w-xs">
                {project.answers["assignment_title"] || project.title || "Academic Assignment"}
              </span>
              <span className="hidden lg:inline-flex text-[10px] font-bold uppercase tracking-wider text-[color:var(--accent)] bg-[color:var(--accent-subtle)] px-2 py-0.5 rounded-full">
                {academicLevel === "postgraduate" ? "Postgraduate" : "Undergraduate"}
              </span>
            </div>
          </div>

          {/* Quick Header Tools & Word Count */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-[color:var(--text-secondary)] bg-[color:var(--surface-inset)] px-3 py-1 rounded-full border border-[color:var(--border-subtle)]">
              <span>Target: {targetWordCount}w</span>
              <span>•</span>
              <span className="text-[color:var(--accent)]">{currentWordCount}w written</span>
            </div>

            {onOpenVault && (
              <button
                type="button"
                onClick={onOpenVault}
                className="text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] px-2.5 py-1 rounded-[var(--radius-sm)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
              >
                ☁️ Vault
              </button>
            )}

            {onOpenAiAccess && (
              <button
                type="button"
                onClick={onOpenAiAccess}
                className="text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] px-2.5 py-1 rounded-[var(--radius-sm)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
              >
                ⚙️ AI Access
              </button>
            )}

            {/* AI Tutor Toggle */}
            <button
              type="button"
              onClick={() => setTutorPanelOpen(!tutorPanelOpen)}
              className={`p-1.5 rounded-[var(--radius-md)] text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                tutorPanelOpen
                  ? "bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border border-[color:var(--accent-border)]"
                  : "bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)]"
              }`}
              title="Toggle Academic Tutor"
            >
              <span>🎓</span>
              <span className="hidden md:inline">AI Tutor</span>
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
